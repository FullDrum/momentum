// Persistent, reviewed task memory, stored in the separate archive spreadsheet.
// Unlike original transcripts, these records do not expire automatically.
var VOICE_MEMORY_TAB = 'task_memory';

function voiceMemorySheet_() {
  var book = voiceArchiveSheet_().getParent();
  var sheet = book.getSheetByName(VOICE_MEMORY_TAB);
  if (!sheet) {
    sheet = book.insertSheet(VOICE_MEMORY_TAB);
    sheet.appendRow(['entryId','taskId','owner','createdAt','summary','outcome','nextAction','status','sourceRecordId','requestId']);
  }
  return sheet;
}
function voiceMemoryTaskAllowed_(taskId, user) {
  voiceArchiveAccess_(user);
  var data = getAll(user);
  return !!(data && Array.isArray(data.nodes) && data.nodes.some(function(n) {
    return String(n.id) === taskId && !n.isSection;
  }));
}
function voiceMemoryStore_(arg, user) {
  var taskId = String(arg && arg.taskId || '').trim();
  if (!taskId || !voiceMemoryTaskAllowed_(taskId,user)) return { error: 'Task not found or permission denied' };
  var memory = arg && arg.memory || {};
  var summary = String(memory.summary || '').trim();
  var outcome = String(memory.outcome || '').trim();
  var nextAction = String(memory.nextAction || '').trim();
  var status = String(memory.status || 'pending');
  var requestId = String(arg.requestId || '').trim();
  if (!summary || summary.length > 12000 || outcome.length > 4000 || nextAction.length > 4000 ||
      ['pending','in_progress','waiting','completed'].indexOf(status) < 0 ||
      !requestId || requestId.length > 100) return { error: 'Invalid memory entry' };
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = voiceMemorySheet_();
    var rows = sheet.getDataRange().getValues();
    for (var i=1;i<rows.length;i++) {
      if (String(rows[i][9]) === requestId && String(rows[i][2]) === user) {
        return { ok: true, entryId: String(rows[i][0]), duplicate: true };
      }
    }
    var entryId = Utilities.getUuid();
    sheet.appendRow([entryId,taskId,user,new Date().toISOString(),
      "'" + summary,"'" + outcome,"'" + nextAction,status,String(arg.sourceRecordId || ''),requestId]);
    return { ok: true, entryId: entryId };
  } finally { lock.releaseLock(); }
}
function voiceMemoryList_(arg,user) {
  var taskId = String(arg && arg.taskId || '').trim();
  if (!taskId || !voiceMemoryTaskAllowed_(taskId,user)) return { error: 'Task not found or permission denied' };
  var rows = voiceMemorySheet_().getDataRange().getValues();
  var entries = rows.slice(1).filter(function(r) {
    return String(r[1]) === taskId && String(r[2]) === user;
  }).map(function(r) {
    function unescapeCell(x) { return String(x || '').replace(/^'/,''); }
    return { entryId:String(r[0]), at:String(r[3]), text:unescapeCell(r[4]),
      memory:{summary:unescapeCell(r[4]),outcome:unescapeCell(r[5]),
        nextAction:unescapeCell(r[6]),status:String(r[7]),sourceRecordId:String(r[8]||'')} };
  });
  entries.sort(function(a,b){return b.at.localeCompare(a.at);});
  return { ok:true, entries:entries.slice(0,200) };
}
