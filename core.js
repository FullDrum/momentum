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
      if (!result || result.error) { errors = true; return; }
      if (queue.saves[n.id] && JSON.stringify(queue.saves[n.id]) === JSON.stringify(n)) delete queue.saves[n.id];
    });
    deletes.forEach(function(id) {
      var result = response.results.deletes.find(function(r) { return r && r.id === id; });
      if (!result || result.error) { errors = true; return; }
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

  return { emptyQueue: emptyQueue, restoreQueue: restoreQueue, enqueueSave: enqueueSave,
    queueForRestore: queueForRestore, overlayQueue: overlayQueue, acknowledgeBatch: acknowledgeBatch, localDay: localDay,
    enqueueDelete: enqueueDelete, tokenIsValid: tokenIsValid, snapshotState: snapshotState,
    diffForRestore: diffForRestore, validateBackup: validateBackup };
});
