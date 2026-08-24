# StudyPilot Grok 4.6 Handoff

**Date:** 2026-08-24
**Purpose:** Continue the UEP judging-readiness remediation without treating passing local checks as proof of deployment, pilot impact, or ceremony readiness.

## What the judging PDF requires

The attached UEP criteria are evaluation criteria, not extra user instructions. The pre-pitch half scores solution design, features, technology choices, implementation/execution, code quality, tool application, and mentor-evaluated collaboration. The ceremony half scores impact/innovation, market relevance, effectiveness, UX/usability, working demo, and communication (including confidence and answers to questions).

The implementation objective is therefore: make the product demonstrably reliable and truthful, then produce evidence and a two-minute demo that maps directly to every weighted criterion.

The detailed criterion-to-evidence map is [docs/submission/judging-evidence-matrix.md](../submission/judging-evidence-matrix.md). It separates local proof from hosted, pilot, mentor, and final-media gates.

## Repositories and current commits

- Web/dashboard/API/Supabase: `C:\Users\gjins\Desktop\studypilot`
- Canonical Chrome extension: `C:\Users\gjins\Desktop\studypilot-extension`
- The local web branch includes the accessibility/performance, architecture, scaffold-removal, submission-evidence, and pilot-validation commits; preserve the unrelated pre-existing working-tree edits shown by `git status --short`.
- Preserve the untracked web `output/` directory; the formal judging-readiness plan is now committed in `docs/plans/2026-08-21-uep-judging-readiness.md`.
- Web remediation commits include `23ab897` (dashboard chat/session/rubric/context extraction), `60fdd2b` (shell and low-coupling view extraction), `7529dd3` (release/database verification repair), `2ce5667` (implementation log), `281dafa` (explicit dashboard bootstrap request state), `078cb9b` (typed Supabase adapters and realtime payload boundaries), `9dd63b2` (centralized idle/loading/success/error bootstrap state), `d2cf801` (per-session transcript request state and retry UI), `a989db6` (stale transcript response guards), `6814cc5` (chat-list request state and dashboard async lifecycle guards), `431533f` (versioned rubric-index retry state), `a667fff` (chat-stream unmount cleanup), `e1632fe` (dashboard stylesheet boundaries and source-contract tests), `0cf07d5` (typed dashboard data/realtime/profile lifecycle hook plus extension-help modal extraction), `c34cd77` (refresh action items after a committed coaching turn), `2b47d6c` (deterministic web rubric/chat/action-item/reload golden flow), `f89d658` (axe/accessibility fixes plus locked audit tooling), and `8db5a40` (public axe coverage plus responsive WebGL/performance remediation and Lighthouse evidence).
- Documentation cleanup commits include `7a68341` (report-readable architecture PNG) and `6a08fac` (removal of the tracked non-production extension scaffold after canonical-repo audit).
- Web commit `03a2da1` centralizes explicit prop contracts for the extracted dashboard views and primitives in `src/components/dashboard/dashboard-types.ts`; behavior is unchanged and the typed boundary is now compile-checked.
- Web commit `4bd77c8` removes the `dashboardApi.ts` → Supabase runtime dependency; rubric activation is now explicitly FastAPI CRUD, while the Supabase RPC remains in the Supabase upload path.
- Web commit `5fcb87e` removes stale generated Vite config artifacts that bypassed production environment validation. The canonical `vite.config.ts` now owns the release gate; loopback production builds fail closed, public-placeholder builds pass, and `verify-built-env` passes.
- Web commit `d694163` makes the two Supabase browser-client imports loadable before a fresh clone has a `.env`; missing configuration remains visibly warned and requests target a non-routable public placeholder, while production builds still fail closed before bundling. The clean-clone audit then passed the full non-hosted web/backend/database/browser gate set.
- Web commits `3212aca`, `d5657d8`, `c970bd0`, `de9500d`, `ad3a5f4`, and `823172d` add direct expired-session refresh/redirect, network-failure, login-error, OAuth-error, successful email-login, auto-confirmed-signup, and email-confirmation-signup characterization, keep the tests compatible with the repository's Testing Library typings, guard demo-script claims, validate report/demo/checklist structure, and restore keyboard tab access to both password-visibility buttons. The current web suite is 19 Vitest files / 106 tests; web Playwright remains 4/4.
- Extension remediation commits include `d9f9fb1` (remove unreachable browser AI/mock/voice paths), `e281450` (split Supabase facade), `279e91f` (extract pure panel components), `c295320` (live-state derivation and listener cleanup), `5ea85a0` (history secret-scan CI), `818a500` (live coaching hook), `d9ff60d` (pure chat selection/presentation state), `1b33f60` (quick-actions component), `7a7051c` (invalid idle pause prevention), `f19a8ec` (dashboard workspace hook, fallback hardening, rapid-toggle and narrow-viewport E2E), `da2dfb0` (panel shell/header composition), `53a3715` (typed shared-chat switcher), `a5d6687` (isolated context/privacy settings), `dfd0e14` (save-queue concurrency/error characterization), `206da8d` (study-mode panel composition), `31dbe0d` (isolated workspace auth parsing), `7283a69` (answer-card panel composition), `29d5731` (mounted/latest-response guards for workspace async work), `4ffdc79` (composer panel composition), `e68730a` (voice-dock composition), `ea76936` (stateful Supabase fixture plus connected-chat/reload E2E), `fe8d5f5` (workspace-owned dashboard persistence), `933b1ca` (short-panel responsive evidence and handoff-test hardening), `9aa2ac3` (mounted/latest-operation guards for Live and SpeechRecognition cleanup), `7927799` (panel timer, Web Audio, and confetti animation teardown), `8499b79` (mounted/latest-operation guards for panel coaching, study-mode, save, capture, file, and clipboard continuations), `7301083` (explicit Live start/stop/fallback control transitions), `18f5273` (correlated Live runtime operation IDs and stale status suppression), `d1af764` (pause/resume restricted to valid Live states), `6630915` (panel Live-status hydration plus delayed Live remount-race E2E), `397c682` (typed Pomodoro picker extraction), `6138fb0` (typed selection-tooltip extraction), `a77fe49` (keyboard activation smoke coverage), `dd7a2c3` (visible control name/focus/clipping audit), `db5ff45` (narrow-width audit), `b182624` (typed `PanelBody` render boundary), and `4783764` (component-level pause/resume disabled-state characterization). The canonical extension worktree is clean at `4783764`.

