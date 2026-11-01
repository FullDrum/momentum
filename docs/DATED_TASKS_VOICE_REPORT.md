# Dated AI tasks and recording Stop/Send — 1 November 2026

Implemented only on the Momentum Next development branch and isolated staging Site. Original outliner, Today, editing, keyboard and mobile navigation remain the foundation. No production deployment, Google Apps Script/Sheets access, new API key or secret change.

## Functionality

- OpenAI Responses structured output can propose up to ten independent `create_task` actions, each with a title, optional existing parent and optional explicit date. No synthetic parent is generated. Ideas may stay in the conversation with no proposal.
- Expand Suggestions, review the task batch, inspect titles, parents and exact dates, then explicitly approve. Preview does not write tasks. Apply revalidates the persisted assistant proposal and current revision; the task batch, completion receipt and audit are stored atomically in account-scoped staging D1.
- A blank conversation node can become the first approved task (only when it has no children), retaining its ID and history. Its new parent and date are shown in the preview. Additional tasks are independent roots unless an existing parent was explicitly proposed and approved. New parents can be ordinary dated tasks; propose children after that parent exists.
- Durable request receipts handle lost-response retries and concurrent taps; a saved creation marker on the assistant message prevents a second application even with another request ID. No successful creation notice is shown until the write returns and a refreshed list confirms the IDs, titles, dates and parent IDs.
- Every persisted non-section task has a date. Manual saves, AI tasks, subtasks, capture conversion and parent tasks default to Today; valid explicit dates remain unchanged. Existing undated staging records acquire a date on their next load/save. Sections are navigation containers rather than tasks.
- Today is a work-list date, not a deadline. The browser's calendar day is supplied for new writes and previews. Requests without a local day use Pacific/Auckland. Retryable native batches keep their original day. Subtasks never inherit a parent's future date; indentation never changes the work-list date. These legacy app behavior corrections are applied by the staging build, leaving the canonical production app.js untouched.
- Stop (■) ends a clip and transcribes it into the editable message draft. It never sends to AI, including duration-limit stops. The normal Send remains available afterward.
- The white arrow in a blue circle is also enabled during recording: Send ends the clip, transcribes and submits exactly once. Permission/transcription/cancellation states remain explicit. A failed transcription keeps the typed draft and requires an explicit retry; recovered audio is left for review, not automatically sent. No interim-fragment concatenation or language selector is used.
- Existing server-side OpenAI transcription and automatic language detection are retained. Keys stay server-side.

## Automated results

- `npm run staging:build`: PASS; original outliner bundled with the isolated backend, production endpoints stripped.
- `npm test`: PASS, 15 test files, 0 failures. Includes new SQLite-backed date/task-creation acceptance cases plus recording intent/retry cases.
- `npm run test:staging-browser`: PASS, desktop and Pixel 7 emulation using the built Worker and disposable SQLite. Provider responses and microphone devices are mocked. Verifies actual UI preview/approval and durable writes, list refresh, reload, blank-task reuse/history, Today versus future dates, manual sibling/indent date independence, account isolation, offline draft recovery, keyboard-open/closed layout, Stop versus Send and repeated taps. Existing Enter/Tab/Shift+Tab/completion/undo/redo/collapse behaviors pass. Zero unexpected external requests or page errors.
- `npm run test:browser`: PASS, existing application shell/offline/cache and sandbox regressions.
- `git diff --check`: PASS.

The Russian request `Посчитать бонус Артёма, сделать проплаты и сравнить варианты доставки декантера из Канады.` is exercised with a mocked structured model response, followed by real staging backend writes in the test harness. Approval yields exactly three independent Today tasks from an initially blank node: `Посчитать бонус Артёма`, `Сделать проплаты`, `Сравнить варианты доставки декантера из Канады`. No artificial parent. Tests also cover an idea without creation, conversion after discussion, and an explicit future date.

## Manual verification still required

The publishing tools can verify deployment and configured secret presence, but this execution environment's egress does not allow the signed-in live Site and no physical Android device is attached. Automated provider fixtures are not evidence that the live model chose the expected semantic decomposition. On Android Chrome, reload the published staging Site and:

1. Open a blank node, send the Russian request, expand Suggestions and review three independent Today tasks. Confirm nothing changed until approval; then confirm all three appear and survive reload.
2. Discuss an idea explicitly without creating tasks; subsequently ask to create it, review and approve the dated task.
3. Ask for a different work-list date, inspect the exact date before approval and confirm it stays out of Today when appropriate.
4. Record Russian, English and mixed speech. Stop must leave editable unsent text; record again and Send must transcribe and submit once. Check repeated taps, denied permission, network failure and keyboard visibility.

Live OpenAI output quality, real phone audio accuracy and physical Android IME behavior are not claimed as verified in this milestone.

## Published review build

- Staging version **5**, successful publication using existing environment revision **4**.
- URL: https://momentum-next-staging-nikita.workspace-755223.chatgpt.site
- FullDrum feature branch: `feature/dated-ai-tasks-voice-send`; PR target: `dev/voice-capture-structure-milestone`.
- Dedicated hosting-source commit: `e1a6f96b34902646601711238b1b26c984ca4ffe`. The packaged Worker hash matches the tested build (`fd1ca1cbad5072e12fd4e503955137f6ac7a8fbfff8f64ec5c39f7531e9c8a52`).
- Screenshots use synthetic test data: [recording Stop/Send](screenshots/voice-recording-stop-send.png), [approved dated tasks](screenshots/dated-tasks-approved-mobile.png).
- GitHub review workflow is recorded in repository `AGENTS.md`. No production merge was performed.

## PR #9 QA follow-up — 1 November 2026

- Fixed partial native task saves: start from the persisted task and apply supplied fields before whitelist validation. Omitted dates (and hierarchy/flags) are retained; newly created tasks without a date default to Today. Explicit dates reschedule normally; explicit null/empty dates mean Today, never an undated task. This matches the normal client contract (`MomentumCore.enqueueSave` and `flushBatch` copy full snapshots) while safely handling older/partial saves.
- Added SQLite regressions for `2026-11-10` → title-only save with omitted date → reload with `2026-11-10`, new tasks defaulting Today, explicit rescheduling, and retained non-date fields.
- Nested blank-node reuse now includes the named previous parent in the visible preview. Tests verify no move before approval, rejection of unapproved/tampered plans, and retained ID/history after approved move and reload. Reused blank nodes also retain an existing scheduled day unless the proposal explicitly reschedules them; other newly created tasks default Today.
- Investigated Actions **run #43**, ID `41267513782`, job `124733289507`: 136/137 cases passed; the failure was `ENOENT` reading `staging/dist/server/index.js` in `tests/outliner-conversation.test.js:68`. That generated file is Git-ignored. CI ran `npm test` on a clean checkout without building, whereas local testing had built it first. It was a missing build prerequisite, not an OpenAI credential or date-test failure.
- Added `pretest: npm run staging:build`, so the same plain `npm test` prepares the artifact locally and in CI without installing browser dependencies or using secrets.
- Reproduced the old failure from a clean Git archive, including Node **22.23.4**, matching Actions. A separate clean archive plus the patch passes plain `npm test` on Node 22.23.4: 15 test files, zero failures. Working-tree Node 24 tests also pass.
- Extended the staging browser harness with actual partial-batch date persistence, nested blank-node named move preview, approval, reload and history retention. Real provider responses and physical Android remain unverified.
