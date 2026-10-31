const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');const {chromium,devices}=require('playwright');
(async()=>{
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('staging/drizzle/0000_staging.sql','utf8'));
 const env={DB:{prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}};}}};
 const source=fs.readFileSync('staging/dist/server/index.js','utf8');const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 const server=http.createServer(async(req,res)=>{
  try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id',(req.headers.cookie||'').includes('owner=bob')?'bob-test':'alice-test');
   const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end(error.message);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream']});
 try{
  const context=await browser.newContext({...devices['Pixel 7'],permissions:['microphone']});const page=await context.newPage();const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>{if(!r.request().url().startsWith(base+'/')){external.push(r.request().url());return r.abort();}return r.continue();});
  await page.addInitScript(()=>{window.speechInstances=[];window.SpeechRecognition=class{constructor(){speechInstances.push(this);}start(){}abort(){this.onend();}};});
  await page.goto(base);await page.getByText(/Connected to private staging/).waitFor();
  await page.getByRole('button',{name:'Check microphone',exact:true}).click();await page.getByText(/Microphone permission granted/).waitFor();
  await page.getByLabel('Instruction · speak or type').fill('Decanter freight booking');await page.getByRole('button',{name:'🎤 Speak',exact:true}).click();
  await page.evaluate(()=>{const r=speechInstances[0];r.onresult({results:[Object.assign([{transcript:'tomorrow'}],{isFinal:true})]});r.onresult({results:[Object.assign([{transcript:'tomorrow'}],{isFinal:true}),Object.assign([{transcript:'morning'}],{isFinal:true})]});});
  assert.equal(await page.getByLabel('Instruction · speak or type').inputValue(),'Decanter freight booking tomorrow morning');
  await page.getByRole('button',{name:'Save to staging',exact:true}).click();await page.getByText('Saved to staging. Available on your other signed-in devices.').waitFor();
  const second=await browser.newContext({...devices['Pixel 7']});const phone=await second.newPage();await phone.goto(base);await phone.getByText(/Connected to private staging/).waitFor();
  assert.equal(await phone.getByRole('button',{name:'Decanter freight booking tomorrow morning',exact:true}).count(),1);
  await phone.getByLabel('Instruction · speak or type').fill('Decanter import');await phone.getByRole('button',{name:'Save to staging',exact:true}).click();await phone.getByText('Saved to staging. Available on your other signed-in devices.').waitFor();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:'Decanter import',exact:true}).waitFor();
  await page.getByRole('button',{name:'Decanter freight booking tomorrow morning',exact:true}).click();
  await page.getByLabel('Target task', {exact:true}).selectOption({label:'Decanter import'});await page.getByRole('button',{name:'Preview change',exact:true}).click();await page.getByText(/Proposal only · revision/).waitFor();
  await page.getByRole('button',{name:'Approve and save change',exact:true}).click();await page.getByText('Structure change saved to staging.').waitFor();
  await page.getByLabel('Action',{exact:true}).selectOption('supports');await page.getByRole('button',{name:'Preview change',exact:true}).click();await page.getByRole('button',{name:'Approve and save change',exact:true}).click();await page.getByText('Structure change saved to staging.').waitFor();
  await phone.reload();await phone.getByText(/Connected to private staging/).waitFor();assert.match(await phone.locator('#links').innerText(),/supports → Decanter import/);
  // A stale preview is rejected after another session changes the account revision.
  await page.getByLabel('Action',{exact:true}).selectOption('related');await page.getByRole('button',{name:'Preview change',exact:true}).click();await page.getByText(/Proposal only · revision/).waitFor();
  await phone.getByLabel('Instruction · speak or type').fill('Inspect plant equipment');await phone.getByRole('button',{name:'Save to staging',exact:true}).click();await phone.getByText('Saved to staging. Available on your other signed-in devices.').waitFor();
  await page.getByRole('button',{name:'Approve and save change',exact:true}).click();await page.getByText(/Tasks changed on another device/).waitFor();
  // Failed network leaves a recoverable draft; retry uses the same request ID.
  await page.getByLabel('Instruction · speak or type').fill('Offline recoverable note');await context.setOffline(true);await page.getByRole('button',{name:'Save to staging',exact:true}).click();await page.getByText(/Not confirmed/).waitFor();assert.equal(await page.getByLabel('Instruction · speak or type').inputValue(),'Offline recoverable note');
  await context.setOffline(false);await page.reload();await page.getByText(/Connected to private staging/).waitFor();assert.equal(await page.getByLabel('Instruction · speak or type').inputValue(),'Offline recoverable note');
  await page.getByRole('button',{name:'Save to staging',exact:true}).click();await page.getByText('Saved to staging. Available on your other signed-in devices.').waitFor();
  // Real Chromium microphone permission denial is handled while text stays usable.
  await second.clearPermissions();await phone.getByRole('button',{name:'Check microphone',exact:true}).click();await phone.getByText(/Microphone unavailable/).waitFor();
  await phone.getByLabel('Instruction · speak or type').fill('Text still works after permission denial');await phone.getByRole('button',{name:'Save to staging',exact:true}).click();await phone.getByText('Saved to staging. Available on your other signed-in devices.').waitFor();
  await page.evaluate(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition;});
  await page.addInitScript(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition;});await page.reload();await page.getByText(/Connected to private staging/).waitFor();assert.equal(await page.getByRole('button',{name:'🎤 Speak',exact:true}).isDisabled(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const bob=await browser.newContext();await bob.addCookies([{name:'owner',value:'bob',url:base}]);const bobPage=await bob.newPage();await bobPage.goto(base);await bobPage.getByText(/Connected to private staging/).waitFor();assert.match(await bobPage.locator('#tree').innerText(),/empty/);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await page.screenshot({path:'work/staging-mobile.png',fullPage:true});
  console.log('PASS: Pixel 7 viewport; real Chromium fake-device microphone grant and denial; simulated speech snapshots; two-session persistence; reviewed moves/links; stale approval rejection; offline draft recovery/retry; text fallback; per-account isolation; no external requests or page errors.');
  await second.close();await bob.close();await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
