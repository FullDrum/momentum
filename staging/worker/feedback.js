import {fail,id,text} from './api.js';
export const feedbackTypes={hierarchy:'AI hierarchy proposal needs review',dates:'Task date handling needs review',voice:'Voice recording or transcription needs review',interface:'Outliner interface needs review',other:'Staging behavior needs review'};
export const feedbackStatuses=['submitted','triaged','proposed_fix','codex_pr','qa_checked','resolved'];
function ticketId(value){if(typeof value!=='string'||!/^qa_[a-f0-9-]{36}$/.test(value))fail(400,'Invalid QA ticket ID');return value;}
export function redactFeedback(value,max=2000){
 return text(value,'feedback text',max).replace(/\bsk-[A-Za-z0-9_-]{12,}/g,'[credential removed]')
 .replace(/\bBearer\s+\S+/gi,'[credential removed]')
 .replace(/\b(?:OPENAI_API_KEY|api[_ -]?key|password|token|secret)\s*[:=]\s*\S+/gi,'[credential removed]')
 .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[credential removed]')
 .replace(/https?:\/\/[^\s<>]+/gi,'[URL removed]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email removed]').slice(0,max);
}
export function feedbackDraft(state,body,buildId){
 const taskId=id(body.taskId);if(!state.tasks.some(t=>t.id===taskId&&!t.isSection))fail(404,'Task not found');
 const type=body.type;if(!Object.hasOwn(feedbackTypes,type))fail(400,'Choose a QA category');
 const observation=redactFeedback(body.observation);if(!observation)fail(400,'Describe the problem and expected behavior');
 if(!Array.isArray(body.excerpts)||body.excerpts.length>2)fail(400,'Choose at most two short excerpts');
 const seen=new Set(),excerpts=body.excerpts.map(e=>{
  if(!e||typeof e!=='object')fail(400,'Invalid excerpt');const messageId=id(e.messageId);
  const source=(state.messages||[]).find(m=>m.id===messageId&&m.taskId===taskId);if(!source||seen.has(messageId))fail(400,'Excerpt is not from this conversation');seen.add(messageId);
  return {messageId,role:source.role==='assistant'?'assistant':'user',text:redactFeedback(e.text,600)};
 });
 return {id:ticketId(body.id),type,taskId,buildId,observation,excerpts};
}
export function publicFeedbackReference(record){
 // Deliberately no interpolation of private observations, task IDs/names or excerpts.
 const title='Momentum Next QA: '+feedbackTypes[record.type];
 const body='Staging QA ticket: '+ticketId(record.id)+'\nCategory: '+feedbackTypes[record.type]+'\nBuild: '+record.buildId+'\n\nPrivate context is retained in the authenticated Momentum Next staging QA inbox. GitHub access alone does not grant access. Reproduce with authorized private access, then propose a staging-only fix. No private conversation or task data is included here.';
 return {title,body,url:'https://github.com/FullDrum/momentum/issues/new?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body)};
}
const feedbackDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
function visibleFeedback(record){const {createSignature,...visible}=record;return {...visible,publicReference:publicFeedbackReference(record)};}
export async function readFeedback(repo,owner,reportId,buildId){
 const {state}=await repo.read(owner),records=state.feedback||[];
 if(reportId){const record=records.find(r=>r.id===ticketId(reportId));if(!record)fail(404,'QA report not found');return {buildId,report:visibleFeedback(record)};}
 return {buildId,items:records.map(({id,type,taskId,status,createdAt,updatedAt,buildId,revision,prUrl})=>({id,type,taskId,status,createdAt,updatedAt,buildId,revision,prUrl})).reverse()};
}
export async function writeFeedback(repo,owner,action,body,buildId){
 if(action==='preview')return {draft:feedbackDraft((await repo.read(owner)).state,body,buildId)};
 if(body.approved!==true)fail(400,'Explicit QA submission required');
 const reportId=ticketId(body.id);
 for(let attempt=0;attempt<5;attempt++){
  const snap=await repo.read(owner),state=structuredClone(snap.state);state.feedback=state.feedback||[];
  let record=state.feedback.find(r=>r.id===reportId),signature;
  if(action==='submit'){
   // Retries use the build of the originally approved draft, even after a deploy.
   const draft=feedbackDraft(state,body,record?.buildId||buildId);signature=await feedbackDigest(draft);
   if(record){if(signature!==record.createSignature)fail(409,'QA ticket ID already used for different content');return {report:visibleFeedback(record),duplicate:true};}
   if(body.buildId!==buildId)fail(409,'The staging build changed. Preview your report again.');
   if(state.feedback.length>=100)fail(413,'Staging QA inbox limit reached');
   const now=new Date().toISOString();record={...draft,createdAt:now,updatedAt:now,status:'submitted',revision:1,prUrl:null,replies:[],createSignature:signature};state.feedback.push(record);
  }else{
   if(!record)fail(404,'QA report not found');
   if(action==='reply'){
    const requestId=id(body.requestId),content=redactFeedback(body.content);if(!content)fail(400,'Enter a QA reply');
    const existing=record.replies.find(r=>r.id===requestId);if(existing){if(existing.content!==content)fail(409,'Reply ID already used for different content');return {report:visibleFeedback(record),duplicate:true};}
    if(record.replies.length>=50)fail(413,'QA reply limit reached');record.replies.push({id:requestId,content,at:new Date().toISOString()});
   }else if(action==='status'){
    if(!feedbackStatuses.includes(body.status))fail(400,'Invalid QA status');
    if(body.expectedRevision!==record.revision)fail(409,'QA report changed. Refresh before updating its status.');
    const prUrl=body.prUrl||null;if(prUrl!==null&&(typeof prUrl!=='string'||!/^https:\/\/github\.com\/FullDrum\/momentum\/pull\/[1-9]\d*$/.test(prUrl)))fail(400,'Use a FullDrum/momentum pull request URL');
    if(body.status==='codex_pr'&&!prUrl)fail(400,'Add the Codex pull request URL');record.status=body.status;record.prUrl=prUrl;
   }else fail(404,'QA action not found');
   record.updatedAt=new Date().toISOString();record.revision++;
  }
  if(await repo.compareAndSwap(owner,snap.revision,state))return {report:visibleFeedback(record)};
 }
 fail(409,'QA inbox changed on another device. Retry your submission.');
}
