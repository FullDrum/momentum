(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MomentumCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function emptyQueue() {
    return { saves: {}, deletes: {} };
  }

  function restoreQueue(raw) {
    if (!raw) return emptyQueue();
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== 'object') return emptyQueue();
      return {
        saves: parsed.saves && typeof parsed.saves === 'object' ? parsed.saves : {},
        deletes: parsed.deletes && typeof parsed.deletes === 'object' ? parsed.deletes : {}
      };
    } catch (_) {
      return emptyQueue();
    }
  }

  function enqueueSave(queue, node) {
    if (!node || !node.id || !node.name || !String(node.name).trim()) return false;
    if (queue.deletes[node.id]) return false;
    queue.saves[node.id] = Object.assign({}, node);
    return true;
  }

  function enqueueDelete(queue, id) {
    if (!id) return false;
    delete queue.saves[id];
    queue.deletes[id] = true;
    return true;
  }

  function tokenIsValid(token, expiry, now, bufferMs) {
    if (!token) return false;
    if (!expiry) return true;
    return (now == null ? Date.now() : now) < expiry - (bufferMs == null ? 30000 : bufferMs);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snapshotState(nodes, collapsed, tab, zoomedId) {
    return { nodes: clone(nodes), collapsed: clone(collapsed), tab: tab, zoomedId: zoomedId };
  }

  function nodeChanged(a, b) {
    if (!a || !b) return true;
    // Compare persisted fields, including assignment, sharing and completion.
    // readOnlyContext is a server-derived permission hint, not editable state.
    var keys = new Set(Object.keys(a).concat(Object.keys(b)));
    return Array.from(keys).some(function(key) {
      return key !== 'readOnlyContext' && JSON.stringify(a[key]) !== JSON.stringify(b[key]);
    });
  }

  function queueForRestore(queue, currentNodes, targetNodes) {
    var next = emptyQueue();
    var target = {};
    targetNodes.forEach(function(n) { target[n.id] = n; });
    var diff = diffForRestore(currentNodes, targetNodes);
    var dirty = new Set(Object.keys(queue.saves).concat(Object.keys(queue.deletes)));
    diff.saves.concat(diff.deletes).forEach(function(n) { dirty.add(n.id); });
    dirty.forEach(function(id) {
      if (target[id]) enqueueSave(next, target[id]);
      else enqueueDelete(next, id);
    });
    return next;
  }

  function overlayQueue(serverNodes, queue) {
    var seen = new Set();
    var result = [];
    serverNodes.forEach(function(n) {
      seen.add(n.id);
      if (!queue.deletes[n.id]) result.push(queue.saves[n.id] || n);
    });
    Object.keys(queue.saves).forEach(function(id) {
      if (!seen.has(id) && !queue.deletes[id]) result.push(queue.saves[id]);
    });
    return result;
  }

  function acknowledgeBatch(queue, saves, deletes, response) {
    // Missing acknowledgements must never erase the only durable copy.
    if (!response || !response.results || !Array.isArray(response.results.saves) ||
        !Array.isArray(response.results.deletes)) throw new Error('Missing save acknowledgement');
    var errors = false;
    saves.forEach(function(n) {
      var result = response.results.saves.find(function(r) { return r && r.id === n.id; });
      if (!result || result.ok !== true || result.error) { errors = true; return; }
      if (queue.saves[n.id] && JSON.stringify(queue.saves[n.id]) === JSON.stringify(n)) delete queue.saves[n.id];
    });
    deletes.forEach(function(id) {
      var result = response.results.deletes.find(function(r) { return r && r.id === id; });
      if (!result || result.ok !== true || result.error) { errors = true; return; }
      delete queue.deletes[id];
    });
    return errors;
  }

  function localDay(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') +
      '-' + String(date.getDate()).padStart(2, '0');
  }

  function diffForRestore(currentNodes, targetNodes) {
    var current = {};
    var target = {};
    currentNodes.forEach(function(n) { current[n.id] = n; });
    targetNodes.forEach(function(n) { target[n.id] = n; });
    return {
      saves: targetNodes.filter(function(n) {
        return n.name && String(n.name).trim() && (!current[n.id] || nodeChanged(current[n.id], n));
      }),
      deletes: currentNodes.filter(function(n) { return !target[n.id]; })
    };
  }

  function validateBackup(data, currentUser) {
    if (!data || data.format !== 'momentum-backup' || data.version !== 1 || !Array.isArray(data.nodes)) {
      throw new Error('Unsupported backup format');
    }
    if (data.nodes.length > 10000) throw new Error('Backup contains too many items');
    var seen = {};
    return data.nodes.map(function(raw) {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid item');
      var id = String(raw.id || '').trim();
      var name = String(raw.name || '').trim();
      if (!id || !name || seen[id]) throw new Error('Invalid or duplicate item');
      seen[id] = true;
      return {
        id: id, name: name, parentId: raw.parentId ? String(raw.parentId) : null,
        isSection: raw.isSection === true || raw.isSection === 'true',
        done: raw.done === true || raw.done === 'true',
        watching: raw.watching === true || raw.watching === 'true',
        date: raw.date ? String(raw.date) : null,
        completedDate: raw.completedDate ? String(raw.completedDate) : null,
        order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : Date.now(),
        owner: raw.owner ? String(raw.owner) : currentUser,
        assignedTo: raw.assignedTo ? String(raw.assignedTo) : null,
        assignedBy: raw.assignedBy ? String(raw.assignedBy) : null,
        sharedWith: raw.sharedWith ? String(raw.sharedWith) : ''
      };
    });
  }

  // Read a favourite record stored either as a legacy bare number (frequency) or
  // as the newer { n: count, t: lastUsedMs } shape. Returns the count.
  function favouriteCount(fav) {
    if (fav == null) return 0;
    if (typeof fav === 'number') return fav;
    if (typeof fav === 'object' && typeof fav.n === 'number') return fav.n;
    return 0;
  }

  function favouriteRecency(fav) {
    if (fav && typeof fav === 'object' && typeof fav.t === 'number') return fav.t;
    return 0;
  }

  // Rank a person by a combination of frequency and recency. Higher ranks first.
  //   score = count + recencyWeight * 0.5 ^ (age / halfLifeMs)
  // Legacy numeric favourites have no timestamp, so they contribute count only.
  function assigneeScore(fav, nowMs, recencyWeight, halfLifeMs) {
    var count = favouriteCount(fav);
    var t = favouriteRecency(fav);
    var weight = recencyWeight == null ? 10 : recencyWeight;
    var half = halfLifeMs == null ? 7 * 24 * 60 * 60 * 1000 : halfLifeMs;
    if (!(t > 0)) return count;
    var now = nowMs == null ? Date.now() : nowMs;
    var age = now - t;
    if (age < 0) age = 0;
    return count + weight * Math.pow(0.5, age / half);
  }

  // Merge an email into a comma-separated sharedWith list without duplicates.
  function mergeSharedWith(sharedWith, email) {
    var list = (sharedWith || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    if (list.indexOf(email) === -1) list.push(email);
    return list.join(',');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Whitelist link schemes. Anything else (javascript:, data:, vbscript:, file:,
  // ftp:, …) is rejected so it can never be rendered as a clickable link.
  function sanitizeUrl(raw) {
    if (!raw) return null;
    var u = String(raw).trim();
    if (!/^(https?|mailto):/i.test(u)) return null;
    if (/[\s\u0000-\u001f"'<>]/.test(u)) return null;
    return u;
  }

  // Markdown links are hoisted into placeholders BEFORE formatting so the
  // bold/italic/underline/strike markers can never touch a link's URL. Labels and
  // hrefs are HTML-escaped, and the scheme is whitelisted via sanitizeUrl.
  var LINK_GLOBAL = /\[([^\]\n]+)\]\(((?:https?|mailto):[^)\s]*)\)/gi;

  function renderMarkdown(text) {
    if (!text) return '';
    var links = [];
    var s = String(text).replace(LINK_GLOBAL, function(match, label, url) {
      links.push({ label: label, url: url });
      return '\u0000' + (links.length - 1) + '\u0000';
    });
    s = escapeHtml(s);
    s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    s = s.replace(/(?<![_\w])_([^_]+)_(?![_\w])/g, '<i>$1</i>');
    s = s.replace(/__(.+?)__/g, '<u>$1</u>');
    s = s.replace(/~~(.+?)~~/g, '<s>$1</s>');
    s = s.replace(/\u0000(\d+)\u0000/g, function(_, i) {
      var l = links[Number(i)];
      var safe = sanitizeUrl(l.url);
      if (!safe) return escapeHtml('[' + l.label + '](' + l.url + ')');
      return '<a href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(l.label) + '</a>';
    });
    return s;
  }

  return { emptyQueue: emptyQueue, restoreQueue: restoreQueue, enqueueSave: enqueueSave,
    queueForRestore: queueForRestore, overlayQueue: overlayQueue, acknowledgeBatch: acknowledgeBatch, localDay: localDay,
    enqueueDelete: enqueueDelete, tokenIsValid: tokenIsValid, snapshotState: snapshotState,
    diffForRestore: diffForRestore, validateBackup: validateBackup,
    favouriteCount: favouriteCount, assigneeScore: assigneeScore, mergeSharedWith: mergeSharedWith,
    escapeHtml: escapeHtml, sanitizeUrl: sanitizeUrl, renderMarkdown: renderMarkdown };
});
