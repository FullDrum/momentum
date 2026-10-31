import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const assets={
 '/':{type:'text/html; charset=utf-8',content:read('web/index.html')},
 '/app.js':{type:'text/javascript',content:read('web/app.js')},
 '/app.css':{type:'text/css',content:read('web/app.css')},
 '/voice-capture.js':{type:'text/javascript',content:read('shared/voice-capture.js')},
 '/task-relations.js':{type:'text/javascript',content:read('shared/task-relations.js')}
};
const security={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin','permissions-policy':'microphone=(self), camera=(), geolocation=()',
 'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'"};
const worker=read('shared/task-relations.js')+'\n'+read('worker/api.js')+'\nconst assets='+JSON.stringify(assets)+';\nconst security='+JSON.stringify(security)+`;\nexport default {async fetch(request,env){
 const url=new URL(request.url);let response;
 if(url.pathname.startsWith('/api/'))response=await handleApi(request,env,globalThis.MomentumTaskRelations);
 else if(assets[url.pathname]&&['GET','HEAD'].includes(request.method)){const asset=assets[url.pathname];response=new Response(request.method==='HEAD'?null:asset.content,{headers:{'content-type':asset.type}});}
 else response=new Response('Not found',{status:404});
 const headers=new Headers(response.headers);for(const [key,value] of Object.entries(security))headers.set(key,value);
 return new Response(response.body,{status:response.status,headers});
}};\n`;
const dist=path.join(root,'dist');fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(path.join(dist,'server'),{recursive:true});fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});
fs.writeFileSync(path.join(dist,'server/index.js'),worker);fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(dist,'.openai/hosting.json'));fs.cpSync(path.join(root,'drizzle'),path.join(dist,'drizzle'),{recursive:true});
const module=await import('data:text/javascript;base64,'+Buffer.from(worker).toString('base64'));if(typeof module.default.fetch!=='function')throw Error('Invalid Worker artifact');
console.log('Built and validated isolated Worker artifact');
