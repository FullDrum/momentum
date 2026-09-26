const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function backend() {
  let peopleRows = null;
  let nextId = 0;
  const sheet = {
    getRange(row, col, height, width) {
      return {
        getValues() { return Array.from({ length: height }, (_, i) => peopleRows[row - 1 + i].slice(col - 1, col - 1 + width)); },
        setValues(values) { values.forEach((value, i) => { peopleRows[row - 1 + i] = value.slice(); }); }
      };
    },
    getDataRange() { return { getValues() { return peopleRows.map(row => row.slice()); } }; },
    appendRow(row) { peopleRows.push(row.slice()); }
  };
  const context = vm.createContext({
    SHEET_ID: 'test-sheet',
    SpreadsheetApp: { openById() { return {
      getSheetByName() { return peopleRows ? sheet : null; },
      insertSheet() { peopleRows = []; return sheet; }
    }; } },
    LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
    Utilities: { getUuid() { return `person-${++nextId}`; } },
    getOwnerEmail_() { return 'owner@example.com'; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backend/People.gs'), 'utf8'), context);
  return { context, rows: () => peopleRows };
}

test('only the owner can create a provisional person', () => {
  const b = backend();
  assert.equal(b.context.savePerson({ name: 'Pat' }, 'outsider@example.com').error, 'Permission denied');
  assert.equal(b.rows(), null);
  const result = b.context.savePerson({ name: 'Pat' }, 'owner@example.com');
  assert.equal(result.person.personId, 'person-1');
  assert.equal(result.person.status, 'provisional');
  assert.equal(result.person.email, '');
});

test('adding an email keeps the ID and rejects duplicate links', () => {
  const b = backend();
  const first = b.context.savePerson({ name: 'Pat' }, 'owner@example.com').person;
  const second = b.context.savePerson({ name: 'Lee', email: 'lee@example.com' }, 'owner@example.com').person;
  const linked = b.context.savePerson({ personId: first.personId, name: 'Pat', email: ' PAT@Example.com ' }, 'owner@example.com');
  assert.equal(linked.person.personId, first.personId);
  assert.equal(linked.person.email, 'pat@example.com');
  assert.equal(b.context.savePerson({ personId: first.personId, name: 'Pat', email: second.email }, 'owner@example.com').error,
    'Email already linked to another person');
  assert.equal(b.rows().length, 3);
});
