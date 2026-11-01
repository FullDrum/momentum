import {fail,id,text} from './api.js';
import {taskDate,stagingToday} from './task-dates.js';
export function creationPreview(state,revision,body){
 const source=state.messages.find(m=>m.id===id(body.sourceMessageId)&&m.taskId===id(body.taskId)&&m.role==='assistant'&&m.status==='completed');
 if(!source)fail(404,'AI proposal not found');
 const applied=state.audit.find(a=>a.proposal?.kind==='create_tasks'&&a.proposal.sourceMessageId===source.id);
 if(applied||source.creationResult)fail(409,'These proposed tasks have already been saved. Refresh the list.');
 const suggestions=(source.proposals||[]).filter(p=>p.kind==='create_task');if(!suggestions.length||suggestions.length>10)fail(400,'No task creation suggestions to review');
 const origin=state.tasks.find(t=>t.id===body.taskId&&!t.isSection);if(!origin)fail(404,'Conversation task not found');
 const today=stagingToday(body.today),seen=new Set();
 const reuse=!String(origin.name||'').trim()&&!origin.done&&!state.tasks.some(t=>t.parentId===origin.id);
 const tasks=suggestions.map((p,index)=>{
  const title=text(p.title,'task title',300);if(!title||/^new task$/i.test(title))fail(400,'Enter a meaningful task title');
  const parentId=p.targetId==null?null:id(p.targetId);
  if(parentId&&!state.tasks.some(t=>t.id===parentId))fail(404,'Parent task not found');
  const taskId=reuse&&index===0?origin.id:null;
  if(taskId&&parentId===taskId)fail(400,'A task cannot be its own parent');
  const date=taskDate(p.date,today).slice(0,10),key=JSON.stringify([title.toLowerCase(),parentId,date]);
  if(seen.has(key)||state.tasks.some(t=>t.id!==taskId&&String(t.name||'').trim().toLowerCase()===title.toLowerCase()&&(t.parentId||null)===parentId&&t.date?.slice(0,10)===date))fail(409,'A matching dated task already exists');
  seen.add(key);return {title,parentId,parentName:parentId?state.tasks.find(t=>t.id===parentId).name:'Root (independent task)',date,taskId,fromParentId:taskId?origin.parentId||null:null};
 });
 return {kind:'create_tasks',taskId:origin.id,sourceMessageId:source.id,today,tasks,baseRevision:revision,requiresApproval:true};
}
export function applyCreation(state,proposal,requestId,owner){
 // Regenerate from persisted AI suggestions, then compare the exact reviewed plan.
 const expected=creationPreview(state,proposal.baseRevision,{taskId:proposal.taskId,sourceMessageId:proposal.sourceMessageId,today:proposal.today});
 if(JSON.stringify(expected)!==JSON.stringify(proposal))fail(409,'Task proposal changed. Preview again.');
 if(state.tasks.length+proposal.tasks.filter(t=>!t.taskId).length>1000)fail(413,'Staging task limit reached');
 const created=[];proposal.tasks.forEach((t,index)=>{
  const taskId=t.taskId||'ai_'+crypto.randomUUID();
  let task=state.tasks.find(n=>n.id===taskId);
  if(!task){task={id:taskId,done:false,isSection:false,owner,order:Date.now()+index,retainEmpty:true};state.tasks.push(task);}
  Object.assign(task,{name:t.title,parentId:t.parentId,date:t.date});created.push({id:taskId,name:task.name,parentId:task.parentId,date:task.date});
 });
 state.messages.find(m=>m.id===proposal.sourceMessageId).creationResult=created;
 return created;
}