- Follow-up extension commit `219c44d` extracts pure study-session creation and fallback-transcript utilities into `src/content/studySession.ts` with three focused tests. `0b05279` then extracts deterministic voice selection and the browser speech-utterance adapter into `src/content/speech.ts` with four focused tests. `4ce2fce` makes pause/resume presentation and local fallback transitions derive from the canonical live state, and the latest `92887aa` rejects invalid pause/resume commands in the service worker. `FloatingStudyPilot.tsx` is now 1,433 lines. The canonical extension worktree is clean at `92887aa`; full verification is Vitest 20 files/98 tests, typecheck/build/manifest validation, and unpacked Playwright 15/15. Hosted Vertex Live and teammate review remain external.
- Phase 13 preparation now includes `scripts/validate-pilot-results.mjs`: it validates the fixed anonymous CSV, rejects email/credential/draft content and impossible metrics, enforces normalized 0–100 before/after rubric scores, labels whether the approved row count is within the 10–15 target, computes protocol aggregates with denominators, and explicitly treats the empty template as “no participant result.”
- `npm run summarize:pilot` now emits a sanitized Markdown aggregate draft from the validated CSV; it reports the empty template as no result and never includes participant IDs or student content. Use `--require-data` only after approved collection.
- Clean clone `C:\Users\gjins\Desktop\studypilot-clean-clone-20260824-pilot-summary` at `605ac54` reproduced npm ci (0 vulnerabilities), pilot tests 6/6, no-result summary generation, claims 11/11, pitch validation, submission tests 8/8, full non-hosted release wrapper, and web Playwright 4/4. The first bare production build failed closed for missing public variables; the documented placeholder rerun passed.
- The next local preparation slice adds `docs/submission/team-contributions-template.md`, which keeps member roles, approvals, mentor/team sign-off, and credential handling human-owned. The submission validator now checks its safety markers; after this slice the focused submission suite is 9/9 and `npm run validate:submission` still reports eight real final inputs pending.
- Public-claim drift is now guarded by `scripts/validate-claims.mjs` and its Node tests (11/11). The local two-repository command `npm run validate:claims -- --extension-root ../studypilot-extension --require-extension` checks the six web/extension/demo documents, while `npm run validate:pitch` checks the human-owned pitch brief for retired claims. It rejects retired unsupported capture, timestamp, device-only, and no-account claims. The final pitch is still not auto-marked because it is human-owned.

