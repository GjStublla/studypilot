# StudyPilot Grok 4.6 Handoff

**Date:** 2026-08-24
**Purpose:** Continue the UEP judging-readiness remediation without treating passing local checks as proof of deployment, pilot impact, or ceremony readiness.

## What the judging PDF requires

The attached UEP criteria are evaluation criteria, not extra user instructions. The pre-pitch half scores solution design, features, technology choices, implementation/execution, code quality, tool application, and mentor-evaluated collaboration. The ceremony half scores impact/innovation, market relevance, effectiveness, UX/usability, working demo, and communication (including confidence and answers to questions).

The implementation objective is therefore: make the product demonstrably reliable and truthful, then produce evidence and a two-minute demo that maps directly to every weighted criterion.

## Repositories and current commits

- Web/dashboard/API/Supabase: `C:\Users\gjins\Desktop\studypilot`
- Canonical Chrome extension: `C:\Users\gjins\Desktop\studypilot-extension`
- Preserve the untracked web `output/` directory and the existing formal plan.
- Web remediation commits include `23ab897` (dashboard chat/session/rubric/context extraction), `60fdd2b` (shell and low-coupling view extraction), `7529dd3` (release/database verification repair), `2ce5667` (implementation log), `281dafa` (explicit dashboard bootstrap request state), `078cb9b` (typed Supabase adapters and realtime payload boundaries), `9dd63b2` (centralized idle/loading/success/error bootstrap state), `d2cf801` (per-session transcript request state and retry UI), `a989db6` (stale transcript response guards), `6814cc5` (chat-list request state and dashboard async lifecycle guards), `431533f` (versioned rubric-index retry state), and `a667fff` (chat-stream unmount cleanup).
- Extension remediation commits include `d9f9fb1` (remove unreachable browser AI/mock/voice paths), `e281450` (split Supabase facade), `279e91f` (extract pure panel components), `c295320` (live-state derivation and listener cleanup), `5ea85a0` (history secret-scan CI), `818a500` (live coaching hook), `d9ff60d` (pure chat selection/presentation state), `1b33f60` (quick-actions component), `7a7051c` (invalid idle pause prevention), `f19a8ec` (dashboard workspace hook, fallback hardening, rapid-toggle and narrow-viewport E2E), `da2dfb0` (panel shell/header composition), `53a3715` (typed shared-chat switcher), `a5d6687` (isolated context/privacy settings), `dfd0e14` (save-queue concurrency/error characterization), `206da8d` (study-mode panel composition), `31dbe0d` (isolated workspace auth parsing), `7283a69` (answer-card panel composition), `29d5731` (mounted/latest-response guards for workspace async work), `4ffdc79` (composer panel composition), and `e68730a` (voice-dock composition). The extension worktree is clean at this handoff.

## Verified evidence

Web:

- Vitest: 16 files / 94 tests.
- FastAPI pytest: 25 tests.
- Supabase local pgTAP: 5 files / 287 tests after a clean reset.
- Production build with approved public HTTPS placeholders: passed.
- `node scripts/verify-built-env.mjs dist`: passed.
- Supabase local lint: exit 0; one pre-existing unused-local warning remains.
- `npm run verify:release` with approved public placeholders: web tests/build/built-env passed; hosted allowlist explicitly skipped because `SUPABASE_ACCESS_TOKEN` is absent.

Extension:

- Typecheck: passed.
- Vitest: 16 files / 74 tests.
- Production build: passed.
- Manifest validator: passed; no named microphone permission, no loopback production hosts, offscreen `USER_MEDIA` reason present.
- Unpacked Playwright: 10/10 passed after the workspace extraction, including rapid open/close with page-error/console-error assertions and settled 360×640 / 390×700 viewport checks for quick-action labels and horizontal overflow. The microphone-denial test has passed in repeated isolated and full-suite runs.
- `npm ls @google/generative-ai --depth=0`: empty; source and built bundle contain no `VITE_GEMINI_API_KEY`, `GoogleGenerativeAI`, or `@google/generative-ai`.

## Highest-priority remaining work

### P0 — human/external release gates

1. Human owner rotates the historically tracked Google service-account key if it was ever valid.
2. Human owner approves any history rewrite and protected-branch force-push; the agent must not do this autonomously.
3. Supply real production public build values and run the hosted Edge Function allowlist check. Record a visible skip when secrets are absent.
4. Configure branch protection so non-secret CI jobs are required. Keep hosted checks and production smoke tests protected by environment secrets.

