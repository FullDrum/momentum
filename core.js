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
    return a.name !== b.name || a.parentId !== b.parentId ||
      a.isSection !== b.isSection || a.done !== b.done ||
      a.watching !== b.watching || a.date !== b.date || a.order !== b.order;
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
    enqueueDelete: enqueueDelete, tokenIsValid: tokenIsValid, snapshotState: snapshotState,
    diffForRestore: diffForRestore, validateBackup: validateBackup };
});
