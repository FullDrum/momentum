# Momentum — Roadmap

Last updated: 26 September 2026 (Pacific/Auckland)

This is the agreed forward plan. The items below marked implemented are present
in the local checkout. GitHub and production deployment status must be checked
separately; committing alone does not publish the app. Remaining items are in
dependency order and split into backend prerequisites and later features.

## Implemented in the local checkout

- **No project / Inbox** option in the combined picker (a cleared project stays cleared).
- **Unified searchable assignee chooser** — ranked by recency + frequency, `No assignee`,
  add-person, keyboard navigation — used by single assign, bulk assign and the combined picker.
- **Ctrl+Shift+Enter** saves text and picks only the assignee; **Ctrl+Enter** opens the
  combined project + assignee picker.
- **Markdown task links** — `Ctrl+K` / right-click "Make link"; safe scheme whitelist
  (`http`/`https`/`mailto`); clicking a rendered link opens it in a new tab.
- **Tree editing in Today & All Tasks** — hierarchy, `Enter` = new sibling, `Tab` = indent,
  `Shift+Tab` = outdent, drag reorder/reparent, breadcrumbs.
- **Set-to-today cascades** to the whole subtree.
- **Collapse/expand toggles** in Today & All Tasks (collapse state shared with Projects).
- **Service-worker auto-activation** so refreshes reliably pick up new builds.

- **Clearer sync warnings** — connection failures, access denial, HTTP errors,
  and missing acknowledgements now have distinct messages. Changes still stay
  queued on the device for retry. Committed locally; production has not been
  rechecked.

## Backend prerequisites (do before expanding collaboration)

1. **Authorisation guards — deployed, further validation pending.** The main request route
   now checks the allow-list, team and allow-list changes require the Sheet owner, and
   lookup failures deny the request without clearing a valid client session.

   **26 September read-only check:** The current Apps Script editor still routes
   `getTeamMembers`, `saveTeamMember`, `deleteTeamMember`, `getWhitelist`, and
   `addToWhitelist` without an owner check. `doPost` authenticates a Google or
   Momentum session token but does not call `validateUser`; `validateUser` returns
   the submitted email when its Sheet/property lookup throws. The deployed version
   should be checked separately from editor source before release.

   **26 September progress:** `backend-auth.patch` records the change. Apps Script
   version 294 is deployed to the same web-app endpoint. The draft passed syntax
   and isolated tests for owner, approved member, outsider, management routes,
   ownerless-node claiming, and unavailable Sheet/property lookups. The owner
   account reloaded the live app and fetched tasks after deployment. The frontend
   now waits for a successful server reply before adding a team member in the UI.
   Before expanding collaboration, test with a disposable Sheet and a signed-in
   non-owner account; those live cases have not yet been verified.

## Later features (dependency order)

2. **Stable `personId` + provisional name-only people** — replace email-as-identity with a
   stable `personId` (name, optional email, status); migrate legacy email assignments; let a
   manager create a person by name and attach an email later without breaking prior assignments.
   Name-only people are assignable immediately; their tasks stay manager-visible only until
   an authorised email is linked. See `IDENTITY_MIGRATION.md` for the rollout contract.
3. **Per-person stars + team visibility** — stars keyed `(taskId, personId, timestamp)`;
   `My starred` pinned at the top of Today; `Team starred` shows who starred what, without
   exposing hidden tasks.
4. **Held assignments + manager agenda preview** — separate assignment from release so a
   manager can hold tasks back (invisible to the assignee everywhere); `View agenda as…`
   (server-computed) and a `Held back` panel. Enforced by backend filtering, never frontend-only.
5. **Attachments (photos + documents)** — binaries in a dedicated Drive folder (not the Sheet)
   plus a metadata table; upload/list/download authorised through the backend using the same
   task-visibility rules so held/private tasks cannot leak attachment names or URLs.
6. **Shared / group projects** — explicit roles (owner/admin/member/viewer), inheritance,
   removal semantics, and how held tasks interact with membership. Do this only after the
   identity and access-control model is stable.
7. **Sidebar folders / categories** — an expandable folder tree using the same hierarchical
   model (not a separate system), keeping Today / All Tasks / Projects / Assigned to Me.

## Notes

- The backend source and Sheet live outside this repository. Export `Code.gs`, the manifest,
  and the Sheet header row before implementing item 2; the current `backend-auth.patch`
  contains only the previous security change, not a full backend source copy.
- Sync acknowledgement/retry is data-critical: read `RELIABILITY.md` before changing sync.
- Bump the cache name in `sw.js` when cached assets change.
