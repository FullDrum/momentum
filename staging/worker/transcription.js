import {ApiError,id,fail} from './api.js';
/* Audio is held only for this authenticated request; no audio is stored. */
export async function transcribeAudio(request,env,owner,repo,fetcher=fetch){
 const url=new URL(request.url),taskId=id(url.searchParams.get('taskId'));
 const snapshot=await repo.read(owner);if(!snapshot.state.tasks.some(t=>t.id===taskId&&!t.isSection))fail(404,'Task not found');
 if(!env.OPENAI_API_KEY)fail(503,'Audio transcription is not connected. You can type your message.');
 const mime=(request.headers.get('content-type')||'').split(';')[0].toLowerCase();
 const extensions={'audio/webm':'webm','audio/mp4':'mp4','audio/ogg':'ogg','audio/wav':'wav','audio/mpeg':'mp3','audio/x-wav':'wav'};
 if(!extensions[mime])fail(415,'Unsupported recording format. Type your message instead.');
 const limit=10*1024*1024;if(Number(request.headers.get('content-length')||0)>limit)fail(413,'Recording is too large. Maximum 10 MB.');
 const reader=request.body&&request.body.getReader();if(!reader)fail(400,'Empty recording');
 let size=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail(413,'Recording is too large. Maximum 10 MB.');}chunks.push(value);}}finally{reader.releaseLock();}
 if(!size)fail(400,'Empty recording');
 const form=new FormData();form.set('file',new Blob(chunks,{type:mime}),'recording.'+extensions[mime]);
 const model=env.OPENAI_TRANSCRIPTION_MODEL||'gpt-4o-mini-transcribe';
 if(!['gpt-4o-mini-transcribe','gpt-4o-transcribe','whisper-1'].includes(model))fail(503,'Transcription model is not configured correctly. Use text instead.');
 form.set('model',model);form.set('response_format','json');
 // No language parameter: the provider detects supported languages from the clip.
 try{
  const response=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{authorization:'Bearer '+env.OPENAI_API_KEY},body:form,signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('Provider unavailable');const data=await response.json();
  if(typeof data.text!=='string'||!data.text.trim())fail(422,'No speech was detected. Type your message or record again.');
  if(data.text.length>12000)fail(413,'Transcription is too long for one message.');
  return {text:data.text.trim()};
 }catch(error){if(error instanceof ApiError)throw error;fail(502,'Transcription service unavailable. Your typed text is preserved; retry or use text.');}
}
