# Private in-app QA feedback — Issue #10 MVP

Implemented on `feature/private-qa-feedback`, based on PR #9's unmerged head `3ebd26a` so the existing dated-task and voice fixes are retained. The PR targets `dev/voice-capture-structure-milestone`. No production merge, Google data/Apps Script access, key creation or secret change.

## User workflow

1. In a contextual task conversation, tap **Report / QA**. Recording is cancelled before opening QA. Edit the observation/expected behavior (initially the current draft or latest user message). Choose a category. Conversation excerpts are unchecked by default; optionally select/edit up to two short excerpts.
2. Tap **Preview private report**. Inspect the exact allowlisted, redacted submission, including the stable task ID and current build ID. Preview stores no report. Editing invalidates the preview.
3. Tap **Send to QA** explicitly. A successful atomic write returns an opaque ticket ID and `submitted` status. Nothing is sent to GitHub or the AI. Failed/offline submissions retain an account/task-scoped browser draft; retries are explicit and keep the same ticket ID. There is no automatic background submission.
4. Use the private **QA** toolbar button or **QA inbox** inside the panel to inspect stored reports. A report links back to its conversation, preserves only the consented excerpts, accepts private replies and supports manual lifecycle updates: submitted → triaged → proposed fix → Codex PR → QA checked → resolved. A Codex PR status requires a valid `FullDrum/momentum` PR URL. Status does not imply an automatic test or review.
5. Expand **Public GitHub handoff — fixed text only** to review the public payload, then optionally open its GitHub draft. GitHub requires a separate explicit submission. The handoff contains only the opaque ticket ID, predefined category summary and server-generated build ID. It never interpolates observations, task IDs/names, excerpts, private URLs or replies.

## Security and storage

- Existing Sites authentication derives the account from platform-injected identity. All feedback reads/writes use that account's isolated staging D1 record. A ticket ID is not authorization. No cross-account lookup or reviewer impersonation is provided.
- Server validation checks the linked task and selected message IDs against that account and conversation. Excerpts are limited to two × 600 characters; observations/replies to 2,000 characters. Reports contain allowlisted fields, not serialized app state, raw audio, full histories, request headers or environment values.
- Common API key, bearer/JWT token, credential assignment, email and URL patterns are redacted before the private preview and on write. This is best-effort protection for arbitrary user input; the user must remove other sensitive content before confirming. Public privacy does not depend on this redactor: the public body is built from preset strings and opaque metadata only.
- Mutations require same-origin authenticated JSON requests and explicit approval. Feedback writes use compare-and-swap on the account record. Concurrent/lost-response create retries produce one report; changed content under the same ID conflicts. Replies have durable request IDs; status updates check the report revision. Server timestamps and build IDs cannot be supplied by users.
- Reports survive reload, rename, moves and deletion of the source task. If the task is gone, the inbox retains only the previously consented excerpt and explains why the conversation link is unavailable. Task structure and conversation messages are not modified by QA submission.
- Drafts are stored in this browser under account/task keys, never auto-sent. The inbox currently supports 100 reports/account and 50 replies/report, subject to the existing 2 MB account storage limit. No automatic deletion/retention worker is introduced.
- Build IDs are deterministic hashes of the bundled application/worker inputs. A stale-build draft must be previewed again before a new submission; an already-saved report remains safely retryable after deployment changes.

## Reviewer integration limits

The built-in OpenAI assistant and an ordinary ChatGPT conversation are separate sessions. Neither receives QA push messages. Connected GitHub access cannot inspect arbitrary private staging feedback. The private inbox/API is available to the signed-in owning account; the MVP has no separate reviewer role, shared triage account or automatic status synchronization with GitHub. Sharing the Site with another account does not grant access to this account's reports.

An authorized owner can review the private context, open the fixed-text public draft and reference its opaque ID in a Codex PR. Detailed private review by ChatGPT requires an explicit authorized connector or approved automation that returns only consented QA fields. That connector, scheduled checks, automatic GitHub issue creation and two-way status sync are deferred. No credential/session workaround is used. Screenshots are not required for reporting; the repository review screenshot uses synthetic test data only.

## Validation

- `npm test`: all 16 test files pass locally, including eight new SQLite/HTTP QA cases: explicit consent, preview without writes, field allowlisting/redaction, public-payload privacy, auth/account and conversation isolation, concurrent/lost-response deduplication, failed writes, build/size limits, replies and manual lifecycle.
- `npm run test:staging-browser`: desktop and Pixel 7 emulation with built Worker, disposable SQLite, mocked provider/audio. Includes report opt-in preview, offline reload/retry, lost response/repeated taps, inbox persistence/status/replies, conversation link, second-account isolation and keyboard-open mobile layout. Existing task/date/voice/outliner regressions remain covered. No unexpected external requests or page errors.
- `npm run test:browser`: existing application shell, cache/offline and sandbox regressions pass.
- `git diff --check`: pass.
- Physical Android/IME, signed-in live Site API and live OpenAI provider behavior remain manual checks. Automated tests do not post public GitHub issues or use private staging conversations.

## Acceptance demo

Open a task chat and type “AI misunderstood hierarchy”. Tap Report / QA, edit the observation, optionally select one short excerpt, preview, then Send to QA. Check the tracking ID in the private inbox, refresh, add a private reply and set `triaged`. Expand the public handoff and verify it contains only the opaque ticket/category/build before opening GitHub. Use the signed-in inbox to inspect private context; do not paste it into the public issue.

Staging application build ID: `qa-af57b2a9f85e`. [Mobile QA screenshot — synthetic data only](screenshots/private-qa-mobile.png). The published Site URL is https://momentum-next-staging-nikita.workspace-755223.chatgpt.site; repository-generated Cloudflare previews are not the isolated QA backend.
