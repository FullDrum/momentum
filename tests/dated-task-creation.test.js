const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');
require('../task-relations.js');const relations=globalThis.MomentumTaskRelations;
const api=import('../staging/worker/api.js'),native=import('../staging/worker/native-rpc.js'),chat=import('../staging/worker/conversations.js');
const today='2026-11-01',phrase='Посчитать бонус Артёма, сделать проплаты и сравнить варианты доставки декантера из Канады.';
const titles=['Посчитать бонус Артёма','Сделать проплаты','Сравнить варианты доставки декантера из Канады'];
async function setup(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('staging/drizzle/0000_staging.sql','utf8'));const {StagingRepository}=await api;
 const binding={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}};}};
 return {repo:new StagingRepository(binding),db};
}
async function batch(repo,saves,requestId='manual'){
 const {nativeRpc}=await native,initial=await nativeRpc(repo,'alice',{fn:'getInitialData'},relations);
 return nativeRpc(repo,'alice',{fn:'batchOps',arg:{saves,deletes:[]},today,requestId,expectedTree:initial.treeToken},relations);
}
async function suggest(repo,{input=phrase,proposals=titles.map(title=>({kind:'create_task',targetId:null,date:null,title,reason:'Independent action',confidence:'high'})),requestId='message'}={}){
 const {saveMessage,answerMessage}=await chat;
 await saveMessage(repo,'alice',{taskId:'blank',text:input,requestId,today});
 const result=await answerMessage(repo,'alice','blank',requestId,{OPENAI_API_KEY:'test-only'},async(url,options)=>{
  const payload=JSON.parse(options.body);assert.match(payload.instructions,/Every persisted task MUST have a work-list date/);assert.match(payload.instructions,/2026-11-01/);assert.match(payload.instructions,/NEVER invent a common parent/);
  assert.equal(payload.text.format.schema.properties.proposals.items.properties.date.type[1],'null');
  return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({reply:proposals.length?'Предлагаю изменения для подтверждения.':'Обсудим идею, пока без создания задач.',proposals})}]}]});
 });return result.messages.at(-1);
}
async function preview(repo,source){return (await (await api).execute(repo,'alice','/api/preview',{taskId:'blank',kind:'create_tasks',sourceMessageId:source.id,today},relations)).proposal;}
test('all manual writes get Today including blank, parent and subtask; dates remain independent of parent',async()=>{
 const {repo}=await setup();await batch(repo,[{id:'parent',name:'Project',parentId:null,date:'2026-12-20'},{id:'blank',name:'',parentId:'parent'},{id:'root',name:'New parent',parentId:null}]);
 let tasks=(await repo.read('alice')).state.tasks;assert.equal(tasks.find(t=>t.id==='blank').date,today);assert.equal(tasks.find(t=>t.id==='root').date,today);assert.equal(tasks.find(t=>t.id==='parent').date,'2026-12-20');
 const {execute}=await api;const {proposal}=await execute(repo,'alice','/api/preview',{taskId:'parent',kind:'subtask',title:'Do work',today},relations);assert.equal(proposal.date,today);
 const applied=await execute(repo,'alice','/api/apply',{requestId:'child',approved:true,proposal},relations);assert.equal(applied.tasks.at(-1).date,today);
 await batch(repo,[{id:'blank',name:'',parentId:'parent',date:null}],'clear_date');assert.equal((await repo.read('alice')).state.tasks.find(t=>t.id==='blank').date,today);
 await assert.rejects(batch(repo,[{id:'bad',name:'Bad',date:'2026-02-30'}],'invalid_date'),/Invalid task date/);
});
test('legacy undated staging tasks are repaired durably on reload without losing conversation',async()=>{
 const {repo,db}=await setup(),{initialState}=await api;const state=initialState();state.tasks=[{id:'blank',name:'',parentId:null}];state.messages=[{id:'old',taskId:'blank',role:'user',content:'Idea'}];
 db.prepare('INSERT INTO staging_state(owner,revision,payload) VALUES (?,1,?)').run('alice',JSON.stringify(state));
 const snap=await repo.read('alice');assert.equal(snap.revision,2);assert.match(snap.state.tasks[0].date,/^\d{4}-\d{2}-\d{2}$/);assert.equal(snap.state.messages[0].content,'Idea');assert.ok(JSON.parse(db.prepare('SELECT payload FROM staging_state WHERE owner=?').get('alice').payload).tasks[0].date);
});
test('Russian three-action request is previewed then atomically persisted as exactly three independent Today tasks',async()=>{
 const {repo}=await setup();await batch(repo,[{id:'blank',name:'',parentId:null,conversationStarted:true}]);
 const source=await suggest(repo);assert.equal((await repo.read('alice')).state.tasks.length,1);const proposal=await preview(repo,source);
 assert.equal(proposal.tasks.length,3);assert.ok(proposal.tasks.every(t=>t.date===today&&t.parentId===null));assert.equal(proposal.tasks[0].taskId,'blank');
 const {execute}=await api;await assert.rejects(execute(repo,'alice','/api/apply',{requestId:'unapproved',approved:false,proposal},relations),/approval/);
 const tampered=structuredClone(proposal);tampered.tasks[0].title='Unreviewed';await assert.rejects(execute(repo,'alice','/api/apply',{requestId:'tamper',approved:true,proposal:tampered},relations),/changed/);
 const body={requestId:'approved',approved:true,proposal};const [first,retry]=await Promise.all([execute(repo,'alice','/api/apply',body,relations),execute(repo,'alice','/api/apply',body,relations)]);
 assert.equal(first.created.length,3);assert.deepEqual(retry.created,first.created);const persisted=await repo.read('alice');assert.equal(persisted.state.tasks.length,3);assert.deepEqual(persisted.state.tasks.map(t=>t.name),titles);assert.ok(persisted.state.tasks.every(t=>t.date===today&&t.parentId===null));
 assert.equal(persisted.state.messages[0].content,phrase);assert.equal(persisted.state.messages[0].taskId,'blank');assert.deepEqual(persisted.state.messages.at(-1).creationResult,first.created);
 await assert.rejects(preview(repo,source),/already been saved/);
 const latest={...proposal,baseRevision:persisted.revision};await assert.rejects(execute(repo,'alice','/api/apply',{requestId:'different_retry_id',approved:true,proposal:latest},relations),/already been saved/);
 const reload=await (await native).nativeRpc(repo,'alice',{fn:'getInitialData'},relations);assert.equal(reload.nodes.length,3);assert.ok(reload.nodes.every(t=>t.date===today));
});
test('idea can stay a conversation, then convert to one dated task without losing its history',async()=>{
 const {repo}=await setup();await batch(repo,[{id:'blank',name:'',parentId:null}]);
 const idea=await suggest(repo,{input:'Есть идея возить декантеры из Канады, пока только обсудим, задачи не создавай.',proposals:[]});assert.equal(idea.proposals.length,0);assert.equal((await repo.read('alice')).state.tasks[0].name,'');
 const convert=await suggest(repo,{input:'Теперь создай задачу: изучить импорт декантера',requestId:'convert',proposals:[{kind:'create_task',targetId:null,date:null,title:'Изучить импорт декантера',reason:'User requested action',confidence:'high'}]});
 const proposal=await preview(repo,convert);const result=await (await api).execute(repo,'alice','/api/apply',{requestId:'convert_approved',approved:true,proposal},relations);assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].id,'blank');assert.equal(result.tasks[0].date,today);assert.equal((await repo.read('alice')).state.messages.filter(m=>m.role==='user').length,2);
});
test('explicit future schedule and requested project are preserved; stale plans and failed writes never report creation',async()=>{
 const {repo}=await setup();await batch(repo,[{id:'project',name:'Canada project',parentId:null,date:'2026-12-25'},{id:'blank',name:'',parentId:null}]);
 const source=await suggest(repo,{input:'На 10 ноября 2026 создай задачу сравнить доставку в проекте Canada.',proposals:[{kind:'create_task',targetId:'project',date:'2026-11-10',title:'Сравнить доставку',reason:'Explicit schedule and project',confidence:'high'}]});const proposal=await preview(repo,source);assert.equal(proposal.tasks[0].date,'2026-11-10');assert.equal(proposal.tasks[0].parentId,'project');
 const {execute}=await api;const failing={read:repo.read.bind(repo),compareAndSwap:async()=>false};await assert.rejects(execute(failing,'alice','/api/apply',{requestId:'failed',approved:true,proposal},relations),/Another device/);assert.equal((await repo.read('alice')).state.tasks.length,2);assert.equal((await repo.read('alice')).state.tasks[1].name,'');
 await batch(repo,[{id:'other',name:'Other change',parentId:null}],'concurrent');await assert.rejects(execute(repo,'alice','/api/apply',{requestId:'stale',approved:true,proposal},relations),/another device/);
 const fresh=await preview(repo,source);const result=await execute(repo,'alice','/api/apply',{requestId:'future',approved:true,proposal:fresh},relations);assert.equal(result.created[0].date,'2026-11-10');assert.equal(result.tasks.find(t=>t.id==='project').date,'2026-12-25');
});

