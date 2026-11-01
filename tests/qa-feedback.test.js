const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');
require('../task-relations.js');const relations=globalThis.MomentumTaskRelations;const api=import('../staging/worker/api.js'),qa=import('../staging/worker/feedback.js');
const reportId='qa_aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',build='qa-test123';
async function setup(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('staging/drizzle/0000_staging.sql','utf8'));const {StagingRepository,initialState}=await api;
 const binding={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}};}};
 const repo=new StagingRepository(binding),state=initialState();state.tasks=[{id:'task',name:'Private business operation',date:'2026-11-01',parentId:null},{id:'other',name:'Unrelated private task',date:'2026-11-01',parentId:null}];state.messages=[{id:'msg',taskId:'task',role:'user',content:'Private observation'},{id:'unrelated',taskId:'other',role:'user',content:'Unrelated private message'}];await repo.compareAndSwap('alice',0,state);return {repo,binding};}
function body(overrides={}){return {id:reportId,taskId:'task',type:'hierarchy',observation:'AI misunderstood hierarchy. Keep independent tasks separate.',excerpts:[],...overrides};}
async function submit(repo,overrides={}){const {writeFeedback}=await qa;const {draft}=await writeFeedback(repo,'alice','preview',body(overrides),build);return writeFeedback(repo,'alice','submit',{...draft,approved:true},build);}
test('QA preview writes nothing; only explicit submission persists a task-linked report with server metadata',async()=>{const {repo}=await setup(),{writeFeedback,readFeedback}=await qa;
 const before=await repo.read('alice'),{draft}=await writeFeedback(repo,'alice','preview',body({owner:'bob',buildId:'forged',audio:'ignored',fullHistory:['private']}),build);assert.equal((await repo.read('alice')).revision,before.revision);assert.deepEqual(draft.excerpts,[]);assert.equal(draft.buildId,build);assert.equal(draft.owner,undefined);assert.equal(draft.audio,undefined);assert.equal(draft.fullHistory,undefined);
 await assert.rejects(writeFeedback(repo,'alice','submit',draft,build),/Explicit/);assert.equal((await readFeedback(repo,'alice',null,build)).items.length,0);
 const result=await writeFeedback(repo,'alice','submit',{...draft,approved:true},build);assert.equal(result.report.taskId,'task');assert.equal(result.report.status,'submitted');assert.equal(result.report.buildId,build);assert.ok(result.report.createdAt);assert.equal(result.report.createSignature,undefined);assert.equal((await readFeedback(repo,'alice',reportId,build)).report.observation,draft.observation);
 assert.equal((await repo.read('alice')).state.tasks.length,2);assert.equal((await repo.read('alice')).state.messages.length,2);
});
test('public GitHub handoff never includes task IDs, names, observations, excerpts, secrets or user URLs',async()=>{const {repo}=await setup();const privateText='Private business operation email owner@example.com OPENAI_API_KEY=sk-fake1234567890123456789 https://private.example.com/sheet Authorization: Bearer abc.def.xyz';
 const {report}=await submit(repo,{observation:privateText,excerpts:[{messageId:'msg',text:'Private freight business details sk-secret123456789012345'}]});
 assert.doesNotMatch(report.observation,/owner@example|sk-fake|private.example|abc.def/);assert.doesNotMatch(report.excerpts[0].text,/sk-secret/);
 const handoff=decodeURIComponent(JSON.stringify(report.publicReference));for(const term of ['Private business','freight business','owner@example','sk-secret','private.example','taskId','\"task\"','observation'])assert.ok(!handoff.includes(term),term);
 assert.ok(report.publicReference.url.startsWith('https://github.com/FullDrum/momentum/issues/new?'));assert.match(handoff,/qa_aaaaaaaa/);assert.match(handoff,/AI hierarchy proposal needs review/);
});
test('QA rejects unrelated/cross-account excerpts and cross-account reads or updates',async()=>{const {repo}=await setup(),{writeFeedback,readFeedback}=await qa;
 await assert.rejects(writeFeedback(repo,'bob','preview',body(),build),/Task not found/);
 await assert.rejects(writeFeedback(repo,'alice','preview',body({excerpts:[{messageId:'unrelated',text:'Do not include this'}]}),build),/not from this conversation/);
 await submit(repo);assert.deepEqual((await readFeedback(repo,'bob',null,build)).items,[]);await assert.rejects(readFeedback(repo,'bob',reportId,build),/not found/);
 await assert.rejects(writeFeedback(repo,'bob','reply',{id:reportId,approved:true,content:'intruder',requestId:'attack'},build),/not found/);
 await assert.rejects(writeFeedback(repo,'bob','status',{id:reportId,approved:true,status:'resolved',expectedRevision:1},build),/not found/);
});
test('duplicate/lost-response and concurrent QA retries store one report; changed payload conflicts and failed writes do not claim success',async()=>{const {repo}=await setup(),{writeFeedback,readFeedback}=await qa;
 const {draft}=await writeFeedback(repo,'alice','preview',body(),build);const payload={...draft,approved:true};const result=await Promise.all([writeFeedback(repo,'alice','submit',payload,build),writeFeedback(repo,'alice','submit',payload,build)]);assert.equal(result[0].report.id,result[1].report.id);assert.equal((await readFeedback(repo,'alice',null,build)).items.length,1);
 const retry=await writeFeedback(repo,'alice','submit',payload,'qa-new-build');assert.equal(retry.duplicate,true);assert.equal(retry.report.buildId,build);
 await assert.rejects(writeFeedback(repo,'alice','submit',{...payload,observation:'different'},build),/different content/);
 const failing={read:repo.read.bind(repo),compareAndSwap:async()=>false};await assert.rejects(writeFeedback(failing,'alice','submit',{...payload,id:'qa_bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'},build),/Retry/);assert.equal((await readFeedback(repo,'alice',null,build)).items.length,1);
});
test('manual status lifecycle and deduplicated private replies persist without a direct ChatGPT connection',async()=>{const {repo}=await setup(),{writeFeedback,readFeedback,feedbackStatuses}=await qa;let {report}=await submit(repo);
 for(const status of feedbackStatuses.slice(1)){report=(await writeFeedback(repo,'alice','status',{id:reportId,status,prUrl:status==='codex_pr'?'https://github.com/FullDrum/momentum/pull/9':null,expectedRevision:report.revision,approved:true},build)).report;assert.equal(report.status,status);}
 await assert.rejects(writeFeedback(repo,'alice','status',{id:reportId,status:'resolved',expectedRevision:1,approved:true},build),/Refresh/);
 await assert.rejects(writeFeedback(repo,'alice','status',{id:reportId,status:'codex_pr',prUrl:'https://evil.test/private',expectedRevision:report.revision,approved:true},build),/pull request URL/);
 const reply={id:reportId,requestId:'reply1',content:'More details: secret=not-for-storage',approved:true};await writeFeedback(repo,'alice','reply',reply,build);await writeFeedback(repo,'alice','reply',reply,build);const reload=await readFeedback(repo,'alice',reportId,build);assert.equal(reload.report.replies.length,1);assert.doesNotMatch(reload.report.replies[0].content,/not-for-storage/);assert.equal(reload.report.status,'resolved');
});
test('HTTP QA requires identity and same-origin JSON writes; GET is private and no response exposes environment secrets',async()=>{const {binding}=await setup(),{handleApi}=await api;const env={DB:binding,OPENAI_API_KEY:'server-key-never-return'};
 const req=(path,method='GET',headers={},data)=>new Request('https://staging.test/api/'+path,{method,headers,body:data?JSON.stringify(data):undefined});
 assert.equal((await handleApi(req('feedback'),env,relations,build)).status,401);
 const auth={'oai-authenticated-user-id':'alice','content-type':'application/json',origin:'https://staging.test'};
 assert.equal((await handleApi(req('feedback/preview','POST',{...auth,origin:'https://evil.test'},body()),env,relations,build)).status,403);
 const preview=await handleApi(req('feedback/preview','POST',auth,body()),env,relations,build);assert.equal(preview.status,200);const payload=await preview.json();assert.doesNotMatch(JSON.stringify(payload),/server-key-never-return/);
 const saved=await handleApi(req('feedback/submit','POST',auth,{...payload.draft,approved:true}),env,relations,build);assert.equal(saved.status,200);assert.equal(saved.headers.get('cache-control'),'no-store');
 assert.equal((await handleApi(req('feedback?id='+reportId,'GET',{'oai-authenticated-user-id':'bob'}),env,relations,build)).status,404);
});
test('QA limits, build changes and malicious public fields fail closed; default reports contain no automatic excerpt',async()=>{const {repo}=await setup(),{writeFeedback}=await qa;
 const {draft}=await writeFeedback(repo,'alice','preview',body({publicReference:{url:'https://evil.test/private'},taskName:'Private task name',status:'resolved'}),build);assert.deepEqual(draft.excerpts,[]);assert.equal(draft.publicReference,undefined);assert.equal(draft.taskName,undefined);assert.equal(draft.status,undefined);
 await assert.rejects(writeFeedback(repo,'alice','submit',{...draft,approved:true},'new-build'),/build changed/);
 await assert.rejects(writeFeedback(repo,'alice','preview',body({observation:'x'.repeat(2001)}),build),/Invalid/);
 await assert.rejects(writeFeedback(repo,'alice','preview',body({excerpts:[{messageId:'msg',text:'x'.repeat(601)}]}),build),/Invalid/);
 await assert.rejects(writeFeedback(repo,'alice','preview',body({excerpts:[{messageId:'msg',text:'a'},{messageId:'msg',text:'b'}]}),build),/not from/);
 const {report}=await submit(repo);assert.equal(report.status,'submitted');assert.ok(report.publicReference.url.startsWith('https://github.com/FullDrum/momentum/issues/new?'));
});
test('QA linkage and only its consented excerpt survive task rename/reparent/deletion without adding messages',async()=>{const {repo}=await setup(),{readFeedback}=await qa,{nativeRpc}=await import('../staging/worker/native-rpc.js');
 await submit(repo,{excerpts:[{messageId:'msg',text:'Small selected excerpt'}]});let initial=await nativeRpc(repo,'alice',{fn:'getInitialData'},relations);
 await nativeRpc(repo,'alice',{fn:'batchOps',requestId:'rename_for_qa',expectedTree:initial.treeToken,arg:{saves:[{id:'task',name:'Renamed',parentId:'other'}],deletes:[]}},relations);
 let report=(await readFeedback(repo,'alice',reportId,build)).report;assert.equal(report.taskId,'task');assert.equal(report.excerpts[0].text,'Small selected excerpt');
 initial=await nativeRpc(repo,'alice',{fn:'getInitialData'},relations);await nativeRpc(repo,'alice',{fn:'batchOps',requestId:'delete_for_qa',expectedTree:initial.treeToken,arg:{saves:[],deletes:['task']}},relations);
 report=(await readFeedback(repo,'alice',reportId,build)).report;assert.equal(report.taskId,'task');assert.equal(report.excerpts.length,1);assert.equal(report.excerpts[0].text,'Small selected excerpt');assert.equal((await repo.read('alice')).state.messages.length,2);
});

