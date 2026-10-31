/* Actual original outliner + staging Worker. Test identity exists only in this harness. */
const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');const {chromium,devices}=require('playwright');
(async()=>{
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('staging/drizzle/0000_staging.sql','utf8'));
 const env={OPENAI_API_KEY:'test-only',DB:{prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}};}}};
 const source=fs.readFileSync('staging/dist/server/index.js','utf8');const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
 let transcriptionRequests=0;const originalFetch=global.fetch;global.fetch=async(url,options)=>{
  if(url==='https://api.openai.com/v1/audio/transcriptions'){transcriptionRequests++;assert.equal(options.body.has('language'),false);return Response.json({text:'Привет, freight tomorrow.'});}
  if(url!=='https://api.openai.com/v1/responses')throw Error('Unexpected external server request');
  return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({reply:'Confirm the documents before booking freight.',proposals:[{kind:'subtask',targetId:null,title:'Obtain bill of lading',reason:'A concrete prerequisite to discuss and approve.'}]})}]}]}));
 };
 const server=http.createServer(async(req,res)=>{
  try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id',(req.headers.cookie||'').includes('owner=bob')?'bob-test':'alice-test');
   const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end(error.message);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-fake-device-for-media-stream']});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));await context.route('**/*',r=>{if(!r.request().url().startsWith(base+'/')){external.push(r.request().url());return r.abort();}return r.continue();});
  await page.addInitScript(()=>{
   window.recorders=[];window.audioTracksStopped=0;
   navigator.mediaDevices.getUserMedia=async()=>{if(window.denyMic)throw Object.assign(new Error('denied'),{name:'NotAllowedError'});return {getTracks:()=>[{stop(){window.audioTracksStopped++;}}]};};
   window.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){recorders.push(this);this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['recorded audio'],{type:'audio/webm'})});this.onstop();}};
  });
  await page.goto(base);await page.getByRole('button',{name:'+ Add task',exact:true}).waitFor();
  assert.equal(await page.title(),'Momentum – Staging Outliner');assert.equal(await page.locator('.mobile-nav').count(),1);assert.equal(await page.locator('[data-voice-capture]').count(),0);
  await page.getByRole('button',{name:'+ Add task',exact:true}).click();
  await page.locator('textarea.node-input:visible').fill('Decanter import');await page.locator('textarea.node-input:visible').press('Enter');
  await page.locator('textarea.node-input:visible').fill('Freight booking');await page.locator('textarea.node-input:visible').press('Tab');
  let ids=await page.evaluate(()=>({goal:nodes.find(n=>n.name==='Decanter import').id,freight:nodes.find(n=>n.name==='Freight booking').id}));
  assert.equal(await page.evaluate(id=>nodes.find(n=>n.id===id).parentId,ids.freight),ids.goal);
  await page.locator('textarea.node-input:visible').press('Shift+Tab');assert.equal(await page.evaluate(id=>nodes.find(n=>n.id===id).parentId,ids.freight),null);
  await page.locator('textarea.node-input:visible').press('Tab');await page.evaluate(async()=>{window.assertSaved=await flushNow(10000);});
  assert.equal(await page.evaluate(()=>assertSaved),true);
  await page.locator('[data-task-chat="'+ids.freight+'"]').click();
  const panel=page.locator('.task-conversation'),input=page.getByLabel('Message about this task');
  assert.equal(await panel.evaluate(el=>el.previousElementSibling.dataset.id),ids.freight);
  const taskCount=await page.evaluate(()=>nodes.length);
  await input.fill('Typed context');await page.getByRole('button',{name:'Record voice message',exact:true}).click();
  assert.equal(await input.inputValue(),'Typed context');await page.getByRole('button',{name:'Stop recording',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('task-chat-input').value==='Typed context Привет, freight tomorrow.');
  await page.evaluate(()=>recorders[0].onstop());assert.equal(transcriptionRequests,1);assert.equal(await page.locator('[aria-label="Conversation speech language"]').count(),0);
  await page.evaluate(()=>{window.denyMic=true;});await page.getByRole('button',{name:'Record voice message',exact:true}).click();await page.getByText(/Microphone permission denied/).waitFor();assert.equal(await input.inputValue(),'Typed context Привет, freight tomorrow.');await page.evaluate(()=>{window.denyMic=false;});
  await input.fill('What prerequisites do we need?');await input.press('Enter');assert.equal(await page.evaluate(()=>nodes.length),taskCount);
  await page.getByRole('button',{name:'Send',exact:true}).click();await panel.getByText('Confirm the documents before booking freight.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>nodes.length),taskCount);assert.equal(await page.locator('.task-chat-proposal').count(),1);
  await page.getByRole('button',{name:'Close conversation',exact:true}).click();assert.equal(await panel.count(),0);assert.equal(await page.locator('[data-task-chat="'+ids.freight+'"]').evaluate(el=>el===document.activeElement),true);
  await page.locator('[data-task-chat="'+ids.freight+'"]').press('Enter');await panel.getByText('What prerequisites do we need?',{exact:true}).waitFor();
  await input.fill('Draft before rerender');await page.evaluate(()=>render(true));assert.equal(await input.inputValue(),'Draft before rerender');assert.equal(await input.evaluate(el=>document.activeElement===el),true);
  await input.press('Escape');assert.equal(await panel.count(),0);await page.locator('[data-task-chat="'+ids.freight+'"]').click();assert.equal(await input.inputValue(),'Draft before rerender');
  assert.equal(await page.getByRole('button',{name:'Preview proposed change',exact:true}).isVisible(),false);await page.locator('.task-chat-structure > summary').click();
  await page.getByRole('button',{name:'Preview proposed change',exact:true}).click();await page.getByText(/Preview only. Approve/).waitFor();assert.equal(await page.evaluate(()=>nodes.length),taskCount);
  await page.getByRole('button',{name:'Approve this change',exact:true}).click();await page.getByText('Approved change saved to staging.').waitFor();assert.equal(await page.evaluate(()=>nodes.length),taskCount+1);
  await page.getByRole('button',{name:'Close conversation',exact:true}).click();
  const child=await page.evaluate(()=>nodes.find(n=>n.name==='Obtain bill of lading').id);
  await page.locator('[data-check="'+child+'"]').check();assert.equal(await page.evaluate(id=>nodes.find(n=>n.id===id).done,child),true);
  await page.locator('#undoBtn').click();assert.equal(await page.evaluate(id=>nodes.find(n=>n.id===id).done,child),false);
  await page.locator('#redoBtn').click();assert.equal(await page.evaluate(id=>nodes.find(n=>n.id===id).done,child),true);
  await page.locator('#undoBtn').click();await page.evaluate(()=>flushNow(10000));
  await page.locator('[data-task-chat="'+child+'"]').click();await page.getByLabel('Message about this task').fill('Child conversation draft');
  await page.locator('[data-toggle="'+ids.freight+'"]').first().click();assert.equal(await panel.count(),0);
  await page.locator('[data-toggle="'+ids.freight+'"]').first().click();await page.locator('[data-task-chat="'+child+'"]').click();assert.equal(await input.inputValue(),'Child conversation draft');await page.getByRole('button',{name:'Close conversation',exact:true}).click();
  // Ordinary title editing, Enter, undo and redo still use the existing app paths.
  await page.locator('#disp_'+ids.freight).click();await page.locator('#inp_'+ids.freight).fill('Freight booking renamed');await page.locator('#inp_'+ids.freight).press('Tab');await page.evaluate(()=>flushNow(10000));
  await page.locator('[data-task-chat="'+ids.freight+'"]').click();await panel.getByText('What prerequisites do we need?',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Close conversation',exact:true}).click();
  // A second independent browser session uses the same durable backend.
  const mobile=await browser.newContext({...devices['Pixel 7'],serviceWorkers:'block'}),phone=await mobile.newPage();phone.on('pageerror',error=>errors.push(error.message));
  await phone.addInitScript(()=>{
   delete window.MediaRecorder;
   const visual=new EventTarget();visual.keyboardHeight=null;visual.offsetTop=0;visual.offsetLeft=0;visual.scale=1;
   Object.defineProperty(visual,'height',{get(){return visual.keyboardHeight||innerHeight;}});Object.defineProperty(visual,'width',{get(){return innerWidth;}});
   Object.defineProperty(window,'visualViewport',{value:visual,configurable:true});
  });await phone.goto(base);await phone.locator('[data-task-chat="'+ids.freight+'"]').waitFor();
  assert.equal(await phone.locator('#mobileNav').isVisible(),true);await phone.locator('[data-task-chat="'+ids.freight+'"]').tap();
  await phone.locator('.task-conversation').getByText('What prerequisites do we need?',{exact:true}).waitFor();assert.equal(await phone.getByRole('button',{name:'Record voice message',exact:true}).isDisabled(),true);
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await phone.getByLabel('Message about this task').fill('Offline phone draft');await mobile.setOffline(true);await phone.getByRole('button',{name:'Send',exact:true}).tap();await phone.getByText(/Send not confirmed/).waitFor();
  await phone.getByRole('button',{name:'Close conversation',exact:true}).tap();await mobile.setOffline(false);await phone.reload();await phone.locator('[data-task-chat="'+ids.freight+'"]').tap();assert.equal(await phone.getByLabel('Message about this task').inputValue(),'Offline phone draft');
  env.OPENAI_API_KEY='';await phone.getByRole('button',{name:'Send',exact:true}).tap();await phone.getByText(/AI is not connected yet/).waitFor();
  await phone.getByRole('button',{name:'Close conversation',exact:true}).tap();await phone.locator('#mnav-tree').tap();await phone.locator('#mnav-today').tap();assert.equal(await phone.locator('[data-task-chat="'+ids.freight+'"]').count(),1);
  // Conversation keyboard events never create/undo outline tasks.
  await phone.locator('[data-task-chat="'+ids.freight+'"]').tap();const before=await phone.evaluate(()=>nodes.length);await phone.getByLabel('Message about this task').press('Control+z');assert.equal(await phone.evaluate(()=>nodes.length),before);
  await phone.getByRole('button',{name:'Close conversation',exact:true}).tap();
  // Blank task, blur, offline queue and reload retain the ID and conversation draft.
  await phone.locator('#mobileFab').tap();const blankId=await phone.evaluate(()=>focusId);
  await phone.evaluate(()=>{visualViewport.keyboardHeight=360;visualViewport.dispatchEvent(new Event('resize'));});
  await phone.waitForFunction(()=>document.body.classList.contains('keyboard-open'));
  for(const selector of ['#kbIndent','#kbOutdent','#kbNew','.toolbar','#mobileNav']){
   assert.equal(await phone.locator(selector).isVisible(),true);assert.ok(await phone.locator(selector).evaluate(n=>n.getBoundingClientRect().bottom<=visualViewport.height+1),selector);
  }
  assert.ok(await phone.locator('textarea.node-input.editing').evaluate(n=>n.getBoundingClientRect().bottom<=document.getElementById('kbBar').getBoundingClientRect().top));
  const keyboardCount=await phone.evaluate(()=>nodes.length);await phone.locator('#kbNew').tap();assert.equal(await phone.evaluate(()=>nodes.length),keyboardCount+1);
  await phone.locator('[data-task-chat="'+blankId+'"]').tap();await phone.getByLabel('Message about this task').fill('Blank task phone conversation');
  await phone.waitForFunction(()=>document.getElementById('kbIndent').disabled);
  assert.ok(await phone.locator('.task-chat-controls').evaluate(n=>n.getBoundingClientRect().bottom<=document.getElementById('kbBar').getBoundingClientRect().top+1));
  await phone.getByRole('button',{name:'Send',exact:true}).tap();await phone.getByText(/AI is not connected yet/).waitFor();
  await phone.getByRole('button',{name:'Close conversation',exact:true}).tap();await phone.evaluate(()=>{visualViewport.keyboardHeight=null;visualViewport.dispatchEvent(new Event('resize'));});
  await phone.waitForFunction(()=>!document.body.classList.contains('keyboard-open')&&Math.abs(document.getElementById('app').getBoundingClientRect().height-innerHeight)<2);
  await phone.reload();await phone.locator('[data-task-chat="'+blankId+'"]').tap();await phone.locator('.task-chat-log').getByText('Blank task phone conversation',{exact:true}).waitFor();
  assert.equal(await phone.evaluate(id=>nodes.find(n=>n.id===id).name,blankId),'');assert.equal(await phone.evaluate(id=>nodes.find(n=>n.id===id).hasConversation,blankId),true);
  await phone.getByRole('button',{name:'Close conversation',exact:true}).tap();
  await mobile.setOffline(true);await phone.locator('#mobileFab').tap();const offlineBlank=await phone.evaluate(()=>focusId);
  await phone.locator('[data-task-chat="'+offlineBlank+'"]').tap();await phone.getByLabel('Message about this task').fill('Offline blank draft');await phone.getByRole('button',{name:'Close conversation',exact:true}).tap();
  await mobile.setOffline(false);await phone.reload();await phone.locator('[data-task-chat="'+offlineBlank+'"]').tap();assert.equal(await phone.getByLabel('Message about this task').inputValue(),'Offline blank draft');
  await phone.getByRole('button',{name:'Send',exact:true}).tap();await phone.getByText(/AI is not connected yet/).waitFor();await phone.getByRole('button',{name:'Close conversation',exact:true}).tap();
  await phone.locator('#mobileFab').tap();await phone.locator('textarea.node-input:visible').fill('Android native task');
  await phone.locator('[data-task-chat="'+ids.freight+'"]').tap();await phone.evaluate(()=>flushNow(10000));assert.equal(await phone.evaluate(()=>nodes.some(n=>n.name==='Android native task')),true);
  await phone.screenshot({path:'work/outliner-mobile.png',fullPage:true});
  const bob=await browser.newContext({serviceWorkers:'block'});await bob.addCookies([{name:'owner',value:'bob',url:base}]);const bobPage=await bob.newPage();await bobPage.goto(base);await bobPage.getByText('Today is clear',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: original outliner boots; Today task creation, Enter, Tab/Shift+Tab, completion/undo/redo/collapse and native sync; inline placement; persistent ID-bound conversation; no chat child nodes; inert AI proposal then reviewed subtask; rename retention; render/draft/focus/Escape recovery; two sessions; Android viewport/navigation/native task creation; offline send recovery; clear missing-AI state; account isolation; blank-task ID persistence and offline reload; automatic-language final audio transcription; keyboard-open/closed viewport controls; zero external requests/page errors.');
  await bob.close();await mobile.close();await context.close();
 }finally{global.fetch=originalFetch;await browser.close();await new Promise(resolve=>server.close(resolve));db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
