# Voice archive deployment checklist (prototype branch)

The transcript archive is separate from the Momentum nodes spreadsheet.

1. Create a dedicated Google spreadsheet accessible only to the deployment owner.
2. Set Apps Script property `VOICE_ARCHIVE_SHEET_ID` to its spreadsheet ID.
3. Copy `backend/VoiceArchive.gs` and the updated `backend/Code.gs` into the Apps Script project.
4. From the Apps Script editor, run `voiceArchiveInstallCleanup_` once to install the daily expiry trigger. Confirm the trigger is visible and authorised.
5. Deploy a **test** Apps Script version, not the production endpoint. Verify an authorised owner can store/list/pin an original and that other users are denied.
6. Test cleanup against a disposable archive containing expired and pinned rows.
7. Only after these checks, connect the task modal to `voiceArchiveStore`, `voiceArchiveList`, and `voiceArchiveKeep`.

**Current state:** The Momentum task modal stores only short notes in browser localStorage. It does not yet send transcripts to this archive. A GitHub commit does not deploy Apps Script.

**Retention:** Non-pinned transcripts expire 30 days after capture; cleanup is scheduled daily and also runs before archive operations. Pinning prevents expiry. Unpinning starts a fresh 30-day retention period. Short summaries and agent memory should be stored separately and are not removed by this cleanup.

**Security:** Routes are currently owner-only. Do not expose this separate spreadsheet or an API key in frontend source. A future multi-user version requires task-specific authorization checks, not simply trusting a task ID.

**Caveats:** A transcript is stored as plain text in a dedicated Google Sheet, not encrypted end-to-end. Google Sheets revisions, backups, and audit retention are outside this application's cleanup and may persist separately. For strict erasure guarantees, use a storage service with defined deletion and backup retention controls. Audio recordings are not stored by this archive.