test('one approved click snapshots complete ordered multi-turn task history, including older turns and legacy notes, without another node or arbitrary fields',async()=>{
 const {repo}=await setup(),{writeFeedback,readFeedback}=await qa;const snap=await repo.read('alice');
 snap.state.notes=[{id:'old_note',taskId:'task',at:'2026-10-31T00:00:00Z',transcript:'Earlier decision context',memory:{summary:'Not the full note'}},{id:'other_note',taskId:'other',at:'2026-10-31T00:00:00Z',transcript:'Other task private note'}];
 const expected=Array.from({length:20},(_,i)=>({id:'turn_'+i,taskId:'task',role:i%2?'assistant':'user',at:'2026-11-01T00:'+String(i).padStart(2,'0')+':00Z',content:i===0?'Should nodes with active conversations have a visible marker?':i===19?'Yes, keep that decision.':'Complete context '+i+' '.repeat(2)+'x'.repeat(700),...(i%2?{status:'completed'}:{}),audio:'must-not-copy',attachments:['not copied'],owner:'not copied'}));
 snap.state.messages=[expected[15],{id:'other',taskId:'other',role:'user',at:'2026-11-01T00:00:00Z',content:'Other node private message'},...expected.filter((_,i)=>i!==15)];await repo.compareAndSwap('alice',snap.revision,snap.state);
 const before=(await repo.read('alice')).state.messages;
 const result=await writeFeedback(repo,'alice','report',{id:reportId,taskId:'task',approved:true,scope:'full_task_conversation',messages:[{content:'client forged'}],buildId:'forged'},build);
 assert.equal(result.report.buildId,build);assert.equal(result.report.taskId,'task');assert.equal(result.report.snapshot.messages.length,21);assert.equal(result.report.snapshot.messages[0].role,'legacy');assert.equal(result.report.snapshot.messages[0].content,'Earlier decision context');
 assert.deepEqual(result.report.snapshot.messages.slice(1).map(m=>({id:m.id,role:m.role,at:m.at,content:m.content})),expected.map(({id,role,at,content})=>({id,role,at,content})));
 const serialized=JSON.stringify(result.report.snapshot);for(const forbidden of ['Other node private','Other task private','must-not-copy','attachments','client forged','not copied'])assert.ok(!serialized.includes(forbidden));
 assert.ok(result.report.snapshot.capturedAt);assert.equal((await readFeedback(repo,'alice',reportId,build)).report.snapshot.messages[1].content,expected[0].content);assert.deepEqual((await repo.read('alice')).state.messages,before);
});

