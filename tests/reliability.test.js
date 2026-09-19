const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../core.js');

// Run the actual application functions with deterministic storage, RPCs and time.
// DOM rendering is stubbed; these are lifecycle tests, not browser layout tests.
function app(storage = new Map()) {
  let now = new Date(2026, 8, 19, 12).getTime();
  let nextTimer = 0;
  const timers = new Map();
  const listeners = {};
  const element = () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { contains() { return false; } } });
  const context = vm.createContext({
    MomentumCore: core, console: { log() {}, warn() {}, error() {} },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    document: { hidden: false, readyState: 'loading', activeElement: null,
      getElementById() { return null; }, querySelector: element, querySelectorAll() { return []; },
      createElement: element, head: element(), body: element(),
      addEventListener(name, cb) { listeners[name] = cb; }
    },
    window: { addEventListener() {} }, navigator: {},
    setTimeout(cb, delay) { const id = ++nextTimer; timers.set(id, { cb, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {},
    location: { reload() {} }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  context.render = () => {};
  context.showStatusBanner = message => { context.lastMessage = message; };
  context.updateQueueBanner = () => {};
  context.updateZoomCrumb = () => {};
  context.markLastSync = () => { context.synced = true; };
  const login = (email = 'alice@example.com') => {
    context.loadQueue(email);
    context.currentUser = email;
    context.syncAccountReady = true;
    context.localStorage.setItem('momentum_user_email', email);
  };
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].cb();
      for (let i = 0; i < 8; i++) await Promise.resolve();
    }
    now = end;
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  return { c: context, storage, login, advance, setDate(date) { now = date.getTime(); } };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const ack = (saves = [], deletes = []) => ({ results: { saves: saves.map(id => ({ id })), deletes: deletes.map(id => ({ id })) } });

test('closing during a save preserves the durable operation and reload overlays it onto server data', async () => {
  const a = app(); a.login();
  const request = deferred(); a.c.gsr = () => request.promise;
  a.c.queueSave({ id: 'a', name: 'Unsaved edit' });
  const flight = a.c.flushBatch();
  assert.equal(JSON.parse(a.storage.get(a.c.QUEUE_KEY)).saves.a.name, 'Unsaved edit');
  const recovered = app(a.storage); recovered.login();
  recovered.c.gsr = fn => Promise.resolve(fn === 'getInitialData' ? { nodes: [{ id: 'a', name: 'Old' }] } : []);
  await recovered.c.fetchAll(false);
  assert.equal(recovered.c.nodes[0].name, 'Unsaved edit');
  request.resolve(ack(['a'])); await flight;
  assert.equal(a.c.queueIsEmpty(), true);
});

test('an acknowledged older save cannot erase a newer edit', async () => {
  const a = app(); a.login(); const request = deferred(); a.c.gsr = () => request.promise;
  a.c.queueSave({ id: 'a', name: 'First' }); const flight = a.c.flushBatch();
  a.c.queueSave({ id: 'a', name: 'Latest' }); request.resolve(ack(['a'])); await flight;
  assert.equal(a.c.queueState.saves.a.name, 'Latest');
  assert.equal(JSON.parse(a.storage.get(a.c.QUEUE_KEY)).saves.a.name, 'Latest');
});

test('a failed in-flight save cannot resurrect a task deleted during the request', async () => {
  const a = app(); a.login(); const request = deferred(); a.c.gsr = () => request.promise;
  a.c.queueSave({ id: 'a', name: 'First' }); const flight = a.c.flushBatch();
  a.c.queueDelete('a'); request.reject(new Error('offline')); await flight;
  assert.equal(a.c.queueState.saves.a, undefined);
  assert.equal(a.c.queueState.deletes.a, true);
});

test('partial, missing and malformed acknowledgements retain unsuccessful operations', async () => {
  const a = app(); a.login();
  a.c.queueSave({ id: 'a', name: 'Accepted' }); a.c.queueSave({ id: 'b', name: 'Denied' }); a.c.queueDelete('c');
  a.c.gsr = () => Promise.resolve({ results: { saves: [{ id: 'a' }, { id: 'b', error: 'Permission denied' }], deletes: [] } });
  await a.c.flushBatch();
  assert.equal(a.c.queueState.saves.a, undefined);
  assert.equal(a.c.queueState.saves.b.name, 'Denied');
  assert.equal(a.c.queueState.deletes.c, true);
  a.c.gsr = () => Promise.resolve(null); await a.c.flushBatch();
  assert.equal(a.c.queueState.saves.b.name, 'Denied');
  assert.equal(a.c.synced, undefined);
});

test('switching accounts times out without clearing credentials or queued work', async () => {
  const a = app(); a.login(); a.c._momentumSessionToken = 'session';
  a.c.localStorage.setItem('momentum_session_token', 'session');
  a.c.queueSave({ id: 'a', name: 'Pending' }); a.c.gsr = () => new Promise(() => {});
  const result = a.c.switchUser(); await a.advance(3200);
  assert.equal(await result, false);
  assert.equal(a.c.currentUser, 'alice@example.com');
  assert.equal(a.storage.get('momentum_session_token'), 'session');
  assert.equal(JSON.parse(a.storage.get(a.c.QUEUE_KEY)).saves.a.name, 'Pending');
});

test('flushNow waits for an in-flight request even if undo has left no pending entries', async () => {
  const a = app(); a.login(); a.c.batchInFlight = true;
  const result = a.c.flushNow(100); await a.advance(200);
  assert.equal(await result, false);
});

test('successful account switch waits for acknowledgement then clears account state', async () => {
  const a = app(); a.login(); const request = deferred(); a.c.gsr = () => request.promise;
  a.c.queueSave({ id: 'a', name: 'Pending' }); const key = a.c.QUEUE_KEY;
  const result = a.c.switchUser();
  assert.equal(a.c.currentUser, 'alice@example.com');
  request.resolve(ack(['a'])); await a.advance(400);
  assert.equal(await result, true);
  assert.equal(a.c.currentUser, ''); assert.equal(a.storage.has(key), false);
});

test('account queues are isolated and legacy ownership survives a different login', () => {
  const legacy = JSON.stringify({ saves: { a: { id: 'a', name: 'Alice work' } }, deletes: {} });
  const storage = new Map([['momentum_pending_queue', legacy], ['momentum_user_email', 'alice@example.com']]);
  const a = app(storage); a.login('bob@example.com');
  assert.equal(a.c.queueIsEmpty(), true);
  const b = app(storage); b.login('bob@example.com');
  assert.equal(b.c.queueIsEmpty(), true);
  b.login('alice@example.com');
  assert.equal(b.c.queueState.saves.a.name, 'Alice work');
  b.c.persistQueue(); b.login('bob@example.com');
  assert.equal(b.c.queueIsEmpty(), true);
});

test('unknown legacy queues and corrupt recovery data are never silently migrated or overwritten', () => {
  const storage = new Map([['momentum_pending_queue', '{broken']]);
  const a = app(storage); a.login();
  const b = app(storage); b.login();
  assert.equal(storage.get('momentum_pending_queue'), '{broken');
  storage.set(b.c.QUEUE_KEY, '{broken');
  assert.throws(() => b.login());
  assert.equal(storage.get(b.c.QUEUE_KEY), '{broken');
});

test('storage failure is visible and no request starts without a durable copy', async () => {
  const a = app(); a.login(); let calls = 0;
  a.c.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  a.c.gsr = () => { calls++; return Promise.resolve(ack(['a'])); };
  a.c.queueSave({ id: 'a', name: 'Keep open' }); await a.c.flushBatch();
  assert.equal(calls, 0); assert.match(a.c.lastMessage, /Keep Momentum open/);
  assert.equal(a.c.queueState.saves.a.name, 'Keep open');
});

test('undo and redo preserve unrelated pending work and all editable fields', () => {
  const a = app(); a.login();
  a.c.nodes = [{ id: 'a', name: 'Task', assignedTo: 'one', sharedWith: 'one', completedDate: null }, { id: 'b', name: 'Other pending' }];
  a.c.queueSave(a.c.nodes[1]); a.c.pushUndo();
  Object.assign(a.c.nodes[0], { assignedTo: 'two', sharedWith: 'two', completedDate: '2026-09-19' });
  a.c.queueSave(a.c.nodes[0]); a.c.undo();
  assert.equal(a.c.queueState.saves.b.name, 'Other pending');
  assert.equal(a.c.queueState.saves.a.assignedTo, 'one');
  assert.equal(a.c.queueState.saves.a.completedDate, null);
  a.c.redo();
  assert.equal(a.c.queueState.saves.a.assignedTo, 'two');
  assert.equal(a.c.queueState.saves.a.sharedWith, 'two');
  assert.equal(a.c.queueState.saves.b.name, 'Other pending');
});

test('undo during a failed or successful save cannot lose the restored state', async () => {
  for (const fail of [true, false]) {
    const a = app(); a.login(); const request = deferred(); a.c.gsr = () => request.promise;
    a.c.nodes = [{ id: 'a', name: 'Before' }]; a.c.pushUndo();
    a.c.nodes[0].name = 'After'; a.c.queueSave(a.c.nodes[0]); const flight = a.c.flushBatch();
    a.c.undo();
    if (fail) request.reject(new Error('offline')); else request.resolve(ack(['a']));
    await flight;
    assert.equal(a.c.queueState.saves.a.name, 'Before');
    assert.equal(JSON.parse(a.storage.get(a.c.QUEUE_KEY)).saves.a.name, 'Before');
  }
});

test('undo restores an in-flight deletion and redo retains the deletion', async () => {
  const a = app(); a.login(); const request = deferred(); a.c.gsr = () => request.promise;
  a.c.nodes = [{ id: 'a', name: 'Restore me' }]; a.c.pushUndo();
  a.c.nodes = []; a.c.queueDelete('a'); const flight = a.c.flushBatch(); a.c.undo();
  request.resolve(ack([], ['a'])); await flight;
  assert.equal(a.c.queueState.saves.a.name, 'Restore me');
  assert.equal(a.c.queueState.deletes.a, undefined);
  a.c.redo(); assert.equal(a.c.queueState.deletes.a, true);
});

test('new account verification prevents old queued work from being submitted', async () => {
  const a = app(); a.login(); a.c.queueSave({ id: 'a', name: 'Private' });
  a.c.syncAccountReady = false;
  a.c.gsr = () => { throw new Error('Must not call API before verification'); };
  await a.c.flushBatch(); assert.equal(a.c.queueState.saves.a.name, 'Private');
});

test('Today rolls over in local time while preserving the currently edited text', () => {
  const a = app(); a.login();
  a.c.nodes = [{ id: 'a', name: 'Yesterday', date: '2026-09-19' }, { id: 'b', name: 'Tomorrow', date: '2026-09-20' }];
  a.c.document.activeElement = { classList: { contains: () => true }, dataset: { id: 'a' }, value: 'Edited at midnight' };
  a.setDate(new Date(2026, 8, 20, 0, 0, 1));
  assert.equal(a.c.refreshToday(), true);
  assert.equal(a.c.TODAY, '2026-09-20');
  assert.equal(a.c.queueState.saves.a.name, 'Edited at midnight');
  assert.deepEqual(Array.from(a.c.visibleList(), r => r.node.id), ['b']);
  assert.equal(a.c.refreshToday(), false);
});
