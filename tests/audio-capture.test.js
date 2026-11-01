const {test}=require('node:test');const assert=require('node:assert/strict');require('../audio-capture.js');
const {createRecorder}=globalThis.MomentumAudio;
function harness(overrides={}){
 const calls=[],texts=[],statuses=[],instances=[];let stopped=0;
 class Recorder {static isTypeSupported(){return true;}constructor(){instances.push(this);this.mimeType='audio/webm';this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['recorded audio'],{type:'audio/webm'})});this.onstop();}}
 const stream={getTracks:()=>[{stop(){stopped++;}}]};
 const controller=createRecorder({MediaRecorder:Recorder,getUserMedia:async()=>stream,requestId:()=> 'one-clip',transcribe:async(blob,id)=>{calls.push({blob,id});return {text:'Привет, freight tomorrow'};},onState(){},onStatus:t=>statuses.push(t),onTranscript:t=>texts.push(t),setTimeout:()=>1,clearTimeout(){},...overrides});
 return {controller,calls,texts,statuses,instances,stream,get stopped(){return stopped;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('one stopped clip yields one final transcription, never cumulative partial results',async()=>{
 const h=harness();await h.controller.start();assert.equal(h.controller.state(),'recording');assert.deepEqual(h.texts,[]);h.controller.stop();h.instances[0].onstop();await tick();
 assert.equal(h.calls.length,1);assert.deepEqual(h.texts,['Привет, freight tomorrow']);assert.ok(h.stopped>0);assert.equal(h.controller.state(),'idle');h.controller.dispose();
});
test('transcription failure keeps audio for explicit retry and applies the result once',async()=>{
 let count=0;const h=harness({transcribe:async()=>{if(++count===1)throw Error('offline');return {text:'Recovered text'};}});
 await h.controller.start();h.controller.stop();await tick();assert.equal(h.controller.state(),'failed');assert.deepEqual(h.texts,[]);
 await h.controller.retry();await h.controller.retry();assert.equal(count,2);assert.deepEqual(h.texts,['Recovered text']);h.controller.dispose();
});
test('permission denial and unsupported recording leave text-only fallback available',async()=>{
 const h=harness({getUserMedia:async()=>{throw Object.assign(Error(),{name:'NotAllowedError'});}});await h.controller.start();assert.equal(h.controller.state(),'idle');assert.match(h.statuses.at(-1),/permission denied/);assert.deepEqual(h.calls,[]);
 assert.equal(harness({MediaRecorder:undefined}).controller.supported,false);
});
test('closing during a permission request stops a subsequently granted stream',async()=>{
 let grant;const h=harness({getUserMedia:()=>new Promise(resolve=>grant=resolve)});const starting=h.controller.start();h.controller.dispose();grant(h.stream);await starting;assert.ok(h.stopped>0);assert.deepEqual(h.texts,[]);assert.equal(h.instances.length,0);
});
test('late transcription callbacks after close cannot append text to another panel',async()=>{
 let complete;const h=harness({transcribe:()=>new Promise(resolve=>complete=resolve)});await h.controller.start();h.controller.stop();h.controller.dispose();complete({text:'too late'});await tick();assert.deepEqual(h.texts,[]);
});
test('empty provider result fails without changing typed text',async()=>{
 const h=harness({transcribe:async()=>({text:' '})});await h.controller.start();h.controller.stop();await tick();assert.equal(h.controller.state(),'failed');assert.deepEqual(h.texts,[]);h.controller.dispose();
});
test('Stop reviews by default; explicit Send transcribes once with send intent',async()=>{
 const intents=[];const review=harness({onTranscript:(text,intent)=>intents.push(intent)});await review.controller.start();review.controller.stop();await tick();assert.deepEqual(intents,['review']);
 const send=harness({onTranscript:(text,intent)=>intents.push(intent)});await send.controller.start();send.controller.stop(true);send.controller.stop(true);send.controller.stop();await tick();assert.equal(send.calls.length,1);assert.deepEqual(intents,['review','send']);
});
test('automatic duration stop and retry after failed Send never auto-send a transcript',async()=>{
 let timeout;const intents=[];const timed=harness({setTimeout:fn=>(timeout=fn,1),onTranscript:(text,intent)=>intents.push(intent)});await timed.controller.start();timeout();await tick();assert.deepEqual(intents,['review']);
 let attempts=0;const failed=harness({transcribe:async()=>{if(++attempts===1)throw Error('offline');return {text:'Recovery'};},onTranscript:(text,intent)=>intents.push(intent)});await failed.controller.start();failed.controller.stop(true);await tick();assert.equal(failed.controller.state(),'failed');await failed.controller.retry();assert.deepEqual(intents,['review','review']);
});
