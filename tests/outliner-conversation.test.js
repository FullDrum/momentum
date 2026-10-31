const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');
require('../task-relations.js');const relations=globalThis.MomentumTaskRelations;
const api=import('../staging/worker/api.js'),native=import('../staging/worker/native-rpc.js'),chat=import('../staging/worker/conversations.js');
async function setup(){
 const {StagingRepository}=await api;const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('staging/drizzle/0000_staging.sql','utf8'));
 const binding={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}};}};
 return {repo:new StagingRepository(binding),binding};
}
async function seed(repo,owner='alice'){
 const {nativeRpc}=await native;const initial=await nativeRpc(repo,owner,{fn:'getInitialData'},relations);
 const arg={saves:[{id:'goal',name:'Decanter import',parentId:null,isSection:false,done:false,date:'2026-10-31 10:00:00',order:1},{id:'freight',name:'Freight booking',parentId:null,isSection:false,done:false,date:'2026-10-31 10:00:00',order:2}],deletes:[]};
 return nativeRpc(repo,owner,{fn:'batchOps',arg,requestId:'seed',expectedTree:initial.treeToken},relations);
}
test('native queue protocol persists original hierarchy, editing and delete acknowledgements',async()=>{
 const {repo}=await setup(),{nativeRpc}=await native;await seed(repo);
 const state=await nativeRpc(repo,'alice',{fn:'getInitialData'},relations);assert.equal(state.nodes.length,2);
 state.nodes[1].name='Book freight';state.nodes[1].parentId='goal';
 const body={fn:'batchOps',arg:{saves:[state.nodes[1]],deletes:[]},requestId:'edit',expectedTree:state.treeToken};
 const result=await nativeRpc(repo,'alice',body,relations);assert.deepEqual(result.results.saves,[{id:'freight',ok:true}]);
 assert.equal((await nativeRpc(repo,'alice',body,relations)).treeToken,result.treeToken);
 assert.equal((await repo.read('alice')).state.tasks[1].parentId,'goal');
 await nativeRpc(repo,'alice',{fn:'batchOps',arg:{saves:[],deletes:['freight']},requestId:'delete',expectedTree:result.treeToken},relations);
 assert.equal((await repo.read('alice')).state.tasks.length,1);
});
test('native batch rejects cross-device stale edits, missing parents, cycles and forbidden management',async()=>{
 const {repo}=await setup(),{nativeRpc}=await native;const result=await seed(repo);
 await assert.rejects(nativeRpc(repo,'alice',{fn:'batchOps',requestId:'stale',arg:{saves:[],deletes:['freight']},expectedTree:'old'},relations),/another device/);
 await assert.rejects(nativeRpc(repo,'alice',{fn:'batchOps',requestId:'cycle',arg:{saves:[{id:'goal',name:'Goal',parentId:'goal'}],deletes:[]},expectedTree:result.treeToken},relations),/cycle/);
 await assert.rejects(nativeRpc(repo,'alice',{fn:'batchOps',requestId:'orphan',arg:{saves:[{id:'freight',name:'Freight',parentId:'missing'}],deletes:[]},expectedTree:result.treeToken},relations),/Parent task not found/);
 await assert.rejects(nativeRpc(repo,'alice',{fn:'saveTeamMember'},relations),/not enabled/);
});
test('task messages persist by stable ID through rename/reparent and never become outline children',async()=>{
 const {repo}=await setup(),{saveMessage,conversationState}=await chat,{nativeRpc}=await native;await seed(repo);
 await saveMessage(repo,'alice',{taskId:'freight',text:'What prerequisites do we need?',requestId:'message_1'});
 const after=await repo.read('alice');assert.equal(after.state.tasks.length,2);assert.equal(after.state.messages.length,1);
 const state=await nativeRpc(repo,'alice',{fn:'getInitialData'},relations);state.nodes[1].name='Renamed task';state.nodes[1].parentId='goal';
 await nativeRpc(repo,'alice',{fn:'batchOps',arg:{saves:[state.nodes[1]],deletes:[]},requestId:'rename',expectedTree:state.treeToken},relations);
 assert.equal(conversationState(await repo.read('alice'),'freight').messages[0].content,'What prerequisites do we need?');
 await saveMessage(repo,'alice',{taskId:'freight',text:'What prerequisites do we need?',requestId:'message_1'});assert.equal((await repo.read('alice')).state.messages.length,1);
 await assert.rejects(saveMessage(repo,'alice',{taskId:'goal',text:'Changed',requestId:'message_1'}),/different content/);
 await assert.rejects(saveMessage(repo,'bob',{taskId:'freight',text:'No access',requestId:'intruder'}),/not found/);
});
test('missing AI credentials save real messages without fabricating assistant replies',async()=>{
 const {repo}=await setup(),{saveMessage,answerMessage}=await chat;await seed(repo);
 await saveMessage(repo,'alice',{taskId:'freight',text:'Plan this task',requestId:'m'});
 const response=await answerMessage(repo,'alice','freight','m',{},()=>{throw Error('must not call provider');});
 assert.equal(response.aiStatus,'unconfigured');assert.equal(response.messages.length,1);assert.equal(response.messages[0].role,'user');
});
test('AI context is task-specific; structured proposals stay inert until reviewed approval',async()=>{
 const {repo}=await setup(),{saveMessage,answerMessage}=await chat,{execute}=await api;await seed(repo);
 await saveMessage(repo,'alice',{taskId:'goal',text:'Private other conversation',requestId:'other'});
 await saveMessage(repo,'alice',{taskId:'freight',text:'Suggest a prerequisite',requestId:'m'});
 let requests=0;const fetcher=async(url,options)=>{requests++;assert.equal(url,'https://api.openai.com/v1/responses');const input=JSON.parse(options.body);assert.doesNotMatch(JSON.stringify(input.input),/Private other conversation/);assert.equal(input.store,false);
  return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({reply:'Confirm the bill first.',proposals:[{kind:'subtask',targetId:null,title:'Obtain bill of lading',reason:'Required before freight booking'}]})}]}]}),{status:200});};
 const response=await answerMessage(repo,'alice','freight','m',{OPENAI_API_KEY:'test-only'},fetcher);
 assert.equal(response.messages.at(-1).role,'assistant');assert.equal((await repo.read('alice')).state.tasks.length,2);
 await answerMessage(repo,'alice','freight','m',{OPENAI_API_KEY:'test-only'},fetcher);assert.equal(requests,1);
 const {proposal}=await execute(repo,'alice','/api/preview',{taskId:'freight',kind:'subtask',title:'Obtain bill of lading'},relations);
 await assert.rejects(execute(repo,'alice','/api/apply',{requestId:'no_approval',proposal,approved:false},relations),/approval/);
 const applied=await execute(repo,'alice','/api/apply',{requestId:'approved',proposal,approved:true},relations);assert.equal(applied.tasks.length,3);assert.equal(applied.tasks[2].parentId,'freight');
});
test('failed AI requests preserve history and support an explicit retry',async()=>{
 const {repo}=await setup(),{saveMessage,answerMessage}=await chat;await seed(repo);await saveMessage(repo,'alice',{taskId:'freight',text:'Help',requestId:'m'});
 const failed=await answerMessage(repo,'alice','freight','m',{OPENAI_API_KEY:'test-only'},async()=>new Response('',{status:429}));assert.equal(failed.aiStatus,'failed');assert.equal(failed.retryMessageId,'m');assert.equal((await repo.read('alice')).state.tasks.length,2);
});
test('staging is built from canonical outliner files and strips production endpoints',()=>{
 for(const file of ['index.html','app.js','styles.css','core.js','task-conversation.js','task-conversation.css'])assert.equal(fs.readFileSync(file,'utf8'),fs.readFileSync('staging/original/'+file,'utf8'));
 const worker=fs.readFileSync('staging/dist/server/index.js','utf8');assert.doesNotMatch(worker,/script\.google\.com|accounts\.google\.com|apps\.googleusercontent\.com/);assert.match(worker,/mobileNav/);assert.match(worker,/Momentum – Staging Outliner/);
});

