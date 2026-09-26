const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../core.js');

// Acceptance tests for Phase 4a: tree-within-date rendering and set-to-today
// cascade. The app functions run in a vm with stubbed DOM/rendering.

function app() {
  const element = () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, classList: { contains() { return false; }, toggle() {}, add() {}, remove() {} }, addEventListener() {}, querySelector() { return null; } });
  const context = vm.createContext({
    MomentumCore: core,
    console: { log() {}, warn() {}, error() {} },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [2026, 8, 19, 12])); }
      static now() { return new Date(2026, 8, 19, 12).getTime(); }
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { hidden: false, readyState: 'loading', activeElement: null,
      getElementById() { return null; }, querySelector: element, querySelectorAll() { return []; },
      createElement: element, head: element(), body: element(), documentElement: element(), addEventListener() {}
    },
    window: { addEventListener() {}, open() {} }, navigator: {},
    setTimeout() {}, clearTimeout() {}, setInterval() {}, requestAnimationFrame() {},
    location: { reload() {} }, alert() {}, prompt() {},
    Event: function(type) { return { type: type, bubbles: false }; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  context.render = () => {};
  context.showStatusBanner = () => {};
  context.updateQueueBanner = () => {};
  context.markLastSync = () => {};
  return context;
}

function node(id, name, parentId, date) {
  return { id, name, parentId, isSection: false, done: false, date, order: 1 };
}

test('All Tasks nests same-date children under their parent and separates different-date ones', () => {
  const c = app();
  c.activeTab = 'all';
  c.hideDone = false;
  c.collapsed = {};
  c.focusId = null;
  c.nodes = [
    node('p', 'Parent', null, '2026-09-19 10:00:00'),
    node('c1', 'Same day child', 'p', '2026-09-19 12:00:00'),
    node('c2', 'Tomorrow child', 'p', '2026-09-20 10:00:00')
  ];
  const rows = Array.from(c.visibleList(), r => ({ id: r.node.id, depth: r.depth }));
  const ids = rows.map(r => r.id);
  const depth = id => rows.find(r => r.id === id).depth;
  assert.equal(depth('p'), 0);
  assert.equal(depth('c1'), 1, 'same-date child nests under parent');
  assert.equal(depth('c2'), 0, 'different-date child is a top-level entry');
  assert.equal(ids.indexOf('c1'), ids.indexOf('p') + 1, 'same-date child is adjacent to parent');
});

test('Today excludes a child whose date is not today', () => {
  const c = app();
  c.activeTab = 'today';
  c.hideDone = false;
  c.collapsed = {};
  c.focusId = null;
  c.nodes = [
    node('p', 'Parent today', null, '2026-09-19 10:00:00'),
    node('c1', 'Child today', 'p', '2026-09-19 12:00:00'),
    node('c2', 'Child later', 'p', '2026-09-20 10:00:00')
  ];
  const ids = Array.from(c.visibleList(), r => r.node.id);
  assert.ok(ids.includes('p') && ids.includes('c1'), 'today parent and same-date child appear');
  assert.ok(!ids.includes('c2'), 'non-today child must not appear in Today');
});

test('setTaskToday cascades today date to the whole subtree', () => {
  const c = app();
  c.nodes = [
    node('p', 'Parent', null, null),
    node('c1', 'Child', 'p', null),
    node('c2', 'Grandchild', 'c1', null)
  ];
  c.setTaskToday(c.nodes.find(n => n.id === 'p'));
  const day = id => c.nodes.find(n => n.id === id).date.slice(0, 10);
  assert.equal(day('p'), '2026-09-19');
  assert.equal(day('c1'), '2026-09-19');
  assert.equal(day('c2'), '2026-09-19');
});

test('structure: same-date nesting and set-to-today cascade are wired', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(src, /function dateKey/);
  assert.match(src, /function setTaskToday/);
  assert.match(src, /dateKey\(c\) !== dateKey\(n\)/);
  assert.match(src, /setTaskToday\(/);
});

test('structure: Tab indent is enabled in Today/All Tasks with a same-date guard', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.doesNotMatch(src, /inp\.dataset\.flat === 'true'\) return/, 'flat-view Tab guard is removed');
  assert.match(src, /dateKey\(target\) !== dateKey\(cur\)/, 'same-date indent guard exists');
});

test('structure: service worker auto-activates on install', () => {
  const src = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  assert.match(src, /self\.skipWaiting\(\)/);
});

test('drag: same-date child drop nests in All Tasks', () => {
  const c = app();
  c.activeTab = 'all';
  c.collapsed = {};
  c.nodes = [
    node('a', 'A', null, '2026-09-19 10:00:00'),
    node('b', 'B', null, '2026-09-19 12:00:00')
  ];
  c.performDrop(['b'], 'a', 'child');
  assert.equal(c.nodes.find(n => n.id === 'b').parentId, 'a');
});

test('drag: cross-date child drop does not nest in All Tasks', () => {
  const c = app();
  c.activeTab = 'all';
  c.collapsed = {};
  c.nodes = [
    node('a', 'A', null, '2026-09-19 10:00:00'),
    node('b', 'B', null, '2026-09-20 10:00:00')
  ];
  c.performDrop(['b'], 'a', 'child');
  assert.equal(c.nodes.find(n => n.id === 'b').parentId, null, 'cross-date drop stays reorder-only');
});

test('drag: cycle prevention stops a parent being dropped into its own child', () => {
  const c = app();
  c.activeTab = 'tree';
  c.collapsed = {};
  c.nodes = [
    node('a', 'A', null, '2026-09-19 10:00:00'),
    node('b', 'B', 'a', '2026-09-19 12:00:00')
  ];
  c.performDrop(['a'], 'b', 'child');
  assert.equal(c.nodes.find(n => n.id === 'a').parentId, null, 'parent must not move into its own child');
});

test('All Tasks orders same-date top-level tasks by tree position, not date-time', () => {
  const c = app();
  c.activeTab = 'all';
  c.hideDone = false;
  c.collapsed = {};
  c.focusId = null;
  c.nodes = [
    node('b', 'B', null, '2026-09-19 10:00:00'), // tree-first, earlier time
    node('a', 'A', null, '2026-09-19 12:00:00')  // tree-second, later time
  ];
  const ids = Array.from(c.visibleList(), r => r.node.id);
  assert.deepEqual(ids, ['b', 'a'], 'tree order wins over date-time order');
});

test('Enter in a child inserts a new sibling at the top of the same parent', () => {
  const c = app();
  c.activeTab = 'today';
  c.hideDone = false;
  c.collapsed = {};
  c.focusId = null;
  c.nodes = [
    node('p', 'Parent', null, '2026-09-19 10:00:00'),
    node('c', 'Child', 'p', '2026-09-19 12:00:00')
  ];
  const inp = { dataset: { id: 'c', flat: 'true' }, value: 'Child' };
  const e = { key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, preventDefault() {} };
  c.handleKey(e, inp);
  assert.equal(c.nodes.length, 3);
  assert.equal(c.nodes[0].id, 'p');
  assert.equal(c.nodes[1].parentId, 'p', 'new task is in the same parent');
  assert.notEqual(c.nodes[1].id, 'c', 'new sibling sits before the child');
  assert.equal(c.nodes[2].id, 'c');
  assert.equal(c.focusId, c.nodes[1].id, 'new task is focused');
});
