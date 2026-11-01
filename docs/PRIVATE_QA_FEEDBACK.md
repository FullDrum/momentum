# Private in-app QA — one-click full task conversation

This acceptance update on PR #11 supersedes the earlier excerpt/preview workflow, following [the user's acceptance feedback](https://github.com/FullDrum/momentum/pull/11#issuecomment-6556446830). It remains on `feature/private-qa-feedback`, targets `dev/voice-capture-structure-milestone` and retains the unmerged PR #9 dependency. No production merge, production data/Apps Script access, key creation or secret change.

## Current workflow

- Each task conversation has **Report to QA**, with the adjacent disclosure **Whole task chat → private QA**. That deliberate click is consent to save the selected task's complete stored chat privately. There is no report form, preview, checkbox selection or second Send/confirmation.
- A successful write shows an inline ticket ID, message count and **Private QA inbox** link. Opening the inbox is optional and does not submit another report. Normal messages and page reloads never submit QA automatically.
- The server captures all turns from that task, including older turns under collapsed History and earlier task notes displayed in the conversation. The immutable snapshot preserves message IDs, roles, order, complete text, timestamps, assistant status and allowlisted proposal fields, with a snapshot timestamp, stable task ID and server build ID. Old records without message timestamps retain `null`, displayed as timestamp unavailable; no timestamp is invented.
- Capture uses the authenticated account's server history, not a browser-supplied transcript. Other tasks, unsent composer drafts, raw recordings, attachment fields, environment values and unrelated app state are excluded. The report is not a task or an AI message.
- Credential patterns and the configured provider key are redacted server-side. Other private text, URLs and emails remain intact so the decision context is complete. Nothing is silently shortened. More than **1,000 messages** or **200,000 UTF-8 bytes** returns a clear 413 error with no report written. The existing account storage limit also applies.

## Retries and persistence

The browser stores only an account/task-scoped request ID, a history digest and completion metadata—not another transcript copy. The pending ID is saved before sending. Repeated taps are guarded in flight; repeated reporting of the unchanged loaded conversation reuses the completed ID. A changed conversation permits a new explicit report. Server retries return the original frozen snapshot, even after the chat changes, the source task is deleted or another build is deployed.

An offline/failed click shows **QA not confirmed** and asks for an explicit retry. Reload/reconnect never auto-retries. If a report did not reach the server, the retry captures the then-current stored conversation. If the response was lost after a successful write, retry returns the original ticket and snapshot. No success claim is made before the server confirms persistence.

The private inbox retains reports after task rename/move/deletion, links back to the conversation where available, accepts private replies and supports manual submitted → triaged → proposed fix → Codex PR → QA checked → resolved status. A Codex PR status requires a valid FullDrum/momentum PR URL. Status is manual, not evidence of automatic review. Earlier excerpt-based reports and their existing API remain readable/compatible; old reports are not silently expanded into full-history snapshots.

## Privacy boundary and reviewer limits

Sites authentication derives the account from platform-injected identity. Every read/write is scoped to that account; ticket IDs do not grant access. Writes require same-origin authenticated JSON and explicit consent. Atomic compare-and-swap prevents partial reports and duplicate writes.

The public GitHub handoff remains separate, fixed text: **opaque ticket ID + preset category + build ID only**. It never interpolates the snapshot, task ID/name, observation, excerpt or private reply. Opening the public draft does not submit it. The app has no GitHub credential and does not automatically post GitHub issues.

The built-in OpenAI assistant and ordinary ChatGPT are separate sessions. No automatic/private reviewer connection, notification, scheduled polling or GitHub status synchronization exists. GitHub access alone cannot resolve a private ticket. Authorized review uses the owning account's signed-in inbox, or a separately approved connector/automation that is still deferred. Sharing the Site with another account does not grant access to the owner's reports. Concise **QA privacy help** is available in the inbox.

## Validation

- `npm test`: all 16 test files pass, including 13 SQLite/HTTP QA cases. New cases verify complete multi-turn history, legacy/older turns, order/roles/timestamps, long untruncated messages, credential-only redaction, snapshot accuracy, size failures, consent/auth/isolation, frozen lost-response/concurrent retries and public-payload privacy.
- `npm run test:staging-browser`: desktop and Pixel 7 emulation with built Worker/disposable SQLite/mock provider/audio. Verifies one-click reporting with no modal/form/extra consent, older collapsed History, snapshot readback, repeated taps, new-turn reporting, offline reload/retry, saved-response loss, inbox status/replies/linkage/account isolation and keyboard-open layout. Existing task/date/voice/outliner regressions remain covered. No unexpected external requests or page errors.
- `npm run test:browser` and `git diff --check`: pass.
- Physical Android/IME, signed-in live-Site API and live-provider checks remain manual. The tests and screenshot use synthetic fixtures only; no actual private conversation is published.

Application build: `qa-0e0153717363`. [One-click mobile screenshot — synthetic data only](screenshots/one-click-qa-mobile.png). Staging URL: https://momentum-next-staging-nikita.workspace-755223.chatgpt.site. Repository-generated Cloudflare previews are not this isolated backend.
