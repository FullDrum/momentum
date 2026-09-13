const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('page loads extracted styles and core before application logic', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /href="\.\/styles\.css"/);
  const corePosition = html.indexOf('src="./core.js"');
  const appPosition = html.indexOf('src="./app.js"');
  assert.ok(corePosition >= 0);
  assert.ok(appPosition > corePosition);
  assert.doesNotMatch(html, /<style>/);
});

test('offline cache includes every extracted application asset', () => {
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const asset of ['./index.html', './styles.css', './core.js', './app.js']) {
    assert.ok(worker.includes(`'${asset}'`), `${asset} must be cached`);
  }
});

test('application uses the active Apps Script deployment', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /AKfycbweX3x7fglJ-R78DROUj4DPfqWfw9SosOqPX4htozEAcIPEvS3o5U52cL8WGGAsSzaH\/exec/);
});

test('Google access-token popups are only requested by explicit sign-in', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.equal((app.match(/requestAccessToken\(\)/g) || []).length, 1);
  assert.doesNotMatch(app, /silentRefreshToken|silentRefreshWithRetry|scheduleTokenRefresh/);
  assert.match(app, /function signInWithGoogle\(\)[\s\S]*client\.requestAccessToken\(\)/);
});
