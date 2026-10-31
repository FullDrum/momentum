# Isolated Momentum Next staging

URL: https://momentum-next-staging-nikita.workspace-755223.chatgpt.site

Use the owner's ChatGPT account to sign in on each device. Data is isolated by the stable Sites user ID. This application starts with an empty task pool; it never imports live Momentum data.

## Implementation

- `web/`: responsive frontend, text/voice capture and reviewed structure UI.
- `worker/api.js`: authenticated API with a D1 repository. No Google API calls.
- `shared/`: exact copies of the existing capture/relations modules. A regression check requires byte-for-byte equality with the canonical repository modules; update both when changing shared behavior.
- `drizzle/0000_staging.sql`: schema-only migration for a new staging table. No seeds, backfill or production identifiers.
- `.openai/hosting.json`: separate Site identity and logical D1 binding (`DB`); contains no credentials.
- `scripts/build.mjs`: builds and validates a self-contained ESM Worker with only staging assets. It does not bundle `app.js`, production configuration or Google backend source.

The database stores one versioned JSON document per authenticated user. Each write reads the current revision, validates the operation, and updates using an atomic `WHERE revision = ?` comparison. Concurrent captures retry the comparison; reviewed structure rejects stale revisions and requires a fresh preview. Request receipts and original payload signatures live in the same atomic document, so lost responses can be retried without duplicate tasks/notes. The first insert uses a unique owner key and `INSERT OR IGNORE`.

`POST /api/capture` atomically stores a note and, for Inbox capture, creates its task. `POST /api/preview` validates a move or typed link without writing. `POST /api/apply` requires approval and the exact current base revision, revalidates tree/link constraints and commits the change plus audit. `GET /api/state` returns only the authenticated user's data. `GET /api/health` contains no task data. Other API methods and cross-origin writes are rejected.

The hosted platform authenticates users and owns `/signin-with-chatgpt`, `/signout-with-chatgpt` and callback routes. The Worker does not implement a second OAuth stack or trust an owner supplied in JSON. An identity-less service token does not grant user-owned task access. Never put service/source credentials into frontend files, source control or artifacts.

## Local tests and build

From the Momentum repository:

```sh
npm test
npm run staging:build
npm run test:staging-browser
```

The browser tests use Playwright and `/usr/bin/chromium` already available in the development environment. Install the optional dependencies and Chromium on other machines as required. Backend tests use Node's built-in SQLite on Node 22.23.4. The browser harness injects test identity locally; no mock-auth route or fallback is included in the deployed Worker.

## Packaging and publishing this isolated resource

The standard Sites source-helper executable was not mounted in this execution environment. The fallback used ordinary Git to the dedicated Site source repository and the native save/deploy tools. Credentials were passed on hidden stdin and held in process memory, never stored in Git, files, command arguments or artifacts.

The hosted source repository has `staging/` lifted to its root. Build that exact committed source with `node scripts/build.mjs`. Package `.openai/`, `dist/` and `drizzle/` from that root into an archive **outside** the checkout. The archive must retain `dist/server/index.js`; archiving just the contents of `dist/` is rejected. Push the exact source to the dedicated Site repository, save its full commit SHA with the matching archive, then deploy the saved version using the owner-private Sites operation. Reuse the existing project ID and audience; do not create another Site or publish to `FullDrum/momentum` main.

Never run the root production `wrangler.jsonc`, reuse production Google endpoints or copy production Sheets into this app. Publishing this separate staging host does not update Momentum production.

## Android manual checklist — pending

1. In Android Chrome, open the URL above. Sign in with the same ChatGPT account and workspace. Confirm it shows “Connected to private staging.”
2. Tap **Check microphone**, allow access, then tap **Speak**. Dictate a real sentence, stop, review and **Save to staging**. Confirm the transcript has no repeated phrases.
3. Refresh. Open the same URL on another device with the same account and refresh there. Confirm the saved note/task appears.
4. Deny microphone access through Chrome site permissions. Confirm a helpful error appears and typing/saving still works. Re-enable it and retry dictation.
5. While recording, lock/unlock the phone or switch applications. Confirm recording stops and the current text remains. Close and reopen the page to check draft recovery.
6. Turn off the network after loading, type a note and try Save. Confirm failure preserves the text. Restore connectivity and retry; confirm one saved note.
7. Create two staging tasks. Select one, preview a move under the other, and approve. On the second device, refresh and confirm the new parent. Add a related/supports link and check persistence.
8. Preview a change on one device, save a note on the other, then approve the old preview. Confirm it refuses the stale change and asks for a fresh preview.
9. Sign out or use another account. Confirm the private site or task API denies access; do not change the site's audience to conduct this check.

The automated mobile tests emulate the screen/device profile and permission behavior; they do not establish real Android microphone, speech-provider or sign-in compatibility. Record device model, Android/Chrome versions and observed results when this checklist is completed.

## Data lifecycle

Only saved notes sync; drafts remain browser-local. Original text is retained on the staging server with the reviewed memory. No audio is recorded. There is currently no automatic expiry, backup/export UI, delete UI or production synchronization. Use disposable development content. Limits: 1,000 tasks, 2,000 notes, 2 MB per-account snapshot; last 500 structure approvals retained in audit. A network failure after an accepted request can mean the write committed even if its response did not arrive; retry unchanged content with the retained request ID before starting a different note.
