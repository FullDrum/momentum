# Person identity migration

This is the implementation contract for roadmap item 2. The existing backend stores
`assignedTo`, `assignedBy`, `owner`, and `sharedWith` as email addresses. The current
team list is also keyed by email. A name-only assignment must not be written into
any of those email fields or used as an access grant.

## User behaviour

- The manager can create a person with a name and no email, then assign tasks to them.
- Those tasks appear in the manager's views under that person's name. They are not
  visible to any team account until an email is linked and authorised.
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
   configuration out of Git.
2. Add the people table and `assigneePersonId` column. Backfill one person for each
   unique legacy assignee email, reusing an existing team entry where possible.
   Normalise emails for matching, but keep the stored `assignedTo` unchanged until
   each row is linked. Log duplicate/conflicting email rows for manual resolution.
3. Deploy server reads that return both fields and server writes that accept either
   a legacy email or a person ID. Derive `assignedTo` and `sharedWith` on the server
   from the person record. Reject unknown IDs and duplicate email links.
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
