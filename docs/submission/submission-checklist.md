# UEP submission checklist

## Local phase evidence — 2026-08-24

This section records what is reproducible in the workspace; it is not a deployment or mentor sign-off.

- Web local evidence baseline: `5fcb87e` (with adapter-boundary evidence `4bd77c8`, prop-contract evidence `03a2da1`, authorization evidence `d85b27f`, accessibility/performance, architecture, and scaffold commits `8db5a40`, `7a68341`, and `6a08fac`; later documentation commits record submission state).
- Canonical extension local head: `d1af764`; its worktree is clean. The latest slices include workspace-owned persistence, settled narrow-panel screenshot evidence, mounted/latest-operation guards for Live and SpeechRecognition cleanup, teardown ownership for panel timers/Web Audio/confetti animation, stale-result guards for panel coaching/study/save/capture/file/clipboard continuations, explicit Live start/stop/fallback control transitions, correlated service-worker status operations, and valid-state pause/resume controls.
- Web Vitest: 17 files / 96 tests; web Playwright: 4/4; public-placeholder production build and built-environment scan: passed. A default build with the local `.env` fails closed before bundling.
- Extension typecheck, Vitest (17 files / 84 tests), build, manifest validation, and unpacked Playwright (11/11): passed; the viewport test now emits and visually inspects 360×640 and 390×700 screenshots.
- FastAPI pytest: 26 passed; Supabase local pgTAP: 5 files / 291 passed after a fresh reset, including the six-table update-policy matrix.
- Local Lighthouse medians and axe evidence: `context/performance-notes.md`; hosted dashboard performance remains unmeasured.
- Hosted Supabase allowlist: visibly skipped because the process did not contain `SUPABASE_ACCESS_TOKEN`.
- Architecture diagram: `docs/architecture/system.png` from `7a68341`.
- Judging evidence matrix: `docs/submission/judging-evidence-matrix.md` maps every pre-pitch and ceremony criterion to local proof, remaining owner, and demo cue.
- Current external state: no deployed URL, Chrome Web Store URL, pilot dataset, video, or contribution approvals have been supplied in this workspace.

## Evidence and links

- [x] Web repository local evidence commits: code baseline `5fcb87e`; latest tracked documentation `26d1e98`. The worktree still preserves unrelated uncommitted edits listed by `git status --short`.
- [x] Canonical extension repository commit: `d1af764` (clean worktree).
- [x] Deployed web URL: explicitly not deployed in this workspace; hosted deployment and smoke testing remain external.
- [ ] Chrome Web Store/beta-access state: [link or approved invite-only state]
- [ ] Demo video: [link]
- [ ] Backup video/screenshots: [secure location]
- [ ] Pilot summary: [link after approved collection]
- [x] Architecture diagram PNG: `docs/architecture/system.png` (`7a68341`; include the repository link in the final submission)

## Reproducibility

- [x] Node 22+ and Python prerequisites documented in `README.md` (Python 3.13 is also pinned by `backend/Dockerfile`).
- [x] Public build variables documented without secrets in `README.md`, `.env.example`, and the release workflow placeholders.
- [ ] Backend and local Supabase setup tested from a clean clone.
- [x] Web Vitest, Deno, pytest, pgTAP, build, and built-environment scan recorded in the implementation log and CI workflow.
- [x] Extension typecheck, Vitest, build, manifest validation, and unpacked Playwright recorded above.
- [x] Hosted allowlist is visibly marked skipped because protected Supabase secrets are unavailable; production smoke checks remain an external gate.

## Safety and sign-off

- [ ] Historical service-account credential rotation approved and recorded privately.
- [x] No secret-bearing `.env`, service-account JSON, access token, refresh token, or service-role key is present in the current tracked tree; historical service-account rotation remains a human gate.
- [ ] Website, extension, README, report, and pitch use the same capability/privacy claims.
- [ ] Team members approve their contribution text.
- [ ] Mentor/team owner signs off the report, video, deployed URL, and final checklist.
