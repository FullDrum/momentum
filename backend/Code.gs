const SHEET_ID = '__CONFIGURE_SHEET_ID__';
const SHEET_NAME = 'nodes';
const COLS = ['id','name','parentId','isSection','done','date','order','owner','assignedTo','assignedBy','sharedWith','completedDate','watching'];

function doGet(e) {
  return ContentService.createTextOutput('Momentum API backend');
}

function doPost(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  try {
    var body = JSON.parse(e.postData.contents);
    var googleUser = verifyGoogleToken(body.token);
    var user = validateUser(googleUser || verifyMomentumSessionToken(body.sessionToken));
    if (!user) {
      output.setContent(JSON.stringify({ error: 'Unauthorized' }));
    } else {
      var result = routeFunction(body.fn, body.arg, user);
      // A successful Google sign-in establishes a durable app session. Normal
      // task requests can then continue without reopening Google's token popup.
      if (body.fn === 'whoAmI' && googleUser && result && !result.error) {
        result.sessionToken = createMomentumSessionToken(user);
      }
      output.setContent(JSON.stringify(result));
    }
  } catch(err) {
    output.setContent(JSON.stringify({ error: err.message }));
  }
  return output;
}

function verifyGoogleToken(token) {
  if (!token) return null;
  try {
    var resp = UrlFetchApp.fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true }
    );
    if (resp.getResponseCode() === 200) {
      var info = JSON.parse(resp.getContentText());
      if (info.email) return info.email.toLowerCase();
    }
    return null;
  } catch(e) {
    return null;
  }
}

// Signed Momentum sessions last 30 days. The signing key is generated once and
// kept in Script Properties; it is never sent to the browser.
function getMomentumSessionSecret() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('momentumSessionSecret');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('momentumSessionSecret', secret);
  }
  return secret;
}

function sessionSignature(payload) {
  var bytes = Utilities.computeHmacSha256Signature(payload, getMomentumSessionSecret());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function createMomentumSessionToken(email) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    email: String(email || '').toLowerCase(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000
  }), Utilities.Charset.UTF_8).replace(/=+$/, '');
  return payload + '.' + sessionSignature(payload);
}

function verifyMomentumSessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    var parts = token.split('.');
    if (parts.length !== 2 || sessionSignature(parts[0]) !== parts[1]) return null;
    var json = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    var session = JSON.parse(json);
    if (!session.email || !session.exp || Number(session.exp) <= Date.now()) return null;
    return String(session.email).toLowerCase();
  } catch (e) {
    return null;
  }
}

function routeFunction(fn, arg, user) {
  var ownerOnly = ['saveTeamMember', 'deleteTeamMember', 'getPeople', 'savePerson', 'getWhitelist',
    'addToWhitelist', 'claimOwnerlessNodes'];
  if (ownerOnly.indexOf(fn) > -1 && user !== getOwnerEmail_())
    return { error: 'Permission denied' };
  switch (fn) {
    case 'whoAmI':              return { email: user, effective: user };
    case 'getInitialData':      return getInitialData_pwa(user);
    case 'getTeamMembers':      return getTeamMembers();
    case 'getPeople':           return getPeople(user);
    case 'savePerson':          return savePerson(arg, user);
    case 'saveTeamMember':      return saveTeamMember(arg);
    case 'deleteTeamMember':    return deleteTeamMember(arg);
    case 'saveNodeServer':      return saveNodeServer_pwa(arg, user);
    case 'deleteNodeServer':    return deleteNode(arg, user);
    case 'deleteNodesServer':   return deleteNodesServer_pwa(arg, user);
    case 'batchOps':            return batchOps(arg, user);
    case 'claimOwnerlessNodes': return claimOwnerlessNodes(user);
    case 'revokeAccess':        return { ok: true };
    case 'getWhitelist':        return getWhitelist();
    case 'addToWhitelist':      return addToWhitelist(arg);
    default:                    return { error: 'Unknown function: ' + fn };
  }
}

