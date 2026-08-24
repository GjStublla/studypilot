# UEP submission checklist

## Local phase evidence — 2026-08-24

This section records what is reproducible in the workspace; it is not a deployment or mentor sign-off.

- Web local evidence baseline: `5fcb87e` (with adapter-boundary evidence `4bd77c8`, prop-contract evidence `03a2da1`, authorization evidence `d85b27f`, unconfigured-Supabase import fix `d694163`, auth-recovery/accessibility evidence `3212aca`, auth-success transition evidence `d5657d8`, release-gate typing fix `c970bd0`, demo-claim guard `ad3a5f4`, submission-artifact validator `823172d`, accessibility/performance, architecture, and scaffold commits `8db5a40`, `7a68341`, and `6a08fac`; later documentation commits record submission state).
- Canonical extension local head: `92887aa`; its worktree is clean. The latest slices include workspace-owned persistence, settled narrow-panel screenshot evidence, mounted/latest-operation guards for Live and SpeechRecognition cleanup, teardown ownership for panel timers/Web Audio/confetti animation, stale-result guards for panel coaching/study/save/capture/file/clipboard continuations, explicit Live start/stop/fallback control transitions, correlated service-worker status operations, canonical pause/resume presentation and local fallback transitions, service-worker rejection of invalid pause/resume commands, panel Live-status hydration/remount characterization, typed Pomodoro and selection-tooltip body extractions, the typed `PanelBody.tsx` render boundary, independently tested study-session and speech utilities, keyboard activation coverage for launcher/settings controls and the first secondary menu action, a second coaching turn after reload that reuses the active chat, a rendered VoiceDock pause/resume state characterization, and a closed-shadow-root audit of visible control names, tab reachability, and text clipping at both narrow widths.
- Web Vitest: 19 files / 106 tests; web Playwright: 4/4 twice consecutively from fresh Playwright contexts; public-placeholder production build and built-environment scan: passed. A default build with the local `.env` fails closed before bundling. This remains local fixture evidence, not hosted production proof.
- The current `npm run verify:release` run after `605ac54`: web tests (19 files/106 tests), claim tests (11/11), sibling-aware six-document claim validation, pitch-brief retired-claim guard, hosted-flow/owner-aware/contribution-template submission tests (9/9), pilot tests 6/6, sanitized no-result summary, production build, and built-environment scan passed; hosted function allowlist was visibly skipped because `SUPABASE_ACCESS_TOKEN` was absent.
- Fresh committed-head clone `C:\Users\gjins\Desktop\studypilot-clean-clone-20260824-pilot-summary` at `605ac54` reproduced the hosted-flow, pitch, submission, and pilot gates, full non-hosted release wrapper, and web Playwright 4/4. The hosted function allowlist was explicitly skipped for the same missing-secret reason; the clone remained clean.
- Extension typecheck, Vitest (20 files / 98 tests), build, manifest validation, and unpacked Playwright (15/15): passed; `studySession.ts`, `speech.ts`, canonical live pause-state helpers, and invalid runtime-control guards have focused coverage, the viewport test emits and visually inspects 360×640 and 390×700 screenshots, the Live remount race has deterministic page/extension-page console assertions, the rendered VoiceDock pause/resume states are characterized, and the visible-control audit covers accessible names, tab reachability, and text clipping at both narrow widths in addition to launcher/settings/minimize and first-secondary-menu keyboard activation.
- FastAPI pytest: 26 passed; Supabase local pgTAP: 5 files / 291 passed after a fresh reset, including the six-table update-policy matrix.
- Local Lighthouse medians and axe evidence: `context/performance-notes.md`; hosted dashboard performance remains unmeasured.
- Public-claim consistency: `node --test scripts/validate-claims.test.mjs` (11/11), the sibling-aware six-document `validate:claims` run, and `npm run validate:pitch` passed; the pitch brief is guarded against retired claims while final pitch wording, hosted evidence, and pilot statements remain human review items.
- Submission-artifact structure: `node --test scripts/validate-submission-package.test.mjs` (9/9) and `npm run validate:submission` passed the nine-section report, seven-segment 1:58 demo timeline, hosted-flow preparation checkpoints, contribution-template safety markers, fallback instructions, checklist markers, and pending-gate ownership annotations. Strict `--require-final-inputs` remains intentionally red with eight human-owned inputs pending.
- Hosted Supabase allowlist: visibly skipped because the process did not contain `SUPABASE_ACCESS_TOKEN`.
- Remote CI/branch protection: read-only GitHub inspection reports `main` is not protected in either repository and no workflow runs are visible for either remote; push the reviewed local heads first, then configure required checks and record the actual run URLs.
- Web CI now declares a separate Chromium/Playwright `web-e2e` job; its remote result remains pending until the reviewed local head is pushed.
- Branch-protection instructions are recorded in `context/runbook.md` with separate web/extension required-check lists; no GitHub settings were changed from this workspace.
- Architecture diagram: `docs/architecture/system.png` from `7a68341`.
- Judging evidence matrix: `docs/submission/judging-evidence-matrix.md` maps every pre-pitch and ceremony criterion to local proof, remaining owner, and demo cue.
- Current external state: no deployed URL, Chrome Web Store URL, pilot dataset, video, or contribution approvals have been supplied in this workspace.

