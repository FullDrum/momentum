// Optional cross-project task links in the separate Momentum voice archive spreadsheet.
// Links do not alter the primary task parent and require explicit user approval.
var TASK_LINKS_TAB = 'task_links';
var TASK_LINK_TYPES = ['related','blocks','supports','alternative'];
function taskLinksSheet_() {
  var book = voiceArchiveSheet_().getParent();
  var sheet = book.getSheetByName(TASK_LINKS_TAB);
  if (!sheet) {
    sheet = book.insertSheet(TASK_LINKS_TAB);
    sheet.appendRow(['linkId','fromId','toId','type','owner','createdAt','requestId']);
  }
  return sheet;
}
function taskLinksAccess_(user, fromId, toId) {
  voiceArchiveAccess_(user);
  var data = getAll(user);
  var ids = {};
  (data && data.nodes || []).forEach(function(n) { if (!n.isSection) ids[String(n.id)] = true; });
  return !!(ids[fromId] && ids[toId]);
}
function taskLinksList_(arg,user) {
  var taskId = String(arg && arg.taskId || '');
  voiceArchiveAccess_(user);
  if (!taskId || !taskLinksAccess_(user,taskId,taskId)) return {error:'Task not found'};
  var rows = taskLinksSheet_().getDataRange().getValues();
  return {ok:true, links:rows.slice(1).filter(function(r){
    return String(r[4]) === user && (String(r[1]) === taskId || String(r[2]) === taskId);
  }).map(function(r){return {linkId:String(r[0]),fromId:String(r[1]),toId:String(r[2]),type:String(r[3]),createdAt:String(r[5])};})};
}
function taskLinksCreate_(arg,user) {
  var fromId = String(arg && arg.fromId || ''), toId = String(arg && arg.toId || '');
  var type = String(arg && arg.type || ''), requestId = String(arg && arg.requestId || '');
  if (!arg || arg.approved !== true) return {error:'Explicit approval required'};
  if (!fromId || !toId || fromId === toId || TASK_LINK_TYPES.indexOf(type) < 0 ||
      !requestId || requestId.length > 100) return {error:'Invalid link'};
  if (!taskLinksAccess_(user,fromId,toId)) return {error:'Task not found or permission denied'};
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sheet = taskLinksSheet_(), rows = sheet.getDataRange().getValues();
    for (var i=1;i<rows.length;i++) {
      var r=rows[i];
      if (String(r[4]) !== user) continue;
      if (String(r[6]) === requestId ||
          (String(r[1]) === fromId && String(r[2]) === toId && String(r[3]) === type))
        return {ok:true,linkId:String(r[0]),duplicate:true};
    }
    var linkId = Utilities.getUuid();
    sheet.appendRow([linkId,fromId,toId,type,user,new Date().toISOString(),requestId]);
    return {ok:true,linkId:linkId};
  } finally {lock.releaseLock();}
}