// Batched operations endpoint — single round trip handles many saves and deletes.
// Per-item failures don't fail the batch: each result is reported individually
// so the client can re-queue only the failed items.
//
// Order of execution: deletes first, then saves. This matches the client's
// assumption that a delete supersedes any pending save for the same id.
//
// Returns { ok: true, results: { saves: [...], deletes: [...] } }
// Each save result: { id, ok: true } or { id, error: '...' }
// Each delete result: { id, ok: true } or { id, error: '...' }
function batchOps(payload, user) {
  if (!payload || typeof payload !== 'object') return { error: 'Invalid batch payload' };
  var saves = Array.isArray(payload.saves) ? payload.saves : [];
  var deletes = Array.isArray(payload.deletes) ? payload.deletes : [];
  var deleteResults = [];
  if (deletes.length) {
    try {
      var dr = deleteNodesServer_pwa(deletes, user);
      if (!dr || !Array.isArray(dr.results)) throw new Error('Missing delete results');
      deleteResults = dr.results;
    } catch(e) {
      deletes.forEach(function(id) { deleteResults.push({ id: id, error: e.message || 'delete failed' }); });
    }
  }
  var saveResults = [];
  saves.forEach(function(node) {
    if (!node || !node.id) { saveResults.push({ id: (node && node.id) || null, error: 'No id' }); return; }
    try {
      COLS.forEach(function(c) { if (!(c in node)) node[c] = null; });
      node.isSection = node.isSection === true || node.isSection === 'true' || node.isSection === 'TRUE';
      node.done = node.done === true || node.done === 'true' || node.done === 'TRUE';
      node.watching = node.watching === true || node.watching === 'true' || node.watching === 'TRUE';
      var r = saveNode(node, user);
      if (r && r.error) saveResults.push({ id: node.id, error: r.error });
      else if (r && r.ok === true) saveResults.push({ id: node.id, ok: true });
      else saveResults.push({ id: node.id, error: 'Missing save acknowledgement' });
    } catch(e) {
      saveResults.push({ id: node.id, error: e.message || 'save failed' });
    }
  });
  return { ok: true, results: { saves: saveResults, deletes: deleteResults } };
}

function getInitialData_pwa(user) {
  var result = getAll(user);
  result.user = user;
  return result;
}

function saveNodeServer_pwa(node, user) {
  if (!node) return { error: 'No node received' };
  COLS.forEach(function(c) { if (!(c in node)) node[c] = null; });
  node.isSection = node.isSection === true || node.isSection === 'true' || node.isSection === 'TRUE';
  node.done = node.done === true || node.done === 'true' || node.done === 'TRUE';
  node.watching = node.watching === true || node.watching === 'true' || node.watching === 'TRUE';
  return saveNode(node, user);
}

function deleteNodesServer_pwa(ids, user) {
  if (!ids || !ids.length) return { ok: true, deleted: 0, results: [] };
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var byId = Object.create(null);
  var results = [];
  ids.forEach(function(id) {
    var key = String(id || '').trim();
    if (!key) { results.push({ id: id, error: 'No id' }); return; }
    if (byId[key]) return;
    var result = { id: id, ok: true };
    byId[key] = result;
    results.push(result);
  });
  var rowsToDelete = [];
  for (var i = data.length - 1; i >= 1; i--) {
    var rowId = String(data[i][0] || '').trim();
    var result = byId[rowId];
    if (!result) continue;
    var owner = String(data[i][7] || '').trim();
    if (owner === '' || owner === user) rowsToDelete.push({ row: i + 1, result: result });
    else { delete result.ok; result.error = 'Permission denied'; }
  }
  rowsToDelete.sort(function(a, b) { return b.row - a.row; });
  var deleted = 0;
  rowsToDelete.forEach(function(entry) {
    if (entry.result.error) return;
    try { sheet.deleteRow(entry.row); deleted++; }
    catch(e) { delete entry.result.ok; entry.result.error = e.message || 'delete failed'; }
  });
  return { ok: !results.some(function(r) { return !!r.error; }), deleted: deleted, results: results };
}

function getUserEmail() {
  return { email: Session.getEffectiveUser().getEmail() };
}

function whoAmI() {
  return { email: Session.getActiveUser().getEmail() || '', effective: Session.getEffectiveUser().getEmail() || '' };
}

function revokeAccess() {
  try {
    var token = ScriptApp.getOAuthToken();
    UrlFetchApp.fetch('https://oauth2.googleapis.com/revoke?token=' + token, { method: 'post', muteHttpExceptions: true });
    return { ok: true };
  } catch(e) { return { error: e.message }; }
}

function migrateOrder() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var orderCol = data[0].indexOf('order');
  if (orderCol === -1) return;
  var baseTime = Date.now() - (data.length * 1000);
  var updated = 0;
  for (var i = 1; i < data.length; i++) {
    if (!data[i][orderCol]) { sheet.getRange(i+1, orderCol+1).setValue(baseTime + i*1000); updated++; }
  }
  return { ok: true, updated: updated };
}

function registerUser(email) {
  if (email && email.trim()) PropertiesService.getUserProperties().setProperty('userEmail', email.trim());
  return { ok: true };
}

function getUsersSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('users');
  if (!sheet) {
    sheet = ss.insertSheet('users');
    sheet.getRange(1,1,1,3).setValues([['email','name','addedDate']]);
  }
  return sheet;
}

function getTeamMembers() {
  var sheet = getUsersSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1)
    .filter(function(r) { return r[0] && String(r[0]).trim(); })
    .map(function(r) { return { email: String(r[0]).trim(), name: String(r[1]||'').trim() }; });
}