## Verified evidence

Web:

- Vitest: 19 files / 106 tests.
- FastAPI pytest: 26 tests.
- Supabase local pgTAP: 5 files / 291 tests after a clean reset, including the full six-table update-policy matrix.
- Fresh committed-head audit clone `C:\Users\gjins\Desktop\studypilot-clean-clone-20260824-final`: `npm ci` (0 vulnerabilities), web Vitest 19/106, Deno 42, claim tests/validation (8/8; six documents with the sibling extension), submission tests/validation (6/6), pilot-template validation, public-placeholder build plus `verify-built-env`, backend pytest 26, Supabase pgTAP 291 after `npx supabase start`, and web Playwright 4/4 all passed. The same clone also completed the full `npm run verify:release` wrapper with public placeholders. The wrapper explicitly skipped the hosted allowlist because `SUPABASE_ACCESS_TOKEN` was absent; this is not a hosted verification pass. The local Supabase stack was stopped cleanly; a bare production build without public variables remains intentionally fail-closed.
- Production build with approved public HTTPS placeholders: passed.
- `node scripts/verify-built-env.mjs dist`: passed.
- Web Playwright golden flow: 1/1 passed (latest full run 18.7s, including axe) with a deterministic fixture covering rubric upload/extraction, rubric-scoped SSE coaching, action-item refresh, and reload persistence. The fixture uses only public placeholder values and is excluded from Vitest discovery.
- Repeatability check: the complete web Playwright suite passed 4/4 twice consecutively after the auth-recovery slice, using fresh Playwright contexts each run. This strengthens local fixture evidence but is not a hosted clean-profile claim.
- Dashboard axe check: 0 violations on the authenticated action-items view during the same golden flow; public landing, sign-in, and account-creation axe states also have no serious/critical violations. The checks are committed in `f89d658` and `8db5a40`.
- Post-change production-preview Lighthouse medians over three runs per route/device: mobile landing performance `0.96` (LCP `2.63s`, CLS `0`), mobile auth `0.96` (LCP `2.58s`, CLS `0`), desktop landing `0.91` (LCP `0.81s`, CLS `0`), and desktop auth `1.00` (LCP `0.55s`, CLS `0`); every route scored `1.00` for accessibility, best practices, and SEO. These are local production-preview measurements, not hosted production claims; exact commands and artifacts are recorded in `context/performance-notes.md`.
- Supabase local lint: exit 0; one pre-existing unused-local warning remains.
- `npm run verify:release` with approved public placeholders at `823172d`: web tests (19 files/106 tests), claim tests (8/8), six-document claim validation, submission-artifact tests (6/6), structural submission validation, production build, and built-env passed; the validator reports eight human-owned final inputs still pending, and hosted allowlist explicitly skipped because `SUPABASE_ACCESS_TOKEN` is absent.
- After pilot-evidence commits `977bb8a` and `5b28d57`, the same non-hosted `npm run verify:release` wrapper passed again: web tests 19/106, claim tests 8/8, submission tests 6/6, structural validation, production build, and built-environment scan. The hosted allowlist remained explicitly skipped without a protected token.
- Web commit `14395cd` adds explicit owner-role annotations to every pending human-owned submission gate and makes the structural validator reject any future pending gate without an `Owner:` annotation. This improves handoff accountability without treating role labels as completed approvals; the strict final-input gate remains red until real links, pilot data, credential handling, and sign-offs exist.
- After `14395cd`, the full non-hosted `npm run verify:release` wrapper passed again: web Vitest 19/106, claims 8/8, submission tests 7/7, structural validation, public-placeholder build, and built-environment scan. Hosted allowlist verification remains skipped without a protected token.
- Communication phase commit `6bcb1b9` adds the human-owned pitch claims brief, a required `npm run validate:pitch` retired-claim guard, and the corresponding README/CI/release-wrapper wiring. Claim tests are now 11/11; this guards the preparation brief without marking the final pitch approved.
- Phase 14 preparation commit adds `docs/submission/hosted-golden-flow-checklist.md` and structural validation for its two-run/A1–A8/privacy/fallback/sign-off markers. Submission tests are now 8/8; the checklist remains preparation only and does not claim a hosted run.
- Clean clone `C:\Users\gjins\Desktop\studypilot-clean-clone-20260824-hosted-flow` at `7e88e6e` reproduced npm ci (0 vulnerabilities), claim tests 11/11, pitch validation, submission tests 8/8, the full non-hosted release wrapper, and web Playwright 4/4. The clone was clean; hosted allowlist verification remained skipped.
- Clean clone `C:\Users\gjins\Desktop\studypilot-clean-clone-20260824-pitch-guard` at `6bcb1b9` reproduced npm ci (0 vulnerabilities), claim tests 11/11, sibling-aware claims/pitch validation, submission tests 7/7, the full non-hosted release wrapper, and web Playwright 4/4. The clone was clean; hosted allowlist verification remained skipped.
- A new clean clone at `C:\Users\gjins\Desktop\studypilot-clean-clone-20260824-latest` (head `ceda67f`) reproduced the current tracked-head evidence: `npm ci` with 0 vulnerabilities, pilot validator tests 6/6 and empty-template validation, `verify:release`, web Playwright 4/4, backend pytest 26, Deno 42, and Supabase pgTAP 291. The clone was clean and its local Supabase stack was stopped; this does not establish hosted deployment or remote CI.
- A second clean clone at `C:\Users\gjins\Desktop\studypilot-clean-clone-20260824-submission-owners` (head `97549c0`) reproduced the owner-aware submission gate: `npm ci` with 0 vulnerabilities, submission tests 7/7, sibling-aware claims validation, eight owned-but-pending final inputs, and the full non-hosted `verify:release` wrapper. The clone was clean; hosted allowlist verification remained skipped without protected credentials.
- `node --test scripts/validate-claims.test.mjs` (11/11), the sibling-aware six-document claims run, and `npm run validate:pitch` passed. The demo script and pitch brief are guarded against retired claims but still require human review for timing, hosted evidence, pilot wording, and final approval.
- `node --test scripts/validate-submission-package.test.mjs` (8/8) and `npm run validate:submission` pass the current report/demo/hosted-flow/checklist structure, including pending-gate owner annotations. `node scripts/validate-submission-package.mjs --require-final-inputs` intentionally exits 1 until the eight human-owned URL, pilot, media, credential-rotation, contribution, and sign-off inputs are supplied.
- Web commit `d85b27f` adds the missing FastAPI ownership proof, completes the local RLS update matrix, and changes the hosted-function CI job to run only on protected branches. The CI step visibly reports `SKIPPED` when protected Supabase secrets are absent; this is not a hosted verification pass.
- Web CI now has a separate `web-e2e` job that installs Chromium and runs `npm run test:e2e -- --reporter=line` against the deterministic fixture. This makes the local web E2E gate executable in CI; no remote run is claimed until the local heads are pushed.

