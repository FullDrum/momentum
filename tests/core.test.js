const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core.js');

test('saving is last-write-wins and deletion prevents resurrection', () => {
  const queue = core.emptyQueue();
  assert.equal(core.enqueueSave(queue, { id: 'a', name: 'First' }), true);
  core.enqueueSave(queue, { id: 'a', name: 'Latest' });
  assert.equal(queue.saves.a.name, 'Latest');
  core.enqueueDelete(queue, 'a');
  assert.equal(queue.saves.a, undefined);
  assert.equal(queue.deletes.a, true);
  assert.equal(core.enqueueSave(queue, { id: 'a', name: 'Resurrected' }), false);
});

test('offline queue recovery preserves valid work and survives corrupt storage', () => {
  const restored = core.restoreQueue(JSON.stringify({ saves: { a: { id: 'a', name: 'Offline' } }, deletes: { b: true } }));
  assert.equal(restored.saves.a.name, 'Offline');
  assert.equal(restored.deletes.b, true);
  assert.deepEqual(core.restoreQueue('{bad json'), core.emptyQueue());
});

test('authentication expiry observes the safety buffer', () => {
  const now = 1_000_000;
  assert.equal(core.tokenIsValid('', now + 60_000, now), false);
  assert.equal(core.tokenIsValid('token', 0, now), true);
  assert.equal(core.tokenIsValid('token', now + 31_000, now), true);
  assert.equal(core.tokenIsValid('token', now + 30_000, now), false);
});

test('undo diff restores changed and deleted nodes and removes newly-created nodes', () => {
  const before = [{ id: 'a', name: 'Before' }, { id: 'b', name: 'Restored' }];
  const current = [{ id: 'a', name: 'After' }, { id: 'c', name: 'New' }];
  const diff = core.diffForRestore(current, before);
  assert.deepEqual(diff.saves.map(n => n.id), ['a', 'b']);
  assert.deepEqual(diff.deletes.map(n => n.id), ['c']);
  const snap = core.snapshotState(before, { a: true }, 'today', null);
  before[0].name = 'Mutated';
  assert.equal(snap.nodes[0].name, 'Before');
});

test('backup validation rejects duplicates and normalizes booleans', () => {
  const valid = core.validateBackup({ format: 'momentum-backup', version: 1, nodes: [{ id: 'a', name: ' Task ', done: 'true' }] }, 'owner@example.com');
  assert.equal(valid[0].name, 'Task');
  assert.equal(valid[0].done, true);
  assert.equal(valid[0].owner, 'owner@example.com');
  assert.throws(() => core.validateBackup({ format: 'momentum-backup', version: 1, nodes: [{ id: 'a', name: 'One' }, { id: 'a', name: 'Two' }] }, ''), /duplicate/);
});