## Evidence and links

- Repository URLs: [web/dashboard](https://github.com/GjStublla/studypilot) and [canonical extension](https://github.com/GjStublla/studypilot-extension). The remote `main` heads are still the historical baselines; the local evidence commits below must be pushed and checked before submission.
- [x] Web repository local evidence commits: code baseline `5fcb87e`; latest documentation commits include the panel-body, auth-success, release-gate, demo-claim, and submission-artifact updates. The worktree still preserves unrelated uncommitted edits listed by `git status --short`.
- [x] Canonical extension repository commit: `92887aa` (clean worktree).
- [x] Deployed web URL: explicitly not deployed in this workspace; hosted deployment and smoke testing remain external.
- [ ] Chrome Web Store/beta-access state: [link or approved invite-only state] — Owner: deployment/release lead
- [ ] Demo video: [link] — Owner: demo lead
- [ ] Backup video/screenshots: [secure location] — Owner: demo lead
- [ ] Pilot summary: [link after approved collection] — Owner: pilot lead
- [x] Architecture diagram PNG: `docs/architecture/system.png` (`7a68341`; include the repository link in the final submission)
- [x] Credential-free synthetic demo fixture: `docs/submission/demo-fixture.md`; hosted account creation and recording remain external.
- [x] Human-owned pitch preparation brief: `docs/submission/pitch-claims-brief.md`; its retired-claim guard passes, but the ceremony pitch still requires team approval.
- [x] Hosted golden-flow preparation: `docs/submission/hosted-golden-flow-checklist.md` defines two fresh-profile runs, checkpoint evidence, privacy/fallback handling, and owner sign-off; no hosted run is claimed.
- [x] Human-owned contribution/sign-off preparation: `docs/submission/team-contributions-template.md` defines member approval, mentor/team sign-off, and credential-safe handling; it does not claim approvals.

## Reproducibility

- [x] Node 22+ and Python prerequisites documented in `README.md` (Python 3.13 is also pinned by `backend/Dockerfile`).
- [x] Public build variables documented without secrets in `README.md`, `.env.example`, and the release workflow placeholders.
- [x] Backend and local Supabase setup were previously tested from fresh committed-head clone `studypilot-clean-clone-20260824-final`; the latest owner-aware clone `studypilot-clean-clone-20260824-submission-owners` additionally reproduced `npm ci` (0 vulnerabilities), submission tests 7/7, sibling-aware claims validation, and the full public-placeholder release wrapper. A bare production build without public variables fails closed as designed. The same web E2E command is in the README clean-clone sequence and the web CI workflow.
- [x] Pilot results gate is reproducible: `npm run validate:pilot` accepts the header-only template and explicitly reports that no participant result is claimed; `npm run summarize:pilot` emits a sanitized no-result Markdown draft, and `--require-data` is reserved for approved collection.
- [x] Web Vitest, Deno, pytest, pgTAP, build, and built-environment scan recorded in the implementation log and CI workflow.
- [x] Extension typecheck, Vitest, build, manifest validation, and unpacked Playwright recorded above.
- [x] Hosted allowlist is visibly marked skipped because protected Supabase secrets are unavailable; production smoke checks remain an external gate.
- [x] Pitch preparation guard is reproducible: `npm run validate:pitch` checks the tracked brief for retired capability wording without treating it as the approved final pitch.

## Safety and sign-off

- [ ] Historical service-account credential rotation approved and recorded privately. — Owner: repository owner/security lead
- [x] No secret-bearing `.env`, service-account JSON, access token, refresh token, or service-role key is present in the current tracked tree; historical service-account rotation remains a human gate.
- [ ] Website, extension, README, report, and pitch use the same capability/privacy claims. — Owner: product/communications lead
- [ ] Team members approve their contribution text. — Owner: team lead
- [ ] Mentor/team owner signs off the report, video, deployed URL, and final checklist. — Owner: team lead / mentor