test('partial title saves retain explicit dates and hierarchy across SQLite reload; new tasks default Today and explicit rescheduling works',async()=>{
 const {repo}=await setup();await batch(repo,[{id:'project',name:'Canada',date:'2026-12-25'},{id:'scheduled',name:'Original title',date:'2026-11-10',parentId:'project',done:true,order:42,conversationStarted:true}]);
 // Matches batchOps saves from the durable outliner queue, with date intentionally omitted.
 await batch(repo,[{id:'scheduled',name:'Renamed only'},{id:'new_without_date',name:'New dated task'}],'partial');
 const reload=await (await native).nativeRpc(repo,'alice',{fn:'getInitialData'},relations),saved=reload.nodes.find(n=>n.id==='scheduled');
 assert.equal(saved.name,'Renamed only');assert.equal(saved.date,'2026-11-10');assert.equal(saved.parentId,'project');assert.equal(saved.done,true);assert.equal(saved.order,42);assert.equal(saved.conversationStarted,true);assert.equal(reload.nodes.find(n=>n.id==='new_without_date').date,today);
 await batch(repo,[{id:'scheduled',name:'Explicitly rescheduled',date:'2026-11-20'}],'reschedule');assert.equal((await repo.read('alice')).state.tasks.find(n=>n.id==='scheduled').date,'2026-11-20');
 await batch(repo,[{id:'scheduled',date:undefined,name:'Still scheduled'}],'undefined_date');assert.equal((await repo.read('alice')).state.tasks.find(n=>n.id==='scheduled').date,'2026-11-20');
 await batch(repo,[{id:'scheduled',date:null}],'explicit_today');assert.equal((await repo.read('alice')).state.tasks.find(n=>n.id==='scheduled').date,today);
});

