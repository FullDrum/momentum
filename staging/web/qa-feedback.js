/* Private staging QA. Public handoffs use only server-generated fixed text. */
(function(){
 'use strict';var active=null,reporting=new Set();
 var types={conversation:'Task conversation',hierarchy:'AI hierarchy',dates:'Task dates',voice:'Voice',interface:'Interface',other:'Other'};
 var statuses=['submitted','triaged','proposed_fix','codex_pr','qa_checked','resolved'];
 function el(tag,text){var n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
 function button(text,fn){var n=el('button',text);n.type='button';n.onclick=fn;return n;}
 function label(text,input){var n=el('label',text);n.append(input);return n;}
 function identity(){return window.MomentumStaging&&MomentumStaging.account();}
 function mount(title){
  if(active)active.close();var owner=identity();if(!owner)return null;
  var returnFocus=document.activeElement,dialog=el('dialog'),header=el('header'),main=el('div'),footer=el('footer'),heading=el('strong',title),status=el('p');
  dialog.className='qa-dialog';dialog.setAttribute('aria-label',title);main.className='qa-body';status.setAttribute('role','status');
  var p={owner:owner,dialog:dialog,main:main,footer:footer,status:status,alive:function(){return active===p&&identity()===owner;},close:function(){if(p.save)p.save();dialog.close();dialog.remove();if(active===p)active=null;if(returnFocus&&returnFocus.isConnected)returnFocus.focus({preventScroll:true});}};
  header.append(heading,button('Close QA',p.close));dialog.append(header,main,status,footer);dialog.addEventListener('cancel',function(e){e.preventDefault();p.close();});
  dialog.addEventListener('keydown',function(e){e.stopPropagation();});dialog.addEventListener('click',function(e){e.stopPropagation();});
  document.body.append(dialog);active=p;dialog.showModal();return p;
 }
 function storage(p,key,value){try{if(value===undefined)return JSON.parse(localStorage.getItem(key)||'null');localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){p.status.textContent='Browser draft storage is unavailable. Keep a copy before closing.';return null;}}
 function previewBlock(title,value){var box=el('details'),pre=el('pre',value);box.open=true;box.append(el('summary',title),pre);return box;}
 function fail(p,error){if(p.alive())p.status.textContent=error.message+' Your draft is kept. Retry explicitly when connected.';}
 async function report(taskId,control,indicator,messages){
  var owner=identity();if(!owner||reporting.has(taskId))return;
  reporting.add(taskId);control.disabled=true;indicator.textContent='Saving whole task chat privately…';
  var key='momentum_qa_full_report_v1:'+encodeURIComponent(owner)+':'+taskId;
  function current(){return identity()===owner&&indicator.isConnected;}
  try{
   var bytes=new TextEncoder().encode(JSON.stringify(messages||[]));
   var cursor=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
   var saved=JSON.parse(localStorage.getItem(key)||'null');
   var pending=saved&&(!saved.done||saved.cursor===cursor)?saved:{id:'qa_'+crypto.randomUUID(),cursor:cursor,done:false};
   localStorage.setItem(key,JSON.stringify(pending));
   await MomentumStaging.sync();if(identity()!==owner)return;
   var data=await MomentumStaging.api('feedback/report',{id:pending.id,taskId:taskId,scope:'full_task_conversation',approved:true});
   if(identity()!==owner)return;pending.done=true;pending.ticketId=data.report.id;
   // The pending ID is already durable; cache completion must not hide a confirmed write.
   try{localStorage.setItem(key,JSON.stringify(pending));}catch(_){}
   if(current()){
    indicator.replaceChildren(el('span','QA saved · '+data.report.id+' · '+data.report.snapshot.messages.length+' messages '),button('Private QA inbox',function(){openReport(data.report.id);}));
   }
  }catch(error){if(current())indicator.textContent='QA not confirmed: '+error.message+' Tap Report to QA to retry; no automatic retry.';}
  finally{reporting.delete(taskId);control.disabled=false;if(window.MomentumViewport)MomentumViewport.refresh();}
 }
 async function openReport(id){var p=mount('Private QA report');if(!p)return;p.status.textContent='Loading…';try{var data=await MomentumStaging.api('feedback?id='+encodeURIComponent(id));if(p.alive()){showReport(p,data.report);p.status.textContent='';}}catch(error){fail(p,error);}}
 function showReport(p,record){
  if(!p.alive())return;if(p.save)p.save();p.save=null;p.main.replaceChildren();p.footer.replaceChildren();
  p.main.append(el('h3',record.id),el('p','Status: '+record.status.replaceAll('_',' ')+' · Build: '+record.buildId),el('p','Task ID: '+record.taskId),el('p','Created: '+record.createdAt),previewBlock('Private observation',record.observation));
  if(record.snapshot){var history=el('details');history.open=true;history.append(el('summary','Full task conversation ('+record.snapshot.messages.length+' messages)'));record.snapshot.messages.forEach(function(m){var entry=el('section');entry.className='qa-snapshot-message';entry.append(el('strong',m.role+' · '+(m.at||'timestamp unavailable')+(m.status?' · '+m.status:'')),el('pre',m.content));if(m.proposals&&m.proposals.length)entry.append(previewBlock('Proposals',JSON.stringify(m.proposals,null,2)));history.append(entry);});p.main.append(history);}
  if(record.excerpts.length)p.main.append(previewBlock('Consented excerpts',record.excerpts.map(function(e){return e.role+': '+e.text;}).join('\n\n')));
  var conversation=button('Open linked conversation',function(){p.close();var n=nodes.find(function(n){return n.id===record.taskId;});if(!n){showStatusBanner('The task was removed; this QA report retains its private snapshot.','error');return;}activeTab='tree';var parent=n.parentId,seen=new Set();while(parent&&!seen.has(parent)){seen.add(parent);collapsed[parent]=false;var node=nodes.find(function(n){return n.id===parent;});parent=node&&node.parentId;}render();MomentumConversations.open(record.taskId);});p.main.append(conversation);
  var publicBox=previewBlock('Public GitHub handoff — fixed text only',record.publicReference.title+'\n\n'+record.publicReference.body);publicBox.open=false;
  publicBox.append(el('p','This next action opens a public GitHub draft; it does not submit it. Only the fixed text above is included. Never add private context there.'));
  var handoff=el('a','Open sanitized GitHub draft');handoff.href=record.publicReference.url;handoff.target='_blank';handoff.rel='noopener noreferrer';publicBox.append(handoff);p.main.append(publicBox);
  p.main.append(el('p','This inbox is private to your signed-in staging account. ChatGPT does not receive this report automatically. GitHub access alone does not unlock this context; authorized private review must be arranged separately.'));
  var status=el('select');status.setAttribute('aria-label','QA lifecycle status');statuses.forEach(function(value){var o=el('option',value.replaceAll('_',' '));o.value=value;status.append(o);});status.value=record.status;
  var pr=el('input');pr.type='url';pr.placeholder='https://github.com/FullDrum/momentum/pull/…';pr.setAttribute('aria-label','QA fix pull request');pr.value=record.prUrl||'';
  var update=button('Save QA status',async function(){if(update.disabled||!p.alive())return;update.disabled=true;try{var data=await MomentumStaging.api('feedback/status',{id:record.id,status:status.value,prUrl:pr.value||null,expectedRevision:record.revision,approved:true});if(p.alive()){showReport(p,data.report);p.status.textContent='QA status saved.';}}catch(error){fail(p,error);}finally{update.disabled=false;}});p.main.append(label('Manual reviewer status',status),label('Fix PR (optional)',pr),update);
  var replies=el('details');replies.append(el('summary','Replies ('+record.replies.length+')'));record.replies.forEach(function(r){replies.append(el('p',r.at+' · '+r.content));});p.main.append(replies);
  var reply=el('textarea');reply.maxLength=2000;reply.rows=2;reply.setAttribute('aria-label','Private QA reply');var key='momentum_qa_reply_v1:'+encodeURIComponent(p.owner)+':'+record.id,saved=storage(p,key)||{};reply.value=saved.content||'';var requestId=saved.requestId||crypto.randomUUID();
  p.save=function(){if(p.alive())storage(p,key,{content:reply.value,requestId:requestId});};reply.oninput=function(){requestId=crypto.randomUUID();p.save();};
  var sendReply=button('Send private reply',async function(){if(sendReply.disabled||!p.alive())return;sendReply.disabled=true;p.save();try{var data=await MomentumStaging.api('feedback/reply',{id:record.id,content:reply.value,requestId:requestId,approved:true});if(p.alive()){localStorage.removeItem(key);p.save=null;showReport(p,data.report);p.status.textContent='Private reply saved.';}}catch(error){fail(p,error);}finally{sendReply.disabled=false;}});p.main.append(label('More information (private)',reply),sendReply);
  p.main.scrollTop=0;p.footer.append(button('QA inbox',function(){inbox();}),button('Refresh report',async function(){try{var data=await MomentumStaging.api('feedback?id='+encodeURIComponent(record.id));if(p.alive())showReport(p,data.report);}catch(error){fail(p,error);}}));
 }
 async function inbox(){var p=mount('Private QA inbox');if(!p)return;p.status.textContent='Loading QA inbox…';try{var data=await MomentumStaging.api('feedback');if(!p.alive())return;p.status.textContent='Build: '+data.buildId;
  var help=previewBlock('QA privacy help','Report to QA immediately saves the entire selected task chat privately, including older History turns. The click is your consent. Other tasks, unsent drafts, raw recordings and attachments are excluded. Credentials are redacted; nothing is silently truncated. GitHub receives only a fixed ticket/category/build reference. ChatGPT/private reviewer access is not connected.');help.open=false;p.main.append(help);
  p.main.append(el('p','Submitted reports stay in your staging account. Status is updated manually by an authorized reviewer; there is no automatic ChatGPT review.'));
  if(!data.items.length)p.main.append(el('p','No QA reports submitted.'));
  data.items.forEach(function(item){p.main.append(button(item.id+' · '+item.status.replaceAll('_',' ')+' · '+types[item.type],async function(){try{var data=await MomentumStaging.api('feedback?id='+encodeURIComponent(item.id));if(p.alive())showReport(p,data.report);}catch(error){fail(p,error);}}));});
 }catch(error){fail(p,error);}}
 window.MomentumQA={report:report,inbox:inbox};
 var toolbar=document.querySelector('.toolbar');if(toolbar){var qa=button('QA',inbox);qa.className='qa-inbox-button';qa.setAttribute('aria-label','QA inbox');qa.title='Private QA inbox';toolbar.insertBefore(qa,toolbar.firstChild);}
})();
