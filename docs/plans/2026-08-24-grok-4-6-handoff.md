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
- Web remediation commits include `23ab897` (dashboard chat/session/rubric/context extraction), `60fdd2b` (shell and low-coupling view extraction), `7529dd3` (release/database verification repair), and `2ce5667` (implementation log).
- Extension remediation commits include `d9f9fb1` (remove unreachable browser AI/mock/voice paths), `e281450` (split Supabase facade), and `279e91f` (extract pure panel components). The extension worktree is clean at this handoff.

## Verified evidence

Web:

- Vitest: 14 files / 85 tests.
- FastAPI pytest: 25 tests.
- Supabase local pgTAP: 5 files / 287 tests after a clean reset.
- Production build with approved public HTTPS placeholders: passed.
- `node scripts/verify-built-env.mjs dist`: passed.
- Supabase local lint: exit 0; one pre-existing unused-local warning remains.

Extension:

- Typecheck: passed.
- Vitest: 12 files / 58 tests.
- Production build: passed.
- Manifest validator: passed; no named microphone permission, no loopback production hosts, offscreen `USER_MEDIA` reason present.
- Unpacked Playwright: 8/8 passed after the latest extraction.
- `npm ls @google/generative-ai --depth=0`: empty; source and built bundle contain no `VITE_GEMINI_API_KEY`, `GoogleGenerativeAI`, or `@google/generative-ai`.

## Highest-priority remaining work

### P0 — human/external release gates

1. Human owner rotates the historically tracked Google service-account key if it was ever valid.
2. Human owner approves any history rewrite and protected-branch force-push; the agent must not do this autonomously.
3. Supply real production public build values and run the hosted Edge Function allowlist check. Record a visible skip when secrets are absent.
4. Configure branch protection so non-secret CI jobs are required. Keep hosted checks and production smoke tests protected by environment secrets.

### P1 — dashboard maintainability and release confidence

1. Keep `Dashboard.tsx` orchestration-only and reduce it below the plan's 1,000-line target. It is currently about 1,161 lines.
2. Replace boolean loading/error combinations with explicit request-state unions and add stale-promise/unmount cleanup tests.
3. Split `Dashboard.css` into shell, chat, and content-view styles without changing selector scope or visual behavior.
4. Add the deterministic web Playwright golden flow: upload/select rubric, grounded prompt, Socratic follow-up, action item, reload, and verify the same chat.
5. Finish explicit named prop interfaces in `dashboard-types.ts`; do not add `any`, `@ts-ignore`, or lint suppressions.

### P1 — extension maintainability and narrow-width UX

1. Add characterization tests for mount, chat reconciliation, save queue, live start/pause/resume/stop, and cleanup before moving logic.
2. Extract `useLiveCoaching.ts`, `useDashboardWorkspace.ts`, `ExtensionPanel.tsx`, `ContextSettings.tsx`, and `QuickActions.tsx` from `FloatingStudyPilot.tsx`.
3. Keep live transitions explicit (`idle | starting | live | paused | stopping | error`) and make invalid control combinations unrenderable.
4. Add 360x640 and 390x700 screenshots/E2E checks for fully visible quick actions, no header overlap, no horizontal scroll, and no duplicate listeners after rapid open/close.
5. Keep `studypilotSupabase.ts` as the public facade; its auth/chat modules now exist and must retain the current tests.

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