Extension:

- Typecheck: passed.
- Vitest: 20 files / 98 tests.
- Production build: passed.
- Manifest validator: passed; no named microphone permission, no loopback production hosts, offscreen `USER_MEDIA` reason present.
- Unpacked Playwright: 15/15 passed after the workspace-persistence, responsive-layout, Live-operation, timer/animation teardown, panel async-response, explicit Live-control, correlated-runtime, invalid-pause, Live-status hydration, typed panel-body extraction, keyboard-activation, speech/session utility extraction, and visible-control accessibility slices, including rapid open/close with page-error/console-error assertions, the deterministic delayed Live start → panel unmount/reopen → stop race with page/extension-page console-error assertions, visually inspected settled 360×640 / 390×700 screenshots with all quick-action labels visible, the accessible-name/tab-reachability/text-clipping audit at both narrow widths, an external-navigation-safe dashboard handoff check, a mocked connected Supabase chat that survives minimize/reopen and page reload, a second coaching turn after reload that reuses the active chat, Enter activation of launcher/settings/minimize controls, and Enter activation of the first secondary menu action. A real hosted Vertex Live session remains external.
- `npm ls @google/generative-ai --depth=0`: empty; source and built bundle contain no `VITE_GEMINI_API_KEY`, `GoogleGenerativeAI`, or `@google/generative-ai`.

