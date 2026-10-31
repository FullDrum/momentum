# Momentum Next — original outliner staging

URL: https://momentum-next-staging-nikita.workspace-755223.chatgpt.site

The main interface is the original Momentum outliner, built from the repository's `index.html`, `app.js`, `styles.css` and existing interactions. The earlier capture dashboard has been removed from the deployed application. Use the same ChatGPT account/workspace on desktop and Android Chrome to access the owner-private staging resource.

## Task conversations

Tap a task's microphone/chat button. A compact contextual panel opens directly below that row. Text and dictated messages are persisted separately from tasks, keyed by the existing task ID and authenticated account. Renaming or moving a task retains its history. Closing the panel returns focus to its row button; Escape closes, Ctrl/Cmd+Enter sends, and plain Enter adds a newline. Conversation typing does not run outliner shortcuts.

The panel follows its row through rendering and view changes. Hiding the row by collapse/filter closes the panel and keeps its draft. Refresh history loads another device's messages. A lost-response retry uses the same message ID. Earlier staging notes appear as historical notes without becoming outline children.

**Live AI is currently blocked:** no `OPENAI_API_KEY` is configured in Sites runtime secrets and the OpenAI Developers plugin is unavailable in this session. The panel explicitly says AI is not connected. It still saves real messages; it does not fabricate AI replies. The server adapter is implemented and tested with mocked provider responses. To enable it, obtain a key through the OpenAI Developers plugin's supported credential workflow and configure it as a secret on this isolated Site. Optional `OPENAI_MODEL` selects the model; the default is `gpt-4.1-mini`. Never paste keys into browser code, chat, Git or `.openai/hosting.json`.

With a configured key, the server sends the selected task, its recent conversation and a bounded list of tasks from the same account to the Responses API with `store:false`. It exposes no execution tools. Structured suggestions can describe subtasks, links/dependencies, moves, duplicate candidates and next actions. Subtasks/moves/links require a server preview and an explicit approval; stale revisions and invalid parents/cycles are rejected. Duplicate candidates and next actions are discussion suggestions, not automatic merges or task creation. Provider failures keep the user message saved and permit retry. An interrupted response can be retried after its 90-second lease expires.

## Architecture and safety

- `original/` is a generated, tracked deployment snapshot of canonical outliner files. Do not edit it independently. From the Momentum repository, `npm run staging:build` copies and checks these inputs before building. Tests require exact equality with canonical files.
- `web/adapter.js` runs before `app.js` only in staging and implements the original queue's `whoAmI`, `getInitialData`, `batchOps`, people/team-read contracts. It never calls Google. Unsupported team-management actions fail closed.
- `worker/native-rpc.js` validates tree integrity and atomically acknowledges native saves/deletes. It hashes tree snapshots to reject stale device updates and retains idempotent receipts. Pending native edits survive failures using the existing account-scoped queue; a stale-outline conflict requires a reload/reconciliation before replay.
- `worker/conversations.js` stores task messages and optional provider replies. Messages never enter `nodes[]`, native undo snapshots or task-save batches. Deleting a task hides its conversation; the underlying history is retained so restoring that stable ID can recover it.
- `worker/api.js` retains the existing isolated D1 repository and reviewed-structure endpoints. No new SQL migration is needed: message records are an additive field in the existing per-account document. Existing staging records are preserved.
- `shared/` contains copies of the original capture lifecycle and pure relationship helpers. Regression tests require equality with the canonical modules.
- `scripts/build.mjs` creates a self-contained Worker from the original outliner. It strips the production Apps Script URL, Google client ID and GSI script, and serves only explicit staging assets. Same-origin CSP blocks client connections to production. Inline handler/style support is retained because the existing UI uses it.
- Staging uses the existing owner-private Sites identity boundary and dedicated `DB` binding. Every read/write keys data by server-injected user identity. Missing identity and cross-origin writes are rejected. No production data, Sheet, Apps Script project or Momentum deployment is accessed.

Staging does not register the production service worker; native pending edits and conversation drafts persist locally, but loading the staging shell requires a network connection. The canonical application's cache is bumped to v40 for its new conversation assets. No production release has been performed.

## Tests

From the Momentum repository:

```sh
npm run staging:build
npm test
npm run test:staging-browser
npm run test:browser
```

Tests use Node 22.23.4/SQLite, Playwright and Chromium. The local HTTP harness injects a synthetic identity only in test code; no mock-auth route is deployed. Mobile tests emulate the Pixel 7 viewport. Speech callbacks and AI replies are simulated; they are not real-device or live-provider verification.

## Publish only this isolated Site

Reuse `.openai/hosting.json` and the existing owner-private audience. The dedicated Sites source repository has this directory lifted to its root. Build that committed snapshot with `node scripts/build.mjs`; do not run `sync-original.mjs` in the lifted repository. Package `.openai/`, `dist/` and `drizzle/`, preserving `dist/server/index.js`, and save/deploy the matching pushed source SHA through Sites.

The Sites helper executable is not mounted in this environment. The documented fallback uses ordinary Git with short-lived credentials passed on hidden stdin, kept only in process memory, then native version/deployment tools. Never use the root production Wrangler configuration or push `FullDrum/momentum` main.

## Android checklist — manual verification pending

