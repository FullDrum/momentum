import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
let html=read('original/index.html');
html=html.replace(/<script src="https:\/\/accounts\.google\.com[^>]*><\/script>/,'')
 .replace('<script src="./app.js"></script>','<script src="./staging-adapter.js"></script>\n<script src="./app.js"></script>')
 .replace(/Sign in with Google/g,'Sign in to staging').replace('onclick="signInWithGoogle()"','onclick="location.assign(\'/signin-with-chatgpt?return_to=/\')"')
 .replace('<title>Momentum – Task Manager</title>','<title>Momentum – Staging Outliner</title>')
 .replace('<div class="toolbar">','<div class="toolbar"><span class="staging-badge">PRIVATE STAGING</span>');
let app=read('original/app.js').replace(/var APPS_SCRIPT_URL = '[^']*';/,"var APPS_SCRIPT_URL = '';" ).replace(/var GOOGLE_CLIENT_ID = '[^']*';/,"var GOOGLE_CLIENT_ID = '';" );
if(app.includes('script.google.com')||app.includes('apps.googleusercontent.com')||html.includes('accounts.google.com'))throw new Error('Production integration leaked into staging build');
const assets={
 '/':{type:'text/html; charset=utf-8',content:html},
 '/index.html':{type:'text/html; charset=utf-8',content:html},
 '/app.js':{type:'text/javascript',content:app},
 '/staging-adapter.js':{type:'text/javascript',content:read('web/adapter.js')},
 '/voice-capture.js':{type:'text/javascript',content:read('shared/voice-capture.js')},
 '/task-relations.js':{type:'text/javascript',content:read('shared/task-relations.js')}
};
for(const file of ['mobile-viewport.js','audio-capture.js','core.js','task-memory.js','task-conversation.js','styles.css','task-conversation.css','manifest.json'])assets['/'+file]={type:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/json',content:read('original/'+file)};
for(const file of ['icon-192.png','icon-512.png'])assets['/'+file]={type:'image/png',binary:true,content:fs.readFileSync(path.join(root,'original',file)).toString('base64')};
// The original application uses inline event handlers and dynamic element styles.
const security={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin','permissions-policy':'microphone=(self), camera=(), geolocation=()',
 'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'"};
const bundle=file=>read(file).replace(/^import .*;\n/gm,'');
const worker=read('shared/task-relations.js')+'\n'+bundle('worker/api.js')+'\n'+bundle('worker/native-rpc.js')+'\n'+bundle('worker/conversations.js')+'\n'+bundle('worker/transcription.js')+'\nconst assets='+JSON.stringify(assets)+';\nconst security='+JSON.stringify(security)+`;\nexport default {async fetch(request,env){
 const url=new URL(request.url);let response;
 if(url.pathname.startsWith('/api/'))response=await handleApi(request,env,globalThis.MomentumTaskRelations);
 else if(assets[url.pathname]&&['GET','HEAD'].includes(request.method)){const asset=assets[url.pathname];const content=asset.binary?Uint8Array.from(atob(asset.content),c=>c.charCodeAt(0)):asset.content;response=new Response(request.method==='HEAD'?null:content,{headers:{'content-type':asset.type}});}
 else response=new Response('Not found',{status:404});
 const headers=new Headers(response.headers);for(const [key,value] of Object.entries(security))headers.set(key,value);
 return new Response(response.body,{status:response.status,headers});
}};\n`;
const dist=path.join(root,'dist');fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(path.join(dist,'server'),{recursive:true});fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});
fs.writeFileSync(path.join(dist,'server/index.js'),worker);fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(dist,'.openai/hosting.json'));fs.cpSync(path.join(root,'drizzle'),path.join(dist,'drizzle'),{recursive:true});
const module=await import('data:text/javascript;base64,'+Buffer.from(worker).toString('base64'));if(typeof module.default.fetch!=='function')throw Error('Invalid Worker artifact');
console.log('Built original Momentum outliner + isolated staging backend; no production endpoints.');
