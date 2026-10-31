import {nativeRpc} from './native-rpc.js';
import {conversationState,saveMessage,answerMessage} from './conversations.js';
/* Isolated staging API. Platform authentication + per-account storage. No Google calls. */
const MAX_TEXT=12000;
export class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
export const fail=(status,message)=>{throw new ApiError(status,message);};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export function initialState(){return {tasks:[],notes:[],messages:[],links:[],audit:[],receipts:[]};}
export function text(value,label,max=MAX_TEXT){if(typeof value!=='string'||value.length>max)fail(400,'Invalid '+label);return value.trim();}
export function id(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value))fail(400,'Invalid ID');return value;}
function validateCapture(body){
 const transcript=text(body.transcript??'','transcript'),summary=text(body.summary??'','summary')||transcript;
 if(!summary)fail(400,'Speak or type a note first');
 const outcome=text(body.outcome??'','outcome',4000),nextAction=text(body.nextAction??'','next action',4000);
 const status=body.status??'pending';if(!['pending','in_progress','waiting','completed'].includes(status))fail(400,'Invalid status');
 return {transcript,summary,outcome,nextAction,status};
}
export class StagingRepository {
 constructor(db){this.db=db;}
 async read(owner){
  const row=await this.db.prepare('SELECT revision, payload FROM staging_state WHERE owner = ?').bind(owner).first();
  return row?{revision:row.revision,state:JSON.parse(row.payload)}:{revision:0,state:initialState()};
 }
 async compareAndSwap(owner,revision,state){
  const payload=JSON.stringify(state);if(payload.length>2000000)fail(413,'Staging account storage limit reached');
  if(revision===0){const result=await this.db.prepare('INSERT OR IGNORE INTO staging_state (owner, revision, payload) VALUES (?, 1, ?)').bind(owner,payload).run();return result.meta.changes===1;}
  const result=await this.db.prepare('UPDATE staging_state SET revision = revision + 1, payload = ? WHERE owner = ? AND revision = ?').bind(payload,owner,revision).run();return result.meta.changes===1;
 }
}
function publicState(snapshot){return {revision:snapshot.revision,tasks:snapshot.state.tasks,notes:snapshot.state.notes,links:snapshot.state.links,audit:snapshot.state.audit};}
export async function execute(repo,owner,path,body,relations){
 if(path==='/api/state')return publicState(await repo.read(owner));
 if(path==='/api/preview'){
  const {state,revision}=await repo.read(owner);let proposal;
  if(body.kind==='subtask'){
   const parent=state.tasks.find(t=>t.id===id(body.taskId));if(!parent)fail(404,'Task not found');
   const title=text(body.title,'subtask title',300);if(!title)fail(400,'Enter a subtask title');
   return {proposal:{kind:'subtask',parentId:parent.id,parentName:parent.name,title,baseRevision:revision,requiresApproval:true}};
  }
  try{proposal=body.kind==='move'?relations.proposeMove(state.tasks,id(body.taskId),body.targetId===null?null:id(body.targetId)):relations.proposeLink(state.tasks,id(body.taskId),id(body.targetId),body.kind);}
  catch(error){if(error instanceof ApiError)throw error;fail(400,error.message);}
  return {proposal:{...proposal,baseRevision:revision,reason:'User-selected '+body.kind+' proposal',confidence:null}};
 }
 if(!['/api/capture','/api/apply'].includes(path))fail(404,'API route not found');
 const requestId=id(body.requestId);
 for(let attempt=0;attempt<4;attempt++){
  const snapshot=await repo.read(owner),{state,revision}=snapshot;
  const previous=state.receipts.find(r=>r.id===requestId);
  const signature=JSON.stringify({path,body});
  if(previous){if(previous.signature!==signature)fail(409,'Request ID already used for different content');return {...publicState(snapshot),duplicate:true};}
  const next=structuredClone(state);
  if(path==='/api/capture'){
   if(next.notes.length>=2000)fail(413,'Staging note limit reached');
   const memory=validateCapture(body);let taskId=body.taskId===null?null:id(body.taskId);
   if(taskId&&!next.tasks.some(t=>t.id===taskId))fail(404,'Task not found');
   if(!taskId){
    if(next.tasks.length>=1000)fail(413,'Staging task limit reached');
    taskId='capture_'+requestId;
    next.tasks.push({id:taskId,name:memory.summary.slice(0,300),parentId:null,done:false});
   }
   next.notes.unshift({id:requestId,taskId,at:new Date().toISOString(),transcript:memory.transcript,memory});
  }else{
   if(body.approved!==true)fail(400,'Explicit approval required');
   const proposal=body.proposal;
   if(!proposal||proposal.baseRevision!==revision)fail(409,'Tasks changed on another device. Preview again.');
   if(proposal.kind==='subtask'){
    const parent=state.tasks.find(t=>t.id===id(proposal.parentId));if(!parent)fail(404,'Parent task not found');
    const title=text(proposal.title,'subtask title',300);if(!title)fail(400,'Enter a subtask title');
    if(next.tasks.length>=1000)fail(413,'Staging task limit reached');
    next.tasks.push({id:'sub_'+requestId,name:title,parentId:parent.id,isSection:false,done:false,date:parent.date||null,owner,order:Date.now()});
   }else try{const changed=relations.applyProposal(state.tasks,state.links,proposal,true);next.tasks=changed.nodes;next.links=changed.links;}
   catch(error){fail(400,error.message);}
   next.audit.unshift({id:requestId,at:new Date().toISOString(),proposal});next.audit=next.audit.slice(0,500);
  }
  next.receipts.push({id:requestId,signature});
  if(await repo.compareAndSwap(owner,revision,next))return publicState({state:next,revision:revision+1});
 }
 fail(409,'Another device updated your staging data. Refresh and retry.');
}
export async function handleApi(request,env,relations){
 const url=new URL(request.url);
 if(url.pathname==='/api/health')return json({ok:true,environment:'isolated-staging',storageConfigured:!!env.DB});
 const owner=request.headers.get('oai-authenticated-user-id');
 if(!owner)return json({error:'Sign in to access your staging tasks.'},401);
 if(!env.DB)return json({error:'Staging database binding is unavailable.'},503);
 try{
  if(url.pathname==='/api/conversation'){
   if(request.method!=='GET')fail(405,'Method not allowed');
   return json(conversationState(await new StagingRepository(env.DB).read(owner),id(url.searchParams.get('taskId')),env));
  }
  if(url.pathname==='/api/state'){
   if(request.method!=='GET')fail(405,'Method not allowed');
   return json({...await execute(new StagingRepository(env.DB),owner,url.pathname,{},relations),accountId:owner});
  }
  if(request.method!=='POST')fail(405,'Method not allowed');
  if(request.headers.get('origin')!==url.origin)fail(403,'Same-origin request required');
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))fail(415,'JSON required');
  const limit=url.pathname==='/api/rpc'?1000000:40000;
  if(Number(request.headers.get('content-length')||0)>limit)fail(413,'Request too large');
  const raw=await request.text();if(raw.length>limit)fail(413,'Request too large');
  let body;try{body=JSON.parse(raw);}catch(_){fail(400,'Invalid JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Invalid request');
  const repo=new StagingRepository(env.DB);
  if(url.pathname==='/api/rpc')return json(await nativeRpc(repo,owner,body,relations));
  if(url.pathname==='/api/message'){
   await saveMessage(repo,owner,body);
   return json(await answerMessage(repo,owner,id(body.taskId),id(body.requestId),env));
  }
  if(url.pathname==='/api/reply')return json(await answerMessage(repo,owner,id(body.taskId),id(body.messageId),env));
  return json(await execute(new StagingRepository(env.DB),owner,url.pathname,body,relations));
 }catch(error){
  if(error instanceof ApiError)return json({error:error.message},error.status);
  console.error('[MOM staging] API failure');return json({error:'Staging service unavailable. Your draft is preserved; retry later.'},503);
 }
}
