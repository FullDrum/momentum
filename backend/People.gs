// Add this file to the Apps Script project after Code.gs is under local review.
// The route must pass its validated user and restrict mutations to the Sheet owner.
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

function getPeople(user) {
  if (user !== getOwnerEmail_()) return { error: 'Permission denied' };
  return { people: readPeople_() };
}

function savePerson(data, user) {
  if (user !== getOwnerEmail_()) return { error: 'Permission denied' };
  data = data || {};
  var name = String(data.name || '').trim();
  var email = String(data.email || '').trim().toLowerCase();
  var id = String(data.personId || '').trim();
  if (!name) return { error: 'Name required' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Invalid email' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = peopleSheet_();
    var rows = sheet.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === id && id) rowIndex = i + 1;
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
    return { ok: true, person: person };
  } finally {
    lock.releaseLock();
  }
}
