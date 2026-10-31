const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../voice-capture.js');
const {createStore,createSpeech}=globalThis.MomentumCapture;
function memoryStorage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
test('draft recovery and captures are scoped to account and task',()=>{
 const storage=memoryStorage(),a=createStore(storage,'alice'),b=createStore(storage,'bob');
 a.saveDraft('task',{transcript:'freight details'});
 assert.equal(createStore(storage,'alice').draft('task').transcript,'freight details');
 assert.deepEqual(b.draft('task'),{});assert.deepEqual(a.draft('other'),{});
 a.save('task',{transcript:'freight details'},'request-1');
 assert.deepEqual(a.draft('task'),{});assert.equal(a.entries('task')[0].memory.summary,'freight details');
 assert.deepEqual(b.entries('task'),[]);
 a.save('task',{transcript:'freight details'},'request-1');assert.equal(a.entries('task').length,1);
});
test('empty input rejected; whitespace summary falls back to transcript',()=>{
 const store=createStore(memoryStorage(),'alice');
 assert.throws(()=>store.save('t',{transcript:'   '},'1'),/Speak or type/);
 store.save('t',{transcript:'typed note',summary:'   '},'2');assert.equal(store.entries('t')[0].memory.summary,'typed note');
});
test('failed storage write preserves draft and does not claim a saved capture',()=>{
 const storage=memoryStorage(),store=createStore(storage,'alice');store.saveDraft('t',{transcript:'only copy'});
 storage.setItem=()=>{throw Error('quota exceeded');};
 assert.throws(()=>store.save('t',{transcript:'only copy'},'1'),/quota/);
 assert.equal(store.draft('t').transcript,'only copy');assert.deepEqual(store.entries('t'),[]);
});
test('corrupt storage is preserved and never overwritten',()=>{
 let raw='{"entries":false}',writes=0;const store=createStore({getItem:()=>raw,setItem:()=>writes++},'alice');
 assert.throws(()=>store.save('t',{transcript:'note'},'1'),/invalid/);assert.equal(writes,0);
});
function harness(throwOnStart=false){
 const instances=[];let text='typed base',status='',listening=false;
 class FakeSpeech{constructor(){instances.push(this);}start(){if(throwOnStart)throw Error('denied');}abort(){this.onend();}}
 const controller=createSpeech({Speech:FakeSpeech,getText:()=>text,getLanguage:()=> 'en-NZ',onText:t=>text=t,onStatus:t=>status=t,onListening:v=>listening=v});
 const result=(rec,parts)=>rec.onresult({results:parts.map(([s,final])=>Object.assign([{transcript:s}],{isFinal:final}))});
 return {controller,instances,result,get text(){return text;},get status(){return status;},get listening(){return listening;}};
}
test('cumulative speech results replace snapshots without duplicated finals',()=>{
 const h=harness();h.controller.start();const rec=h.instances[0];
 h.result(rec,[['freight',true]]);h.result(rec,[['freight',true],['booking',false]]);h.result(rec,[['freight',true],['booking',true]]);
 assert.equal(h.text,'typed base freight booking');assert.equal(rec.lang,'en-NZ');
 rec.onend();assert.equal(h.listening,false);h.controller.start();h.result(h.instances[1],[['tomorrow',true]]);
 assert.equal(h.text,'typed base freight booking tomorrow');
});
test('stop and dispose ignore old callbacks, including late errors',()=>{
 const h=harness();h.controller.start();const old=h.instances[0];h.controller.stop();h.controller.start();
 h.result(old,[['late unwanted text',true]]);old.onerror({error:'aborted'});old.onend();assert.equal(h.text,'typed base');assert.equal(h.listening,true);
 h.controller.dispose();h.result(h.instances[1],[['late',true]]);assert.equal(h.text,'typed base');assert.equal(h.listening,false);
});
test('permission errors and synchronous start failures preserve text and reset state',()=>{
 const h=harness();h.controller.start();h.instances[0].onerror({error:'not-allowed'});
 assert.equal(h.listening,false);assert.match(h.status,/not-allowed/);assert.equal(h.text,'typed base');
 const failed=harness(true);failed.controller.start();assert.equal(failed.listening,false);assert.match(failed.status,/denied/);
});
