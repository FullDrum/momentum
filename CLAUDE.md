# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Background & intent

Momentum is a personal task and project management PWA built by **Nikita** (timezone Pacific/Auckland). It is a **hierarchical outliner**: nodes can be tasks or sections, infinitely nestable, with assignment, sharing, drag-and-drop reordering, and date scheduling. Four views: **Today**, **All Tasks**, **Projects (tree)**, **Assigned to Me**.

Distinguishing design choices vs. a generic todo app:
- Tree-first data model — every node has a `parentId`; sections and tasks are the same shape with an `isSection` flag.
- Local-first with background sync — mutations never block the UI (see sync engine below).
- Multi-user with per-node ownership, assignment, and email-based sharing — not a single-user app.
- Single-file PWA so it installs cleanly on mobile/desktop with zero build tooling.

## Live system reference

| Thing | Value |
|---|---|
| Production URL | https://momentum.nikita-da2.workers.dev |
| GitHub repo | https://github.com/FullDrum/momentum |
| Hosting | Cloudflare Pages/Workers — auto-deploys on push to `main` (~30s) |
| Apps Script Web App | https://script.google.com/macros/s/AKfycbweX3x7fglJ-R78DROUj4DPfqWfw9SosOqPX4htozEAcIPEvS3o5U52cL8WGGAsSzaH/exec |
| Apps Script deploy config | Execute as: Me, Access: Anyone |
| Google Sheet ID | `1XqHdX2tFwJ18XpC8lUzAZ_FXoOFkIkttWOA3RYWmSAA` |
| Sheet tab `nodes` columns | id, name, parentId, isSection, done, date, order, owner, assignedTo, assignedBy, sharedWith, completedDate |
| Sheet tab `users` columns | email, name, addedDate |
| OAuth Client ID | `751338704263-1iso4ep0be9brhic463uc4ogkst6en2g.apps.googleusercontent.com` |
| Whitelist | Apps Script Script Property `whitelist` (comma-separated emails); sheet owner is always allowed |

## Deploy workflow (deploy.py)

The repo has no CI; deploys happen via a local Python watcher that **Nikita runs in the background**:

- `deploy.py` lives at `G:\My Drive\Programming and SQL\Claude\deploy.py` (local only, not in this repo).
- It watches `C:\Users\Lab\Downloads`. Save `index.html` there → pushed to GitHub → Cloudflare redeploys in ~30s. Save `Code.gs` there → pushed to the Apps Script project and a new version is deployed.
- To run it: `cd "G:\My Drive\Programming and SQL\Claude"` then `python deploy.py`.

This is why `git log` is dominated by `Auto-deploy: index.html at HH:MM:SS` commits — each is one save-to-Downloads event, not a meaningful unit of work. **Read diffs, not messages.**

`Code.gs` (the Apps Script source) is **not in this repo** — it's edited in the Apps Script online editor and deployed via the same watcher when exported to Downloads.

## Project shape

Momentum is a **single-file installable PWA** task manager. The entire app — markup, styles, and ~4500 lines of vanilla JS — lives in `index.html`. Supporting files:

- `manifest.json`, `icon-192.png`, `icon-512.png` — PWA manifest + icons
- `sw.js` — service worker. Deliberately a pass-through with no caching; cross-origin requests (Apps Script, Google APIs) are returned to the browser so redirects and CORS aren't broken.

There is no build step, no package manager, no tests, no linter, no framework. Edit `index.html` and reload.

The backend is a **Google Apps Script Web App** bound to a Google Sheet (URL hard-coded as `APPS_SCRIPT_URL` near `index.html:812`). The source for that Apps Script is **not in this repo** — it lives in the linked Apps Script project. Any reference to `gsr('fnName', arg)` is an RPC into that script (`whoAmI`, `getInitialData`, `batchOps`, `getTeamMembers`, etc.). Auth is Google OAuth via GSI; the access token is sent in the request body, not as a header.

## Deployment