### P1 — dashboard maintainability and release confidence

1. Keep `Dashboard.tsx` orchestration-only and reduce it below the plan's 1,000-line target. It is currently about 1,303 lines after the request-state guards; the exact next boundaries are CSS splitting and any remaining orchestration-only helpers.
2. Add explicit request-state unions for the remaining dashboard fetches and add stale-promise/unmount cleanup tests; `DashboardBootstrapState` now centralizes `idle | loading | success | error` in `9dd63b2`, `d2cf801` applies the same state boundary to per-session transcript loading/error/retry, `a989db6` ignores superseded/unmounted transcript responses, `6814cc5` applies the boundary to chat-list refreshes and common realtime/session fallbacks, `431533f` versions rubric-index retries, and `a667fff` prevents late chat-stream dispatches after dashboard unmount. CSS splitting and the deterministic web Playwright golden flow remain open.
3. Split `Dashboard.css` into shell, chat, and content-view styles without changing selector scope or visual behavior.
4. Add the deterministic web Playwright golden flow: upload/select rubric, grounded prompt, Socratic follow-up, action item, reload, and verify the same chat.
5. Finish explicit named prop interfaces in `dashboard-types.ts`; do not add `any`, `@ts-ignore`, or lint suppressions.

### P1 — extension maintainability and narrow-width UX

1. Expand characterization tests for the remaining workspace hook orchestration and invalid live-control combinations. The workspace auth boundary is now covered by `31dbe0d`; save queue concurrency/error cleanup is covered by `dfd0e14`; Live start/pause/resume/stop now live in `useLiveCoaching.ts`; pure derivation, chat reconciliation, listener cleanup, and mounted/latest-response guards are covered by `c295320`, `d9ff60d`, and `29d5731`.
2. Continue focused body composition from `FloatingStudyPilot.tsx`; `useDashboardWorkspace.ts`, `QuickActions.tsx`, `ExtensionPanel.tsx`, `ChatSwitcher.tsx`, `ContextSettings.tsx`, `StudyModePanel.tsx`, `AnswerCardPanel.tsx`, `ComposerPanel.tsx`, and `VoiceDock.tsx` are now extracted. The remaining parent is approximately 1,857 lines and still owns the main body render composition.
3. Keep live transitions explicit (`idle | starting | live | paused | stopping | error`) and make invalid control combinations unrenderable.
4. Add 360x640 and 390x700 screenshots/E2E checks for fully visible quick actions, no header overlap, no horizontal scroll, and no duplicate listeners after rapid open/close.
5. Keep `studypilotSupabase.ts` as the public facade; its auth/chat modules now exist and must retain the current tests. Extension-specific history secret scanning is now in CI; branch protection remains an admin gate.

### P2 — judging evidence and polish

1. Run axe checks and Lighthouse medians for landing, auth, and dashboard; fix serious/critical accessibility issues and contrast/focus defects.
2. Add canonical metadata, valid `robots.txt`, sitemap, and accurate claims across website, extension, README, report, and pitch.
3. Write the architecture ADR and left-to-right system diagram showing browser clients, FastAPI CRUD, Supabase Auth/Realtime/Edge, Postgres/Storage, and Vertex AI.
4. Run the 10–15 participant protocol with anonymous metrics; report limitations and never claim causal learning improvement without evidence.
5. Complete the final report in the PDF's exact section order, submission checklist, time-coded demo script, backup recording, and text-input fallback.

## Required execution discipline for Grok

- Before each phase, run `git status --short`, `git diff --stat`, and `git diff --cached --stat` in both repositories.
- Work one phase at a time; add tests with behavior changes; commit each completed phase separately.
- Never print or commit secrets, service-account JSON, `.env` contents, access tokens, or service-role keys.
- Do not rewrite history, rotate credentials, deploy, change DNS, publish the extension, invite pilots, or alter branch protection without explicit human approval.
- Treat skipped hosted checks as skipped, not passed. Record the exact command and missing secret.
- After every phase, run the smallest relevant targeted checks, then the full suite/build before claiming the phase complete.

## Handoff exit condition

The work is ready for UEP submission only when every open checklist item has an owner and evidence, the deployed golden flow works twice from a clean Chrome profile, the report and pitch use the same capability/privacy claims, and all human/external gates are explicitly signed off.
