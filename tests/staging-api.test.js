const {test}=require('node:test');const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');
require('../task-relations.js');const R=globalThis.MomentumTaskRelations;
const api=import('../staging/worker/api.js');
function database(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('staging/drizzle/0000_staging.sql','utf8'));
 return {prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}};}};
}
const capture=(requestId,transcript='Confirm decanter freight')=>({requestId,taskId:null,transcript,summary:'',outcome:'',nextAction:'',status:'pending'});
async function setup(){const a=await api,db=database(),repo=new a.StagingRepository(db);return {a,db,repo,run:(owner,path,body)=>a.execute(repo,owner,'/api/'+path,body,R)};}
test('saved notes survive new sessions/repository instances and are isolated by account',async()=>{
 const {a,db,run}=await setup();await run('alice','capture',capture('first'));
 const fromAnotherSession=await a.execute(new a.StagingRepository(db),'alice','/api/state',{},R);
 assert.equal(fromAnotherSession.notes[0].transcript,'Confirm decanter freight');assert.equal(fromAnotherSession.tasks.length,1);
 assert.equal((await run('bob','state',{})).notes.length,0);
});
test('capture retry deduplicates after response loss and rejects changed payloads using same request ID',async()=>{
 const {run}=await setup();await run('alice','capture',capture('same'));const retry=await run('alice','capture',capture('same'));
 assert.equal(retry.duplicate,true);assert.equal(retry.notes.length,1);assert.equal(retry.revision,1);
 await assert.rejects(run('alice','capture',capture('same','different')),/different content/);
});
test('concurrent writes serialize through SQLite compare-and-swap without lost notes',async()=>{
 const {run}=await setup();await Promise.all([run('alice','capture',capture('one')),run('alice','capture',capture('two'))]);
 const result=await run('alice','state',{});assert.equal(result.notes.length,2);assert.equal(result.tasks.length,2);assert.equal(result.revision,2);
});
test('reviewed structure persists, preserves a single parent and rejects stale approvals',async()=>{
 const {run}=await setup();await run('alice','capture',capture('goal','Decanter import'));await run('alice','capture',capture('freight','Freight quote'));
 const {proposal}=await run('alice','preview',{kind:'move',taskId:'capture_freight',targetId:'capture_goal'});
 await assert.rejects(run('alice','apply',{requestId:'unapproved',proposal,approved:false}),/approval/);
 const result=await run('alice','apply',{requestId:'move',proposal,approved:true});assert.equal(result.tasks[1].parentId,'capture_goal');assert.equal(result.audit.length,1);
 const retried=await run('alice','apply',{requestId:'move',proposal,approved:true});assert.equal(retried.duplicate,true);
 await assert.rejects(run('alice','apply',{requestId:'stale',proposal,approved:true}),/another device/);
 await assert.rejects(run('alice','preview',{kind:'move',taskId:'capture_goal',targetId:'capture_freight'}),/descendant/);
 const link=await run('alice','preview',{kind:'supports',taskId:'capture_freight',targetId:'capture_goal'});
 const linked=await run('alice','apply',{requestId:'link',proposal:link.proposal,approved:true});assert.equal(linked.links.length,1);assert.equal(linked.tasks[1].parentId,'capture_goal');
});
test('task IDs from another account cannot be used in capture or structure requests',async()=>{
 const {run}=await setup();await run('alice','capture',capture('private'));
 await assert.rejects(run('bob','capture',{...capture('intruder'),taskId:'capture_private'}),/not found/);
 await assert.rejects(run('bob','preview',{kind:'move',taskId:'capture_private',targetId:null}),/not found/);
});
test('invalid inputs never change durable state',async()=>{
 const {run}=await setup();for(const body of [capture('empty',' '),{...capture('huge'),transcript:'x'.repeat(12001)},{...capture('bad'),status:'bad'}])await assert.rejects(run('alice','capture',body));
 assert.equal((await run('alice','state',{})).revision,0);
});
test('HTTP API fails closed for missing identity, cross-origin writes and malformed JSON',async()=>{
 const {a,db}=await setup();const headers={'oai-authenticated-user-id':'alice','content-type':'application/json','origin':'https://staging.test'};
 const send=(body,extra={})=>a.handleApi(new Request('https://staging.test/api/capture',{method:'POST',headers:{...headers,...extra},body}),{DB:db},R);
 assert.equal((await a.handleApi(new Request('https://staging.test/api/state'),{DB:db},R)).status,401);
 assert.equal((await send(JSON.stringify(capture('cross')),{'origin':'https://evil.test'})).status,403);
 assert.equal((await send('{')).status,400);assert.equal((await send('[]')).status,400);assert.equal((await send('x'.repeat(40001))).status,413);
 assert.equal((await send(JSON.stringify(capture('valid')))).status,200);
 const state=await a.handleApi(new Request('https://staging.test/api/state',{headers:{'oai-authenticated-user-id':'alice'}}),{DB:db},R);assert.equal((await state.json()).accountId,'alice');
});
test('staging shared controllers match the tested canonical modules; bundle has no production integrations',()=>{
 for(const file of ['voice-capture.js','task-relations.js'])assert.equal(fs.readFileSync('staging/shared/'+file,'utf8'),fs.readFileSync(file,'utf8'));
 const web=fs.readFileSync('staging/web/adapter.js','utf8')+fs.readFileSync('staging/worker/api.js','utf8');
 assert.doesNotMatch(web,/script\.google\.com|sheets\.googleapis|momentum\.nikita-da2|GOOGLE_CLIENT_ID/);
});
