# Momentum Next staging milestone

31 October 2026 · Pacific/Auckland

Staging URL: **https://momentum-next-staging-nikita.workspace-755223.chatgpt.site**

Private to the owner. Open in Android Chrome and sign in with the same ChatGPT account/workspace used for this conversation. No separate Google sign-in is needed.

## Completed

- Deployed a mobile-responsive HTTPS staging application to a newly created, owner-private Sites project with a separately provisioned Cloudflare D1 database.
- Voice/text capture saves original text and reviewed summary/outcome/next-action/status to the server. A new Inbox capture creates a staging task; subsequent notes can attach to that task. Saved records persist between sessions/devices for the same signed-in account.
- Browser drafts recover after reload. Uncertain saves retain their request ID for safe retry; server-side receipts prevent duplicate writes. Capture and structural updates use atomic revision comparisons to avoid losing concurrent changes.
- Related-task suggestions explain shared words. Structure previews are computed by the server, and applying moves/links requires explicit review. The server rechecks the latest revision, rejects cycles/duplicates and preserves one primary parent. Approved structure changes are logged.
- Added microphone permission diagnostics, English/Russian recognition, error handling, interruption handling and text fallback. Microphone checks stop their audio tracks immediately; no audio is stored by Momentum.

## Isolation and authentication

Continued from `99c60f3` on `dev/voice-capture-structure-milestone`. All staging code is under `staging/`, with additional automated tests and documentation. Existing application assets, production configuration and backend source were not changed.

The deployment uses [Sites](https://chatgpt.com/apps) hosting and its sign-in boundary, not Momentum's production Cloudflare Worker. Hosted platform identity keys every database read/write; APIs reject missing identity and cross-origin writes. The site's access policy was verified as custom with one allowed owner and no groups. Staging does not load production scripts, copy production records, call Google Sheets or call Apps Script.

Google Apps Script alternative is blocked: the environment reports no Google runtime credentials/outbound identity, no configured Google credential selectors, no `clasp`, and no Apps Script create/deploy tool. No Google credentials or production project were reused. The separate D1 backend provides durable staging storage without waiting for Google setup.

## Verification

- Node 22.23.4: **12 test files passed, 0 failed**, including eight new staging API scenarios using real SQLite and the staging SQL migration.
- Mobile browser integration passed: Pixel 7 viewport, two independent sessions, persisted captures/moves/links, stale-review rejection, offline draft recovery/retry, account isolation and text fallback. No page errors or external requests in this test.
- Chromium microphone permissions were exercised with a synthetic audio device: granted and denied flows passed. Speech result callbacks were simulated. **Physical Android audio/recognition has not been tested.**
- Existing application Chromium suite also passed after staging was added.
- Build artifact validation, JavaScript syntax checks and `git diff --check` passed.
- Hosted deployment reported **succeeded**. Native database inspection confirmed the isolated `DB` binding and `staging_state` table. Native access inspection confirmed owner-private access.
- Direct HTTPS checks from the execution environment were blocked by its destination proxy (`Tunnel connection failed: 403 Forbidden`). No connected browser tool was available. Thus signed-in live-site save/read and real-device access remain manual checks; deployment success is not presented as a completed end-to-end phone test.

See `STAGING_TEST_RESULTS.txt` for captured automated results and `staging/README.md` for architecture and the phone checklist.

## Remaining limitations

- Complete the Android checklist: sign-in, actual dictation, deny/re-enable permissions, phone interruption, and a saved note appearing on a second signed-in device. The optional user verification request is still pending at report time.
- Suggestions use keyword matching, not semantic AI. Unsaved drafts remain device-local; only explicitly saved notes sync.
- Capacity is bounded to 1,000 tasks, 2,000 notes and a 2 MB serialized account snapshot. The last 500 structure changes are shown in audit. This staging implementation has no deletion/retention or backup/export UI and is not designed for large production datasets.
- Browser speech services may process audio remotely and need an Internet connection. Support varies by Android/browser version.
- The owner-private site is not shared with staff. There is no production data migration, Apps Script integration, production permission rollout or merge.

## Deployment provenance

- Sites project: `appgprj_6ae55c4f17648191adfc942931ac6e09`
- Hosted source commit: `1f5e0ad89e7d3dba088814ad1520d2816fb4a3b2` in the dedicated Sites source repository.
- Saved version: `appgprj_6ae55c4f17648191adfc942931ac6e09~appgver_37ae86b1b608819194d6f01ad36d180e` (version 1).
- Deployment: `appgdep_6ae55db9ce8c819190d075f3f646888e` — succeeded.

Nothing was merged or deployed to Momentum production. The hosting platform labels activation of a new isolated Site as a publish deployment; this URL is the separate staging resource authorized for this milestone.