function saveTeamMember(data) {
  var email = (typeof data === 'object' ? data.email : data) || '';
  var name  = (typeof data === 'object' ? data.name  : '') || '';
  if (!email || !email.trim()) return { error: 'No email' };
  email = email.trim().toLowerCase();
  name = (name||'').trim();
  var sheet = getUsersSheet();
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === email) {
      sheet.getRange(i+1, 2).setValue(name);
      return { ok: true, updated: true };
    }
  }
  sheet.appendRow([email, name, new Date().toISOString().slice(0,10)]);
  return { ok: true, added: true };
}

function deleteTeamMember(email) {
  if (!email) return { error: 'No email' };
  email = email.trim().toLowerCase();
  var sheet = getUsersSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim().toLowerCase() === email) { sheet.deleteRow(i+1); return { ok: true }; }
  }
  return { ok: true };
}

function claimOwnerlessNodes(email) {
  if (!email || !email.trim()) return { error: 'No email' };
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var ownerCol = data[0].indexOf('owner');
  var claimed = 0;
  for (var r = 1; r < data.length; r++) {
    if (!data[r][ownerCol]) { sheet.getRange(r+1, ownerCol+1).setValue(email.trim()); claimed++; }
  }
  return { ok: true, claimed: claimed };
}

function getInitialData(clientEmail) {
  var user = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  if (!user && clientEmail) user = validateUser(clientEmail);
  var result = getAll(user);
  result.user = user;
  return result;
}

function getOwnerEmail_() {
  try {
    var owner = SpreadsheetApp.openById(SHEET_ID).getOwner();
    var email = owner ? String(owner.getEmail() || '').trim().toLowerCase() : '';
    if (!email) throw new Error('Owner unavailable');
    return email;
  } catch (e) { throw new Error('Authorization unavailable'); }
}

function validateUser(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return '';
  var owner = getOwnerEmail_();
  if (email === owner) return email;
  try {
    var whitelist = PropertiesService.getScriptProperties().getProperty('whitelist') || '';
    var approved = whitelist.split(',').map(function(e) { return e.trim().toLowerCase(); }).filter(Boolean);
    return approved.indexOf(email) > -1 ? email : '';
  } catch (e) { throw new Error('Authorization unavailable'); }
}

function addToWhitelist(email) {
  if (!email || !email.trim()) return { error: 'No email' };
  try {
    var current = PropertiesService.getScriptProperties().getProperty('whitelist') || '';
    var list = current.split(',').map(function(e){ return e.trim().toLowerCase(); }).filter(Boolean);
    var e = email.trim().toLowerCase();
    if (list.indexOf(e) === -1) list.push(e);
    PropertiesService.getScriptProperties().setProperty('whitelist', list.join(','));
    return { ok: true, whitelist: list };
  } catch(e) { return { error: e.message }; }
}

function getWhitelist() {
  var whitelist = PropertiesService.getScriptProperties().getProperty('whitelist') || '';
  var owner = SpreadsheetApp.openById(SHEET_ID).getOwner().getEmail().toLowerCase();
  var list = whitelist.split(',').map(function(e){ return e.trim().toLowerCase(); }).filter(Boolean);
  if (list.indexOf(owner) === -1) list.unshift(owner);
  return { whitelist: list };
}

function saveNodeServer(node) {
  var user = Session.getEffectiveUser().getEmail();
  if (!node) return { error: 'No node received' };
  COLS.forEach(function(c) { if (!(c in node)) node[c] = null; });
  node.isSection = node.isSection === true || node.isSection === 'true' || node.isSection === 'TRUE';
  node.done = node.done === true || node.done === 'true' || node.done === 'TRUE';
  node.watching = node.watching === true || node.watching === 'true' || node.watching === 'TRUE';
  return saveNode(node, user);
}

function deleteNodeServer(id) {
  return deleteNode(id, Session.getEffectiveUser().getEmail());
}

function deleteNodesServer(ids) {
  if (!ids || !ids.length) return { ok: true, deleted: 0 };
  return deleteNodesServer_pwa(ids, Session.getEffectiveUser().getEmail());
}

function fmtDate(val) {
  if (!val || val === '') return null;
  var d = val instanceof Date ? val : new Date(String(val).replace(' ','T'));
  if (isNaN(d.getTime())) return null;
  return Utilities.formatDate(d, 'Pacific/Auckland', 'yyyy-MM-dd HH:mm:ss');
}

function getSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
}

function getAllRows() {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      obj[h] = h === 'date' ? fmtDate(row[i]) : (row[i] === '' ? null : row[i]);
    });
    obj.isSection = obj.isSection === true || obj.isSection === 'TRUE' || obj.isSection === 1;
    obj.done = obj.done === true || obj.done === 'TRUE' || obj.done === 1;
    obj.watching = obj.watching === true || obj.watching === 'TRUE' || obj.watching === 1;
    return obj;
  });
}

