const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../identity');

test('backfill reuses one person for each legacy email', () => {
  let next = 0;
  const plan = identity.planLegacyBackfill(
    [{ email: ' Pat@Example.com ', name: 'Pat' }],
    [{ id: 'a', assignedTo: 'pat@example.com' }, { id: 'b', assignedTo: 'PAT@example.com' },
      { id: 'c', assignedTo: 'other@example.com' }],
    () => `person-${++next}`
  );
  assert.equal(plan.people.length, 2);
  assert.deepEqual(plan.links, [
    { nodeId: 'a', personId: 'person-1' }, { nodeId: 'b', personId: 'person-1' },
    { nodeId: 'c', personId: 'person-2' }
  ]);
});

test('a provisional assignment grants no email access and removes the old assignment share', () => {
  const person = identity.createPerson('stable-id', 'Pat', '');
  const fields = identity.assignmentFields(
    { assignedTo: 'old@example.com', sharedWith: 'old@example.com,manager@example.com' },
    person, 'manager@example.com'
  );
  assert.equal(fields.assigneePersonId, 'stable-id');
  assert.equal(fields.assignedTo, '');
  assert.equal(fields.sharedWith, 'manager@example.com');
});

test('linking an email preserves the person ID and rejects a duplicate', () => {
  const provisional = identity.createPerson('stable-id', 'Pat', '');
  const other = identity.createPerson('other-id', 'Lee', 'lee@example.com');
  assert.deepEqual(identity.linkEmail([provisional, other], 'stable-id', ' PAT@Example.com '),
    { personId: 'stable-id', name: 'Pat', email: 'pat@example.com', status: 'active' });
  assert.throws(() => identity.linkEmail([provisional, other], 'stable-id', 'lee@example.com'), /already linked/);
});
