/* Original Momentum transport adapter, loaded BEFORE app.js on the staging host only. */
(function(){
 'use strict';
 var expectedTree=null,accountId=null,pendingBatch=null;
 function today(){return localDateTime().slice(0,10);}
 async function api(path,body){
  var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},30000);
  try{
   var response=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},credentials:'same-origin',cache:'no-store',signal:controller.signal,body:body?JSON.stringify(body):undefined});
   if(response.status===401){var error=new Error('Not authenticated');error.status=401;throw error;}
   if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('Staging session expired. Sign in again.');
   var data=await response.json();if(!response.ok){var failure=new Error(data.error||'Staging request failed');failure.status=response.status;throw failure;}return data;
  }catch(error){if(error.name==='AbortError')throw new Error('Staging timed out. Your changes remain on this device.');throw error;}
  finally{clearTimeout(timeout);}
 }
 function token(data){if(data.treeToken)expectedTree=data.treeToken;return data;}
 function batchKey(){return 'momentum_staging_native_batch_v1:'+accountId;}
 window.MomentumStaging={
  api:api,
  account:function(){return accountId;},
  rpc:async function(fn,arg){
   if(fn==='whoAmI'){
    var identity=await api('rpc',{fn:fn});accountId=identity.email;
    try{pendingBatch=JSON.parse(localStorage.getItem(batchKey())||'null');}catch(_){}
    return identity;
   }
   if(fn==='batchOps'){
    var signature=JSON.stringify(arg);
    if(!pendingBatch||pendingBatch.signature!==signature)pendingBatch={signature:signature,requestId:crypto.randomUUID(),expectedTree:expectedTree,today:today()};
    localStorage.setItem(batchKey(),JSON.stringify(pendingBatch));
    var result;
    try{result=token(await api('rpc',{fn:fn,arg:arg,today:pendingBatch.today,requestId:pendingBatch.requestId,expectedTree:pendingBatch.expectedTree}));}
    catch(error){if(error.status===409){pendingBatch=null;localStorage.removeItem(batchKey());}throw error;}
    pendingBatch=null;localStorage.removeItem(batchKey());return result;
   }
   return token(await api('rpc',{fn:fn,arg:arg}));
  },
  sync:async function(){
   saveActiveInput();if(!await flushNow(10000))throw new Error('Wait for task edits to finish syncing, then retry.');
  },
  refresh:async function(){await fetchAll(false);},
  signIn:function(){location.assign('/signin-with-chatgpt?return_to=/');},
  signOut:async function(){saveActiveInput();if(await flushNow(10000)){if(window.MomentumConversations)window.MomentumConversations.close();location.assign('/signout-with-chatgpt?return_to=/');}else showStatusBanner('Changes are still saving. Reconnect before signing out.','error');}
 };
 window.MomentumConversationAPI={
  account:function(){return accountId;},
  load:async function(taskId){await window.MomentumStaging.sync();return api('conversation?taskId='+encodeURIComponent(taskId));},
  transcribe:async function(taskId,blob,requestId,signal){
   await window.MomentumStaging.sync();
   var response=await fetch('/api/transcribe?taskId='+encodeURIComponent(taskId),{method:'POST',credentials:'same-origin',headers:{'content-type':blob.type},body:blob,signal:signal});
   var data=await response.json();if(!response.ok)throw new Error(data.error||'Transcription failed');return data;
  },
  send:async function(taskId,text,requestId){await window.MomentumStaging.sync();return api('message',{taskId:taskId,text:text,requestId:requestId,today:today()});},
  retry:async function(taskId,messageId){return api('reply',{taskId:taskId,messageId:messageId});},
  preview:async function(taskId,kind,targetId,title,date,sourceMessageId){await window.MomentumStaging.sync();return api('preview',{taskId:taskId,kind:kind,targetId:targetId,title:title,date:date||null,sourceMessageId:sourceMessageId,today:today()});},
  apply:async function(proposal,requestId){await window.MomentumStaging.sync();var data=await api('apply',{proposal:proposal,requestId:requestId,approved:true});if(proposal.taskId&&!queueState.saves[proposal.taskId])delete nodeTouched[proposal.taskId];(data.created||[]).forEach(function(t){delete nodeTouched[t.id];});await window.MomentumStaging.refresh();
   (data.created||[]).forEach(function(t){var saved=nodes.find(function(n){return n.id===t.id;});if(!saved||saved.name!==t.name||saved.date!==t.date||saved.parentId!==t.parentId)throw new Error('Tasks were saved, but list verification failed. Refresh and retry confirmation.');});return data;}
 };
})();
