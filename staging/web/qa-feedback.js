/* Private staging QA. Public handoffs use only server-generated fixed text. */
(function(){
 'use strict';var active=null;
 var types={hierarchy:'AI hierarchy',dates:'Task dates',voice:'Voice',interface:'Interface',other:'Other'};
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
 async function report(taskId,observation){
  var p=mount('Report / QA');if(!p)return;
  var key='momentum_qa_draft_v1:'+encodeURIComponent(p.owner)+':'+taskId,recovered=storage(p,key)||{},pending=recovered.pending||null,preview=null,busy=false;
  var category=el('select');category.setAttribute('aria-label','QA category');Object.keys(types).forEach(function(k){var o=el('option',types[k]);o.value=k;category.append(o);});category.value=recovered.type||'hierarchy';
  var note=el('textarea');note.rows=3;note.maxLength=2000;note.setAttribute('aria-label','QA observation and expected behavior');note.value=recovered.observation||observation||'';
  var excerptList=el('div'),chosen=(recovered.excerpts||[]).slice(0,2),review=el('div');
  p.main.append(el('p','Private staging report. Choose any short excerpts to include. No full history or audio. Nothing is sent to GitHub.'),label('Category',category),label('Problem / expected behavior',note),el('p','Task ID: '+taskId),excerptList,review);
  var choices=[];
  function values(){return {type:category.value,taskId:taskId,observation:note.value,excerpts:choices.filter(function(c){return c.check.checked;}).map(function(c){return {messageId:c.id,text:c.input.value};})};}
  function save(){if(!p.alive())return;storage(p,key,Object.assign(values(),{pending:pending}));}
  p.save=save;
  function formBusy(value){busy=value;category.disabled=note.disabled=value;choices.forEach(function(c){c.check.disabled=c.input.disabled=value;});}
  function changed(){preview=null;pending=null;review.replaceChildren();send.disabled=true;save();}
  var inspect=button('Preview private report',async function(){
   if(busy||!p.alive())return;formBusy(true);inspect.disabled=true;
   try{await MomentumStaging.sync();var body=Object.assign(values(),{id:pending?pending.id:'qa_'+crypto.randomUUID()});var data=await MomentumStaging.api('feedback/preview',body);if(!p.alive())return;
    preview=data.draft;note.value=preview.observation;preview.excerpts.forEach(function(e){var c=choices.find(function(c){return c.id===e.messageId;});if(c)c.input.value=e.text;});
    review.replaceChildren(previewBlock('Exact private submission (redacted)',JSON.stringify(preview,null,2)),el('p','Review this content for private information. Common keys, tokens, URLs and emails are redacted; you must remove anything else you do not want stored.'));
    send.disabled=false;save();
   }catch(error){fail(p,error);}finally{formBusy(false);inspect.disabled=false;}
  });
  var send=button('Send to QA',async function(){
   if(busy||!p.alive()||!preview)return;formBusy(true);send.disabled=true;inspect.disabled=true;
   pending=preview;if(!storage(p,key,Object.assign(values(),{pending:pending}))){formBusy(false);inspect.disabled=false;send.disabled=false;return;}
   try{var data=await MomentumStaging.api('feedback/submit',Object.assign({},pending,{approved:true}));if(!p.alive())return;
    pending=null;p.save=null;localStorage.removeItem(key);showReport(p,data.report);p.status.textContent='QA report saved: '+data.report.id+' · submitted';
   }catch(error){fail(p,error);send.disabled=false;}finally{formBusy(false);inspect.disabled=false;}
  });send.disabled=true;p.footer.append(inspect,send,button('QA inbox',function(){inbox();}));
  category.onchange=note.oninput=changed;p.status.textContent='Loading available excerpts…';
  try{await MomentumStaging.sync();var data=await MomentumStaging.api('conversation?taskId='+encodeURIComponent(taskId));if(!p.alive())return;
   var eligible=(data.messages||[]).filter(function(m){return ['user','assistant'].includes(m.role)&&m.content;});
   if(!note.value&&!recovered.observation){var recentUser=eligible.filter(function(m){return m.role==='user';}).at(-1);if(recentUser)note.value=recentUser.content.slice(0,2000);}
   var messages=eligible.filter(function(m){return eligible.slice(-2).includes(m)||chosen.some(function(e){return e.messageId===m.id;});});
   messages.forEach(function(m){var check=el('input');check.type='checkbox';check.setAttribute('aria-label','Include '+m.role+' excerpt');var input=el('textarea');input.maxLength=600;input.rows=2;input.setAttribute('aria-label','Editable '+m.role+' excerpt');var prior=chosen.find(function(e){return e.messageId===m.id;});check.checked=!!prior;input.value=prior?prior.text:m.content.slice(0,600);input.hidden=!check.checked;
    var choice={id:m.id,check:check,input:input};choices.push(choice);check.onchange=function(){input.hidden=!check.checked;changed();};input.oninput=changed;excerptList.append(label('Include '+m.role+' excerpt',check),input);
   });
   if(!messages.length)excerptList.append(el('p','No messages selected. You can report the interface without an excerpt.'));
   p.status.textContent=pending?'A previous submission was not confirmed. Preview and explicitly retry the same ticket.':'Build: '+(await MomentumStaging.api('feedback')).buildId;
   save();
  }catch(error){fail(p,error);}
 }
 function showReport(p,record){
  if(!p.alive())return;if(p.save)p.save();p.save=null;p.main.replaceChildren();p.footer.replaceChildren();
  p.main.append(el('h3',record.id),el('p','Status: '+record.status.replaceAll('_',' ')+' · Build: '+record.buildId),el('p','Task ID: '+record.taskId),el('p','Created: '+record.createdAt),previewBlock('Private observation',record.observation));
  if(record.excerpts.length)p.main.append(previewBlock('Consented excerpts',record.excerpts.map(function(e){return e.role+': '+e.text;}).join('\n\n')));
  var conversation=button('Open linked conversation',function(){p.close();var n=nodes.find(function(n){return n.id===record.taskId;});if(!n){showStatusBanner('The task was removed; this QA report retains its consented excerpt.','error');return;}activeTab='tree';var parent=n.parentId,seen=new Set();while(parent&&!seen.has(parent)){seen.add(parent);collapsed[parent]=false;var node=nodes.find(function(n){return n.id===parent;});parent=node&&node.parentId;}render();MomentumConversations.open(record.taskId);});p.main.append(conversation);
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
  p.main.append(el('p','Submitted reports stay in your staging account. Status is updated manually by an authorized reviewer; there is no automatic ChatGPT review.'));
  if(!data.items.length)p.main.append(el('p','No QA reports submitted.'));
  data.items.forEach(function(item){p.main.append(button(item.id+' · '+item.status.replaceAll('_',' ')+' · '+types[item.type],async function(){try{var data=await MomentumStaging.api('feedback?id='+encodeURIComponent(item.id));if(p.alive())showReport(p,data.report);}catch(error){fail(p,error);}}));});
 }catch(error){fail(p,error);}}
 window.MomentumQA={report:report,inbox:inbox};
 var toolbar=document.querySelector('.toolbar');if(toolbar){var qa=button('QA',inbox);qa.className='qa-inbox-button';qa.setAttribute('aria-label','QA inbox');qa.title='Private QA inbox';toolbar.insertBefore(qa,toolbar.firstChild);}
})();
