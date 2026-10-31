# Voice archive deployment checklist (prototype branch)

**31 October 2026 development update:** The current capture UI saves browser-local drafts and notes only; it does not invoke these archive or memory routes. The instructions below describe the historical staging backend and remain prerequisites for a future staging adapter. They do not authorize production setup or deployment. Local originals currently have no automatic expiry.

The transcript archive is separate from the Momentum nodes spreadsheet.

1. Create a dedicated Google spreadsheet accessible only to the deployment owner.
2. Set Apps Script property `VOICE_ARCHIVE_SHEET_ID` to its spreadsheet ID.
3. Copy `backend/VoiceArchive.gs`, `backend/VoiceMemory.gs` and the updated `backend/Code.gs` into the Apps Script project.
4. From the Apps Script editor, run `voiceArchiveInstallCleanup_` once to install the daily expiry trigger. Confirm the trigger is visible and authorised.
5. Deploy a **test** Apps Script version, not the production endpoint. Verify an authorised owner can store/list/pin an original and that other users are denied.
6. Test cleanup against a disposable archive containing expired and pinned rows.
7. Test `voiceMemoryStore` and `voiceMemoryList` including duplicate `requestId` handling and access checks.
8. Point a staging frontend to the test Apps Script deployment and verify the task modal end-to-end. Do not deploy the prototype frontend against the production backend.
9. Review partial-save recovery: an original may be stored before the corresponding memory entry; repeated submissions can currently duplicate the original. Resolve this before production.

**Current state:** The prototype task modal now calls the server for both original transcripts and reviewed task memory. These calls will fail until the test Apps Script deployment is configured and published. Existing legacy browser-local notes are only a fallback, not automatically migrated. A GitHub commit does not deploy Apps Script.

**Retention:** Non-pinned transcripts expire 30 days after capture; cleanup is scheduled daily and also runs before archive operations. Pinning prevents expiry. Unpinning starts a fresh 30-day retention period. Reviewed summaries and task memory are stored in the `task_memory` tab of the same dedicated spreadsheet and are not removed by this cleanup.

**Security:** Routes are currently owner-only. Do not expose this separate spreadsheet or an API key in frontend source. A future multi-user version requires task-specific authorization checks, not simply trusting a task ID.

**Caveats:** A transcript is stored as plain text in a dedicated Google Sheet, not encrypted end-to-end. Google Sheets revisions, backups, and audit retention are outside this application's cleanup and may persist separately. For strict erasure guarantees, use a storage service with defined deletion and backup retention controls. Audio recordings are not stored by this archive.
