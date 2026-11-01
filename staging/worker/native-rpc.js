import {taskDate,stagingToday} from './task-dates.js';
import {ApiError,fail,text,id} from './api.js';
/* Compatibility for the original app's queue contract, isolated to staging. */
export async function outlineToken(tasks){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(tasks))))).map(b=>b.toString(16).padStart(2,'0')).join('');}
function validateOutline(tasks){
 const map=new Map(tasks.map(t=>[t.id,t]));if(map.size!==tasks.length)fail(400,'Duplicate task ID');
 if(tasks.length>1000)fail(413,'Staging task limit reached');
 for(const task of tasks){
  const seen=new Set([task.id]);let parent=task.parentId;
  while(parent){if(!map.has(parent))fail(400,'Parent task not found');if(seen.has(parent))fail(400,'Cannot create a parent cycle');seen.add(parent);parent=map.get(parent).parentId;}
 }
}
export async function nativeRpc(repo,owner,body,relations){
 if(body.fn==='whoAmI')return {email:owner,environment:'isolated-staging'};
 if(body.fn==='getPeople')return {people:[]};if(body.fn==='getTeamMembers')return [];
 if(body.fn==='getInitialData'){
  const snapshot=await repo.read(owner);return {user:owner,nodes:snapshot.state.tasks.map(t=>({...t,...(!t.isSection?{retainEmpty:true}:{}),hasConversation:t.conversationStarted===true||(snapshot.state.messages||[]).some(m=>m.taskId===t.id)||(snapshot.state.notes||[]).some(n=>n.taskId===t.id)})),treeToken:await outlineToken(snapshot.state.tasks)};
 }
 if(body.fn!=='batchOps')fail(403,'This collaboration or management action is not enabled in isolated staging.');
 const requestId=id(body.requestId),arg=body.arg;
 if(!arg||!Array.isArray(arg.saves)||!Array.isArray(arg.deletes)||arg.saves.length+arg.deletes.length>1000)fail(400,'Invalid task batch');
 const signature=await outlineToken({path:'/api/rpc',body});
 for(let attempt=0;attempt<5;attempt++){
  const snap=await repo.read(owner),state=structuredClone(snap.state);
  const previous=state.receipts.find(r=>r.id===requestId);
  if(previous){if(previous.signature!==signature)fail(409,'Request ID already used for different content');return {...previous.result,treeToken:await outlineToken(state.tasks)};}
  if(body.expectedTree!==await outlineToken(state.tasks))fail(409,'The outline changed on another device. Reload to reconcile your queued edits before retrying.');
  const deletes=new Set(arg.deletes.map(id));state.tasks=state.tasks.filter(t=>!deletes.has(t.id));
  for(const raw of arg.saves){
   if(!raw||typeof raw!=='object')fail(400,'Invalid task');const taskId=id(raw.id);if(deletes.has(taskId))fail(400,'Conflicting task batch');
   const task={id:taskId,name:text(raw.name??'','task name'),parentId:raw.parentId==null||raw.parentId===''?null:id(raw.parentId),owner,isSection:!!raw.isSection,done:!!raw.done,...(!raw.isSection?{retainEmpty:true}:{}),...(raw.conversationStarted===true?{conversationStarted:true}:{})};
   for(const key of ['date','completedDate','order','watching','assignedTo','assignedBy','assigneePersonId','sharedWith'])if(raw[key]!==undefined)task[key]=raw[key];
   if(!task.isSection)task.date=taskDate(task.date,stagingToday(body.today));
   if(task.order!=null&&!Number.isFinite(task.order))fail(400,'Invalid task order');
   const at=state.tasks.findIndex(t=>t.id===taskId);if(at<0)state.tasks.push(task);else state.tasks[at]=task;
  }
  validateOutline(state.tasks);
  state.tasks.sort((a,b)=>(a.order??0)-(b.order??0));state.links=state.links.filter(l=>!deletes.has(l.fromId)&&!deletes.has(l.toId));
  const result={results:{saves:arg.saves.map(n=>({id:n.id,ok:true})),deletes:arg.deletes.map(taskId=>({id:taskId,ok:true}))}};
  state.receipts.push({id:requestId,signature,result});
  if(await repo.compareAndSwap(owner,snap.revision,state))return {...result,treeToken:await outlineToken(state.tasks)};
 }
 fail(409,'Another device updated the outline. Retry when connected.');
}