test('nested blank reuse shows its old parent and requires approval before moving to root; stable ID and history survive reload',async()=>{
 const {repo}=await setup();await batch(repo,[{id:'project',name:'Canada project',date:'2026-11-10',parentId:null},{id:'blank',name:'',date:today,parentId:'project',conversationStarted:true}]);
 const source=await suggest(repo);const proposal=await preview(repo,source),first=proposal.tasks[0];
 assert.equal(first.taskId,'blank');assert.equal(first.fromParentId,'project');assert.equal(first.fromParentName,'Canada project');assert.equal(first.parentId,null);assert.equal(first.parentName,'Root (independent task)');assert.equal(proposal.requiresApproval,true);
 assert.equal((await repo.read('alice')).state.tasks.find(t=>t.id==='blank').parentId,'project');
 const {execute}=await api;await assert.rejects(execute(repo,'alice','/api/apply',{requestId:'nested_unapproved',approved:false,proposal},relations),/approval/);
 const hiddenMove=structuredClone(proposal);hiddenMove.tasks[0].fromParentId=null;await assert.rejects(execute(repo,'alice','/api/apply',{requestId:'hidden_move',approved:true,proposal:hiddenMove},relations),/changed/);
 assert.equal((await repo.read('alice')).state.tasks.find(t=>t.id==='blank').parentId,'project');
 const result=await execute(repo,'alice','/api/apply',{requestId:'nested_approved',approved:true,proposal},relations);assert.equal(result.created[0].id,'blank');assert.equal(result.created[0].parentId,null);
 const reload=await (await native).nativeRpc(repo,'alice',{fn:'getInitialData'},relations);assert.equal(reload.nodes.find(n=>n.id==='blank').parentId,null);assert.equal(reload.nodes.find(n=>n.id==='blank').hasConversation,true);assert.equal(reload.nodes.find(n=>n.id==='project').date,'2026-11-10');
 const history=(await repo.read('alice')).state.messages.filter(m=>m.taskId==='blank');assert.equal(history[0].content,phrase);assert.equal(history.at(-1).creationResult[0].id,'blank');
});

test('blank reuse preserves its existing future work-list date unless explicitly rescheduled; other new tasks still get Today',async()=>{
 const {repo}=await setup();await batch(repo,[{id:'blank',name:'',parentId:null,date:'2026-11-10',conversationStarted:true}]);const source=await suggest(repo),proposal=await preview(repo,source);
 assert.equal(proposal.tasks[0].date,'2026-11-10');assert.ok(proposal.tasks.slice(1).every(t=>t.date===today));
 const result=await (await api).execute(repo,'alice','/api/apply',{requestId:'preserve_blank_date',approved:true,proposal},relations);assert.equal(result.created[0].date,'2026-11-10');
 const reschedule=await setup();await batch(reschedule.repo,[{id:'blank',name:'',parentId:null,date:'2026-11-10'}]);const explicit=await suggest(reschedule.repo,{input:'Перенеси идею на 20 ноября',proposals:[{kind:'create_task',title:'Rescheduled idea',targetId:null,date:'2026-11-20',reason:'Explicit date',confidence:'high'}]});
 const changed=await preview(reschedule.repo,explicit);assert.equal(changed.tasks[0].date,'2026-11-20');await (await api).execute(reschedule.repo,'alice','/api/apply',{requestId:'reschedule_blank',approved:true,proposal:changed},relations);assert.equal((await reschedule.repo.read('alice')).state.tasks[0].date,'2026-11-20');
});
