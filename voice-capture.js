/* Shared capture controller and recoverable, account-scoped local capture store. */
(function(root){
  'use strict';
  function createStore(storage, scope) {
    var key='momentum_next_capture_v1:'+encodeURIComponent(scope || 'signed-out');
    function read(){
      var raw=storage.getItem(key), data=raw ? JSON.parse(raw) : {drafts:{},entries:[]};
      if(!data || !data.drafts || typeof data.drafts!=='object' || Array.isArray(data.drafts) || !Array.isArray(data.entries))throw new Error('Capture storage is invalid; existing data was preserved');
      return data;
    }
    function write(data){storage.setItem(key,JSON.stringify(data));}
    return {
      draft:function(id){return read().drafts[id] || {};},
      saveDraft:function(id,draft){var data=read();data.drafts[id]=draft;write(data);},
      entries:function(id){return read().entries.filter(function(e){return e.taskId===id;});},
      save:function(id,draft,requestId){
        if(!String(draft.summary||'').trim()&&!String(draft.transcript||'').trim())throw new Error('Speak or type a note first');
        var data=read(),existing=data.entries.find(function(e){return e.id===requestId;});
        if(existing)return existing;
        var entry={id:requestId,taskId:id,at:new Date().toISOString(),transcript:String(draft.transcript||'').trim(),
          memory:{summary:String(draft.summary||'').trim()||String(draft.transcript||'').trim(),outcome:String(draft.outcome||'').trim(),nextAction:String(draft.nextAction||'').trim(),status:draft.status||'pending'}};
        data.entries.unshift(entry);delete data.drafts[id];write(data);return entry;
      }
    };
  }
  function createSpeech(options){
    var current=null, disposed=false;
    function status(text){if(!disposed)options.onStatus(text);}
    function finish(session){if(current!==session)return;current=null;options.onListening(false);}
    function stop(){
      var session=current;if(!session)return;
      // Detach before stopping: late browser callbacks must not edit a newer session.
      finish(session);try{session.rec.abort();}catch(_){}
    }
    return {
      start:function(){
        if(disposed||current)return;
        if(!options.Speech){status('Speech unavailable. You can type instead.');return;}
        var session={rec:null,base:options.getText().trim()};
        try{
          var rec=new options.Speech();session.rec=rec;current=session;
          rec.lang=options.getLanguage();rec.continuous=true;rec.interimResults=true;
          rec.onresult=function(event){
            if(disposed||current!==session)return;
            // Results are cumulative snapshots, including already-final results.
            var parts=[session.base];
            for(var i=0;i<event.results.length;i++)parts.push(event.results[i][0].transcript);
            options.onText(parts.filter(Boolean).join(' ').trim());
          };
          rec.onerror=function(event){if(current!==session||disposed)return;status('Speech error: '+event.error+'. Your text is preserved; type or try again.');stop();};
          rec.onend=function(){if(current!==session||disposed)return;finish(session);status('Stopped. Review and save your note.');};
          rec.start();options.onListening(true);status('Listening…');
        }catch(err){if(current===session)finish(session);status('Cannot start speech: '+err.message+'. You can type instead.');}
      },
      stop:stop,
      dispose:function(){stop();disposed=true;},
      listening:function(){return !!current;}
    };
  }
  root.MomentumCapture={createStore:createStore,createSpeech:createSpeech};
})(typeof window!=='undefined'?window:globalThis);
