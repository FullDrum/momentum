const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../core.js');

// Acceptance tests for Phase 3: safe task links.
// applyLink is exercised in a vm (with prompt/alert stubbed); the sanitisation
// and rendering logic itself is covered in core.test.js.

function app() {
  const element = () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, classList: { contains() { return false; } }, addEventListener() {}, querySelector() { return null; } });
  const context = vm.createContext({
    MomentumCore: core,
    console: { log() {}, warn() {}, error() {} },
    Date,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { hidden: false, readyState: 'loading', activeElement: null,
      getElementById() { return null; }, querySelector: element, querySelectorAll() { return []; },
      createElement: element, head: element(), body: element(), addEventListener() {}
    },
    window: { addEventListener() {} }, navigator: {},
    setTimeout() {}, clearTimeout() {}, setInterval() {},
    location: { reload() {} },
    prompt: () => 'https://example.com',
    alert: () => {},
    Event: function(type) { return { type: type, bubbles: false }; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  context.render = () => {};
  return context;
}

function fakeInput(value, start, end) {
  return {
    value, selectionStart: start, selectionEnd: end,
    setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; },
    dispatchEvent() {}
  };
}

test('applyLink wraps the selected text in Markdown link syntax', () => {
  const c = app();
  c.prompt = () => 'https://example.com';
  const inp = fakeInput('hello world', 6, 11);
  c.applyLink(inp);
  assert.equal(inp.value, 'hello [world](https://example.com)');
});

test('applyLink rejects unsafe URL schemes without changing the text', () => {
  const c = app();
  let alerted = null;
  c.prompt = () => 'javascript:alert(1)';
  c.alert = msg => { alerted = msg; };
  const inp = fakeInput('hello world', 6, 11);
  c.applyLink(inp);
  assert.equal(inp.value, 'hello world');
  assert.match(alerted, /http, https and mailto/);
});

test('applyLink does nothing when no text is selected', () => {
  const c = app();
  let prompted = false;
  c.prompt = () => { prompted = true; return 'https://example.com'; };
  const inp = fakeInput('hello world', 6, 6);
  c.applyLink(inp);
  assert.equal(prompted, false);
  assert.equal(inp.value, 'hello world');
});

test('structure: Ctrl+K, right-click Make link, and link-open wiring are present', () => {
  const src = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(src, /e\.key === 'k' \|\| e\.key === 'K'/, 'Ctrl+K handler exists');
  assert.match(src, /function applyLink/, 'applyLink is defined');
  assert.match(src, /contextmenu/, 'right-click handler exists');
  assert.match(src, /showLinkMenu/, 'link menu is wired');
  assert.match(src, /closest\('a'\)/, 'display click opens links instead of editing');
  // The raw formatter is gone; rendering now lives in core.js.
  assert.match(src, /function renderMarkdown\(text\) \{\s*return MomentumCore\.renderMarkdown\(text\);/, 'renderMarkdown delegates to core');
});
