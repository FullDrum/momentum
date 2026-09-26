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

## Ready to commit and deploy

- **Clearer sync warnings** — connection failures, access denial, HTTP errors,
  and missing acknowledgements now have distinct messages. Changes still stay
  queued on the device for retry. Frontend tests pass; this change is not yet
  committed or verified in production.

## Backend prerequisites (do before expanding collaboration)

1. **Authorisation guards** — fix the source-review findings: the main request route does
   not consistently validate the user allow-list; team-management and allow-list routes lack
   a clear owner/admin guard; one validation path can fail open. Add isolated authorisation
   tests. *(Needs `Code.gs` access.)*

   **26 September read-only check:** The current Apps Script editor still routes
   `getTeamMembers`, `saveTeamMember`, `deleteTeamMember`, `getWhitelist`, and
   `addToWhitelist` without an owner check. `doPost` authenticates a Google or
   Momentum session token but does not call `validateUser`; `validateUser` returns
   the submitted email when its Sheet/property lookup throws. The deployed version
   should be checked separately from editor source before release.

   **Implementation plan:** Export `Code.gs` into a private, reviewable backend
   workspace; make `validateUser` deny access on lookup errors; require allow-list
   membership for every request; require the Sheet owner for team and allow-list
   management routes. Keep ordinary task routes available to approved users and
   preserve per-node ownership checks. Add tests for approved, unapproved, owner,
   non-owner, expired-session, and lookup-failure cases. Test against a disposable
   Sheet, then deploy a new Apps Script version and verify the live endpoint before
   marking this item shipped.

## Later features (dependency order)

2. **Stable `personId` + provisional name-only people** — replace email-as-identity with a
   stable `personId` (name, optional email, status); migrate legacy email assignments; let a
   manager create a person by name and attach an email later without breaking prior assignments.
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

- Backend phases 1–6 are blocked on exporting `Code.gs` and the Sheet header row; the Apps
  Script source and the Google Sheet live outside this repository.
- Sync acknowledgement/retry is data-critical: read `RELIABILITY.md` before changing sync.
- Bump the cache name in `sw.js` when cached assets change.