The `Auto-deploy: index.html at HH:MM:SS` commits dominating `git log` come from an external process (not a workflow in this repo) that pushes `index.html` from somewhere else. **Do not assume each commit is meaningful** — many are auto-saves. When investigating history, look at the *diff*, not the message.

The remote is `https://github.com/FullDrum/momentum.git`. The site is served from `main` (presumably via GitHub Pages or similar) — pushing to `main` is effectively deploying to production. Confirm before pushing.

## Architecture: the parts that need reading multiple sections to understand

### Local-first sync engine (`index.html:465–729`)
The big idea: **local `nodes[]` is the source of truth**, and all mutations go through a persisted queue that batches to the server in the background.

- `queueState = { saves, deletes }` lives in `localStorage` under `momentum_pending_queue`. Survives reload, crash, sign-out, sign-in.
- Every mutation calls `queueSave(node)` or `queueDelete(id)`, which arms a debounced flush (`FLUSH_DEBOUNCE_MS = 1500`). One batch in flight at a time; subsequent mutations queue for the next batch.
- `flushBatch()` ships one `batchOps` RPC with all pending saves and deletes. Per-item failures are re-queued; whole-request failures trigger exponential backoff (1.5s → 30s cap).
- `batchGeneration` is bumped on undo/redo so in-flight batches representing stale state don't clobber the queue when they return.
- `nodeTouched[id]` records the last-edit timestamp. `fetchAll(initial=false)` reconciles server state with local, **refusing to overwrite** any node that (a) has a pending save/delete, (b) was touched in the last `TOUCHED_WINDOW_MS = 5000`, or (c) is the currently-focused textarea.
- Legacy aliases (`pendingSave`, `scheduleSave`, `deleteRemote`, `opGeneration`, `opQueueDepth`) point at the new engine so old call sites keep working — don't "clean these up" without checking call sites.

When changing sync behavior, also update the unsaved-changes banner logic (`updateQueueBanner`) and the visibility-change / `beforeunload` / `pagehide` handlers near the bottom of the file, which all try to flush before the tab dies.

### Auth (`index.html:815–944`)
Google Identity Services token client. Two modes: interactive `signInWithGoogle()` and silent `silentRefreshToken()` (uses `prompt: 'none'` + `login_hint`). `silentRefreshWithRetry` retries transient failures but short-circuits on `interaction_required` / `consent_required` / `login_required` (marked `.fatal`). `gsr()` transparently attempts a silent refresh on `Unauthorized` and retries the original call.

### Data model
A node has roughly: `{ id, name, parentId, isSection, done, date, completedDate, order, owner, assignedTo, readOnlyContext }`. IDs prefixed with `_` are client-generated and haven't been persisted yet (`newId()`). The tree is flat with `parentId` pointers; `children()` / `descendants()` / `ancestors()` reconstruct it. `order` controls sibling ordering (see `orderBetween`).

Edit permissions: `isOwner(n)` (unowned or owner==currentUser) and `canEdit(n)` = `!readOnlyContext && (owner || assignedTo == currentUser)`. `sharedWith` is a comma-separated list of emails granting read/write to a node and its descendants. `assignedTo` + `assignedBy` track delegation. Ancestor nodes of visible-but-not-owned nodes are shown greyed-out as `readOnlyContext`.

### Views (`activeTab`)
`today`, `all`, `tree`, `assigned` — `visibleList()` produces the flat row list for the active tab. The `tree` tab also supports zoom-in via `zoomedId`. The `today`/`all`/`assigned` views render matched tasks plus their child subtree, deduplicated by `seen` set.

### Undo/redo (`index.html:3771–~3950`)
Snapshots whole `nodes` and `collapsed` state. On undo: bumps `batchGeneration`, **drops the pending queue** (since it reflects pre-undo state), diffs old vs. new node sets, and re-queues the deltas as saves/deletes. Call `pushUndo()` *before* mutating state.