1. Open the HTTPS URL in Android Chrome, sign in, and confirm the original Today/outliner/mobile navigation appears.
2. Create and edit a task using the existing plus button. Exercise indentation/outdent and Projects/Today navigation.
3. Tap its microphone/chat button. Confirm the panel appears immediately below that task. Type a message; verify Send and Ctrl/Cmd+Enter, multiline Enter, Escape and focus restoration.
4. Tap Speak, allow microphone permission, dictate a real sentence and send. Deny/re-enable permission in Chrome site settings and verify text fallback. Lock/unlock or change apps during dictation and verify text is retained.
5. Close/reopen the panel and reload. Open the same task from another signed-in device: history should persist without new child tasks. Rename or move the task and check the same history.
6. Collapse a parent while its child's panel is open, then expand/reopen. Check draft recovery and that native task editing still works.
7. Go offline after loading, send a message and reconnect. Retry unchanged content and confirm a single persisted message.
8. After an AI key is configured, test a real provider reply and suggestion; verify no structural change occurs before Preview and Approve. Modify the outline from another device after preview and confirm stale approval is refused.

Physical Android audio, real provider replies and signed-in live-site API writes have not been verified from this execution environment. Direct HTTPS probes were previously denied by its egress proxy; hosted deployment/schema/access status is verified through native Sites tools. No connected browser tool or physical Android device is available here.

## Limits

Owner-private staging only; no worker sharing, full collaboration management, production migration or destructive AI merges. Unsaved drafts stay local; only sent messages sync. Browser speech may use a remote provider; Momentum stores text and does not record audio. Limits: 1,000 tasks, 2,000 legacy notes, 4,000 conversation records and a 2 MB account snapshot. The last 500 structure approvals are retained. No automatic expiry, deletion/backup UI or full concurrent-edit merge protocol is implemented; use development content.

## Blank tasks, final audio and Android keyboard — current correction

The current interface no longer uses browser speech recognition or a language selector. The microphone records one clip with `MediaRecorder`; stopping it requests one final OpenAI transcription from authenticated `POST /api/transcribe`. The server omits a language parameter so supported languages, including Russian and English, are detected automatically. Model default: `gpt-4o-mini-transcribe`; optional server-only `OPENAI_TRANSCRIPTION_MODEL` can select `gpt-4o-transcribe` or `whisper-1`.

This supersedes the earlier browser-recognition description above. The normal panel contains the most recent three messages, text entry, microphone, Send and Close. Earlier history/options and suggestions/task structure remain collapsed until opened.

**The credential blocker is unchanged:** no `OPENAI_API_KEY` is configured on this Site. Consequently live transcription and AI replies are unavailable. The interface disables recording when transcription is disconnected, explains the text fallback, and never substitutes browser recognition. The integrated endpoint and recording lifecycle are tested with simulated clips/provider responses. Configure the key as a server runtime secret using the supported OpenAI Developers workflow, then publish a version to apply it. No credential is present in client assets.

Audio handling: HTTPS/localhost microphone permission is required. Limit: 60 seconds and 10 MB per clip. The server validates identity, task ownership, origin, MIME type and streamed byte limit, then uploads the clip to OpenAI using a server-only Authorization header. It stores no audio. Empty/provider-failed results keep typed text intact. A failed recording upload can be retried while the panel remains open; closing/cancelling discards the in-memory clip. A network retry can issue another provider request, but the controller applies a successful final result only once. Clips and actual recognition accuracy were not tested on a physical phone.

Blank-task lifecycle:

| Path | Current behavior |
| --- | --- |
| Creation | A title-independent task ID is assigned; staging immediately queues the task with `retainEmpty: true`. |
| Typing / blur | Staging persists every edit to the local queue, including an empty title; blur does not remove retained tasks. |
| Start conversation | `conversationStarted` is queued; the task syncs before loading/sending history. If offline, its ID and draft remain local. |
| Today / All Tasks / reload | Visibility and normalization preserve retained tasks. “New task” is a placeholder; the stored title can remain empty. |
| Queue, undo restoration, backup | Core helpers accept explicitly retained blank tasks without inventing a title. |
| Empty Backspace | Conversation-bearing tasks are protected; use the explicit Delete action. Explicit deletes retain server history for later restoration of the same ID. |
| Offline / reconnect | Pending task writes and conversation drafts survive in browser storage and replay by stable ID after reconnect/reload. The private staging shell still needs a network connection to load. |

`mobile-viewport.js` sizes the existing flex outliner to `visualViewport.height` and its offset. While the keyboard is open, the toolbar becomes compact and horizontally scrollable, navigation contracts, and indent/outdent plus a native add-task control remain in the accessory bar above the keyboard. The floating plus is hidden only in this mode because its replacement is in flow. The tree scrolls the active editor or chat composer into view. During chat, task-indent controls are disabled to avoid treating a chat message as an outline command; Add and Done remain available. When the keyboard closes, the original navigation/toolbar layout returns.

Automated tests emulate keyboard-open/closed visual viewport sizes and exercise the above-keyboard Add action. They do not open a real Android IME. On a physical Android Chrome device, verify keyboard open/closed, task typing, indent/outdent, Add, horizontal toolbar access, chat typing, rotation and returning from a permission prompt. Record device/Android/Chrome versions. Real microphone, Russian/English transcription and keyboard checks remain manual acceptance items.