test('full-history reports preserve URLs/email/nonsecret text, redact credentials without truncating, and keep all content out of public handoffs',async()=>{
 const {repo}=await setup(),{writeFeedback}=await qa;const snap=await repo.read('alice');snap.state.messages=[{id:'decision',taskId:'task',role:'user',at:'2026-11-01',content:'Private marker decision https://private.example/context owner@example.com '+ 'z'.repeat(12000)+' sk-fake12345678901234567890 Bearer sensitive-token exact-server-credential',proposals:[{kind:'create_task',title:'Private proposed marker task',reason:'Full decision context',targetId:null}],rawAudio:'excluded'}];await repo.compareAndSwap('alice',snap.revision,snap.state);
 const {report}=await writeFeedback(repo,'alice','report',{id:reportId,taskId:'task',approved:true,scope:'full_task_conversation'},build,{secrets:['exact-server-credential']});const content=report.snapshot.messages[0].content;
 assert.ok(content.includes('z'.repeat(12000)));assert.ok(content.includes('https://private.example/context owner@example.com'));assert.doesNotMatch(content,/sk-fake|sensitive-token|exact-server-credential/);assert.equal(report.snapshot.messages[0].proposals[0].title,'Private proposed marker task');
 const publicText=decodeURIComponent(JSON.stringify(report.publicReference));for(const forbidden of ['Private marker','private.example','owner@example','Private proposed','decision','taskId'])assert.ok(!publicText.includes(forbidden));
});