test('blank task and its conversation round-trip through the native backend with stable IDs',async()=>{
 const {repo}=await setup(),{nativeRpc}=await native,{saveMessage,conversationState}=await chat;
 const before=await nativeRpc(repo,'alice',{fn:'getInitialData'},relations);
 await nativeRpc(repo,'alice',{fn:'batchOps',requestId:'blank_create',expectedTree:before.treeToken,arg:{saves:[{id:'blank',name:'',parentId:null,isSection:false,conversationStarted:true}],deletes:[]}},relations);
 await saveMessage(repo,'alice',{taskId:'blank',text:'Start planning without a title',requestId:'blank_message'});
 const reload=await nativeRpc(repo,'alice',{fn:'getInitialData'},relations);assert.equal(reload.nodes[0].id,'blank');assert.equal(reload.nodes[0].name,'');assert.equal(reload.nodes[0].retainEmpty,true);assert.equal(reload.nodes[0].hasConversation,true);
 assert.equal(conversationState(await repo.read('alice'),'blank').messages[0].content,'Start planning without a title');
});
test('transcription endpoint uses automatic language detection and keeps credentials server-only',async()=>{
 const {repo}=await setup(),{transcribeAudio}=await import('../staging/worker/transcription.js');await seed(repo);
 const request=()=>new Request('https://staging.test/api/transcribe?taskId=freight',{method:'POST',headers:{'content-type':'audio/webm'},body:new Uint8Array([1,2,3])});
 let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.headers.authorization,'Bearer test-key');assert.equal(options.body.has('language'),false);assert.equal(options.body.get('model'),'gpt-4o-mini-transcribe');assert.equal((await options.body.get('file').arrayBuffer()).byteLength,3);return Response.json({text:'Привет. Freight tomorrow.'});};
 const result=await transcribeAudio(request(),{OPENAI_API_KEY:'test-key'},'alice',repo,fetcher);assert.deepEqual(result,{text:'Привет. Freight tomorrow.'});assert.equal(calls,1);
 await assert.rejects(transcribeAudio(request(),{},'alice',repo,fetcher),/not connected/);
 await assert.rejects(transcribeAudio(request(),{OPENAI_API_KEY:'test-key'},'bob',repo,fetcher),/Task not found/);
 const invalid=new Request('https://staging.test/api/transcribe?taskId=freight',{method:'POST',headers:{'content-type':'text/plain'},body:'bad'});await assert.rejects(transcribeAudio(invalid,{OPENAI_API_KEY:'test-key'},'alice',repo,fetcher),/Unsupported recording/);
 assert.equal((await repo.read('alice')).state.messages?.length||0,0);
});
test('transcription failures, empty audio and oversized requests fail safely',async()=>{
 const {repo}=await setup(),{transcribeAudio}=await import('../staging/worker/transcription.js');await seed(repo);
 const req=body=>new Request('https://staging.test/api/transcribe?taskId=freight',{method:'POST',headers:{'content-type':'audio/webm'},body});
 await assert.rejects(transcribeAudio(req(new Uint8Array()),{OPENAI_API_KEY:'test-key'},'alice',repo),/Empty recording/);
 await assert.rejects(transcribeAudio(req(new Uint8Array([1])),{OPENAI_API_KEY:'test-key'},'alice',repo,async()=>new Response('',{status:429})),/service unavailable/);
 await assert.rejects(transcribeAudio(req(new Uint8Array([1])),{OPENAI_API_KEY:'test-key'},'alice',repo,async()=>Response.json({text:''})),/No speech/);
 const large=new Request('https://staging.test/api/transcribe?taskId=freight',{method:'POST',headers:{'content-type':'audio/webm','content-length':String(11*1024*1024)},body:'x'});await assert.rejects(transcribeAudio(large,{OPENAI_API_KEY:'test-key'},'alice',repo),/too large/);
});

