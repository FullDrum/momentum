# Momentum agent: maintainability-first design

## Principle
The agent reduces task-management effort; it must not create a second task system.

## Single source of truth
- Momentum task IDs, titles, completion and primary parent remain authoritative in Momentum.
- Extra relationship records reference task IDs, never duplicate task text.
- Archived voice transcripts and reviewed memory are supplementary, not competing task databases.
- A relationship is useful only if it answers a concrete planning question.

## Three distinct concepts
1. **Parent:** one structural parent; no cycles.
2. **Relationship:** optional cross-project reference with a type and evidence.
3. **Alternative:** mutually exclusive *approaches* to a goal, not a claim that two tasks are duplicates.

## Safe agent workflow
1. Read the current tasks and context.
2. Generate a proposal with task IDs, before/after parent IDs, reason and confidence.
3. Show a human-readable diff. Group bulk edits into one review.
4. Request explicit approval before any write.
5. Re-read fresh revisions immediately before writes; reject stale plans.
6. Log approved operations and results for audit/undo planning.
7. If an operation partially fails, stop and report exactly what changed.

## Complexity budget
- No automatic links inferred solely from similar titles.
- No auto-moves without explicit confirmation.
- No background graph reshuffling.
- Avoid linking every task to every related task.
- Prefer a small number of useful relations per project; this is guidance, not a hard cap.
- Review and prune links that no longer help a decision.

## Integration
Bobik and the Momentum agent should exchange task IDs, proposals and results through a documented interface. They should not rely on one another's hidden chat context as a data store. A ChatGPT dot cannot be assumed to call the app directly; the bridge is not implemented.

## Current implementation limits
The development milestone now shares capture and structure logic between the task panel and a synthetic sandbox. The sandbox persists reviewed moves and links locally; the regular app previews structure and stores browser-local captures without server calls. Keyword suggestions are explainable and never apply changes automatically. AI inference, a direct Bobik channel, voice-command parsing and production integration remain unimplemented. Server-side task memory and transcript archive require disposable staging setup and testing. See `DEVELOPMENT_MILESTONE.md` for implementation, test results and boundaries.

## Acceptance scenarios
- Ten Canadian freight replies can be proposed as children or related records under the decanter import goal, without duplicating them.
- A container-purchase task can support two projects without acquiring two parents.
- Moving a task under its descendant is rejected.
- The user can inspect a proposed bulk reorganization and approve or reject it.
- The agent can explain *why* each link or move was suggested.