test('oversized full histories fail with no report and no silent truncation',async()=>{
 const {repo}=await setup(),{writeFeedback}=await qa;let snap=await repo.read('alice');snap.state.messages=Array.from({length:1001},(_,i)=>({id:'many_'+i,taskId:'task',role:'user',at:'2026-11-01',content:'Keep all turns'}));await repo.compareAndSwap('alice',snap.revision,snap.state);
 const request={id:reportId,taskId:'task',approved:true,scope:'full_task_conversation'};await assert.rejects(writeFeedback(repo,'alice','report',request,build),e=>e.status===413&&/never truncated/.test(e.message));assert.equal((await repo.read('alice')).state.feedback,undefined);
 snap=await repo.read('alice');snap.state.messages=[{id:'large',taskId:'task',role:'user',at:'2026-11-01',content:'я'.repeat(110000)}];await repo.compareAndSwap('alice',snap.revision,snap.state);
 await assert.rejects(writeFeedback(repo,'alice','report',request,build),e=>e.status===413&&/200 KB/.test(e.message));assert.equal((await repo.read('alice')).state.feedback,undefined);assert.equal((await repo.read('alice')).state.messages[0].content.length,110000);
});

test('full report retries return the original frozen snapshot across history changes, deletion, deployments and concurrent taps',async()=>{
 const {repo}=await setup(),{writeFeedback}=await qa;const request={id:reportId,taskId:'task',approved:true,scope:'full_task_conversation'};
 const results=await Promise.all([writeFeedback(repo,'alice','report',request,build),writeFeedback(repo,'alice','report',request,build)]);assert.deepEqual(results[0].report.snapshot,results[1].report.snapshot);assert.equal((await repo.read('alice')).state.feedback.length,1);
 let snap=await repo.read('alice');snap.state.messages.push({id:'later',taskId:'task',role:'user',at:'2026-11-02',content:'Later change should not change the original report'});snap.state.tasks=snap.state.tasks.filter(t=>t.id!=='task');await repo.compareAndSwap('alice',snap.revision,snap.state);
 const retry=await writeFeedback(repo,'alice','report',request,'new-build');assert.equal(retry.duplicate,true);assert.deepEqual(retry.report.snapshot,results[0].report.snapshot);assert.equal(retry.report.buildId,build);assert.equal((await repo.read('alice')).state.feedback.length,1);
 await assert.rejects(writeFeedback(repo,'alice','report',{...request,taskId:'other'},build),/different content/);
});

