# Momentum Next — AI, voice and compact-chat status

1 November 2026 · Pacific/Auckland

**Private staging:** https://momentum-next-staging-nikita.workspace-755223.chatgpt.site

**Version 4 deployed successfully. Real OpenAI AI/voice are still not connected.** The directory confirms OpenAI Developers is not installed; this session has no OpenAI tools/skills, the cloud environment has no provider credentials, and the Site has no runtime variables (`OPENAI_API_KEY` is absent; environment revision 0). This deployment completes the independent UI/context/review changes and does not claim a live-provider test.

## Function status

| Function | Current status |
| --- | --- |
| Original outliner, Today, indentation, task editing, undo/redo and navigation | Preserved; automated regression tests pass. |
| Persistent task conversations, including blank task IDs and page reload | Implemented and verified with the real staging API code/SQLite in browser integration tests across two sessions. Hosted user sign-in/API testing remains manual. |
| Compact task panel | Implemented: two recent messages, a single input/microphone/send row, close, and collapsed History/Suggestions. No repeated explanatory paragraphs in the normal panel. |
| Android keyboard layout | Viewport emulation tests pass for open/closed keyboard, visible native controls, add-task action, and composer visibility. No physical Android IME test was possible. |
| AI context | Server adapter now explicitly includes the selected task, root-to-parent ancestor path, recent selected-task conversation, legacy notes and bounded nearby tasks. Verified with mocked provider requests, including ancestors beyond the former task-list prefix. |
| Real AI replies | Requires OpenAI key configuration; not live-tested or enabled. The compact UI reports AI off and retains real text history. |
| Voice transcription | Native recording + server-only OpenAI transcription is implemented and regression-tested with synthetic audio/mocked responses. The server omits language for automatic detection and applies only a final transcript. Real Russian/English/mixed-language recognition remains unverified and blocked by the missing key. |
| Titles for empty tasks | Provider schema, confidence/evidence validation, server preview and explicit approval implemented and tested. A title changes neither ID nor parent/history. Actual model-generated titles require the provider connection. |
| Hierarchy suggestions | Explicit preview/approval remains mandatory. Matching subtask titles are rejected to avoid redundant task creation. |
| Production | Not modified, accessed, merged or deployed. Same isolated Site and D1 storage; owner-private access remains one owner and zero groups. |

## Changes in this version

The AI adapter no longer relies on the first 200 task rows to convey parent context. It walks the selected task's ancestors explicitly, excludes conversations belonging to other tasks, incorporates up to four selected-task legacy notes and 16 recent task messages, and omits failed assistant responses. Context is bounded: at most 32 ancestors (root and nearest parents for deep chains) and 20 nearby tasks. The model is asked to answer concisely in the conversation's language, prefer useful discussion and existing tasks, and avoid speculative task proliferation.

The schema supports a short `title` suggestion. The server rejects title suggestions for non-empty tasks, low confidence, insufficient user evidence, generic New task placeholders and overlong titles. Insufficient information keeps the stored title empty and the UI placeholder unchanged. Preview and explicit approval are required; a stale review or a title entered by another device prevents overwrite. Subtask proposals also check for an existing matching child. Duplicate candidates and next actions remain review/discussion items, never automatic merges.

The panel now has one composer row and two recent messages. Earlier history, provider information and advanced suggestions stay collapsed. A mobile screenshot check exposed an overlap between the floating Add button and Send after history loaded. The fix relocates the existing Add control to the toolbar while chat is open and rechecks composer visibility after loading messages. Closing chat restores its native floating position. The above-keyboard accessory Add remains available. Navigation is also asserted to remain inside the visual viewport.

## Required configuration — exact next step

Install **OpenAI Developers**, then use its supported API-key workflow to configure the isolated Site's server runtime secret **`OPENAI_API_KEY`**. Never put the key in chat text, browser code, Git or the hosting manifest. Publish a saved version after setting the runtime secret to apply its environment revision. Optional server values are `OPENAI_MODEL` (default `gpt-4.1-mini`) and `OPENAI_TRANSCRIPTION_MODEL` (default `gpt-4o-mini-transcribe`).

After connection, run a disposable staging conversation and actual microphone requests before marking AI/voice fully working. No credential was invented, extracted from another service or silently substituted. The OpenAI Developers installation suggestion is available; its individual connection is not yet confirmed.

## Automated results

- Node 22.23.4: **14 test files passed, 0 failed**, including new explicit ancestor-context, reviewed-title, insufficient-information and duplicate-subtask cases.
- Original-outliner desktop/Pixel 7 viewport integration passed: Today creation, Enter/Tab/Shift+Tab, completion, undo/redo, collapse, task editing, stable conversation IDs, two-session persistence, blank task reload/offline recovery, approved title with no extra node, collapsed advanced UI and keyboard viewport behavior.
- Native recording/final transcript tests and server transcription authorization/language-configuration tests pass using mocked audio/provider responses. No real audio recognition was exercised.
- Canonical shell/PWA tests passed; cache version is v42. Syntax, build artifact, canonical snapshot and whitespace checks passed. Production Apps Script source, root Wrangler configuration and SQL migrations were unchanged.
- Native Sites tools confirm successful version 4 deployment and unchanged private access. No physical phone or connected local browser is available. The execution environment's previously denied live-site egress remains a verification limitation; native publication success is not a completed phone/sign-in test.

See `AI_VOICE_COMPACT_TEST_RESULTS.txt` for captured results and `staging/README.md` for architecture and the phone checklist.

## Manual acceptance still incomplete

On Android Chrome, sign in with the same ChatGPT account/workspace. Verify task editing, mobile navigation, keyboard-open/closed controls and the compact composer. After configuring OpenAI, grant/deny/re-enable microphone permission and test separate Russian, English and mixed-language clips. Confirm one final transcription, explicit Send, no duplicated fragments and clear offline/provider-failure recovery.

For an empty task, provide a clear goal and review a proposed title without applying it. Confirm it remains New task until approval, keeps its ID/history after approval and reload, and creates no extra nodes. Give insufficient information and confirm it asks a short question while retaining New task. Verify that parent context is understood and no hierarchy change occurs before approval.

## Provenance

- Development branch: `dev/voice-capture-structure-milestone`, continued from `f9d7804`.
- Site: `appgprj_6ae55c4f17648191adfc942931ac6e09`.
- Hosted source: `99413964565cc9fe5d13a38fa5219a12367e621f` in its dedicated staging repository.
- Version 4: `appgprj_6ae55c4f17648191adfc942931ac6e09~appgver_4e136aa4b5ec81919e4ac38f7faeaf86`.
- Deployment: `appgdep_6ae667fd435c8191a606523084659692` — succeeded, environment revision 0.

The platform's publish operation updates this isolated staging Site, not Momentum production.
