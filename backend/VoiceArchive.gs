// Separate original-transcript archive for Momentum.
// Configure VOICE_ARCHIVE_SHEET_ID in Apps Script Properties to the ID of a
// dedicated spreadsheet. Do not use the main Momentum tasks spreadsheet.
// This source file alone does not deploy or create a trigger.
var VOICE_ARCHIVE_DAYS = 30;
var VOICE_ARCHIVE_TAB = 'originals';

function voiceArchiveSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('VOICE_ARCHIVE_SHEET_ID');
  if (!id) throw new Error('Voice archive is not configured');
  var book = SpreadsheetApp.openById(id);
  var sheet = book.getSheetByName(VOICE_ARCHIVE_TAB);
  if (!sheet) {
    sheet = book.insertSheet(VOICE_ARCHIVE_TAB);
    sheet.appendRow(['recordId', 'taskId', 'owner', 'createdAt', 'expiresAt', 'keepOriginal', 'transcript']);
  }
  return sheet;
}

function voiceArchiveAccess_(user) {
  if (!user || user !== getOwnerEmail_()) throw new Error('Permission denied');
}

function voiceArchiveClean_() {
  var sheet = voiceArchiveSheet_();
  var values = sheet.getDataRange().getValues();
  var now = Date.now();
  var removed = 0;
  for (var i = values.length - 1; i >= 1; i--) {
    var keep = String(values[i][5]).toLowerCase() === 'true';
    var expires = new Date(values[i][4]).getTime();
    if (!keep && Number.isFinite(expires) && expires <= now) {
      sheet.deleteRow(i + 1);
      removed++;
    }
  }
  return removed;
}

// Install a daily time-based trigger for voiceArchiveClean_ during setup.
function voiceArchiveInstallCleanup_() {
  var existing = ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === 'voiceArchiveClean_';
  });
  if (!existing) ScriptApp.newTrigger('voiceArchiveClean_').timeBased().everyDays(1).create();
}

// The trigger executes under the Apps Script deployment account.
function voiceArchiveStore_(arg, user) {
  voiceArchiveAccess_(user);
  if (!arg || typeof arg !== 'object') return { error: 'Invalid request' };
  var taskId = String(arg.taskId || '').trim();
  var transcript = String(arg.transcript || '').trim();
  if (!taskId || !transcript || transcript.length > 30000) return { error: 'Invalid original' };
  var all = getAll(user);
  if (!all || !Array.isArray(all.nodes) || !all.nodes.some(function(n) {
    return String(n.id) === taskId && !n.isSection;
  })) return { error: 'Task not found' };
  var created = new Date();
  var expires = new Date(created.getTime() + VOICE_ARCHIVE_DAYS * 86400000);
  var id = Utilities.getUuid();
  var keep = arg.keepOriginal === true;
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    voiceArchiveClean_();
    voiceArchiveSheet_().appendRow([id, taskId, user, created.toISOString(), expires.toISOString(), keep, "'" + transcript]);
  } finally { lock.releaseLock(); }
  return { ok: true, recordId: id, expiresAt: keep ? null : expires.toISOString(), keepOriginal: keep };
}

function voiceArchiveList_(arg, user) {
  voiceArchiveAccess_(user);
  var taskId = String(arg && arg.taskId || '');
  if (!taskId) return { error: 'Missing task' };
  var all = getAll(user);
  if (!all || !Array.isArray(all.nodes) || !all.nodes.some(function(n) {
    return String(n.id) === taskId && !n.isSection;
  })) return { error: 'Task not found' };
  voiceArchiveClean_();
  var rows = voiceArchiveSheet_().getDataRange().getValues();
  return { ok: true, records: rows.slice(1).filter(function(row) {
    return String(row[1]) === taskId && String(row[2]) === user;
  }).map(function(row) {
    var keep = String(row[5]).toLowerCase() === 'true';
    return { recordId: String(row[0]), createdAt: String(row[3]),
      expiresAt: keep ? null : String(row[4]), keepOriginal: keep, transcript: String(row[6]) };
  }) };
}

function voiceArchiveKeep_(arg, user) {
  voiceArchiveAccess_(user);
  var recordId = String(arg && arg.recordId || '');
  if (!recordId || !arg || typeof arg.keepOriginal !== 'boolean') return { error: 'Invalid request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    voiceArchiveClean_();
    var sheet = voiceArchiveSheet_();
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === recordId && String(rows[i][2]) === user) {
        sheet.getRange(i + 1, 6).setValue(arg.keepOriginal);
        if (!arg.keepOriginal) {
          // Restart 30-day retention when an original is unpinned.
          sheet.getRange(i + 1, 5).setValue(new Date(Date.now() + VOICE_ARCHIVE_DAYS * 86400000).toISOString());
        }
        return { ok: true };
      }
    }
    return { error: 'Original not found' };
  } finally { lock.releaseLock(); }
}