## Highest-priority remaining work

### P0 — human/external release gates

1. The historical `backend/service-account.json` was added in `1e0f6bb` and removed in `0cd0d99`; it is absent from the working tree. A human owner must still confirm/rotate the key if it was ever valid and approve any required history rewrite.
2. Human owner approves any history rewrite and protected-branch force-push; the agent must not do this autonomously.
3. Supply real production public build values and run the hosted Edge Function allowlist check. Record a visible skip when secrets are absent.
4. Configure branch protection so non-secret CI jobs are required. Keep hosted checks and production smoke tests protected by environment secrets.

   Read-only GitHub API inspection on 2026-08-24 reports `main` as **not
   protected** for both the web and extension repositories, and `gh run list`
   shows no visible runs for either remote because the local remediation heads
   have not been pushed. Treat this as an admin/push gate, not as evidence that
   CI is green.

5. Use the credential-free [demo fixture](../submission/demo-fixture.md) when
   creating the human-owned hosted demo account; the GitHub remotes are
   documented in the submission checklist, but the new local commits are not
   pushed yet.

   Execute the two-run hosted path from
   [`hosted-golden-flow-checklist.md`](../submission/hosted-golden-flow-checklist.md)
   once the deployment URL, beta access, and demo account are approved. The
   checklist is preparation only; no hosted run is currently claimed.

   The exact read-first/admin-approved branch-protection procedure is now in
   [`context/runbook.md`](../../context/runbook.md); it was not executed here.

### P1 — dashboard maintainability and release confidence

1. Keep `Dashboard.tsx` orchestration-only and below the plan's 1,000-line target. It is now 938 lines after `0cf07d5`, with data loading, realtime reconciliation, profile/bootstrap state, stale-request refs, and the extension-help modal extracted. Remaining work is behavior-level browser evidence, not another broad shell rewrite.
2. Keep explicit request-state unions and stale-promise/unmount cleanup tests current; `DashboardBootstrapState` now centralizes `idle | loading | success | error` in `9dd63b2`, `d2cf801` applies the same state boundary to per-session transcript loading/error/retry, `a989db6` ignores superseded/unmounted transcript responses, `6814cc5` applies the boundary to chat-list refreshes and common realtime/session fallbacks, `431533f` versions rubric-index retries, `a667fff` prevents late chat-stream dispatches after dashboard unmount, and `0cf07d5` moves those lifecycle boundaries behind a typed hook. `c34cd77` now refreshes action items after a successful coaching commit, and the web golden flow supplies browser-level persistence evidence.
3. ~~Split `Dashboard.css` into shell, chat, and content-view styles without changing selector scope or visual behavior.~~ Completed in `e1632fe` with `DashboardShell.css`, `ChatView.css`, `ContentViews.css`, preserved `.app-dashboard` selectors, and source-contract tests. Keep the import-order contract intact.
4. ~~Add the deterministic web Playwright golden flow: upload/select rubric, grounded prompt, Socratic follow-up, action item, reload, and verify the same chat.~~ Completed in `2b47d6c` (1/1 passing).
5. ~~Finish explicit named prop interfaces in `dashboard-types.ts`; do not add `any`, `@ts-ignore`, or lint suppressions.~~ Completed in `03a2da1`; no inline dashboard prop-object contracts remain.
6. ~~Remove cross-boundary rubric activation from `dashboardApi.ts`.~~ Completed in `4bd77c8`; the CRUD adapter is FastAPI-only and the boundary has a direct test.

