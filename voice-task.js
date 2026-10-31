/* Momentum Next capture UI. Local development storage only; never calls gsr. */
(function(){
  'use strict';
  var active=null;
  function el(tag,text,cls){var n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  function environment(){return window.MomentumVoiceEnvironment||{
    getNodes:function(){return typeof nodes!=='undefined'?nodes:[];},
    scope:function(){return typeof currentUser!=='undefined'&&currentUser?currentUser:'signed-out';}
  };}
  function close(){if(active)active.close();}
  function open(id){
    close();if(active)return;
    var env=environment(),scope=env.scope(),all=env.getNodes(),node=all.find(function(n){return String(n.id)===String(id);});
    if(id!=='__inbox__'&&(!node||node.isSection))return;
    var taskId=id,previous=document.activeElement,store=MomentumCapture.createStore(localStorage,scope),draft={};
    var overlay=el('div',null,'voice-task-overlay');overlay.id='voice-task-overlay';
    var panel=el('section',null,'voice-task-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','voice-title');
    // Keep app-level task creation, undo and navigation shortcuts out of the dialog.
    panel.addEventListener('keydown',function(event){event.stopPropagation();});
    var title=el('h2',node?'Capture · '+node.name:'Quick capture · Inbox');title.id='voice-title';
    var status=el('p','','voice-muted');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    var warning='Development capture: saved on this browser only, including full text. No server, AI or archive requests. Shared devices can access local notes.';
    panel.append(title,el('p',warning,'voice-muted'));
    var fields={};
    function field(key,label,tag){var input=el(tag||'textarea');input.id='voice-'+key;input.setAttribute('aria-label',label);var l=el('label',label);l.htmlFor=input.id;panel.append(l,input);fields[key]=input;return input;}
    var language=field('language','Speech language','select');
    [['en-NZ','English (New Zealand)'],['ru-RU','Русский']].forEach(function(pair){var option=el('option',pair[1]);option.value=pair[0];language.append(option);});
    var controls=el('div',null,'voice-controls'),mic=el('button','🎤 Speak');mic.type='button';controls.append(mic);panel.append(controls,status);
    var transcript=field('transcript','Instruction · speak or type');
    var summary=field('summary','Short note (optional; defaults to instruction)');
    field('outcome','Result / outcome');field('nextAction','Next action');
    var state=field('status','Task memory status','select');
    ['pending','in_progress','waiting','completed'].forEach(function(value){var o=el('option',value.replace('_',' '));o.value=value;state.append(o);});
    var history=el('div'),suggestions=el('div'),structure=el('details'),structureTitle=el('summary','Task structure · preview move or link');
    var target=el('select'),kind=el('select'),preview=el('div',null,'voice-note');
    target.setAttribute('aria-label','Target task or project');kind.setAttribute('aria-label','Structure action');
    [['move','Move under parent'],['related','Related to'],['blocks','Blocks'],['supports','Supports'],['alternative','Alternative to']].forEach(function(pair){var o=el('option',pair[1]);o.value=pair[0];kind.append(o);});
    var rootOption=el('option','Inbox / root');rootOption.value='';target.append(rootOption);
    all.filter(function(n){return String(n.id)!==String(id);}).forEach(function(n){var o=el('option',n.name);o.value=n.id;target.append(o);});
    var proposal=null,propose=el('button','Preview change'),apply=el('button','Approve in development sandbox');apply.hidden=true;
    function invalidate(){proposal=null;apply.hidden=true;preview.replaceChildren();}
    target.onchange=kind.onchange=invalidate;
    function sameAccount(){if(env.scope()!==scope){status.textContent='Account changed. Close and reopen capture.';return false;}return true;}
    function previewChange(){
      invalidate();if(!sameAccount())return;
      try{
        proposal=kind.value==='move'?MomentumTaskRelations.proposeMove(env.getNodes(),id,target.value||null):MomentumTaskRelations.proposeLink(env.getNodes(),id,target.value,kind.value);
        preview.textContent=proposal.kind==='move'?'Move “'+proposal.taskName+'”: '+proposal.fromParentName+' → '+proposal.toParentName:'“'+proposal.fromName+'” '+proposal.type+' → “'+proposal.toName+'”';
        preview.append(el('p','Proposal only. No change has been applied.','voice-muted'));
        if(env.applyProposal)apply.hidden=false;
        else preview.append(el('p','Applying structure is available in the development sandbox demo.','voice-muted'));
      }catch(err){preview.textContent=err.message;}
    }
    propose.onclick=previewChange;
    apply.onclick=function(){
      if(!sameAccount()||!proposal)return;
      try{env.applyProposal(proposal,true);invalidate();status.textContent='Applied in development sandbox only.';}
      catch(err){invalidate();status.textContent=err.message;}
    };
    structure.append(structureTitle,kind,target,propose,preview,apply);
    structure.hidden=!node;
    function related(){
      suggestions.replaceChildren();
      var matches=MomentumTaskRelations.suggest(env.getNodes(),[transcript.value,summary.value,node&&node.name].filter(Boolean).join(' '),id);
      if(!matches.length){suggestions.append(el('p','No related-task suggestions yet. Add a few specific words.','voice-muted'));return;}
      matches.forEach(function(match){
        var item=el('div',null,'voice-note');item.append(el('strong',match.name),el('p',match.reason+' · keyword match, review required','voice-muted'));
        if(node){var choose=el('button','Preview related link');choose.onclick=function(){kind.value='related';target.value=match.taskId;structure.open=true;previewChange();};item.append(choose);}
        suggestions.append(item);
      });
    }
    function values(){var result={};Object.keys(fields).forEach(function(key){result[key]=fields[key].value;});return result;}
    function persist(){
      // The store remains bound to the account that opened this draft.
      try{store.saveDraft(taskId,values());return true;}catch(err){status.textContent='Draft not saved: '+err.message+'. Keep this panel open and copy your text.';return false;}
    }
    var Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
    var speech=MomentumCapture.createSpeech({Speech:Speech,getText:function(){return transcript.value;},getLanguage:function(){return language.value;},
      onText:function(text){if(!sameAccount()){speech.stop();return;}transcript.value=text;persist();related();},
      onStatus:function(text){status.textContent=text;},onListening:function(listening){mic.textContent=listening?'■ Stop':'🎤 Speak';mic.setAttribute('aria-pressed',String(listening));}});
    mic.disabled=!Speech;mic.setAttribute('aria-pressed','false');
    mic.onclick=function(){if(sameAccount()){if(speech.listening())speech.stop();else speech.start();}};
    Object.keys(fields).forEach(function(key){fields[key].addEventListener('input',function(){speech.stop();persist();related();});});
    var actions=el('div',null,'voice-controls'),save=el('button','Save capture locally'),cancel=el('button','Close');
    function render(){
      history.replaceChildren();
      try{store.entries(taskId).forEach(function(item){var detail=el('details',null,'voice-note');detail.append(el('summary',item.memory.summary),el('p',new Date(item.at).toLocaleString()+' · '+item.memory.status),el('p',item.transcript),el('p','Result: '+item.memory.outcome),el('p','Next: '+item.memory.nextAction));history.append(detail);});}
      catch(err){status.textContent='Cannot load history: '+err.message;}
    }
    save.onclick=function(){
      if(!sameAccount())return;speech.stop();
      try{
        var requestId=window.crypto.randomUUID();store.save(taskId,values(),requestId);
        Object.keys(fields).forEach(function(key){if(key!=='language'&&key!=='status')fields[key].value='';});state.value='pending';
        status.textContent='Saved locally. No production data changed.';render();related();if(env.onCapture){try{env.onCapture();}catch(refreshError){status.textContent='Saved locally; refresh the sandbox to update its task pool.';}}
      }catch(err){status.textContent='Capture not saved: '+err.message+'. Your text is still here.';}
    };
    function closePanel(){
      speech.stop();
      // A failed write must never silently destroy the only copy of a draft.
      if(!persist())return;
      speech.dispose();overlay.remove();document.removeEventListener('keydown',keydown,true);window.removeEventListener('pagehide',persist);active=null;
      if(previous&&previous.isConnected)previous.focus();
    }
    function keydown(event){
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closePanel();}
      if(event.key==='Tab'){
        var focusable=Array.from(panel.querySelectorAll('button,textarea,select,summary')).filter(function(n){return !n.disabled&&n.getClientRects().length;});
        var first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }
    cancel.onclick=closePanel;actions.append(save,cancel);panel.append(el('h3','Related tasks'),suggestions,structure,actions,el('h3','Saved captures'),history);
    overlay.append(panel);overlay.onclick=function(event){if(event.target===overlay)closePanel();};
    document.body.append(overlay);document.addEventListener('keydown',keydown,true);window.addEventListener('pagehide',persist);
    active={close:closePanel};
    try{draft=store.draft(taskId);Object.keys(fields).forEach(function(key){if(draft[key]!=null)fields[key].value=draft[key];});}catch(err){status.textContent='Draft recovery failed: '+err.message;}
    if(!Speech&&!status.textContent)status.textContent='Speech unavailable here. You can type instead.';
    render();related();transcript.focus();
  }
  document.addEventListener('click',function(event){var b=event.target.closest('[data-voice-task], [data-voice-capture]');if(!b)return;event.preventDefault();event.stopPropagation();open(b.hasAttribute('data-voice-capture')?'__inbox__':b.dataset.voiceTask);},true);
  window.MomentumVoice={open:open,close:close};
})();
