# UEP submission checklist

## Local phase evidence — 2026-08-24

This section records what is reproducible in the workspace; it is not a deployment or mentor sign-off.

- Web local evidence baseline: `5fcb87e` (with adapter-boundary evidence `4bd77c8`, prop-contract evidence `03a2da1`, authorization evidence `d85b27f`, unconfigured-Supabase import fix `d694163`, auth-recovery/accessibility evidence `3212aca`, auth-success transition evidence `d5657d8`, release-gate typing fix `c970bd0`, demo-claim guard `ad3a5f4`, submission-artifact validator `823172d`, accessibility/performance, architecture, and scaffold commits `8db5a40`, `7a68341`, and `6a08fac`; later documentation commits record submission state).
- Canonical extension local head: `b182624`; its worktree is clean. The latest slices include workspace-owned persistence, settled narrow-panel screenshot evidence, mounted/latest-operation guards for Live and SpeechRecognition cleanup, teardown ownership for panel timers/Web Audio/confetti animation, stale-result guards for panel coaching/study/save/capture/file/clipboard continuations, explicit Live start/stop/fallback control transitions, correlated service-worker status operations, valid-state pause/resume controls, panel Live-status hydration/remount characterization, typed Pomodoro and selection-tooltip body extractions, the typed `PanelBody.tsx` render boundary, keyboard activation coverage for launcher/settings/minimize controls, and a closed-shadow-root audit of visible control names, tab reachability, and text clipping at both narrow widths.
- Web Vitest: 19 files / 106 tests; web Playwright: 4/4 twice consecutively from fresh Playwright contexts; public-placeholder production build and built-environment scan: passed. A default build with the local `.env` fails closed before bundling. This remains local fixture evidence, not hosted production proof.
- `npm run verify:release` with public placeholder values after `ad3a5f4`: web tests (19 files/106 tests), claim tests (8/8), six-document claim validation, production build, and built-environment scan passed; hosted function allowlist was visibly skipped because `SUPABASE_ACCESS_TOKEN` was absent.
- Extension typecheck, Vitest (17 files / 84 tests), build, manifest validation, and unpacked Playwright (14/14): passed; the viewport test now emits and visually inspects 360×640 and 390×700 screenshots, the Live remount race has deterministic page/extension-page console assertions, and the visible-control audit covers accessible names, tab reachability, and text clipping at both narrow widths in addition to launcher/settings/minimize keyboard activation.
- FastAPI pytest: 26 passed; Supabase local pgTAP: 5 files / 291 passed after a fresh reset, including the six-table update-policy matrix.
- Local Lighthouse medians and axe evidence: `context/performance-notes.md`; hosted dashboard performance remains unmeasured.
- Public-claim consistency: `node --test scripts/validate-claims.test.mjs` (8/8) and `npm run validate:claims -- --extension-root ../studypilot-extension --require-extension` passed across six documents, including a retired-claim guard for the demo script; pitch wording, hosted evidence, and pilot statements remain human review items.
- Submission-artifact structure: `node --test scripts/validate-submission-package.test.mjs` (6/6) and `npm run validate:submission` passed the nine-section report, seven-segment 1:58 demo timeline, fallback instructions, and checklist markers. Strict `--require-final-inputs` remains intentionally red with eight human-owned inputs pending.
- Hosted Supabase allowlist: visibly skipped because the process did not contain `SUPABASE_ACCESS_TOKEN`.
- Architecture diagram: `docs/architecture/system.png` from `7a68341`.
- Judging evidence matrix: `docs/submission/judging-evidence-matrix.md` maps every pre-pitch and ceremony criterion to local proof, remaining owner, and demo cue.
- Current external state: no deployed URL, Chrome Web Store URL, pilot dataset, video, or contribution approvals have been supplied in this workspace.

## Evidence and links

- Repository URLs: [web/dashboard](https://github.com/GjStublla/studypilot) and [canonical extension](https://github.com/GjStublla/studypilot-extension). The remote `main` heads are still the historical baselines; the local evidence commits below must be pushed and checked before submission.
- [x] Web repository local evidence commits: code baseline `5fcb87e`; current documentation evidence anchor `6cc3365` (including the panel-body, auth-success, release-gate, demo-claim, and submission-artifact updates). The worktree still preserves unrelated uncommitted edits listed by `git status --short`.
- [x] Canonical extension repository commit: `b182624` (clean worktree).
- [x] Deployed web URL: explicitly not deployed in this workspace; hosted deployment and smoke testing remain external.
- [ ] Chrome Web Store/beta-access state: [link or approved invite-only state]
- [ ] Demo video: [link]
- [ ] Backup video/screenshots: [secure location]
- [ ] Pilot summary: [link after approved collection]
- [x] Architecture diagram PNG: `docs/architecture/system.png` (`7a68341`; include the repository link in the final submission)
- [x] Credential-free synthetic demo fixture: `docs/submission/demo-fixture.md`; hosted account creation and recording remain external.

## Reproducibility

- [x] Node 22+ and Python prerequisites documented in `README.md` (Python 3.13 is also pinned by `backend/Dockerfile`).
- [x] Public build variables documented without secrets in `README.md`, `.env.example`, and the release workflow placeholders.
- [x] Backend and local Supabase setup tested from a clean clone: `npm ci`, web Vitest 17/96, Deno 42, placeholder production build plus `verify-built-env`, backend pytest 26, `npx supabase start`, pgTAP 5 files/291 tests, `npx supabase stop --no-backup`, and web Playwright 4/4 all passed in the isolated 2026-08-24 clone. A bare production build without public variables failed closed as designed.
- [x] Pilot results gate is reproducible: `npm run validate:pilot` accepts the header-only template and explicitly reports that no participant result is claimed; `--require-data` is reserved for approved collection.
- [x] Web Vitest, Deno, pytest, pgTAP, build, and built-environment scan recorded in the implementation log and CI workflow.
- [x] Extension typecheck, Vitest, build, manifest validation, and unpacked Playwright recorded above.
- [x] Hosted allowlist is visibly marked skipped because protected Supabase secrets are unavailable; production smoke checks remain an external gate.

## Safety and sign-off

- [ ] Historical service-account credential rotation approved and recorded privately.
- [x] No secret-bearing `.env`, service-account JSON, access token, refresh token, or service-role key is present in the current tracked tree; historical service-account rotation remains a human gate.
- [ ] Website, extension, README, report, and pitch use the same capability/privacy claims.
- [ ] Team members approve their contribution text.
- [ ] Mentor/team owner signs off the report, video, deployed URL, and final checklist.