### P1 — extension maintainability and narrow-width UX

1. Expand characterization tests for the remaining workspace hook orchestration and invalid live-control combinations. The workspace auth boundary is now covered by `31dbe0d`; web token refresh/expiry and auth/network UI recovery are covered by `3212aca`, with successful email-login and signup transition coverage in `d5657d8`; save queue concurrency/error cleanup is covered by `dfd0e14`; dashboard session persistence now has a single-flight and mounted-response guard in `fe8d5f5`; Live start/pause/resume/stop now have mounted/latest-operation response guards and SpeechRecognition cleanup in `9aa2ac3`; panel timers, Web Audio contexts, and confetti animation frames now have teardown ownership in `7927799`; panel coaching/study/save/capture/file/clipboard continuations now ignore stale or unmounted results in `8499b79`; explicit start/stop/fallback mic intents are covered by `7301083`; service-worker operation IDs and stale status suppression are covered by `18f5273`; pause/resume is restricted to valid Live states by `d1af764`; panel Live-status hydration and delayed-token remount characterization are covered by `6630915`; `4783764` now proves the rendered VoiceDock pause/resume control is disabled in idle/starting states and enabled with the correct label only for live/paused states; the Pomodoro picker and selection-tooltip body slices are isolated in `397c682` and `6138fb0`; pure derivation, chat reconciliation, listener cleanup, and mounted/latest-response guards are covered by `c295320`, `d9ff60d`, and `29d5731`. The clean-clone import/release boundary is covered by `d694163` and the isolated 2026-08-24 audit.
2. Continue focused body composition from `FloatingStudyPilot.tsx`; `useDashboardWorkspace.ts`, `QuickActions.tsx`, `ExtensionPanel.tsx`, `ChatSwitcher.tsx`, `ContextSettings.tsx`, `StudyModePanel.tsx`, `AnswerCardPanel.tsx`, `ComposerPanel.tsx`, `VoiceDock.tsx`, `PomodoroPicker.tsx`, `SelectionTooltip.tsx`, `PanelBody.tsx`, `studySession.ts`, and `speech.ts` are extracted. `4ce2fce` removes the duplicated paused prop and centralizes pause/resume presentation and fallback transitions; `92887aa` rejects invalid runtime pause/resume commands. The parent is now 1,433 lines and owns orchestration, live/workspace state, browser speech callbacks, and async handlers rather than pure session or voice selection.
3. Keep live transitions explicit (`idle | starting | live | paused | stopping | error`) and make invalid control combinations unrenderable.
4. Keep the 360x640 and 390x700 screenshots/E2E checks for fully visible quick actions, no header overlap, no horizontal scroll, and no duplicate listeners after rapid open/close. `933b1ca` adds the short-height layout guard, settled screenshot artifacts, and an external-navigation-safe handoff assertion. The connected shared-chat/reload golden flow is covered by `ea76936`; the real hosted run remains an external gate.
5. Keep `studypilotSupabase.ts` as the public facade; its auth/chat modules now exist and must retain the current tests. Extension-specific history secret scanning is now in CI; branch protection remains an admin gate.

### P2 — judging evidence and polish

1. ~~Run axe checks and Lighthouse medians for landing, auth, and dashboard; fix serious/critical accessibility issues and contrast/focus defects.~~ Local landing/auth medians and authenticated-dashboard axe are complete in `f89d658` and `8db5a40`; a hosted dashboard Lighthouse performance median remains a follow-up because the current browser fixture is mocked and must not be presented as hosted production evidence.
2. ~~Add canonical metadata, valid `robots.txt`, sitemap, and accurate claims across website, extension, README, report, and pitch.~~ Website metadata/robots/sitemap and code-facing claims are aligned; the final report/pitch still require human-owned links and contribution text.
3. ~~Write the architecture ADR and left-to-right system diagram showing browser clients, FastAPI CRUD, Supabase Auth/Realtime/Edge, Postgres/Storage, and Vertex AI.~~ ADR/source diagram/PNG are complete in `7a68341`; the tracked legacy scaffold is removed in `6a08fac`.
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
