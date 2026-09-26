// Pure identity rules shared by the migration and the eventual Apps Script backend.
// This file has no access to Sheets or browser storage.
var MomentumIdentity = (function() {
  'use strict';

  function normalEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function createPerson(id, name, email) {
    id = String(id || '').trim();
    name = String(name || '').trim();
    email = normalEmail(email);
    if (!id || !name) throw new Error('A person needs an ID and name');
    return { personId: id, name: name, email: email, status: email ? 'active' : 'provisional' };
  }

  function linkEmail(people, personId, email) {
    email = normalEmail(email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
    var person = people.find(function(p) { return p.personId === personId; });
    if (!person) throw new Error('Unknown person');
    if (people.some(function(p) { return p.personId !== personId && normalEmail(p.email) === email; }))
      throw new Error('Email already linked to another person');
    return createPerson(person.personId, person.name, email);
  }

  // Produces a dry-run backfill. Callers persist the returned rows only after
  // checking conflicts and taking a Sheet backup.
  function planLegacyBackfill(members, nodes, makeId) {
    var byEmail = {};
    var conflicts = [];
    var people = [];
    var links = [];
    (members || []).forEach(function(member) {
      var email = normalEmail(member.email);
      if (!email) return;
      var name = String(member.name || '').trim() || email.split('@')[0];
      if (byEmail[email]) {
        if (byEmail[email].name !== name) conflicts.push({ email: email, names: [byEmail[email].name, name] });
        return;
      }
      var person = createPerson(makeId(), name, email);
      byEmail[email] = person;
      people.push(person);
    });
    (nodes || []).forEach(function(node) {
      var email = normalEmail(node.assignedTo);
      if (!email) return;
      if (!byEmail[email]) {
        var person = createPerson(makeId(), email.split('@')[0], email);
        byEmail[email] = person;
        people.push(person);
      }
      links.push({ nodeId: node.id, personId: byEmail[email].personId });
    });
    return { people: people, links: links, conflicts: conflicts };
  }

  // The old frontend added each assignee to sharedWith. Remove only that old
  // assignment grant when the assignee changes; preserve unrelated shares.
  function assignmentFields(node, person, actorEmail) {
    if (!person || !person.personId) throw new Error('Unknown person');
    var previous = normalEmail(node.assignedTo);
    var email = normalEmail(person.email);
    var shares = String(node.sharedWith || '').split(',').map(normalEmail).filter(Boolean);
    if (previous && previous !== email) shares = shares.filter(function(value) { return value !== previous; });
    return {
      assigneePersonId: person.personId,
      assignedTo: email || '',
      assignedBy: normalEmail(actorEmail),
      sharedWith: Array.from(new Set(shares)).join(',')
    };
  }

  return { normalEmail: normalEmail, createPerson: createPerson, linkEmail: linkEmail,
    planLegacyBackfill: planLegacyBackfill, assignmentFields: assignmentFields };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MomentumIdentity;
