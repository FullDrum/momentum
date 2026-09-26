// Person IDs remain stable when an email is linked or changed.
var PEOPLE_HEADERS = ['personId', 'name', 'email', 'status'];

function peopleSheet_() {
  var spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  var sheet = spreadsheet.getSheetByName('people');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('people');
    sheet.getRange(1, 1, 1, PEOPLE_HEADERS.length).setValues([PEOPLE_HEADERS]);
  }
  var headers = sheet.getRange(1, 1, 1, PEOPLE_HEADERS.length).getValues()[0];
  if (headers.join('|') !== PEOPLE_HEADERS.join('|')) throw new Error('People sheet headers do not match');
  return sheet;
}

function readPeople_() {
  var rows = peopleSheet_().getDataRange().getValues();
  return rows.slice(1).filter(function(row) { return String(row[0] || '').trim(); })
    .map(function(row) {
      return { personId: String(row[0]).trim(), name: String(row[1] || '').trim(),
        email: String(row[2] || '').trim().toLowerCase(), status: String(row[3] || '').trim() };
    });
}

function normalPersonEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function validPersonEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function withoutAssignmentShare_(sharedWith, oldEmail) {
  var old = normalPersonEmail_(oldEmail);
  return String(sharedWith || '').split(',').map(function(s) { return s.trim(); })
    .filter(function(s) { return s && normalPersonEmail_(s) !== old; }).join(',');
}

// Older clients send only assignedTo. For unchanged assignments, keep the stable
// ID already on the row; an explicit blank assigneePersonId from a new client
// means unassign. The server always derives assignedTo from a supplied ID.
function resolveNodeAssignment_(node, existing, user) {
  var explicitId = Object.prototype.hasOwnProperty.call(node, 'assigneePersonId');
  var id = String(node.assigneePersonId || '').trim();
  var email = normalPersonEmail_(node.assignedTo);
  var oldEmail = normalPersonEmail_(existing && existing.assignedTo);
  var oldId = String(existing && existing.assigneePersonId || '').trim();
  if (!explicitId && existing && email === oldEmail) id = oldId;
  if (id) {
    var person = readPeople_().filter(function(p) { return p.personId === id; })[0];
    if (!person) return { error: 'Unknown assignee person' };
    email = person.email;
  } else if (email) {
    if (!validPersonEmail_(email)) return { error: 'Invalid assignee email' };
    var linked = findOrCreateLegacyPerson_(email);
    id = linked.personId;
  }
  node.assigneePersonId = id || '';
  node.assignedTo = email || '';
  if (oldEmail && oldEmail !== email)
    node.sharedWith = withoutAssignmentShare_(node.sharedWith, oldEmail);
  if (!email && !id) node.assignedBy = '';
  else if (!existing || oldId !== id || oldEmail !== email) node.assignedBy = user;
  return { ok: true };
}

function findOrCreateLegacyPerson_(email) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = peopleSheet_();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (normalPersonEmail_(rows[i][2]) === email)
        return { personId: String(rows[i][0]).trim(), email: email };
    }
    var id = Utilities.getUuid();
    sheet.appendRow([id, email.split('@')[0], email, 'active']);
    return { personId: id, email: email };
  } finally {
    lock.releaseLock();
  }
}

function planPeopleBackfill_() {
  var people = readPeople_();
  var byEmail = {};
  var byId = {};
  var conflicts = [];
  people.forEach(function(p) {
    if (byId[p.personId]) conflicts.push('Duplicate person ID: ' + p.personId);
    byId[p.personId] = p;
    if (p.email) {
      if (byEmail[p.email]) conflicts.push('Duplicate person email: ' + p.email);
      byEmail[p.email] = p;
    }
  });
  var memberNames = {};
  getTeamMembers().forEach(function(m) {
    var email = normalPersonEmail_(m.email);
    if (email && m.name) memberNames[email] = m.name;
  });
  var newPeople = [];
  var links = [];
  getAllRows().forEach(function(node, index) {
    var email = normalPersonEmail_(node.assignedTo);
    var id = String(node.assigneePersonId || '').trim();
    if (id) {
      if (!byId[id]) conflicts.push('Unknown person ID on node: ' + node.id);
      else if (email && byId[id].email !== email) conflicts.push('Assignee email mismatch on node: ' + node.id);
      return;
    }
    if (!email) return;
    if (!validPersonEmail_(email)) { conflicts.push('Invalid assignee email on node: ' + node.id); return; }
    if (!byEmail[email]) {
      byEmail[email] = { email: email, name: memberNames[email] || email.split('@')[0] };
      newPeople.push(byEmail[email]);
    }
    links.push({ row: index + 2, nodeId: node.id, email: email });
  });
  return { newPeople: newPeople, links: links, conflicts: conflicts };
}

