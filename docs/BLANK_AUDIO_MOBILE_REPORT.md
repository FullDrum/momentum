> Latest status: `AI_VOICE_COMPACT_STATUS.md` describes version 4 and the unresolved real-provider connection.

# Momentum Next — blank tasks, final transcription and mobile keyboard

31 October 2026 · Pacific/Auckland

**Staging:** https://momentum-next-staging-nikita.workspace-755223.chatgpt.site

Version 3 deployed successfully to the existing owner-private staging resource. The original Momentum outliner remains the main interface. No production deployment, merge, Google Sheet, Apps Script or Momentum data was changed.

## Completed corrections

- Blank tasks retain stable IDs independent of their titles. Staging creates an explicit retained-empty task record immediately. It queues typing changes before blur/reload and preserves blank records through normalization, Today/All/Projects display, queue replay, undo restoration and backup helpers. “New task” is a display placeholder, not a stored title.
- Opening a task conversation records a conversation-start marker. The native server derives conversation presence on reload. Empty Backspace cannot silently remove a conversation-bearing task; the existing explicit Delete action remains available. Sent history stays separate from task children and remains associated with the same ID through rename/reparent.
- Blank tasks and their conversation drafts survive offline creation, close and reconnect/reload. Sent history is recovered after reopening, including in another session. The private staging shell still requires network access to load; offline browser storage recovery does not imply a fully offline sign-in/application shell.
- Removed the speech language selector and browser speech recognition from the task panel. A microphone recording now produces one final server transcription when stopped. No interim text is concatenated. Manual typing during upload is preserved, and the final result is appended at most once.
- Added authenticated, same-origin, task-authorized OpenAI transcription. Audio bytes and the provider credential stay on the server path; no key is exposed in client assets. The request omits language so supported Russian/English and other supported languages are detected automatically. Default model: `gpt-4o-mini-transcribe`; optional server `OPENAI_TRANSCRIPTION_MODEL` supports `gpt-4o-transcribe` and `whisper-1`.
- Recording is bounded to 60 seconds and 10 MB. The server enforces MIME/stream size limits. Audio is held transiently and never stored by Momentum. Permission errors, unavailable recording, empty results and provider failures leave text usable. Failed audio can be retried while the panel stays open; closing/cancelling discards the in-memory clip.
- The normal panel shows the last three messages, text entry, microphone, Send and Close. Earlier history/options and suggestions/task structure are accessible in collapsed sections. Advanced proposals still require preview and explicit approval.
- Added visual-viewport layout handling for mobile keyboard height/offset changes. The toolbar stays at the top of the visible app, becomes compact and horizontally scrollable, and the accessory bar retains indent/outdent and a native Add control above the keyboard. Mobile navigation contracts while the keyboard is open and returns to its original layout when closed. The active task editor/chat composer scrolls into view. In chat, task-indent controls are disabled so messages cannot become outline commands; Add/Done remain available.

## Lifecycle findings

The earlier loss was not a task-ID problem: IDs already existed independently of titles. Four title-based paths discarded useful empty state: queue admission, reload normalization, view filtering and blur cleanup. Undo/backup helpers also treated empty titles as invalid. The correction adds explicit retained-empty semantics instead of inserting a fake title into storage. Non-retained legacy transient blank handling remains available outside staging.

A second path kept edits only in memory until blur. Staging now persists each task input change to its existing debounced local queue, so rapid reload and offline recovery preserve the ID and latest title, including an empty title. The native backend stores retained tasks without renaming them. Conversation-start metadata protects a blank node even before its first message is sent.

## Automated validation

