> Updated by `BLANK_AUDIO_MOBILE_REPORT.md`: staging version 3 adds retained blank tasks, final server audio transcription and keyboard-aware mobile controls.

# Momentum Next — outliner-first staging correction

31 October 2026 · Pacific/Auckland

**URL:** https://momentum-next-staging-nikita.workspace-755223.chatgpt.site

**Deployment:** version 2, succeeded. Owner-private, same account/workspace as this conversation. The standalone capture dashboard is no longer the staging interface.

## Implemented

The deployed application uses the canonical Momentum `index.html`, `app.js`, `styles.css`, core helpers and original task controls. A small staging-only adapter replaces its authentication and backend transport. Production Google endpoint/client configuration and GSI loading are stripped from the staged artifact; the production runtime is not changed.

Each task has a small microphone/chat button, including in search. It opens a compact contextual panel immediately below that row. Text and browser speech input use a shared capture lifecycle, with permission errors and text fallback. Conversations are stored in the isolated backend by authenticated account and stable task ID. Renaming/reparenting retains history; earlier staging notes remain visible as historical notes. Messages are not task nodes, child rows, native undo entries or task-save operations.

Closing restores the clean outline and row-button focus. Escape closes; Ctrl/Cmd+Enter sends; Enter inserts a newline. Native outliner shortcuts do not run while typing in the panel. The same panel survives ordinary renders without losing its draft/selection; hiding its row by collapse or filtering closes it and retains its draft. Sent history loads on another signed-in device/session. Failed or uncertain sends retain text and use idempotent message IDs.

The server AI adapter supports task-specific replies and structured subtask/move/link/dependency/duplicate/next-action suggestions. It has no execution tools. Subtasks, moves and links require a server preview and an explicit approval; the server rechecks current revision and tree constraints before applying. Duplicate and next-action suggestions remain discussion items without automatic merges or task creation. Conversations alone never mutate the tree.

**Live AI blocker:** Sites has no configured runtime variables or provider key. The OpenAI Developers plugin is unavailable in this session. The UI says “AI is not connected yet”; messages still persist. Provider integration is tested using mocked Responses API replies, not a live model. To enable it, obtain a key through the OpenAI Developers plugin's supported credential workflow and configure the isolated Site's `OPENAI_API_KEY` runtime secret; optional `OPENAI_MODEL` defaults to `gpt-4.1-mini`. No key was invented, copied from another account or embedded in source.

## Outliner regression results

- Node 22.23.4: **13 test files passed; 0 failed**. Existing core, tree, assignment, identity, links and reliability tests remain in the suite.
- New backend cases cover native save/delete acknowledgement and retry, stale-device edits, tree validation, persistent ID-bound history, account isolation, missing/failed AI, mocked task-context replies, and proposals that remain inactive until approval.
- Desktop and Pixel 7 viewport browser integration passed: original Today task creation, Enter, Tab/Shift+Tab, completion, undo/redo, collapse/expand, task rename, native sync, inline placement, voice-result deduplication, simulated microphone denial, text fallback, focus/Escape, draft recovery, two independent sessions, mobile navigation and native mobile task creation. No external requests or page errors in the staging harness.
- The regression exposed and fixed a Today hierarchy issue: `watching: false` on a synced child and an unset flag on a local parent could split the child out of its parent block. A focused tree test now covers it.
- Canonical app shell and offline-cache checks passed, including new conversation assets and the absence of the floating capture dashboard button. Historical standalone prototype checks also continue to pass; those prototypes are not the deployed UI.
- Build validation, canonical-source equality checks, syntax checks and `git diff --check` passed. Existing `styles.css`, `core.js`, production Wrangler configuration, Apps Script source and SQL migration files were unchanged by this correction.

Captured output is in `OUTLINER_TEST_RESULTS.txt`. Architecture, publication steps and the Android checklist are in `staging/README.md`.

## Verified hosting and remaining manual checks

Native Sites tools report successful version 2 publication and the same custom access policy with one owner and no groups. The existing separate D1 storage and schema are reused; no production resource is connected and existing staging records are preserved. Undated records from the previous staging phase appear in the original All Tasks view.

Physical Android microphone/audio, real AI-provider responses and signed-in live-site API writes still need manual verification. Automated browser tests emulate Android dimensions and simulate recognition/provider responses; they do not establish physical-device compatibility. No connected browser or Android device is available in this environment. Earlier direct HTTPS probes were denied by the environment's destination proxy; this report does not present native deployment success as a completed phone end-to-end test.

On Android Chrome, sign in at the URL above, create/edit a task through the original UI, tap its microphone/chat button, dictate or type a message and send. Close/reopen and check history from another device. Deny/re-enable microphone access, interrupt dictation, and test offline retry. After an AI key is configured, verify a real reply and a proposal that changes nothing until approved.

Limits remain: owner-private staging, keyword/manual relation helpers, no staff collaboration management, no automatic retention/deletion/backup UI, and no production migration. Unsaved drafts are browser-local. Native stale-outline conflicts preserve the queue and require reload/reconciliation; there is no full concurrent-edit merge protocol. The bounded per-account document permits 1,000 tasks, 2,000 legacy notes, 4,000 conversation records and 2 MB total, retaining the last 500 structure approvals. Browser speech may process audio through its provider; Momentum stores text, not audio.

## Provenance

- Development branch: `dev/voice-capture-structure-milestone`, continued from `9939b6d`.
- Site: `appgprj_6ae55c4f17648191adfc942931ac6e09`.
- Hosted source: `aef4e0a5eec8490c5864546aab59cf9cc63b2703` in the dedicated staging Site source repository.
- Version: `appgprj_6ae55c4f17648191adfc942931ac6e09~appgver_d0e123927f1c8191a32aa6597a90104b` (2).
- Deployment: `appgdep_6ae56741f0dc8191b5aeecc34cdde1a4` — succeeded.

The hosting platform calls activation of this isolated Site a publish deployment. It does not deploy or merge Momentum production. No production Sheets, Apps Script or Momentum data were accessed or changed.
