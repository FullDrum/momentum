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

test('favouriteCount reads legacy numbers and {n,t} records', () => {
  assert.equal(core.favouriteCount(undefined), 0);
  assert.equal(core.favouriteCount(null), 0);
  assert.equal(core.favouriteCount(5), 5);
  assert.equal(core.favouriteCount({ n: 7, t: 123 }), 7);
  assert.equal(core.favouriteCount({ n: 0, t: 123 }), 0);
  assert.equal(core.favouriteCount({ t: 123 }), 0);
});

test('assigneeScore combines frequency and decaying recency', () => {
  const half = 7 * 24 * 60 * 60 * 1000;
  const now = 10 * half; // ~70 days after epoch, so all timestamps are positive
  // Fresh: full recency credit. age 0 -> 0.5^0 = 1.
  assert.equal(core.assigneeScore({ n: 3, t: now }, now), 3 + 10);
  // One half-life old: recency credit halves.
  assert.equal(core.assigneeScore({ n: 3, t: now - half }, now), 3 + 5);
  // Legacy number (no timestamp) contributes count only.
  assert.equal(core.assigneeScore(5, now), 5);
  // Recency can outrank a higher lifetime count once usage is stale.
  const a = core.assigneeScore({ n: 10, t: now - 3 * half }, now);
  const b = core.assigneeScore({ n: 2, t: now }, now);
  assert.ok(a < b, 'very recent usage outranks stale high frequency under the chosen weights');
  // Future timestamps are clamped, never below count.
  assert.equal(core.assigneeScore({ n: 1, t: now + 9999 }, now), 1 + 10);
});

test('mergeSharedWith deduplicates and preserves existing entries', () => {
  assert.equal(core.mergeSharedWith('', 'a@b.c'), 'a@b.c');
  assert.equal(core.mergeSharedWith('x@y.z, a@b.c', 'a@b.c'), 'x@y.z,a@b.c');
  assert.equal(core.mergeSharedWith(' x@y.z , a@b.c ', 'new@q.r'), 'x@y.z,a@b.c,new@q.r');
});

test('sanitizeUrl whitelists http, https and mailto and rejects everything else', () => {
  assert.equal(core.sanitizeUrl('https://example.com'), 'https://example.com');
  assert.equal(core.sanitizeUrl('http://example.com'), 'http://example.com');
  assert.equal(core.sanitizeUrl('mailto:someone@example.com'), 'mailto:someone@example.com');
  assert.equal(core.sanitizeUrl('javascript:alert(1)'), null);
  assert.equal(core.sanitizeUrl('JaVaScRiPt:alert(1)'), null);
  assert.equal(core.sanitizeUrl('data:text/html,<script>'), null);
  assert.equal(core.sanitizeUrl('vbscript:x'), null);
  assert.equal(core.sanitizeUrl('file:///etc/passwd'), null);
  assert.equal(core.sanitizeUrl('ftp://x.com'), null);
  assert.equal(core.sanitizeUrl('https://x.com/a b'), null);
  assert.equal(core.sanitizeUrl('https://x.com/on"load'), null);
  assert.equal(core.sanitizeUrl('  https://example.com  '), 'https://example.com');
  assert.equal(core.sanitizeUrl(''), null);
  assert.equal(core.sanitizeUrl(null), null);
});

test('renderMarkdown renders safe links, escapes labels, and keeps formatting', () => {
  const a = '<a href="https://a.com" target="_blank" rel="noopener noreferrer">x</a>';
  assert.equal(core.renderMarkdown('[x](https://a.com)'), a);
  // Unsafe scheme is left as literal (escaped) text, not a link.
  assert.equal(core.renderMarkdown('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
  // Label is escaped.
  assert.equal(
    core.renderMarkdown('[<b>&</b>](https://a.com)'),
    '<a href="https://a.com" target="_blank" rel="noopener noreferrer">&lt;b&gt;&amp;&lt;/b&gt;</a>'
  );
  // Existing formatting still works.
  assert.equal(core.renderMarkdown('**bold** and _it_ and __u__ and ~~s~~'),
    '<b>bold</b> and <i>it</i> and <u>u</u> and <s>s</s>');
  // A link nested inside bold still renders as a link inside bold.
  assert.equal(core.renderMarkdown('**[x](https://a.com)**'), '<b>' + a + '</b>');
  // A quote inside a URL is not rendered as a link (sanitised away to text).
  assert.equal(core.renderMarkdown('[x](https://a.com/")'), '[x](https://a.com/&quot;)');
});