test('one-click report endpoint requires explicit scope, owner authentication and same origin; errors do not claim a saved snapshot',async()=>{
 const {repo,binding}=await setup(),{writeFeedback}=await qa,{handleApi}=await api;const body={id:reportId,taskId:'task',scope:'full_task_conversation',approved:true};
 await assert.rejects(writeFeedback(repo,'alice','report',{...body,approved:false},build),/Explicit/);await assert.rejects(writeFeedback(repo,'alice','report',{...body,scope:'other'},build),/scope/);await assert.rejects(writeFeedback(repo,'bob','report',body,build),/Task not found/);
 const failing={read:repo.read.bind(repo),compareAndSwap:async()=>false};await assert.rejects(writeFeedback(failing,'alice','report',body,build),/Retry/);assert.equal((await repo.read('alice')).state.feedback,undefined);
 const request=headers=>new Request('https://staging.test/api/feedback/report',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await handleApi(request({origin:'https://staging.test'}),{DB:binding},relations,build)).status,401);assert.equal((await handleApi(request({'oai-authenticated-user-id':'alice',origin:'https://evil.test'}),{DB:binding},relations,build)).status,403);
 const result=await handleApi(request({'oai-authenticated-user-id':'alice',origin:'https://staging.test'}),{DB:binding,OPENAI_API_KEY:'not-exported'},relations,build);assert.equal(result.status,200);const data=await result.json();assert.equal(data.report.snapshot.messages.length,1);assert.doesNotMatch(JSON.stringify(data),/not-exported/);
});