function previewPersonBackfill_(user) {
  if (user !== getOwnerEmail_()) return { error: 'Permission denied' };
  var plan = planPeopleBackfill_();
  return { newPeople: plan.newPeople.length, nodesToLink: plan.links.length,
    conflicts: plan.conflicts };
}

// Run only after a Sheet backup. Re-running resumes a partial migration without
// creating duplicate people or changing legacy assignedTo values.
function migratePeople_(user) {
  if (user !== getOwnerEmail_()) return { error: 'Permission denied' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var plan = planPeopleBackfill_();
    if (plan.conflicts.length) return { error: 'Migration conflicts', conflicts: plan.conflicts };
    var peopleSheet = peopleSheet_();
    var byEmail = {};
    readPeople_().forEach(function(p) { if (p.email) byEmail[p.email] = p.personId; });
    plan.newPeople.forEach(function(p) {
      var id = Utilities.getUuid();
      peopleSheet.appendRow([id, p.name, p.email, 'active']);
      byEmail[p.email] = id;
    });
    var nodesSheet = getSheet();
    plan.links.forEach(function(link) {
      nodesSheet.getRange(link.row, COLS.length).setValue(byEmail[link.email]);
    });
    return { ok: true, peopleCreated: plan.newPeople.length, nodesLinked: plan.links.length };
  } finally {
    lock.releaseLock();
  }
}

function getPeople_(user) {
  if (user !== getOwnerEmail_()) return { error: 'Permission denied' };
  return { people: readPeople_() };
}

function savePerson_(data, user) {
  if (user !== getOwnerEmail_()) return { error: 'Permission denied' };
  data = data || {};
  var name = String(data.name || '').trim();
  var email = normalPersonEmail_(data.email);
  var id = String(data.personId || '').trim();
  if (!name) return { error: 'Name required' };
  if (email && !validPersonEmail_(email)) return { error: 'Invalid email' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = peopleSheet_();
    var rows = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var previousEmail = '';
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === id && id) {
        rowIndex = i + 1;
        previousEmail = normalPersonEmail_(rows[i][2]);
      }
      if (email && String(rows[i][2] || '').trim().toLowerCase() === email && String(rows[i][0]).trim() !== id)
        return { error: 'Email already linked to another person' };
    }
    if (id && rowIndex < 0) return { error: 'Unknown person' };
    if (!id) id = Utilities.getUuid();
    var person = { personId: id, name: name, email: email,
      status: email ? 'active' : 'provisional' };
    var values = [[person.personId, person.name, person.email, person.status]];
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, PEOPLE_HEADERS.length).setValues(values);
    else sheet.appendRow(values[0]);
    if (rowIndex > 0 && previousEmail !== email) {
      var nodesSheet = getSheet();
      var nodeRows = nodesSheet.getDataRange().getValues();
      for (var n = 1; n < nodeRows.length; n++) {
        if (String(nodeRows[n][COLS.length - 1] || '').trim() !== id) continue;
        nodesSheet.getRange(n + 1, 9).setValue(email);
        if (previousEmail)
          nodesSheet.getRange(n + 1, 11).setValue(withoutAssignmentShare_(nodeRows[n][10], previousEmail));
      }
    }
    return { ok: true, person: person };
  } finally {
    lock.releaseLock();
  }
}
