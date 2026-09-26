// Prepare a private deployment copy without storing the live Sheet ID in Git.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const privateDir = path.join(root, '.private');
const original = fs.readFileSync(path.join(privateDir, 'Code.gs'), 'utf8');
const tracked = fs.readFileSync(path.join(root, 'backend', 'Code.gs'), 'utf8');
const declaration = original.match(/^const SHEET_ID = '[^']+';$/m);
if (!declaration) throw new Error('Private Code.gs has no Sheet ID declaration');
const placeholder = "const SHEET_ID = '__CONFIGURE_SHEET_ID__';";
if (tracked.split(placeholder).length !== 2) throw new Error('Expected one Sheet ID placeholder');
const prepared = tracked.replace(placeholder, declaration[0]);
if (prepared.includes('__CONFIGURE_SHEET_ID__')) throw new Error('Unreplaced Sheet ID placeholder');
fs.writeFileSync(path.join(privateDir, 'Code.deploy.gs'), prepared, 'utf8');
console.log('Prepared .private/Code.deploy.gs for review; no live deployment was made.');
