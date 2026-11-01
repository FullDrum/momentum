/* Inline task conversations. Messages never enter nodes[] or the task save queue. */
(function(){
 'use strict';
 var active=null;
 function el(tag,text,cls){var n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
 function account(){return window.MomentumConversationAPI?window.MomentumConversationAPI.account():typeof currentUser!=='undefined'?currentUser:'signed-out';}
 function row(id){return Array.from(document.querySelectorAll('.node-row')).find(function(n){return n.dataset.id===id;});}
 function close(restore){
  var p=active;if(!p)return;if(!persist(p))return;p.audio.dispose();p.element.remove();active=null;if(window.MomentumViewport)window.MomentumViewport.setChatOpen(false);
  var r=row(p.id),button=r&&r.querySelector('[data-task-chat]');if(button){button.setAttribute('aria-expanded','false');button.removeAttribute('aria-controls');if(restore!==false)button.focus({preventScroll:true});}
 }
 function persist(p){try{localStorage.setItem(p.key,JSON.stringify({text:p.input.value,pending:p.pending}));return true;}catch(error){p.status.textContent='Draft could not be saved on this browser. Keep a copy of your text.';return false;}}
 function still(p){return active===p&&p.account===account();}
 function reconcile(){
  if(!active)return;var p=active,r=row(p.id);
  if(!r||p.account!==account()){close(false);return;}
  r.after(p.element);p.element.style.marginLeft=Math.min(parseInt(r.style.paddingLeft||'8',10),48)+'px';
  var button=r.querySelector('[data-task-chat]');if(button){button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls','task-conversation-panel');}
  var n=nodes.find(function(n){return n.id===p.id;});if(n)p.title.textContent='Conversation · '+(String(n.name||'').trim()||'New task');
  if(p.focused){p.input.focus({preventScroll:true});p.input.setSelectionRange(p.start,p.end);p.focused=false;}
 }
 function messages(p,data){
  if(!still(p))return;p.log.replaceChildren();p.older.replaceChildren();p.suggestions.replaceChildren();
  var history=data.messages||[];history.forEach(function(message,index){
   var item=el('div',null,'task-chat-message'),heading=el('strong',message.role==='assistant'?(message.status==='failed'?'AI unavailable':message.status==='pending'?'AI pending':'AI'):message.role==='legacy'?'Earlier note':'You');
   item.append(heading,el('div',message.content));
   (message.proposals||[]).forEach(function(proposal){
    var card=el('div',null,'task-chat-proposal');card.append(el('strong',proposal.kind.replace('_',' ')));if(proposal.title)card.append(el('p',proposal.title));
    if(proposal.kind==='create_task'||proposal.kind==='subtask')card.append(el('p','Date: '+(proposal.date||'Today')+' · '+(proposal.targetId?'Selected parent':'Root / independent')));
    if(proposal.reason)card.append(el('p',proposal.reason,'task-chat-muted'));
    if(message.creationResult&&proposal.kind==='create_task')card.append(el('p','Saved to staging.','task-chat-muted'));
    else if(proposal.kind==='create_task'){/* One atomic review button for all independent actions below. */}
    else if(['duplicate','next_action'].indexOf(proposal.kind)>=0)card.append(el('p','Suggestion for review; no task has been changed.','task-chat-muted'));
    else {var review=el('button','Preview proposed change');review.type='button';review.onclick=function(){p.kind.value=proposal.kind;p.target.value=proposal.targetId||'';p.proposedTitle.value=proposal.title||'';p.date.value=proposal.date||'';p.sourceMessageId=null;p.structure.open=true;p.fields();preview(p);};card.append(review);}
    p.suggestions.append(card);
   });
   var creations=(message.proposals||[]).filter(function(s){return s.kind==='create_task';});
   if(creations.length&&!message.creationResult){var reviewTasks=el('button','Review '+creations.length+' proposed tasks');reviewTasks.type='button';reviewTasks.onclick=function(){p.sourceMessageId=message.id;p.kind.value='create_tasks';p.fields();preview(p);};p.suggestions.append(reviewTasks);}
   (index<history.length-2?p.older:p.log).append(item);
  });
  p.structure.querySelector('summary').textContent=p.suggestions.children.length?'Suggestions ('+p.suggestions.children.length+')':'Suggestions';
  p.log.hidden=!p.log.children.length;
  p.log.scrollTop=p.log.scrollHeight;
  p.transcriptionAvailable=data.transcriptionAvailable===true;p.mic.disabled=!p.audio.supported||!p.transcriptionAvailable;
  if(!p.audio.supported)p.audioStatus.textContent='Voice unsupported. Type instead.';else if(!p.transcriptionAvailable)p.audioStatus.textContent='Voice unavailable. Type instead.';
  p.retry.hidden=!data.retryMessageId||data.aiStatus==='unconfigured';p.retry.dataset.messageId=data.retryMessageId||'';
  p.health.textContent=data.aiStatus==='unconfigured'?'AI off':'';
  p.configNote.textContent=data.aiStatus==='unconfigured'?'OpenAI is not configured. Text messages are saved; AI replies and voice require a server credential.':'';
  p.status.textContent=data.aiStatus==='failed'?'AI reply failed. Retry in History.':data.aiStatus==='pending'?'Thinking…':'';
  if(window.MomentumViewport)window.MomentumViewport.refresh();
 }
 async function load(p){try{var data=await p.api.load(p.id);messages(p,data);}catch(error){if(still(p))p.status.textContent=error.message;}}
 function invalidate(p){p.approvalId=null;p.proposal=null;p.approve.hidden=true;p.preview.replaceChildren();}
 async function preview(p){
  invalidate(p);try{var data=await p.api.preview(p.id,p.kind.value,p.target.value||null,p.proposedTitle.value,p.date.value,p.sourceMessageId);if(!still(p))return;p.proposal=data.proposal;
   p.preview.textContent=p.proposal.kind==='create_tasks'?p.proposal.tasks.map(function(t){return (t.taskId?'Use this blank task: ':'Create: ')+t.title+'\nDate: '+t.date+' · '+t.parentName+(t.taskId&&t.fromParentId!==t.parentId?' (move from current parent)':'');}).join('\n\n'):p.proposal.kind==='title'?'Title: New task → “'+p.proposal.title+'”':p.proposal.kind==='subtask'?'Create “'+p.proposal.title+'” under “'+p.proposal.parentName+'” · Date: '+p.proposal.date:p.proposal.kind==='move'?'Move “'+p.proposal.taskName+'”: '+p.proposal.fromParentName+' → '+p.proposal.toParentName:'“'+p.proposal.fromName+'” '+p.proposal.type+' → “'+p.proposal.toName+'”';
   p.preview.append(el('p','Not applied.','task-chat-muted'));p.approve.hidden=false;
  }catch(error){if(still(p))p.preview.textContent=error.message;}
 }
 function open(id){
  if(active&&active.id===id){close();return;}
  close(false);if(active)return;var r=row(id),node=typeof nodes!=='undefined'&&nodes.find(function(n){return n.id===id;});if(!r||!node||node.isSection)return;
  node.retainEmpty=true;node.conversationStarted=true;node.hasConversation=true;scheduleSave(node);saveActiveInput();focusId=null;
  var p={id:id,account:account(),api:window.MomentumConversationAPI,pending:null};
  p.key='momentum_task_conversation_draft_v1:'+encodeURIComponent(p.account)+':'+id;
  p.element=el('section',null,'task-conversation');p.element.id='task-conversation-panel';p.element.setAttribute('role','region');p.element.setAttribute('aria-labelledby','task-chat-title');
  p.title=el('strong','Conversation · '+(String(node.name||'').trim()||'New task'));p.title.id='task-chat-title';
  p.health=el('span','','task-chat-health');var heading=el('div',null,'task-chat-heading'),dismiss=el('button','×');dismiss.setAttribute('aria-label','Close conversation');dismiss.type='button';dismiss.onclick=function(){close();};heading.append(p.title,p.health,dismiss);
  p.log=el('div',null,'task-chat-log');p.log.setAttribute('aria-label','Conversation history');p.log.tabIndex=0;
  p.status=el('p','Loading…','task-chat-muted');p.status.setAttribute('role','status');p.status.setAttribute('aria-live','polite');
  var label=el('label','Message about this task');label.htmlFor='task-chat-input';label.className='task-chat-label';p.input=el('textarea');p.input.id='task-chat-input';p.input.rows=1;p.input.maxLength=12000;p.input.placeholder='Message…';
  var controls=el('div',null,'task-chat-controls'),mic=el('button','🎤'),send=el('button','↑'),refresh=el('button','Refresh history');[mic,send,refresh].forEach(function(b){b.type='button';});
  send.className='task-chat-send';send.setAttribute('aria-label','Send');send.title='Send (Ctrl/Cmd+Enter)';
  p.mic=mic;mic.setAttribute('aria-label','Record voice message');mic.disabled=true;
  p.retry=el('button','Retry AI reply');p.retry.type='button';p.retry.hidden=true;
  p.audioStatus=el('span','','task-chat-muted');p.audioStatus.setAttribute('role','status');
  p.audio=MomentumAudio.createRecorder({MediaRecorder:window.MediaRecorder,getUserMedia:navigator.mediaDevices&&navigator.mediaDevices.getUserMedia?navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices):null,
   requestId:function(){return crypto.randomUUID();},transcribe:function(blob,requestId,signal){return p.api.transcribe(id,blob,requestId,signal);},
   onTranscript:function(text,intent){if(!still(p))return;p.input.value=[p.input.value.trim(),text].filter(Boolean).join(' ');persist(p);p.sendAfterTranscript=intent==='send';},
   onStatus:function(text){p.audioStatus.textContent=text;},onState:function(state){
    mic.textContent=state==='recording'?'■':state==='failed'?'↻':state==='requesting'||state==='transcribing'||state==='stopping'?'×':'🎤';
    mic.setAttribute('aria-label',state==='recording'?'Stop recording':state==='failed'?'Retry transcription':state==='requesting'||state==='transcribing'||state==='stopping'?'Cancel recording':'Record voice message');
    mic.setAttribute('aria-pressed',String(state==='recording'));send.disabled=!!p.sending||['requesting','transcribing','stopping'].indexOf(state)>=0;
    if(state==='idle'&&p.sendAfterTranscript){p.sendAfterTranscript=false;submit();}
   }});
  mic.onclick=function(){var state=p.audio.state();if(state==='recording')p.audio.stop();else if(state==='failed')p.audio.retry();else if(state==='requesting'||state==='transcribing'||state==='stopping')p.audio.cancel();else p.audio.start();};
  p.input.oninput=function(){p.input.style.height='auto';p.input.style.height=Math.min(p.input.scrollHeight,88)+'px';persist(p);};
  try{var draft=JSON.parse(localStorage.getItem(p.key)||'null');if(draft){p.input.value=draft.text||'';p.pending=draft.pending||null;}}catch(error){p.status.textContent='Draft recovery failed; existing browser data was preserved.';}
  async function submit(){
   if(p.sending||!p.api)return;
   if(p.audio.state()==='recording'){p.audio.stop(true);return;}
   if(['requesting','transcribing','stopping'].indexOf(p.audio.state())>=0)return;
   var text=p.input.value.trim();if(!text){p.status.textContent='Speak or type a message first.';return;}
   if(['recording','requesting','transcribing','stopping'].indexOf(p.audio.state())>=0)return;if(!p.pending||p.pending.text!==text)p.pending={text:text,id:crypto.randomUUID()};persist(p);
   if(p.audio.state()==='failed')p.audio.cancel();
   p.sending=true;send.disabled=true;mic.disabled=true;p.input.readOnly=true;p.status.textContent='Sending…';
   try{var data=await p.api.send(id,text,p.pending.id);if(still(p)){p.pending=null;p.input.value='';persist(p);messages(p,data);}}
   catch(error){if(still(p))p.status.textContent='Send not confirmed: '+error.message+' Your text is kept for retry.';}
   finally{p.sending=false;send.disabled=false;mic.disabled=!p.audio.supported||!p.transcriptionAvailable;p.input.readOnly=false;}
  }
  send.onclick=submit;refresh.onclick=function(){load(p);};p.retry.onclick=async function(){p.retry.disabled=true;try{messages(p,await p.api.retry(id,p.retry.dataset.messageId));}catch(error){if(still(p))p.status.textContent=error.message;}finally{p.retry.disabled=false;}};
  p.structure=el('details',null,'task-chat-structure');p.structure.append(el('summary','Suggestions'));p.suggestions=el('div');p.structure.append(p.suggestions);
  p.kind=el('select');p.kind.setAttribute('aria-label','Conversation structure action');[['create_tasks','AI task creation batch'],['title','Title for empty task'],['subtask','Propose subtask'],['move','Move this task'],['related','Related to'],['blocks','Blocks'],['supports','Supports'],['alternative','Alternative']].forEach(function(pair){var o=el('option',pair[1]);o.value=pair[0];p.kind.append(o);});p.kind.value='title';
  p.target=el('select');p.target.setAttribute('aria-label','Conversation target task');var root=el('option','Inbox / root');root.value='';p.target.append(root);nodes.filter(function(n){return n.id!==id;}).forEach(function(n){var o=el('option',n.name||'New task');o.value=n.id;p.target.append(o);});
  p.proposedTitle=el('input');p.proposedTitle.placeholder='Proposed title';p.proposedTitle.setAttribute('aria-label','Proposed title');p.proposedTitle.maxLength=300;
  p.date=el('input');p.date.type='date';p.date.setAttribute('aria-label','Proposed task date');
  var previewButton=el('button','Preview change');previewButton.type='button';previewButton.onclick=function(){preview(p);};p.preview=el('div',null,'task-chat-preview');p.approve=el('button','Approve this change');p.approve.type='button';p.approve.hidden=true;
  function fields(){p.proposedTitle.hidden=['title','subtask'].indexOf(p.kind.value)<0;p.target.hidden=['title','subtask','create_tasks'].indexOf(p.kind.value)>=0;p.date.hidden=p.kind.value!=='subtask';}
  p.kind.onchange=function(){p.sourceMessageId=null;invalidate(p);fields();};p.date.onchange=p.target.onchange=p.proposedTitle.oninput=function(){invalidate(p);};p.fields=fields;fields();
  p.approve.onclick=async function(){if(!p.proposal||p.approve.disabled)return;p.approve.disabled=true;if(!p.approvalId)p.approvalId=crypto.randomUUID();try{var result=await p.api.apply(p.proposal,p.approvalId);if(still(p)){invalidate(p);p.approvalId=null;await load(p);p.preview.textContent=result.created?'Saved and verified '+result.created.length+' dated tasks.':'Approved change saved to staging.';}}catch(error){if(still(p))p.preview.textContent=error.message;}finally{p.approve.disabled=false;}};
  p.structure.append(p.kind,p.target,p.proposedTitle,p.date,previewButton,p.preview,p.approve);
  p.history=el('details',null,'task-chat-history');p.history.append(el('summary','History'));p.configNote=el('p','','task-chat-muted');p.history.append(p.configNote);p.older=el('div',null,'task-chat-older');p.history.append(p.older,refresh,p.retry);
  controls.append(mic,send);var compose=el('div',null,'task-chat-compose');compose.append(label,p.input,controls,p.audioStatus);
  var advanced=el('div',null,'task-chat-advanced');advanced.append(p.history,p.structure);p.element.append(heading,p.log,p.status,compose,advanced);
  p.element.addEventListener('keydown',function(event){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}else if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();submit();}});
  ['click','mousedown','pointerdown','touchstart'].forEach(function(type){p.element.addEventListener(type,function(e){e.stopPropagation();});});
  active=p;if(window.MomentumViewport)window.MomentumViewport.setChatOpen(true);reconcile();p.input.focus({preventScroll:true});p.element.scrollIntoView({block:'nearest'});
  if(p.api)load(p);else{send.disabled=true;p.structure.hidden=true;p.status.textContent='Persistent task conversation is available in the isolated staging app.';}
 }
 document.addEventListener('click',function(event){var button=event.target.closest('[data-task-chat]');if(!button)return;event.preventDefault();event.stopPropagation();open(button.dataset.taskChat);},true);
 document.addEventListener('keydown',function(event){if(event.target.closest('[data-task-chat]')&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopImmediatePropagation();event.target.click();}},true);
 document.addEventListener('visibilitychange',function(){if(active&&document.hidden){active.audio.cancel();persist(active);}});
 window.addEventListener('pagehide',function(){if(active){active.audio.dispose();persist(active);}});
 window.MomentumConversations={open:open,close:close,beforeRender:function(){if(!active)return;active.focused=document.activeElement===active.input;active.start=active.input.selectionStart;active.end=active.input.selectionEnd;active.element.remove();},afterRender:reconcile};
})();
