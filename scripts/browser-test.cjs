/* Run with Playwright installed; never permits external requests. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'text/plain'});res.end(error?'Not found':data);});
});
(async()=>{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900},serviceWorkers:'block'}),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{if(!route.request().url().startsWith(base+'/')){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.addInitScript(()=>{
   window.fakeSpeech=[];
   window.SpeechRecognition=class{constructor(){window.fakeSpeech.push(this);}start(){}abort(){this.onend();}};
  });
  await page.goto(base+'/prototypes/task-structure-live.html');
  await page.getByRole('button',{name:'＋ Capture a task'}).click();
  const transcript=page.getByLabel('Instruction · speak or type');
  await transcript.fill('Confirm decanter freight booking');
  await page.getByRole('button',{name:'🎤 Speak',exact:true}).click();
  await page.evaluate(()=>{
   const rec=fakeSpeech[0];function result(parts){rec.onresult({results:parts.map(text=>Object.assign([{transcript:text}],{isFinal:true}))});}
   result(['tomorrow']);result(['tomorrow','morning']);
  });
  assert.equal(await transcript.inputValue(),'Confirm decanter freight booking tomorrow morning');
  await page.getByRole('button',{name:'■ Stop',exact:true}).click();
  assert.match(await page.locator('.voice-task-panel').innerText(),/Shared words:.*decanter/);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'＋ Capture a task'}).click();
  assert.equal(await transcript.inputValue(),'Confirm decanter freight booking tomorrow morning');
  await page.getByRole('button',{name:'Save capture locally'}).click();
  assert.match(await page.getByRole('status').last().innerText(),/Saved locally/);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const captured=page.getByRole('button',{name:'Confirm decanter freight booking tomorrow morning',exact:true});await captured.click();
  await page.locator('.voice-task-panel summary').filter({hasText:'Task structure'}).click();
  await page.getByLabel('Target task or project').selectOption('decanter');
  await page.getByRole('button',{name:'Preview change',exact:true}).click();
  assert.match(await page.locator('.voice-task-panel').innerText(),/Inbox \/ root → Decanter import/);
  await page.getByRole('button',{name:'Approve in development sandbox'}).click();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  assert.equal(await page.locator('#tree > .task').filter({has:page.getByRole('button',{name:'Decanter import',exact:true})}).getByRole('button',{name:'Confirm decanter freight booking tomorrow morning',exact:true}).count(),1);
  await captured.click();await page.locator('.voice-task-panel summary').filter({hasText:'Task structure'}).click();
  await page.getByLabel('Structure action').selectOption('supports');await page.getByLabel('Target task or project').selectOption('equipment');
  await page.getByRole('button',{name:'Preview change',exact:true}).click();await page.getByRole('button',{name:'Approve in development sandbox'}).click();await page.getByRole('button',{name:'Close',exact:true}).click();
  assert.match(await page.locator('#links').innerText(),/supports → Plant equipment/);
  await page.getByRole('button',{name:'Decanter import',exact:true}).click();await page.locator('.voice-task-panel summary').filter({hasText:'Task structure'}).click();await page.getByLabel('Target task or project').selectOption('freight');await page.getByRole('button',{name:'Preview change',exact:true}).click();
  assert.match(await page.locator('.voice-task-panel').innerText(),/descendant/);assert.equal(await page.getByRole('button',{name:'Approve in development sandbox'}).isVisible(),false);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  // Local quota failure leaves the only copy visible and prevents closing.
  await page.getByRole('button',{name:'＋ Capture a task'}).click();await transcript.fill('Do not lose this text');
  await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};});
  await page.getByRole('button',{name:'Save capture locally'}).click();assert.equal(await transcript.inputValue(),'Do not lose this text');
  await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await transcript.isVisible(),true);
  await page.reload();
  // Mobile layout and unavailable recognition use the same capture panel.
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition;});
  await page.getByRole('button',{name:'＋ Capture a task'}).click();assert.equal(await page.getByRole('button',{name:'🎤 Speak',exact:true}).isDisabled(),true);
  assert.ok(await page.locator('.voice-task-panel').evaluate(n=>n.getBoundingClientRect().right<=innerWidth));
  const shot=process.env.DEMO_SCREENSHOT;if(shot){await page.getByRole('button',{name:'Close',exact:true}).click();await page.setViewportSize({width:1100,height:900});await page.screenshot({path:shot,fullPage:true});}
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('PASS: shared demo; cumulative speech; draft recovery; text save; suggestions; reviewed move/link; cycle rejection; quota recovery; mobile layout; no speech fallback; zero external requests; zero page errors.');
  // Actual app shell and modal smoke test, with all external traffic blocked.
  await page.goto(base+'/');await page.evaluate(()=>{currentUser='alice@example.test';nodes=[{id:'synthetic',name:'Synthetic app task',parentId:null}];MomentumVoice.open('synthetic');});
  assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.getByLabel('Result / outcome').count(),1);assert.equal(await page.getByLabel('Next action').count(),1);
  await page.getByLabel('Instruction · speak or type').fill('Alice private draft');
  await page.evaluate(()=>{currentUser='bob@example.test';});
  await page.getByRole('button',{name:'Save capture locally'}).click();
  assert.match(await page.getByRole('dialog').innerText(),/Account changed/);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>MomentumVoice.open('synthetic'));
  assert.equal(await page.getByLabel('Instruction · speak or type').inputValue(),'');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>{currentUser='alice@example.test';MomentumVoice.open('synthetic');});
  assert.equal(await page.getByLabel('Instruction · speak or type').inputValue(),'Alice private draft');
  await page.getByRole('button',{name:'Close',exact:true}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.evaluate(()=>nodes.length),1);
  assert.deepEqual(errors,[]);console.log('PASS: actual application startup and task modal without production access.');
  const offline=await browser.newContext({serviceWorkers:'allow'});
  await offline.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const cachedPage=await offline.newPage();await cachedPage.goto(base+'/');
  await cachedPage.waitForEvent('load');
  await cachedPage.waitForFunction(()=>navigator.serviceWorker.controller);
  const assets=await cachedPage.evaluate(async()=>{const cache=await caches.open('momentum-v39');return (await cache.keys()).map(r=>new URL(r.url).pathname);});
  for(const asset of ['/voice-task.js','/voice-capture.js','/voice-task.css','/task-relations.js'])assert.ok(assets.includes(asset),asset);
  // Visiting the sandbox must not replace the app shell in the offline cache.
  await cachedPage.goto(base+'/prototypes/task-structure-live.html');
  await offline.setOffline(true);await cachedPage.goto(base+'/');
  assert.equal(await cachedPage.title(),'Momentum – Task Manager');
  await cachedPage.getByRole('button',{name:'Capture note',exact:true}).click();
  await cachedPage.getByLabel('Instruction · speak or type').fill('Offline note');
  await cachedPage.getByRole('button',{name:'Save capture locally'}).click();
  assert.match(await cachedPage.getByRole('dialog').innerText(),/Saved locally/);
  await offline.close();console.log('PASS: service-worker assets, sandbox navigation isolation, offline application capture.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
