/* Keep deployment input a reproducible copy of the real outliner, never a second UI. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const staging=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(staging,'..');
fs.mkdirSync(path.join(staging,'original'),{recursive:true});
for(const file of ['index.html','app.js','styles.css','core.js','task-memory.js','task-conversation.js','task-conversation.css','manifest.json','icon-192.png','icon-512.png'])fs.copyFileSync(path.join(root,file),path.join(staging,'original',file));
for(const file of ['voice-capture.js','task-relations.js'])fs.copyFileSync(path.join(root,file),path.join(staging,'shared',file));
console.log('Copied canonical outliner assets into the isolated hosting source.');