function getAll(user) {
  var all = getAllRows();
  var canSee = {};
  all.forEach(function(n) {
    var owner = n.owner || '';
    var at = n.assignedTo || '';
    var sw = (n.sharedWith||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
    if (!owner || owner === user || at === user || sw.indexOf(user) > -1) canSee[n.id] = true;
  });
  function addAncestors(id) {
    var node = all.filter(function(n){return n.id===id;})[0];
    if (node && node.parentId && !canSee[node.parentId]) { canSee[node.parentId]=true; addAncestors(node.parentId); }
  }
  Object.keys(canSee).forEach(addAncestors);
  function addDescendants(id) {
    all.filter(function(n){return n.parentId===id;}).forEach(function(n){
      if (!canSee[n.id]) { canSee[n.id]=true; addDescendants(n.id); }
    });
  }
  all.filter(function(n){
    var owner=n.owner||'';
    var sw=(n.sharedWith||'').split(',').map(function(s){return s.trim();});
    return !owner || owner===user || sw.indexOf(user)>-1;
  }).forEach(function(n){addDescendants(n.id);});
  var owned = new Set();
  all.forEach(function(n){
    var owner=n.owner||''; var at=n.assignedTo||'';
    var sw=(n.sharedWith||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
    if (!owner||owner===user||at===user||sw.indexOf(user)>-1) owned.add(n.id);
  });
  function addDescSet(id,set,nodes){
    nodes.filter(function(n){return n.parentId===id;}).forEach(function(n){
      if (!set.has(n.id)){set.add(n.id);addDescSet(n.id,set,nodes);}
    });
  }
  [...owned].forEach(function(id){addDescSet(id,owned,all);});
  all.sort(function(a,b){
    return (a.order?String(a.order):'').localeCompare(b.order?String(b.order):'');
  });
  return {
    nodes: all.filter(function(n){return canSee[n.id];}).map(function(n){
      if (user && n.owner && n.owner.trim() !== '' && !owned.has(n.id)) n.readOnlyContext = true;
      return n;
    })
  };
}

function findRowById(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) if (data[i][0] === id) return i + 1;
  return -1;
}

function saveNode(node, user) {
  if (!node || !node.id) return { error: 'No node id' };
  var sheet = getSheet();
  var allRows = getAllRows();
  var existing = allRows.filter(function(n){return n.id===node.id;})[0];
  if (!existing && (!node.name || !String(node.name).trim())) return { ok: true, skipped: true };
  if (existing) {
    var existingOwner = existing.owner || '';
    var isOwner = existingOwner === '' || existingOwner === user;
    var isAssignee = existing.assignedTo === user;
    if (!isOwner && !isAssignee) return { error: 'Permission denied' };
    if (!isOwner) { node.owner=existing.owner; node.sharedWith=existing.sharedWith; node.assignedBy=existing.assignedBy; }
  } else {
    node.owner = user;
  }
  var row = COLS.map(function(c){
    if (c==='isSection'||c==='done'||c==='watching') return node[c]?'TRUE':'FALSE';
    if (c==='date'){
      if (!node[c]||node[c]==='null'||node[c]==='undefined') return '';
      var parsed = new Date(String(node[c]).replace(' ','T'));
      return isNaN(parsed.getTime())?'':parsed;
    }
    var val=node[c];
    if (val===undefined||val===null||val==='null'||val==='undefined') return '';
    return String(val);
  });
  var rowIdx = findRowById(sheet, node.id);
  var targetRange;
  if (rowIdx > 0) {
    targetRange = sheet.getRange(rowIdx, 1, 1, COLS.length);
  } else {
    sheet.appendRow(row);
    targetRange = sheet.getRange(sheet.getLastRow(), 1, 1, COLS.length);
  }
  var formats = COLS.map(function(c){ return c==='date'?'yyyy-MM-dd HH:mm:ss':'@STRING@'; });
  targetRange.setNumberFormats([formats]);
  if (rowIdx > 0) targetRange.setValues([row]);
  return { ok: true };
}

function deleteNode(id, user) {
  if (!id) return { error: 'No id' };
  var sheet = getSheet();
  var all = getAllRows();
  var node = all.filter(function(n){return n.id===id;})[0];
  if (!node) return { ok: true };
  var owner = node.owner || '';
  if (owner !== '' && owner !== user) return { error: 'Permission denied' };
  var data = sheet.getDataRange().getValues();
  for (var i = data.length-1; i >= 1; i--) {
    if (data[i][0] === id) { sheet.deleteRow(i+1); break; }
  }
  return { ok: true };
}