test('AI context explicitly includes root-to-parent ancestors even beyond the task list prefix',async()=>{
 const {taskContext}=await chat;
 const tasks=Array.from({length:205},(_,i)=>({id:'unrelated_'+i,name:'Unrelated '+i,parentId:null}));
 tasks.push({id:'root',name:'Plant reliability',parentId:null,isSection:true},{id:'parent',name:'Transfer system',parentId:'root'},{id:'blank',name:'',parentId:'parent'});
 const state={tasks,notes:[{id:'note',taskId:'blank',memory:{summary:'Pump is blocked'}}],messages:[{id:'private',taskId:'parent',role:'user',content:'Other conversation text',at:'2026-01-01'},{id:'m',taskId:'blank',role:'user',content:'Repair the pump',at:'2026-01-02'}]};
 const context=taskContext(state,'blank');assert.deepEqual(context.ancestors.map(t=>t.id),['root','parent']);assert.equal(context.task.name,'');assert.equal(context.history.at(-1).content,'Repair the pump');assert.match(context.history[0].content,/Pump is blocked/);assert.doesNotMatch(JSON.stringify(context.history),/Other conversation text/);
});
test('high-confidence blank-task title is an inert suggestion until explicit approval; ID and history persist',async()=>{
 const {repo}=await setup(),{nativeRpc}=await native,{saveMessage,answerMessage}=await chat,{execute}=await api;
 const initial=await nativeRpc(repo,'alice',{fn:'getInitialData'},relations);
 await nativeRpc(repo,'alice',{fn:'batchOps',requestId:'create_blank',expectedTree:initial.treeToken,arg:{saves:[{id:'blank',name:'',parentId:null,isSection:false,conversationStarted:true}],deletes:[]}},relations);
 await saveMessage(repo,'alice',{taskId:'blank',text:'Repair the blocked transfer pump',requestId:'title_message'});
 const result=await answerMessage(repo,'alice','blank','title_message',{OPENAI_API_KEY:'test-only'},async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({reply:'A pump repair task fits this goal.',proposals:[{kind:'title',targetId:null,title:'Repair transfer pump',reason:'The conversation identifies the equipment and action.',confidence:'high'}]})}]}]}));
 assert.equal(result.messages.at(-1).proposals[0].kind,'title');assert.equal((await repo.read('alice')).state.tasks[0].name,'');
 const {proposal}=await execute(repo,'alice','/api/preview',{taskId:'blank',kind:'title',title:'Repair transfer pump'},relations);
 await assert.rejects(execute(repo,'alice','/api/apply',{requestId:'unapproved_title',proposal,approved:false},relations),/approval/);
 const applied=await execute(repo,'alice','/api/apply',{requestId:'approved_title',proposal,approved:true},relations);assert.equal(applied.tasks.length,1);assert.equal(applied.tasks[0].id,'blank');assert.equal(applied.tasks[0].name,'Repair transfer pump');assert.equal(applied.tasks[0].parentId,null);
 assert.equal((await repo.read('alice')).state.messages[0].taskId,'blank');
 await assert.rejects(execute(repo,'alice','/api/preview',{taskId:'blank',kind:'title',title:'Replace existing title'},relations),/already has a title/);
});
test('insufficient information or low confidence leaves the New task placeholder unchanged',async()=>{
 const {repo}=await setup(),{nativeRpc}=await native,{saveMessage,answerMessage}=await chat;
 const initial=await nativeRpc(repo,'alice',{fn:'getInitialData'},relations);await nativeRpc(repo,'alice',{fn:'batchOps',requestId:'create',expectedTree:initial.treeToken,arg:{saves:[{id:'blank',name:'',parentId:null,isSection:false}],deletes:[]}},relations);
 for(const [requestId,content,confidence] of [['low_info','Hi','high'],['low_confidence','Maybe consider several different plans','low']]){
  await saveMessage(repo,'alice',{taskId:'blank',text:content,requestId});
  const response=await answerMessage(repo,'alice','blank',requestId,{OPENAI_API_KEY:'test-only'},async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({reply:'What outcome do you want?',proposals:[{kind:'title',targetId:null,title:'Unjustified title',reason:'Not enough context',confidence}]})}]}]}));
  assert.equal(response.messages.at(-1).proposals.length,0);assert.equal((await repo.read('alice')).state.tasks[0].name,'');
 }
});
test('reviewed subtask proposals reject an existing matching child rather than proliferating tasks',async()=>{
 const {repo}=await setup(),{execute}=await api;await seed(repo);
 const preview=await execute(repo,'alice','/api/preview',{taskId:'freight',kind:'subtask',title:'Confirm booking'},relations);await execute(repo,'alice','/api/apply',{requestId:'first_child',proposal:preview.proposal,approved:true},relations);
 await assert.rejects(execute(repo,'alice','/api/preview',{taskId:'freight',kind:'subtask',title:'Confirm booking'},relations),/matching subtask already exists/);assert.equal((await repo.read('alice')).state.tasks.length,3);
});
