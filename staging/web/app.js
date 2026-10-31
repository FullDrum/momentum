(function(){
 'use strict';
 var $=id=>document.getElementById(id),snapshot=null,account=null,proposal=null,pending=null,saving=false,selected=null;
 var draftFields=['task','language','transcript','summary','outcome','next-action','memory-status'];
 function draftKey(){return 'momentum_staging_draft_v1:'+account;}
 function values(){var out={};draftFields.forEach(key=>out[key]=$(key).value);return out;}
 function draft(){if(!account)return;try{localStorage.setItem(draftKey(),JSON.stringify({fields:values(),pending:pending}));}catch(error){$('save-status').textContent='Draft could not be stored on this browser. Keep this page open and copy your text.';}}
 async function api(path,body){
  var controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
   var result=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal,credentials:'same-origin',cache:'no-store'});
   if(result.status===401){$('signin').hidden=false;$('capture-fields').disabled=true;throw Error('Please sign in to staging. Your draft has been kept.');}
   if(!(result.headers.get('content-type')||'').includes('application/json'))throw Error('Session may have expired. Sign in again, then retry.');
   var data=await result.json();if(!result.ok)throw Error(data.error||'Staging request failed');return data;
  }catch(error){if(error.name==='AbortError')throw Error('Staging timed out. Your draft is kept; retry Save.');throw error;}
  finally{clearTimeout(timeout);}
 }
 function option(value,label){var o=document.createElement('option');o.value=value;o.textContent=label;return o;}
 function invalidate() {proposal=null;$('approve').hidden=true;$('proposal').textContent='';}
 function render(){
  var previous=$('task').value;$('task').replaceChildren(option('','New Inbox task'));
  snapshot.tasks.forEach(t=>$('task').append(option(t.id,t.name)));if(snapshot.tasks.some(t=>t.id===previous))$('task').value=previous;
  $('tree').replaceChildren();
  function branch(parent,host){snapshot.tasks.filter(t=>t.parentId===parent).forEach(t=>{var row=document.createElement('div');row.className='task';var button=document.createElement('button');button.textContent=t.name;button.onclick=()=>chooseTask(t.id);var children=document.createElement('div');children.className='children';row.append(button,children);host.append(row);branch(t.id,children);});}
  branch(null,$('tree'));if(!snapshot.tasks.length)$('tree').textContent='Your task pool is empty. Save your first instruction above.';
  $('links').replaceChildren();if(!snapshot.links.length)$('links').textContent='No relationships yet.';
  snapshot.links.forEach(l=>{var p=document.createElement('p');var from=snapshot.tasks.find(t=>t.id===l.fromId),to=snapshot.tasks.find(t=>t.id===l.toId);p.textContent=from.name+' — '+l.type+' → '+to.name;$('links').append(p);});
  renderNotes();suggest();
 }
 function renderNotes(){
  $('notes').replaceChildren();var notes=snapshot.notes.filter(n=>!$('task').value||n.taskId===$('task').value);
  if(!notes.length)$('notes').textContent='No saved notes for this selection.';
  notes.forEach(n=>{var item=document.createElement('details');item.className='note';var heading=document.createElement('summary');heading.textContent=n.memory.summary;var info=document.createElement('p');info.textContent=new Date(n.at).toLocaleString()+' · '+n.memory.status;var original=document.createElement('p');original.textContent=n.transcript;var memory=document.createElement('p');memory.textContent='Result: '+n.memory.outcome+'\nNext: '+n.memory.nextAction;item.append(heading,info,original,memory);$('notes').append(item);});
 }
 function chooseTask(id){
  selected=id;$('task').value=id;invalidate();$('structure').hidden=!id;
  if(id){var task=snapshot.tasks.find(t=>t.id===id);$('structure-title').textContent='Structure · '+task.name;
   $('target').replaceChildren(option('','Inbox / root'));snapshot.tasks.filter(t=>t.id!==id).forEach(t=>$('target').append(option(t.id,t.name)));}
  renderNotes();suggest();draft();
 }
 function suggest(){
  $('suggestions').replaceChildren();if(!snapshot)return;
  var selectedTask=snapshot.tasks.find(t=>t.id===$('task').value);
  MomentumTaskRelations.suggest(snapshot.tasks,[$('transcript').value,$('summary').value,selectedTask&&selectedTask.name].filter(Boolean).join(' '),$('task').value).forEach(match=>{
   var p=document.createElement('p');p.textContent='Related: '+match.name+' · '+match.reason;$('suggestions').append(p);
   if(selectedTask){var button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Preview related link';button.onclick=()=>{chooseTask(selectedTask.id);$('action').value='related';$('target').value=match.taskId;preview();$('structure').scrollIntoView({behavior:'smooth'});};$('suggestions').append(button);}
  });
 }
 async function refresh(initial){
  try{
   var data=await api('state');
   if(account&&account!==data.accountId){draft();location.reload();return;}
   account=data.accountId;snapshot=data;$('capture-fields').disabled=false;$('signin').hidden=true;render();invalidate();
   if(initial){try{var saved=JSON.parse(localStorage.getItem(draftKey())||'null');if(saved){draftFields.forEach(key=>{if(saved.fields[key]!=null)$(key).value=saved.fields[key];});pending=saved.pending;chooseTask($('task').value);}}catch(error){$('save-status').textContent='Saved local draft could not be restored; it has not been deleted.';}}
   $('connection').textContent='Connected to private staging · revision '+snapshot.revision+' · saved notes sync across devices';
  }catch(error){$('connection').textContent=error.message;}
 }
 var Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 var speech=MomentumCapture.createSpeech({Speech:Speech,getText:()=>$('transcript').value,getLanguage:()=>$('language').value,
  onText:text=>{$('transcript').value=text;draft();suggest();},onStatus:text=>$('speech-status').textContent=text,
  onListening:listening=>{$('mic').textContent=listening?'■ Stop':'🎤 Speak';$('mic').setAttribute('aria-pressed',String(listening));}});
 $('mic').disabled=!Speech;$('mic').setAttribute('aria-pressed','false');
 if(!Speech)$('speech-status').textContent='Speech recognition is unavailable in this browser. Type your instruction below.';
 $('mic').onclick=()=>{if(speech.listening()){speech.stop();$('speech-status').textContent='Stopped. Review the transcript, then save.';}else speech.start();};
 $('check-mic').onclick=async()=>{
  try{if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw Error('Microphone access requires HTTPS and a supported browser');
   var stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());$('speech-status').textContent='Microphone permission granted. Tap Speak to dictate, or type below.';
  }catch(error){$('speech-status').textContent='Microphone unavailable ('+error.name+'). In Android Chrome, open site permissions and allow Microphone, then retry. You can type below.';}
 };
 draftFields.forEach(key=>$(key).addEventListener('input',()=>{speech.stop();draft();suggest();}));
 $('task').addEventListener('change',()=>chooseTask($('task').value));
 $('capture').onsubmit=async event=>{
  event.preventDefault();if(saving)return;speech.stop();
  var payload={taskId:$('task').value||null,transcript:$('transcript').value,summary:$('summary').value,outcome:$('outcome').value,nextAction:$('next-action').value,status:$('memory-status').value};
  if(!payload.transcript.trim()&&!payload.summary.trim()){$('save-status').textContent='Speak or type a note first.';return;}
  var signature=JSON.stringify(payload);if(!pending||pending.signature!==signature)pending={signature,requestId:crypto.randomUUID()};draft();
  saving=true;$('capture-fields').disabled=true;$('save-status').textContent='Saving to staging…';
  try{
   var data=await api('capture',{...payload,requestId:pending.requestId});snapshot=data;pending=null;
   ['transcript','summary','outcome','next-action'].forEach(key=>$(key).value='');$('memory-status').value='pending';draft();render();invalidate();
   $('save-status').textContent='Saved to staging. Available on your other signed-in devices.';$('connection').textContent='Connected to private staging · revision '+snapshot.revision;
  }catch(error){$('save-status').textContent='Not confirmed: '+error.message+' Your text is preserved; retry Save.';}
  finally{saving=false;$('capture-fields').disabled=false;}
 };
 async function preview(){
  invalidate();if(!selected)return;
  try{var data=await api('preview',{taskId:selected,targetId:$('target').value||null,kind:$('action').value});proposal=data.proposal;
   $('proposal').textContent=proposal.kind==='move'?'Move “'+proposal.taskName+'”\nFrom: '+proposal.fromParentName+'\nTo: '+proposal.toParentName:'“'+proposal.fromName+'” '+proposal.type+' → “'+proposal.toName+'”';
   $('proposal').textContent+='\nProposal only · revision '+proposal.baseRevision+' · approve to save.';$('approve').hidden=false;
  }catch(error){$('proposal').textContent=error.message;}
 }
 $('preview').onclick=preview;$('action').onchange=$('target').onchange=invalidate;
 $('approve').onclick=async()=>{
  if(!proposal)return;$('approve').disabled=true;
  // Retain the exact request across uncertain responses; server deduplicates retries.
  if(!proposal.requestId)proposal.requestId=crypto.randomUUID();var requestId=proposal.requestId;
  var clean={...proposal};delete clean.requestId;
  try{snapshot=await api('apply',{requestId,proposal:clean,approved:true});invalidate();render();$('proposal').textContent='Structure change saved to staging.';$('connection').textContent='Connected to private staging · revision '+snapshot.revision;}
  catch(error){$('proposal').textContent=error.message+' No new change was confirmed. Refresh and preview again if tasks changed.';}
  finally{$('approve').disabled=false;}
 };
 $('refresh').onclick=()=>refresh(false);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){speech.stop();draft();}else if(!saving)refresh(false);});
 window.addEventListener('pagehide',()=>{speech.dispose();draft();});refresh(true);
})();
