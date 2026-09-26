# Momentum project guide

Momentum is Nikita's collaborative task and project outliner (Pacific/Auckland). Tasks and sections form one arbitrarily nested tree. The four views are Today, All Tasks, Projects, and Assigned to Me. The same nodes appear across views; Today and All Tasks are projections of the tree, not separate lists.

## Project and deployment

- `index.html` contains the page markup and loads `styles.css`, `core.js`, then `app.js`. There is no build step or framework.
- `core.js` contains reusable data, queue, backup, and text-rendering helpers. `app.js` contains state, sync, auth, views, and interactions.
- `sw.js` caches same-origin app assets for offline use. Cross-origin Google and Apps Script requests pass through to the browser.
- `manifest.json` and the PNG icons support installation as a PWA.
- `tests/*.test.js` contains Node tests. Run `node --test tests/*.test.js` or `npm test`. `.github/workflows/test.yml` runs `npm test` on pushes to `main` and pull requests, using Node 22.
- The repository is `https://github.com/FullDrum/momentum`. The production site is `https://momentum.nikita-da2.workers.dev`. Pushing to `main` is a production deployment through Cloudflare; run tests before pushing and verify the backend when a change depends on it.
- The Google Apps Script backend source (`Code.gs`) is outside this repository. Frontend tests cannot verify backend behavior. The active endpoint and OAuth client ID are configured near the auth code in `app.js`.
- An older local `deploy.py` watcher may also publish files through GitHub/Apps Script. Its presence and state are outside this repository; check it before using that route.

## Tree and date behavior

- Each node has a `parentId`; sections and tasks share the same shape. The `nodes` array preserves tree order, and `order` is used when saving/reordering. `children()`, `descendants()`, and `ancestors()` in `app.js` navigate the tree.
- Projects shows the tree. Today selects tasks scheduled for the local day, then shows their child subtree as a block even when a child has another date. All Tasks shows task subtrees grouped under the date of each displayed root task. Assigned to Me is a filtered view.
- This is intentional: a child is normally a step of its parent and stays visible when the parent is the focus for Today. Choosing Today on a parent calls `setTaskToday()` and moves the whole subtree to today. Choosing Today on an individual child can surface that child separately.
- In Today and All Tasks, Enter on a task makes a sibling after its subtree; Tab nests a task under a neighboring task; Shift+Tab moves it out. Drag and drop can reorder or nest. The related workflow tests are in `tests/tree.test.js`.
- Current implementation detail: Tab in Today/All Tasks aligns the indented task's date with its new parent. Enter on a top-level task in these views creates a sibling dated now; Enter on a child inherits its parent date. Keep these rules in mind when changing date or outline behavior.

## Sync and accounts

- Local `nodes[]` is the immediate UI state. Mutations enter a per-account queue persisted in `localStorage`; `flushBatch()` sends one `batchOps` request at a time after a short debounce. Failed or unacknowledged operations remain queued and retry with backoff.
- `fetchAll()` overlays pending local work on fetched data. Undo/redo preserves unrelated pending work. Account switching waits for pending work and avoids replaying one user's queue into another account.
- `gsr()` calls the Apps Script endpoint. Google Identity Services provides explicit interactive sign-in. After sign-in, the app prefers a durable Momentum session token if the backend issues one. It does not silently request a new Google access token.
- Backend acknowledgement and retry behavior matter for data safety. Read `RELIABILITY.md` before changing sync or deploying a sync change. Its backend findings are dated evidence, not a live health check.

## Permissions and Watch

- Nodes may have `owner`, `assignedTo`, `assignedBy`, and `sharedWith`. `canEdit()` checks ownership or assignment and rejects read-only context nodes. The backend must enforce permissions too.
- The Watch UI is implemented: tasks can be marked Done & Watch, watched tasks stay visible in Projects when Hide Done is on, and Today/All Tasks have Watching areas and visibility toggles. `watching` is normalized when data loads. Verify backend storage of that field separately because `Code.gs` is not in this repo.
- The earlier proposal for per-user change badges and explicit acknowledgement is not documented here as an existing feature; check actual code and backend before extending Watch.

## Working conventions

- Match the existing vanilla JavaScript style. Keep app behavior in `app.js` and reusable pure helpers in `core.js`; do not move it back into `index.html`.
- Use the `[MOM ...]` logging helpers for new diagnostics.
- Update or add focused tests for behavior changes. Run the Node suite before committing.
- Bump the cache name in `sw.js` when changing cached assets so installed clients receive the new version.
- Check the current Git diff and working tree before editing or deploying. Existing local changes may belong to another workflow.