- Node 22.23.4: **14 test files passed; 0 failed**. This includes the existing core/tree/reliability/assignment suites and new recording lifecycle, blank-task, backend transcription and recovery cases.
- Recording-controller tests cover final-only output, duplicate stop callbacks, failed upload/retry, permission denial, unsupported recording, closing during permission requests, late responses after close and empty transcripts.
- Backend tests verify stable blank IDs/history, automatic language request configuration, server-only Authorization, task/account isolation, missing credentials, unsupported formats, empty/oversized audio and provider failures. Audio/transcription responses are synthetic/mocked, not real speech recognition.
- Desktop and Pixel 7 viewport browser integration passed: original task creation/editing, Enter/Tab/Shift+Tab, completion, undo/redo, collapse, mobile navigation, inline conversation focus/drafts, server-reviewed proposals, two-session history, blank title/ID recovery after reload, offline blank creation and recovery, final transcription without repeats, and text fallback.
- Mobile keyboard tests simulate visual-viewport resize events for open/closed keyboard states. They check toolbar/nav/accessory bounds, editor and composer placement above the bar, and invoke the above-keyboard Add action. These are browser layout/interaction tests, not a physical Android IME test.
- Canonical application shell and offline-cache tests passed with v41 audio/viewport assets. Syntax/build checks, source snapshot equality and `git diff --check` passed. Production backend, Wrangler configuration and SQL migrations were unchanged.
- Native Sites tools report successful version 3 deployment and unchanged owner-private access (one allowed owner, no groups).

Captured results: `BLANK_AUDIO_MOBILE_TEST_RESULTS.txt`. Detailed lifecycle, architecture, data limits and phone instructions are in `staging/README.md`.

## Exact remaining blockers and manual tests

**OpenAI credential:** Sites currently has no configured runtime variables or `OPENAI_API_KEY`. The OpenAI Developers plugin is not available in this session. Therefore live AI replies and real audio transcription are not enabled; the UI disables recording when transcription is disconnected and provides text fallback. The integration is implemented and tested with mocked provider responses. Obtain/configure a key through the supported OpenAI Developers workflow as an isolated Site runtime secret, then publish to apply it. No secret was copied, invented or embedded in client code.

**Physical Android:** No Android device or connected browser is available here. Real Android Chrome keyboard, microphone prompts, audio quality and Russian/English recognition remain manual acceptance tests. Earlier direct live-site HTTPS probes were blocked by the execution environment's destination proxy; signed-in deployed API interactions also remain manual checks. Hosted publication status is verified independently through Sites.

On Android Chrome with the same ChatGPT account/workspace:

1. Create a blank task, open its chat, type/send a message, close and reload. Confirm the same blank task and history remain, with “New task” as a placeholder.
2. Create/edit while offline after loading, reconnect and reload. Confirm the same ID/draft/history recovers and no conversation message appears as a child task.
3. Open the keyboard during task editing. Confirm indent/outdent, Add and toolbar access remain above it. Create a sibling using the accessory Add. Close the keyboard and verify normal navigation/layout returns.
4. Focus chat entry, rotate the phone, switch apps and return. Check the composer/Send/Close remain reachable and text is retained. Check horizontal toolbar scrolling and Done.
5. After configuring the provider key, record Russian and English clips. Stop once and confirm one final transcript, review, then Send. Deny/re-enable microphone access, interrupt a recording and test failed-upload retry/text fallback.

The app stores no audio, but the OpenAI service processes uploaded clips under the account's provider policies. Retry after a lost response can issue another provider request; the UI still applies only one final result per recording. There is no automatic server retention/deletion or backup UI; use development content.

## Deployment provenance

- Branch: `dev/voice-capture-structure-milestone`, continued from `6d8f8ba`.
- Project: `appgprj_6ae55c4f17648191adfc942931ac6e09`.
- Hosted source: `679090836e1b4ef3101d8819bac3506addc904c7` in the dedicated staging repository.
- Version 3: `appgprj_6ae55c4f17648191adfc942931ac6e09~appgver_5dc1a4440a848191a6bbfb4b61f5ddce`.
- Deployment: `appgdep_6ae5761fc7f88191b17b3133cb8c7eb6` — succeeded.

The hosting platform calls activation of this separate staging Site a publish deployment. Momentum production and its production branch remain untouched.
