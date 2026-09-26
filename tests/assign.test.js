const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../core.js');

// Acceptance tests for the first UI batch:
//   1. "No project" clears and persists the parent.
//   2. Ctrl+Shift+Enter (assignee-only) leaves the project untouched.
//   3. A single, recency+frequency-ranked assignee chooser (ranking + uniform
//      assignment mutation are exercised here; DOM/search are structure-tested).
// The app functions run in a vm with stubbed DOM/rendering, same as reliability.test.js.

function app(storage = new Map()) {
  const base = new Date(2026, 8, 19, 12).getTime();
  let now = base;
  let nextTimer = 0;
  const timers = new Map();
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
      addEventListener() {}
    },
    window: { addEventListener() {} }, navigator: {},
    setTimeout(cb) { const id = ++nextTimer; timers.set(id, { cb }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {},
    location: { reload() {} }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  context.render = () => {};
  context.showStatusBanner = () => {};
  context.updateQueueBanner = () => {};
  context.markLastSync = () => {};
  const login = (email = 'alice@example.com') => {
    context.loadQueue(email);
    context.currentUser = email;
    context.syncAccountReady = true;
  };
  return { c: context, login, setNow(ms) { now = ms; } };
}

test('adding a team member waits for server approval before using the person', async () => {
  const a = app();
  const fields = {
    '#newMemberName': { value: 'Bob', style: {}, focus() {}, addEventListener() {} },
    '#newMemberEmail': { value: 'bob@example.com', style: {}, focus() {}, addEventListener() {} },
    '#saveMemberBtn': { disabled: false },
    '.cancel-member-btn': {}
  };
  let removed = false;
  const form = { style: {}, querySelector(selector) { return fields[selector]; }, remove() { removed = true; } };
  const root = { style: {}, appendChild() {} };
  a.c.document.createElement = () => form;
  a.c.showStatusBanner = message => { a.c.lastMessage = message; };
  let saved = false;
  a.c.gsr = () => Promise.reject(new Error('Permission denied'));
  a.c.showAddMemberForm({ querySelector() { return root; } }, () => { saved = true; });
  fields['#saveMemberBtn'].onclick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(saved, false);
  assert.equal(removed, false);
  assert.equal(fields['#saveMemberBtn'].disabled, false);
  assert.match(a.c.lastMessage, /only the app owner/i);

  a.c.gsr = () => Promise.resolve({ ok: true });
  fields['#saveMemberBtn'].onclick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(saved, true);
  assert.equal(removed, true);
});

test('applyPicker with a null section clears the parent (No project)', () => {
  const a = app(); a.login();
  a.c.nodes = [
    { id: 'sec', name: 'Projects', parentId: null, isSection: true, order: 100 },
    { id: 't1', name: 'Task', parentId: 'sec', isSection: false, done: false, order: 200, owner: 'alice@example.com' }
  ];
  a.c.applyPicker(a.c.nodes[1], null, 'bob@example.com');
  const moved = a.c.nodes.find(n => n.id === 't1');
  assert.equal(moved.parentId, null, 'parent must be cleared');
  assert.equal(moved.assignedTo, 'bob@example.com');
});

test('applyPicker with a section still reparents and preserves assignment fields', () => {
  const a = app(); a.login();
  a.c.nodes = [
    { id: 'sec', name: 'Projects', parentId: null, isSection: true, order: 100 },
    { id: 'sec2', name: 'Other', parentId: null, isSection: true, order: 150 },
    { id: 't1', name: 'Task', parentId: 'sec', isSection: false, done: false, order: 200, owner: 'alice@example.com' }
  ];
  a.c.applyPicker(a.c.nodes[2], 'sec2', '');
  const moved = a.c.nodes.find(n => n.id === 't1');
  assert.equal(moved.parentId, 'sec2');
  assert.equal(moved.assignedTo, null);
});

test('assignee-only assignment leaves parentId, date and order untouched and merges sharedWith', () => {
  const a = app(); a.login();
  a.c.nodes = [
    { id: 't1', name: 'Task', parentId: 'sec', isSection: false, done: false, date: '2026-09-19', order: 200,
      owner: 'alice@example.com', assignedTo: null, sharedWith: 'x@y.z' }
  ];
  a.c.applyAssignment(a.c.nodes[0], 'bob@example.com');
  const n = a.c.nodes[0];
  assert.equal(n.parentId, 'sec');
  assert.equal(n.date, '2026-09-19');
  assert.equal(n.order, 200);
  assert.equal(n.assignedTo, 'bob@example.com');
  assert.equal(n.assignedBy, 'alice@example.com');
  assert.equal(n.sharedWith, 'x@y.z,bob@example.com');
});

test('assignee-only assignment to no-one clears assignedTo/assignedBy but keeps sharedWith', () => {
  const a = app(); a.login();
  a.c.nodes = [
    { id: 't1', name: 'Task', parentId: 'sec', isSection: false, done: false, order: 200,
      owner: 'alice@example.com', assignedTo: 'bob@example.com', assignedBy: 'alice@example.com', sharedWith: 'bob@example.com' }
  ];
  a.c.applyAssignment(a.c.nodes[0], null);
  assert.equal(a.c.nodes[0].assignedTo, null);
  assert.equal(a.c.nodes[0].assignedBy, null);
  assert.equal(a.c.nodes[0].sharedWith, 'bob@example.com');
});

test('defaultParentForNewTask honours an explicit No-project choice', () => {
  const a = app(); a.login();
  a.c.lastPickedSection = undefined;
  assert.equal(a.c.defaultParentForNewTask('sec'), 'sec');
  assert.equal(a.c.defaultParentForNewTask(null), null);
  a.c.lastPickedSection = null;
  assert.equal(a.c.defaultParentForNewTask('sec'), null, 'explicit No project must not fall back to current parent');
  a.c.lastPickedSection = 'sec2';
  assert.equal(a.c.defaultParentForNewTask('sec'), 'sec2');
});

test('getSortedAssignees ranks by recency + frequency, then name', () => {
  const a = app(); a.login();
  const base = new Date(2026, 8, 19, 12).getTime();
  a.setNow(base);
  a.c.teamMembers = [
    { email: 'z@c.com', name: 'Zoe' },
    { email: 'x@a.com', name: 'Xander' },
    { email: 'y@b.com', name: 'Yara' }
  ];
  a.c.nodes = [];
  a.c.assigneeFavourites = {
    'z@c.com': 3,                    // legacy number -> score 3
    'x@a.com': { n: 2, t: base },    // fresh -> 2 + 10 = 12
    'y@b.com': { n: 9, t: 0 }        // stale/unknown -> 9
  };
  const order = Array.from(a.c.getSortedAssignees(), u => u.email);
  assert.deepEqual(order, ['x@a.com', 'y@b.com', 'z@c.com']);
});

test('recordFavourite stores {n,t} for assignees and upgrades legacy numbers', () => {
  const a = app(); a.login();
  const base = new Date(2026, 8, 19, 12).getTime();
  a.setNow(base);
  a.c.assigneeFavourites = { 'x@a.com': 3 };
  a.c.recordFavourite('assignee', 'x@a.com');
  const fav = a.c.assigneeFavourites['x@a.com'];
  assert.equal(fav.n, 4);
  assert.equal(fav.t, base);
  // Section favourites stay bare counts.
  a.c.sectionFavourites = { sec1: 1 };
  a.c.recordFavourite('section', 'sec1');
  assert.equal(a.c.sectionFavourites.sec1, 2);
});

test('structure: raw email assign prompt is gone and the unified chooser is present', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.doesNotMatch(src, /teammate@example\.com/, 'raw email prompt must be removed');
  assert.match(src, /function openPeopleChooser/);
  assert.match(src, /Search people|pcSearch|filtered\(\)/, 'chooser must be searchable');
  assert.match(src, /function applyAssignment/);
});

test('structure: Ctrl+Shift+Enter opens assignee-only selection and leaves project untouched', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(src, /e\.key === 'Enter' && e\.shiftKey[\s\S]{0,60}\(e\.ctrlKey \|\| e\.metaKey\)/, 'Ctrl+Shift+Enter branch exists');
  assert.match(src, /showCombinedPicker\(cur\)/, 'Ctrl+Enter keeps the combined picker');
});

test('structure: people chooser handles each arrow key once (single keydown listener)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  // The search input must not also wire keydown — the one document-level
  // listener handles arrows; a second listener makes each press skip an item.
  assert.doesNotMatch(src, /search\.addEventListener\('keydown'/);
});
