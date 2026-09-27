# Person identity migration

This is the implementation contract for roadmap item 2. The existing backend stores
`assignedTo`, `assignedBy`, `owner`, and `sharedWith` as email addresses. The current
team list is also keyed by email. A name-only assignment must not be written into
any of those email fields or used as an access grant.

## User behaviour

- The manager can create a person with a name and no email, then assign tasks to them.
- Those tasks appear in the manager's views under that person's name. The
  assignment itself grants no team account access until an email is linked and
  authorised. Existing project or explicit sharing rules may still expose a task;
  the backend must check those rules before claiming a task is manager-only.
- Adding or changing an email does not change the person's ID or their assignments.
- Existing email assignments still appear under the correct person after migration.

## Data contract

- Add a `people` table with `personId` (immutable UUID), `name`, `email` (optional,
  unique after case/space normalisation), and `status` (`provisional` or `active`).
- Add `assigneePersonId` to nodes. Keep the legacy `assignedTo` email during the
  transition; it is a compatibility field, not the identity. The server derives it
  from the linked person's email. It must be blank for a provisional person.
- Keep `owner`, `assignedBy`, and `sharedWith` as authenticated-email access fields
  until their own server-side migration. Never put a person ID or a display name in
  them. Task visibility remains a server decision.
- A client may display `assigneePersonId` but cannot grant itself access by sending
  a different ID, email, owner, or `sharedWith` value. The backend validates every
  assignment change against its people table and existing permission rules.

## Rollout order

1. Back up the Sheet. Export the current `Code.gs`, Apps Script manifest, and header
   row to a local, reviewable copy before editing. Keep deployment IDs and private
   configuration out of Git. `backend/Code.gs` is now a tracked, scrubbed copy of
   the live source; `node scripts/build-backend.js` prepares an ignored
   `.private/Code.deploy.gs` using the Sheet ID from `.private/Code.gs`.
2. Add the people table and `assigneePersonId` column. Backfill one person for each
   unique legacy assignee email, reusing an existing team entry where possible.
   Normalise emails for matching, but keep the stored `assignedTo` unchanged until
   each row is linked. Log duplicate/conflicting email rows for manual resolution.
   The owner has reported making a Sheet backup, adding the `people` headers, and
   adding `assigneePersonId` after `watching`; the live header order is not yet
   independently verified.
3. Deploy server reads that return both fields and server writes that accept either
   a legacy email or a person ID. Derive `assignedTo` on the server
   from the person record. Remove the prior assignment's legacy share when changing
   assignees, and review any separate project/explicit shares. Reject unknown IDs
   and duplicate email links.
4. Update the frontend picker, badges, favourites, and forms to use `personId`.
   The add-person form accepts a name alone; an email can be linked later. Existing
   local queued saves and backups using email are still accepted during transition.
5. Test old and new clients against the backend with a disposable Sheet and two
   accounts. Check that a provisional assignee cannot see the task; linking their
   authorised email makes it visible; changing an email keeps the same assignment;
   and unrelated accounts cannot read or modify it. Then deploy the frontend.
6. Retire legacy email assignment writes only after queued older clients have
   drained. Retain a read migration path for backups.

The live owner-only backend read after version 294 confirms the present `COLS`
still has email fields and no `assigneePersonId`. This document does not itself
change the running app or its access rules.

The pure rules for person creation, email linking, legacy backfill planning, and
assignment-field transitions now live in `identity.js` with local tests.

`backend/People.gs` now contains the tested people-table functions, owner-only
backfill preview and migration, and server-side assignment resolution.
`backend/Code.gs` routes these functions and includes `assigneePersonId` after
`watching` in the node schema. The local frontend picker selects people by ID,
allows name-only creation, and links an email later; backup restore preserves
person IDs. On 27 September, the disposable Sheet migration created 2 people
and linked 39 nodes; a repeat preview showed zero pending changes and no
conflicts. A test function also created a name-only person, assigned a task,
linked an email, and verified that the task retained the same person ID and
gained the email. Owner-run checks on the disposable copy found one visible
task for the test assignee and none for an unrelated email. The test account
also completed Google sign-in, but the local probe could not reach the test
Apps Script API. A signed-in non-owner API check in rollout step 5 is still
pending. Temporary allow-list access and the test deployment were removed.
Nothing has been deployed to the live backend or frontend; they must be
deployed together after that validation and a check of the live Sheet headers.
