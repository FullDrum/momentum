/* One recording -> one final server transcript. No browser speech recognition. */
(function(root){
 'use strict';
 function createRecorder(options){
  var current=null,state='idle',disposed=false;
  var Recorder=options.MediaRecorder,media=options.getUserMedia;
  var timer=options.setTimeout||setTimeout,clear=options.clearTimeout||clearTimeout;
  function status(text){if(!disposed)options.onStatus(text);}
  function change(next){state=next;if(!disposed)options.onState(next);}
  function release(session){if(session.timer)clear(session.timer);if(session.uploadTimer)clear(session.uploadTimer);if(session.stream)session.stream.getTracks().forEach(function(track){track.stop();});}
  function cancel(){var session=current;current=null;if(session){release(session);if(session.abort)session.abort.abort();try{if(session.rec&&session.rec.state!=='inactive')session.rec.stop();}catch(_){}session.chunks=[];session.blob=null;}change('idle');}
  async function transcribe(session){
   if(current!==session||session.uploading||session.applied)return;
   session.uploading=true;session.abort=new AbortController();session.uploadTimer=timer(function(){session.abort.abort();},35000);change('transcribing');status('Transcribing the recording…');
   try{
    var result=await options.transcribe(session.blob,session.id,session.abort.signal);
    if(disposed||current!==session)return;
    if(!result||typeof result.text!=='string'||!result.text.trim())throw new Error('No speech was detected. Type your message or record again.');
    session.applied=true;options.onTranscript(result.text.trim());session.blob=null;session.chunks=[];current=null;change('idle');status('Transcribed.');
   }catch(error){if(disposed||current!==session)return;change('failed');status('Transcription unavailable: '+error.message+' Your typed text is kept. Retry the recording or use text.');}
   finally{if(session.uploadTimer)clear(session.uploadTimer);session.uploading=false;}
  }
  async function start(){
   if(disposed||current||!Recorder||!media)return;
   var session={id:options.requestId(),chunks:[],size:0};current=session;change('requesting');status('Allow microphone access to record.');
   try{
    session.stream=await media({audio:true});if(disposed||current!==session){release(session);return;}
    var mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(function(type){return Recorder.isTypeSupported&&Recorder.isTypeSupported(type);});
    var rec=new Recorder(session.stream,mime?{mimeType:mime}:undefined);session.rec=rec;
    rec.ondataavailable=function(event){if(current!==session||session.finished)return;if(event.data&&event.data.size){session.size+=event.data.size;session.chunks.push(event.data);}};
    rec.onerror=function(){if(current!==session)return;cancel();status('Recording failed. Your typed text is kept; use text or try again.');};
    rec.onstop=function(){
     if(current!==session||session.finished)return;session.finished=true;release(session);
     if(!session.size||session.size>10*1024*1024){cancel();status('Recording was empty or too large. Use a shorter clip or type instead.');return;}
     session.blob=new Blob(session.chunks,{type:rec.mimeType||mime||'audio/webm'});transcribe(session);
    };
    rec.start();change('recording');status('Recording… Tap Stop.');
    session.timer=timer(function(){if(current===session)stop();},60000);
   }catch(error){if(current!==session)return;cancel();status(error.name==='NotAllowedError'?'Microphone permission denied. Allow Microphone in browser site settings, or type instead.':'Microphone unavailable. Your text is kept; type instead or try again.');}
  }
  function stop(){var session=current;if(!session||!session.rec||session.rec.state==='inactive')return;try{session.rec.stop();release(session);}catch(error){cancel();status('Could not finish recording. Type instead.');}}
  return {supported:!!(Recorder&&media),start:start,stop:stop,cancel:cancel,retry:function(){if(current&&state==='failed')return transcribe(current);},state:function(){return state;},dispose:function(){cancel();disposed=true;}};
 }
 root.MomentumAudio={createRecorder:createRecorder};
})(typeof window!=='undefined'?window:globalThis);
