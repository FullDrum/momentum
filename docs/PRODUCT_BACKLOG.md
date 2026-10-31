# Momentum product requirements and phased backlog

Updated 2026-10-31 from user discussion. This is a design backlog, not a claim of implemented functionality.

## Operating model
Momentum supports variable daily priorities in a waste-processing business. Incoming materials, volumes, qualities and equipment constraints change daily. A persistent pool of goals/tasks coexists with a short daily working list. Unfinished work remains in the pool and may be rescheduled; a focus day is not a hard deadline.

## Near-term priorities
1. **Fast capture:** create a note/task by text or voice without browsing the tree first. AI later proposes existing-task match, parent goal, duplicates and next actions; save first, organize later.
2. **Structure and dependencies:** one primary parent per task, optional cross-project links, blockers and alternatives. Support drag-and-drop and natural-language restructuring with human-reviewed previews. No destructive auto-merges.
3. **Agent review session:** on request, surface a small number of high-leverage questions, missing prerequisites, duplicate candidates and blockers; allow review in batches.
4. **Task photos:** attach one or more photographs to a task, show thumbnail and full-size view, with clear instructions for workers who have limited English. Requirements: upload from phone camera or gallery, captions optional, safe access controls, storage quotas, offline behavior, deletion policy, and no public image URLs by default. Prototype independently before production storage integration.

## Later: assignment and sharing (defer)
- Share Momentum with selected staff, grant role-based access and assign accountable owners.
- Each worker sees a small actionable list, not the entire backlog or speculative ideas.
- Owner/manager can reprioritize each worker's daily focus as conditions change.
- Persistent project plan remains intact despite daily interruptions.
- Separate manager-only ideas, planned work, ready-to-do work, and today's assignments.
- Review permissions, privacy, notifications and conflict resolution before rollout.

## Design constraints
- Priorities are dynamic; avoid treating all tasks as fixed ranked items.
- Show workers only relevant and actionable tasks.
- Use photos where they convey location, object or required action better than text.
- Avoid over-expanding task trees: decompose only when a blocker, owner or concrete action requires it.
- Keep AI proposals explainable and require confirmation for structural or bulk changes.
- Distinguish completed tasks, deferred tasks, and unverified ideas.

## Not yet built
Production photo storage; worker sharing/permissions UX; per-person priority queues; AI orchestration; drag-and-drop in production; full cross-project dependency planner.

## Development milestone — 31 October 2026

Implemented on `dev/voice-capture-structure-milestone`: recoverable browser-local voice/text capture, explainable keyword suggestions, and shared reviewed structure logic in a synthetic sandbox. Capture and structure have Node and Chromium tests. Regular application capture does not call the backend; task creation and applied moves/links are sandbox-only. See `DEVELOPMENT_MILESTONE.md` for validation and next steps. Remaining priorities above still require staging integrations before production rollout.

## Private staging milestone — 31 October 2026

Implemented on `dev/voice-capture-structure-milestone`: owner-private HTTPS staging, separate D1 storage, cross-session saved captures, server-reviewed structure writes and automated mobile permission/fallback tests. No Google or production data integration. Physical Android microphone and signed-in live-site tests remain pending. See `STAGING_REPORT.md`.

## Architectural correction — outliner-first staging

The existing Momentum outliner is the product foundation. The standalone staging capture dashboard is removed. Contextual voice/text panels now sit under existing task rows, with persistent ID-bound history and reviewed changes. Preserve native Today/hierarchy/keyboard/mobile workflows. Provider credentials and physical Android verification remain prerequisites for live AI/audio acceptance. See `OUTLINER_STAGING_REPORT.md`.

## Blank-task, audio and keyboard correction

Staging retains untitled task IDs through blur, queue/reload and conversation recovery; the UI uses a New task placeholder. The normal conversation panel is compact, language selection is removed, and recorded clips use a server-only OpenAI transcription adapter with automatic language detection. Mobile viewport handling keeps editing controls above the keyboard. See `BLANK_AUDIO_MOBILE_REPORT.md` for results and the provider/physical-device blockers.