### Mobile
A separate set of touch handlers + a bottom nav + a keyboard accessory bar (`.kb-bar`) are activated by `applyMobileStyles()` / `checkMobile()`. The `.is-mobile` body class gates a lot of CSS. There is no responsive media-query split — desktop vs. mobile is decided in JS and re-checked on resize.

## Conventions worth knowing

- **Vanilla JS, ES5-flavoured.** `var`, `function`, no modules. Arrow functions appear but the dominant style is `function(){}`. Match it.
- **`[MOM ...]` console logs.** `mlog` / `mwarn` / `merror` prefix every log so you can filter the console for `MOM`. Use them for any new diagnostics.
- **One file.** Resist the urge to split into modules — there is no bundler. Group related code with the `// ── Section ─` banner comments.
- **Don't add caching to the service worker.** The comment in `sw.js` explains why: caching breaks the Apps Script redirect/CORS dance.
- **Hard-coded backend URL and OAuth client ID** live near `index.html:812`. Changing them is a deployment-level change, not a code change.

## Planned feature: Done & Watch

A task can be marked **done + watching** — done from my side, but I still want to see it (e.g. delegated work where my part is finished, but I want to know when the assignee actually closes it, or it gets edited).

**Data model**
- Add a `watching` boolean to nodes. New column in the `nodes` sheet; `Code.gs` (Apps Script — not in this repo) needs to read/write it.

**Marking**
- Two buttons per task: `✓ Done` (normal) and `👁 Done & Watch` (sets `done=true, watching=true`).
- Keyboard shortcut for each (TBD — propose `Cmd+Enter` for Done, `Cmd+Shift+Enter` for Done & Watch; confirm with Nikita).

**Display**
- **Tree (Projects):** watched-done tasks **always visible** regardless of Hide Done. Rendered with **strikethrough** styling.
- **Today + All Tasks:** watched-done tasks live in a collapsed `▸ Watching (n)` section pinned to the bottom of the list.

**Change bubble-up**
- A "change" = (a) edit by anyone other than the current user, or (b) the assignee marks the underlying task actually-done.
- When a watched task has unacknowledged changes, it **moves out of the Watching section into the main Today list**, with an inline badge describing the change (e.g. `[edited by Sam · 2h]`, `[✓ marked done by Jess]`).
- Acknowledgement is **explicit** — user clicks the badge (or a × on it) to clear. Implicit acknowledgement (open/expand the task) does NOT clear the badge.
- Acknowledgement state is **per-user and local-only** — stored in `localStorage`, not synced to the sheet. Suggested key: `momentum_watch_ack` → `{ [nodeId]: lastSeenChangeTimestamp }`.

**Not doing**
- No auto-graduation. Watches persist until manually un-watched, even after the underlying task is actually-done.
- No notification system beyond the in-app badge.

**Build order suggested**
1. Sheet column + `Code.gs` round-trip for the `watching` field.
2. `index.html` data model + the two Done buttons (no view changes yet).
3. Tree rendering: strikethrough + ignore Hide Done for watched-done.
4. Today/All Tasks: Watching section at bottom.
5. Change detection + badge + explicit acknowledge in localStorage.
6. Keyboard shortcuts.

## Key features (user-visible)

- Hierarchical tree of nodes, infinitely nestable; sections and tasks share one shape.
- Four tabs: Today, All Tasks, Projects (tree), Assigned to Me.
- Keyboard shortcuts: `Enter` (new node), `Tab` / `Shift+Tab` (indent/outdent), `Cmd+Shift+S` (toggle section), `Cmd+Shift+X` (promote to today), `Cmd+Z` (undo), `Alt+←` (back).
- Drag-and-drop reordering with multi-select.
- Zoom in to any node to focus on a subtree (tree view, `zoomedId`).
- Assign tasks to team members from the `users` sheet; share nodes by email.
- Hide-done toggle.
- Undo/redo, up to 30 steps, client-side.
- Auto-save via debounced serialised queue (see sync engine).
- Dark mode via `prefers-color-scheme`.
- 30-second background refresh when idle.
