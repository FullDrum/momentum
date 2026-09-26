# Reliability changes

This change preserves pending operations until the backend acknowledges them,
including while a request is in flight. Recovery overlays pending saves and deletes
onto fetched data. Queues are stored per verified account; the legacy queue is
migrated only when its saved account can be identified. Unknown or malformed
recovery data is preserved rather than silently discarded.

Account switching waits for pending requests as well as pending operations. A
timeout keeps the current account and work in place. Undo/redo retains unrelated
unsaved operations and compares all persisted task fields (excluding the derived
`readOnlyContext` permission hint). Today refreshes in local time when the app is
activated and at most 30 seconds after midnight while visible.

## Validation

Run `npm test` (Node 22, matching CI). The reliability tests execute the actual
application functions with simulated storage, time and API responses. Rendering
is stubbed; these are not signed-in browser or live backend tests.

## Backend verification before a sync deployment

The Apps Script source is outside this repository. On 19 September 2026, read-only
inspection found that the then-active endpoint used version 292 and its Code.gs
matched the editor source at that time. This is historical evidence, not a check
of the currently deployed backend.

That source returned the required acknowledgement arrays and updated existing saves
by task ID. Repeated deletion of an absent ID succeeded. However, version 292
fabricated successful bulk-delete acknowledgements for permission-denied tasks.
A separate two-function backend replacement was prepared and tested locally.
Verify whether it was deployed before relying on the frontend acknowledgement
handling. No production backend or Sheet was modified during the 19 September review.

Confirm against a test Sheet before release:

- `batchOps` returns `results.saves` and `results.deletes` arrays containing an
  `{ id, ok: true }` acknowledgement per successful operation, and `{ id, error }` for
  failures. A missing acknowledgement leaves the operation pending.
- Retrying a save with the same task ID updates the same record; retrying a delete
  for an already deleted task succeeds. A connection can fail after the server
  applies a request, so replay must be idempotent.
- Edit during a slow save, reload during a save, undo during a save, and switch
  accounts while offline. Check the restored data after reconnecting.
- Verify the service worker activates the new cache/assets and that the Today
  view advances when returning to the app on the next local day.

This change does not provide server-side concurrent-edit conflict resolution or
cross-tab transaction locking. Those require separate backend/client coordination.
The backend source also has no write locking, so sequential replay support is not
a guarantee against simultaneous write races.
The UI feature proposals are not part of this reliability change.
