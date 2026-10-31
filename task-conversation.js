/* Inline task conversations. Messages never enter nodes[] or the task save queue. */
(function(){
 'use strict';
 var active=null;
 function el(tag,text,cls){var n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
 function account(){return window.MomentumConversationAPI?window.MomentumConversationAPI.account():typeof currentUser!=='undefined'?currentUser:'signed-out';}
 function row(id){return Array.from(document.querySelectorAll('.node-row')).find(function(n){return n.dataset.id===id;});}
 function close(restore){
  var p=active;if(!p)return;if(!persist(p))return;p.audio.dispose();p.element.remove();active=null;
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
    var card=el('div',null,'task-chat-proposal');card.append(el('strong',proposal.kind.replace('_',' ')),el('p',proposal.title||proposal.reason));
    if(proposal.reason)card.append(el('p',proposal.reason,'task-chat-muted'));
    if(['duplicate','next_action'].indexOf(proposal.kind)>=0)card.append(el('p','Suggestion for review; no task has been changed.','task-chat-muted'));
    else {var review=el('button','Preview proposed change');review.type='button';review.onclick=function(){p.kind.value=proposal.kind;p.target.value=proposal.targetId||'';p.proposedTitle.value=proposal.title||'';p.structure.open=true;preview(p);};card.append(review);}
    p.suggestions.append(card);
   });(index<history.length-3?p.older:p.log).append(item);
  });
  if(!p.log.children.length)p.log.append(el('p','Discuss this task here. Messages stay separate from the outline.','task-chat-muted'));
  p.log.scrollTop=p.log.scrollHeight;
  p.transcriptionAvailable=data.transcriptionAvailable===true;p.mic.disabled=!p.audio.supported||!p.transcriptionAvailable;
  if(!p.audio.supported)p.audioStatus.textContent='Recording is unavailable in this browser. Type your message instead.';else if(!p.transcriptionAvailable)p.audioStatus.textContent='Audio transcription is not connected. You can type instead.';
  p.retry.hidden=!data.retryMessageId||data.aiStatus==='unconfigured';p.retry.dataset.messageId=data.retryMessageId||'';
  p.status.textContent=data.aiStatus==='unconfigured'?'Messages are saved. AI is not connected yet.':data.aiStatus==='failed'?'Your message is saved. AI could not reply; retry when available.':data.aiStatus==='pending'?'Your message is saved. AI is still responding. Use Refresh history to check.':'History synced to this task.';
 }
 async function load(p){try{var data=await p.api.load(p.id);messages(p,data);}catch(error){if(still(p))p.status.textContent=error.message;}}
 function invalidate(p){p.approvalId=null;p.proposal=null;p.approve.hidden=true;p.preview.replaceChildren();}
 async function preview(p){
  invalidate(p);try{var data=await p.api.preview(p.id,p.kind.value,p.target.value||null,p.proposedTitle.value);if(!still(p))return;p.proposal=data.proposal;
   p.preview.textContent=p.proposal.kind==='subtask'?'Create “'+p.proposal.title+'” under “'+p.proposal.parentName+'”':p.proposal.kind==='move'?'Move “'+p.proposal.taskName+'”: '+p.proposal.fromParentName+' → '+p.proposal.toParentName:'“'+p.proposal.fromName+'” '+p.proposal.type+' → “'+p.proposal.toName+'”';
   p.preview.append(el('p','Preview only. Approve to change the outline.','task-chat-muted'));p.approve.hidden=false;
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
  var heading=el('div',null,'task-chat-heading'),dismiss=el('button','×');dismiss.setAttribute('aria-label','Close conversation');dismiss.type='button';dismiss.onclick=function(){close();};heading.append(p.title,dismiss);
  p.log=el('div',null,'task-chat-log');p.log.setAttribute('aria-label','Conversation history');p.log.tabIndex=0;
  p.status=el('p','Loading conversation…','task-chat-muted');p.status.setAttribute('role','status');p.status.setAttribute('aria-live','polite');
  var label=el('label','Message about this task');label.htmlFor='task-chat-input';p.input=el('textarea');p.input.id='task-chat-input';p.input.rows=2;p.input.maxLength=12000;p.input.placeholder='Ask about this task…';
  var controls=el('div',null,'task-chat-controls'),mic=el('button','🎤'),send=el('button','Send'),refresh=el('button','Refresh history');[mic,send,refresh].forEach(function(b){b.type='button';});
  p.mic=mic;mic.setAttribute('aria-label','Record voice message');mic.disabled=true;
  p.retry=el('button','Retry AI reply');p.retry.type='button';p.retry.hidden=true;
  p.audioStatus=el('span','','task-chat-muted');p.audioStatus.setAttribute('role','status');
  p.audio=MomentumAudio.createRecorder({MediaRecorder:window.MediaRecorder,getUserMedia:navigator.mediaDevices&&navigator.mediaDevices.getUserMedia?navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices):null,
   requestId:function(){return crypto.randomUUID();},transcribe:function(blob,requestId,signal){return p.api.transcribe(id,blob,requestId,signal);},
   onTranscript:function(text){if(!still(p))return;p.input.value=[p.input.value.trim(),text].filter(Boolean).join(' ');persist(p);},
   onStatus:function(text){p.audioStatus.textContent=text;},onState:function(state){
    mic.textContent=state==='recording'?'■ Stop':state==='failed'?'Retry audio':state==='requesting'||state==='transcribing'?'Cancel':'🎤';
    mic.setAttribute('aria-label',state==='recording'?'Stop recording':state==='failed'?'Retry transcription':state==='requesting'||state==='transcribing'?'Cancel recording':'Record voice message');
    mic.setAttribute('aria-pressed',String(state==='recording'));send.disabled=!!p.sending||['recording','requesting','transcribing'].indexOf(state)>=0;
   }});
  mic.onclick=function(){var state=p.audio.state();if(state==='recording')p.audio.stop();else if(state==='failed')p.audio.retry();else if(state==='requesting'||state==='transcribing')p.audio.cancel();else p.audio.start();};
  p.input.oninput=function(){persist(p);};
  try{var draft=JSON.parse(localStorage.getItem(p.key)||'null');if(draft){p.input.value=draft.text||'';p.pending=draft.pending||null;}}catch(error){p.status.textContent='Draft recovery failed; existing browser data was preserved.';}
  async function submit(){
   if(p.sending||!p.api)return;var text=p.input.value.trim();if(!text){p.status.textContent='Speak or type a message first.';return;}
   if(['recording','requesting','transcribing'].indexOf(p.audio.state())>=0)return;if(!p.pending||p.pending.text!==text)p.pending={text:text,id:crypto.randomUUID()};persist(p);
   p.sending=true;send.disabled=true;p.input.readOnly=true;p.status.textContent='Saving message…';
   try{var data=await p.api.send(id,text,p.pending.id);if(still(p)){p.pending=null;p.input.value='';persist(p);messages(p,data);}}
   catch(error){if(still(p))p.status.textContent='Send not confirmed: '+error.message+' Your text is kept for retry.';}
   finally{p.sending=false;send.disabled=false;p.input.readOnly=false;}
  }
  send.onclick=submit;refresh.onclick=function(){load(p);};p.retry.onclick=async function(){p.retry.disabled=true;try{messages(p,await p.api.retry(id,p.retry.dataset.messageId));}catch(error){if(still(p))p.status.textContent=error.message;}finally{p.retry.disabled=false;}};
  p.structure=el('details',null,'task-chat-structure');p.structure.append(el('summary','Suggestions & task structure'));p.suggestions=el('div');p.structure.append(p.suggestions);
  p.kind=el('select');p.kind.setAttribute('aria-label','Conversation structure action');[['subtask','Propose subtask'],['move','Move this task'],['related','Related to'],['blocks','Blocks'],['supports','Supports'],['alternative','Alternative']].forEach(function(pair){var o=el('option',pair[1]);o.value=pair[0];p.kind.append(o);});
  p.target=el('select');p.target.setAttribute('aria-label','Conversation target task');var root=el('option','Inbox / root');root.value='';p.target.append(root);nodes.filter(function(n){return n.id!==id;}).forEach(function(n){var o=el('option',n.name||'New task');o.value=n.id;p.target.append(o);});
  p.proposedTitle=el('input');p.proposedTitle.placeholder='Proposed subtask title';p.proposedTitle.setAttribute('aria-label','Proposed subtask title');p.proposedTitle.maxLength=300;
  var previewButton=el('button','Preview change');previewButton.type='button';previewButton.onclick=function(){preview(p);};p.preview=el('div',null,'task-chat-preview');p.approve=el('button','Approve this change');p.approve.type='button';p.approve.hidden=true;
  p.kind.onchange=p.target.onchange=p.proposedTitle.oninput=function(){invalidate(p);};
  p.approve.onclick=async function(){if(!p.proposal)return;p.approve.disabled=true;if(!p.approvalId)p.approvalId=crypto.randomUUID();try{await p.api.apply(p.proposal,p.approvalId);if(still(p)){invalidate(p);p.approvalId=null;p.preview.textContent='Approved change saved to staging.';}}catch(error){if(still(p))p.preview.textContent=error.message;}finally{p.approve.disabled=false;}};
  p.structure.append(p.kind,p.target,p.proposedTitle,previewButton,p.preview,p.approve);
  p.history=el('details',null,'task-chat-history');p.history.append(el('summary','History & options'));p.older=el('div',null,'task-chat-older');p.history.append(p.older,refresh,p.retry);
  controls.append(mic,send);var compose=el('div',null,'task-chat-compose');compose.append(label,p.input,controls,p.audioStatus);
  p.element.append(heading,p.log,p.status,compose,p.history,p.structure);
  p.element.addEventListener('keydown',function(event){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}else if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();submit();}});
  ['click','mousedown','pointerdown','touchstart'].forEach(function(type){p.element.addEventListener(type,function(e){e.stopPropagation();});});
  active=p;reconcile();p.input.focus({preventScroll:true});p.element.scrollIntoView({block:'nearest'});
  if(p.api)load(p);else{send.disabled=true;p.structure.hidden=true;p.status.textContent='Persistent task conversation is available in the isolated staging app.';}
 }
 document.addEventListener('click',function(event){var button=event.target.closest('[data-task-chat]');if(!button)return;event.preventDefault();event.stopPropagation();open(button.dataset.taskChat);},true);
 document.addEventListener('keydown',function(event){if(event.target.closest('[data-task-chat]')&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopImmediatePropagation();event.target.click();}},true);
 document.addEventListener('visibilitychange',function(){if(active&&document.hidden){active.audio.cancel();persist(active);}});
 window.addEventListener('pagehide',function(){if(active){active.audio.dispose();persist(active);}});
 window.MomentumConversations={open:open,close:close,beforeRender:function(){if(!active)return;active.focused=document.activeElement===active.input;active.start=active.input.selectionStart;active.end=active.input.selectionEnd;active.element.remove();},afterRender:reconcile};
})();
