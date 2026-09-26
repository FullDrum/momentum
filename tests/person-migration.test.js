const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HEADERS = ['id','name','parentId','isSection','done','date','order','owner','assignedTo',
  'assignedBy','sharedWith','completedDate','watching','assigneePersonId'];

function harness() {
  let nextId = 0;
  const tables = {
    nodes: [HEADERS.slice(), ['task-1','Task','','FALSE','FALSE','',1,'owner@example.com',
      'bob@example.com','owner@example.com','bob@example.com','','FALSE','']],
    users: [['email','name','addedDate'], ['bob@example.com','Bob','2026-09-27']],
    people: [['personId','name','email','status']]
  };
  function sheet(name) {
    const rows = tables[name];
    return {
      getDataRange() { return { getValues() { return rows.map(row => row.slice()); } }; },
      getRange(row, col, height = 1, width = 1) { return {
        getValues() { return Array.from({ length: height }, (_, i) =>
          Array.from({ length: width }, (_, j) => (rows[row - 1 + i] || [])[col - 1 + j] || '')); },
        setValues(values) { values.forEach((value, i) => { rows[row - 1 + i] ||= []; value.forEach((cell, j) => {
          rows[row - 1 + i][col - 1 + j] = cell;
        }); }); },
        setValue(value) { rows[row - 1] ||= []; rows[row - 1][col - 1] = value; },
        setNumberFormats() {}
      }; },
      appendRow(row) { rows.push(row.slice()); },
      getLastRow() { return rows.length; },
      deleteRow(row) { rows.splice(row - 1, 1); }
    };
  }
  const context = vm.createContext({
    SpreadsheetApp: { openById() { return {
      getOwner() { return { getEmail() { return 'owner@example.com'; } }; },
      getSheetByName(name) { return tables[name] ? sheet(name) : null; },
      insertSheet(name) { tables[name] = []; return sheet(name); }
    }; } },
    LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
    Utilities: { getUuid() { return `person-${++nextId}`; } }
  });
  for (const file of ['Code.gs', 'People.gs']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend', file), 'utf8'), context);
  }
  return { context, tables };
}

test('legacy backfill is idempotent and preserves email-based access', () => {
  const { context: c, tables } = harness();
  assert.equal(c.previewPersonBackfill_('owner@example.com').nodesToLink, 1);
  const result = c.migratePeople_('owner@example.com');
  assert.equal(result.peopleCreated, 1);
  assert.equal(result.nodesLinked, 1);
  assert.equal(tables.nodes[1][8], 'bob@example.com');
  assert.equal(tables.nodes[1][13], tables.people[1][0]);
  assert.equal(c.migratePeople_('owner@example.com').peopleCreated, 0);
  assert.equal(tables.people.length, 2);
  assert.equal(c.getAll('bob@example.com').nodes.length, 1);
});

test('name-only reassignment removes old access; linking email keeps the task and ID', () => {
  const { context: c, tables } = harness();
  c.migratePeople_('owner@example.com');
  const provisional = c.savePerson_({ name: 'Pat' }, 'owner@example.com').person;
  const node = c.getAllRows()[0];
  node.assigneePersonId = provisional.personId;
  assert.equal(c.saveNode(node, 'owner@example.com').ok, true);
  assert.equal(tables.nodes[1][8], '');
  assert.equal(tables.nodes[1][10], '');
  assert.equal(tables.nodes[1][13], provisional.personId);
  assert.equal(c.getAll('bob@example.com').nodes.length, 0);
  const oldClientEdit = c.getAllRows()[0];
  delete oldClientEdit.assigneePersonId;
  oldClientEdit.name = 'Updated task';
  assert.equal(c.saveNode(oldClientEdit, 'owner@example.com').ok, true);
  assert.equal(tables.nodes[1][13], provisional.personId);
  const linked = c.savePerson_({ personId: provisional.personId, name: 'Pat', email: 'pat@example.com' },
    'owner@example.com').person;
  assert.equal(linked.personId, provisional.personId);
  assert.equal(tables.nodes[1][8], 'pat@example.com');
  assert.equal(c.getAll('pat@example.com').nodes.length, 1);
});

test('older clients preserve an unchanged person ID and assignees cannot reassign', () => {
  const { context: c, tables } = harness();
  c.migratePeople_('owner@example.com');
  const id = tables.nodes[1][13];
  const oldClientNode = c.getAllRows()[0];
  delete oldClientNode.assigneePersonId;
  oldClientNode.name = 'Edited task';
  assert.equal(c.saveNode(oldClientNode, 'owner@example.com').ok, true);
  assert.equal(tables.nodes[1][13], id);
  const attempted = c.getAllRows()[0];
  attempted.assigneePersonId = '';
  attempted.assignedTo = '';
  assert.equal(c.saveNode(attempted, 'bob@example.com').ok, true);
  assert.equal(tables.nodes[1][13], id);
  assert.equal(tables.nodes[1][8], 'bob@example.com');
});

test('migration reports duplicate people and leaves nodes unchanged', () => {
  const { context: c, tables } = harness();
  tables.people.push(['person-a', 'Bob', 'bob@example.com', 'active']);
  tables.people.push(['person-b', 'Robert', 'BOB@example.com', 'active']);
  assert.match(c.migratePeople_('owner@example.com').error, /conflicts/);
  assert.equal(tables.nodes[1][13], '');
  assert.equal(tables.people.length, 3);
});

test('a wrong nodes header fails before migration writes', () => {
  const { context: c, tables } = harness();
  tables.nodes[0][13] = 'wrongHeader';
  assert.throws(() => c.migratePeople_('owner@example.com'), /headers do not match/);
  assert.equal(tables.people.length, 1);
  assert.equal(tables.nodes[1][13], '');
});
