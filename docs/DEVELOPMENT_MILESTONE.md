# Momentum Next development milestone

31 October 2026, Pacific/Auckland. Development only.

Base: `feature/voice-task-assistant-prototype` at `40223ca7e163560167ae8e4f995eefaad918eee8`.
Working branch: `dev/voice-capture-structure-milestone`.

## Completed

- Fixed the task panel crash: history, outcome, next-action and status controls now exist. Both entry points use the same panel and capture controller.
- Global quick capture and task-specific text/voice capture. A short summary is optional: full typed instruction can be saved immediately.
- Recover drafts while typing, after close, and across reloads. Saves preserve editable text on quota failures. Storage is scoped to the account present when the panel opens; account changes block saves into the wrong account.
- Rebuild cumulative speech-result snapshots to avoid duplicated final phrases. English (NZ) and Russian language choice; manual editing stops recognition; stopped/disposed sessions ignore late callbacks; start and permission failures reset controls and keep text. Text remains usable without speech support.
- Reviewed summary, outcome, next action and status stored alongside original text in local browser history. Local originals have no automatic expiry; this is explicitly described in the UI and differs from the historical server archive.
- Up to three deterministic related-task suggestions with shared-word explanations. Completed tasks, sections, read-only context and the current task are excluded. Suggestions never merge or move tasks.
- Shared structure proposal/apply API for one primary parent and related/supports/blocks/alternative links. Sandbox application requires approval, revalidates the task snapshot, rejects cycles and duplicate symmetric links, and preserves original inputs.
- Synthetic demo turns saved Inbox captures into sandbox tasks; preview and approve moves or links, including moves back to Inbox. Structure/links persist locally and can be reset independently of captures.
- Dialog labels, keyboard focus containment and restoration, Escape, narrow-screen layout, safe text rendering, and local-only data notices.
- Updated service-worker cache to v39 and cached capture assets. Sandbox navigation no longer overwrites the offline application shell.

## Architecture and development boundary

`voice-capture.js` owns speech lifecycle and local storage. `voice-task.js` renders the shared UI. `task-relations.js` is pure proposal, validation and suggestion logic. `prototypes/sandbox.js` provides the development adapter through `MomentumVoiceEnvironment` (`getNodes`, `scope`, `applyProposal`, `onCapture`). The regular application adapter reads the current visible task pool, saves browser-local notes, and previews structure; it does not apply structure to real tasks or send captures to `gsr`.

The sandbox uses synthetic seeds, a separate storage namespace, and CSP `connect-src 'none'`. It never loads `app.js`, credentials, Apps Script, Sheets or Google identity. Its saved captures are a disposable simulation of tasks, not a second production task database. No backend source changed from the requested base. No production data, Apps Script deployment, live Sheet or production branch was modified.

Old prototype archive/memory/link server routes remain unchanged in the branch but are deliberately disconnected from the development capture interface. Legacy local notes are preserved and not migrated automatically. Staging API integration is a separate milestone.

## Run the demonstration

From the repository, run `python3 -m http.server 8000 --bind 127.0.0.1`, then open `http://127.0.0.1:8000/prototypes/task-structure-live.html`. The demo includes a short walkthrough. For microphone testing, use localhost or HTTPS in a browser that supports SpeechRecognition.

## Validation

- Baseline: existing 9 Node test files passed before implementation.
- Final: `PATH=/workspace/.momentum-tools/node-v22.23.4-linux-x64/bin:$PATH npm test` on Node 22.23.4: 11 test files passed, 0 failed. New files cover 12 focused capture/relationship scenarios, including cumulative recognition, late callbacks, failed writes, account scopes, stale proposals, links and cycles.
- `npm run test:browser`: Chromium/Playwright integration covers shared demo capture, mocked speech, draft recovery, suggestions, approved move/link, cycle rejection, quota recovery, mobile layout, unavailable speech, actual application modal, account isolation, service-worker assets and offline capture. Demo checks require zero external requests and zero page errors; all external requests are blocked throughout testing.
- `node --check` for changed scripts and `git diff --check` passed.
- Microphone audio and real recognition services were not exercised: recognition callbacks were simulated deterministically. No live backend calls or authenticated production sessions were used.

Browser test setup: install optional development dependencies with `npm install`, install Chromium (or set `CHROMIUM_PATH` to its executable), then `npm run test:browser`. This environment supplied Playwright 1.62.1 and `/usr/bin/chromium`. A dependency lockfile could not be generated because the CLI proxy was unreachable; no dependency installation was required to run the supplied tools.

## Remaining limitations and next steps

1. Add a disposable authenticated staging API and transaction/idempotency contract for atomic capture + reviewed memory + original text. Verify permissions, retention and failure recovery before enabling server saving. Current local data is not encrypted, synchronized or backed up and can be lost if browser data is cleared.
2. Promote saved Inbox notes into the authoritative task model through a reviewed staging adapter. The regular app's quick capture currently stores local notes; automatic task creation is confined to the synthetic sandbox.
3. Evaluate semantic suggestions on representative task language, titles and permissions. Current keyword overlap has no stemming or semantic understanding; its score is a ranking signal, not confidence.
4. Test a real microphone on target mobile/desktop browsers, including permission denial and interruptions. Browser speech providers can process audio remotely; the app stores text, not audio.
5. Add revision-aware backend structure writes and a durable audit/undo protocol. Cross-tab storage transactions, batch restructuring, natural-language commands, drag-and-drop, dependency graph execution, AI review sessions, worker sharing and photos remain later work.

Nothing has been merged or deployed to production.
