/* Momentum voice task panel — prototype, no backend actions. */
(function () {
  'use strict';
  var keyPrefix = 'momentum_voice_notes_v1:';
  var approvalKey = 'momentum_voice_approval_v1';
  var activeTask = null, recognition = null;
  function archiveCall(name, arg) { if (typeof gsr !== 'function') return Promise.reject(new Error('Server unavailable')); return gsr(name,arg).then(function(r){if(!r || r.error || r.ok!==true)throw new Error((r&&r.error)||'Archive unavailable');return r;}); }
  var style = document.createElement('style');
  style.textContent = '.voice-task-btn{border:0;background:transparent;color:var(--text2);cursor:pointer;padding:5px;font-size:17px;flex-shrink:0}.voice-task-overlay{position:fixed;inset:0;z-index:12000;background:#0009;display:flex;align-items:center;justify-content:center;padding:14px}.voice-task-panel{box-sizing:border-box;width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--bg);color:var(--text);border:1px solid var(--border2);border-radius:14px;padding:18px;box-shadow:0 14px 45px #0007}.voice-task-panel textarea{box-sizing:border-box;width:100%;min-height:80px;margin:7px 0 14px;padding:9px;background:var(--bg2);color:var(--text);border:1px solid var(--border2);border-radius:8px;font:inherit}.voice-task-panel button{background:var(--bg2);color:var(--text);border:1px solid var(--border2);border-radius:7px;padding:8px;cursor:pointer}.voice-task-panel .voice-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.voice-task-panel .voice-note{padding:9px 0;border-top:1px solid var(--border2);white-space:pre-wrap;font-size:13px}.voice-task-panel .voice-muted{font-size:12px;color:var(--text2)}';
  document.head.appendChild(style);
  function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  function load(id) { try { var a=JSON.parse(localStorage.getItem(keyPrefix + id)||'[]'); return Array.isArray(a)?a:[]; } catch (_) { return []; } }
  function stop() { if (recognition) { recognition.stop(); recognition=null; } }
  function close() { stop(); var n=document.getElementById('voice-task-overlay'); if(n)n.remove(); activeTask=null; }
  function open(id) {
    close(); activeTask=id;
    var node = typeof nodes !== 'undefined' && nodes.find(function(n){return n.id===id;});
    if (!node || node.isSection) return;
    var overlay=el('div',null,'voice-task-overlay');overlay.id='voice-task-overlay';
    var panel=el('div',null,'voice-task-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
    panel.appendChild(el('h3','🎤 '+node.name));
    panel.appendChild(el('p','Prototype: reviewed memory and originals require a configured server archive. No AI or email action is performed.','voice-muted'));
    var transcript=el('textarea');transcript.placeholder='Speak or type your full instruction';transcript.setAttribute('aria-label','Instruction transcript');
    var summary=el('textarea');summary.placeholder='Keep all important points; remove repetition';summary.setAttribute('aria-label','Short task note');
    var controls=el('div',null,'voice-controls');
    var mic=el('button','🎤 Speak');mic.type='button';var status=el('span','','voice-muted');
    var Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Speech){mic.disabled=true;status.textContent='Speech recognition unavailable in this browser';}
    mic.onclick=function(){
      if(recognition){stop();mic.textContent='🎤 Speak';return;}
      var base=transcript.value.trim(),finalText='';
      recognition=new Speech();recognition.lang='ru-RU';recognition.continuous=true;recognition.interimResults=true;
      recognition.onresult=function(e){var interim='';for(var i=0;i<e.results.length;i++){if(e.results[i].isFinal)finalText+=e.results[i][0].transcript+' ';else interim+=e.results[i][0].transcript;}transcript.value=[base,finalText,interim].filter(Boolean).join(' ');};
      recognition.onerror=function(e){status.textContent='Speech error: '+e.error;};
      recognition.onend=function(){recognition=null;mic.textContent='🎤 Speak';};
      recognition.start();mic.textContent='■ Stop';status.textContent='Listening…';
    };
    controls.append(mic,status);panel.append(controls,el('label','Full instruction (not saved)'),transcript,el('label','Short history note'),summary);
    var approval=el('input');approval.type='checkbox';approval.checked=localStorage.getItem(approvalKey)!=='off';
    approval.onchange=function(){localStorage.setItem(approvalKey,approval.checked?'on':'off');};
    var approvalLabel=el('label',' Require confirmation');approvalLabel.prepend(approval);panel.appendChild(approvalLabel);
    var actions=el('div',null,'voice-controls'),save=el('button','Save short note'),cancel=el('button','Close');
    cancel.onclick=close;
    var archiveSection=el('details');
    var archiveHeading=el('summary','Original transcripts (private archive)');
    var archiveStatus=el('p','Open to load archived originals.','voice-muted');
    var archiveItems=el('div');
    archiveSection.append(archiveHeading,archiveStatus,archiveItems);
    archiveSection.addEventListener('toggle',function(){
      if(!archiveSection.open)return;
      archiveStatus.textContent='Loading originals…';
      archiveCall('voiceArchiveList',{taskId:id}).then(function(result){
        if(activeTask!==id)return;
        archiveItems.replaceChildren();
        archiveStatus.textContent=result.records.length ? 'Originals are removed after 30 days unless saved.' : 'No archived originals.';
        result.records.forEach(function(record){
          var item=el('details'),head=el('summary',new Date(record.createdAt).toLocaleString()+(record.keepOriginal?' · saved':' · expires '+new Date(record.expiresAt).toLocaleDateString()));
          var original=el('p',record.transcript,'voice-note');
          var keep=el('input');keep.type='checkbox';keep.checked=record.keepOriginal;
          var label=el('label',' Keep original');label.prepend(keep);
          keep.onchange=function(){
            keep.disabled=true;
            archiveCall('voiceArchiveKeep',{recordId:record.recordId,keepOriginal:keep.checked}).then(function(){
              archiveStatus.textContent='Retention preference updated. Close and reopen to refresh.';
            }).catch(function(err){keep.checked=!keep.checked;archiveStatus.textContent=err.message;}).finally(function(){keep.disabled=false;});
          };
          item.append(head,original,label);archiveItems.appendChild(item);
        });
      }).catch(function(err){archiveStatus.textContent='Archive unavailable: '+err.message;});
    });
    function renderEntries(items){
      history.replaceChildren();
      items.forEach(function(item){
        var m=item.memory||{},lines=[new Date(item.at).toLocaleString()+' · '+item.text];
        if(m.outcome)lines.push('Result: '+m.outcome);
        if(m.nextAction)lines.push('Next: '+m.nextAction);
        if(m.status)lines.push('Status: '+m.status);
        history.appendChild(el('div',lines.join('\n'),'voice-note'));
      });
    }
    function render(){
      archiveCall('voiceMemoryList',{taskId:id}).then(function(result){
        if(activeTask===id)renderEntries(result.entries);
      }).catch(function(err){
        if(activeTask===id){renderEntries(load(id));status.textContent='Server memory unavailable; showing older local notes: '+err.message;}
      });
    }
    save.onclick=function(){
      var note=summary.value.trim();if(!note){status.textContent='Enter a short note first';return;}
      if(approval.checked&&!window.confirm('Save this note to local history?'))return;
      var original=transcript.value.trim();
      save.disabled=true;
      var archive=original ? archiveCall('voiceArchiveStore',{taskId:id,transcript:original,keepOriginal:false}) : Promise.resolve({ok:true});
      archive.then(function(archiveResult){
        var memory=window.MomentumTaskMemory.fromReviewedText(note,outcome.value,nextAction.value,state.value,archiveResult.recordId||null);
        var requestId=window.crypto&&window.crypto.randomUUID?window.crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
        return archiveCall('voiceMemoryStore',{taskId:id,memory:memory,requestId:requestId,sourceRecordId:archiveResult.recordId||null}).then(function(){
          transcript.value='';summary.value='';outcome.value='';nextAction.value='';
          status.textContent='Saved task memory on server'+(original?' and original in separate archive':'');
          render();
        });
      }).catch(function(err){status.textContent='Save incomplete: '+err.message+'. Your text remains here; an original may already have been archived.';})
      .finally(function(){save.disabled=false;});
    };
    actions.append(save,cancel);panel.append(actions,el('h4','Short task history'),history,archiveSection);
    overlay.appendChild(panel);overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
    document.body.appendChild(overlay);render();transcript.focus();
  }
  document.addEventListener('click',function(e){var b=e.target.closest('[data-voice-task]');if(!b)return;e.preventDefault();e.stopPropagation();open(b.dataset.voiceTask);},true);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&activeTask)close();});
})();
