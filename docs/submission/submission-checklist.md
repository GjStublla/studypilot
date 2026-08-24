# UEP submission checklist

## Local phase evidence — 2026-08-24

This section records what is reproducible in the workspace; it is not a deployment or mentor sign-off.

- Web local evidence baseline: `8db5a40` (with architecture/scaffold commits `7a68341` and `6a08fac`; later documentation commits record submission state).
- Canonical extension local head: `ea76936`; its worktree is clean.
- Web Vitest: 17 files / 96 tests; web Playwright: 4/4; production build and built-environment scan: passed.
- Extension typecheck, Vitest (16 files / 74 tests), build, manifest validation, and unpacked Playwright (11/11): passed.
- Local Lighthouse medians and axe evidence: `context/performance-notes.md`; hosted dashboard performance remains unmeasured.
- Hosted Supabase allowlist: visibly skipped because the process did not contain `SUPABASE_ACCESS_TOKEN`.
- Architecture diagram: `docs/architecture/system.png` from `7a68341`.
- Current external state: no deployed URL, Chrome Web Store URL, pilot dataset, video, or contribution approvals have been supplied in this workspace.

## Evidence and links

- [ ] Web repository commit: [exact SHA]
- [ ] Canonical extension repository commit: [exact SHA]
- [ ] Deployed web URL: [URL or explicit not-deployed statement]
- [ ] Chrome Web Store/beta-access state: [link or state]
- [ ] Demo video: [link]
- [ ] Backup video/screenshots: [secure location]
- [ ] Pilot summary: [link after approved collection]
- [x] Architecture diagram PNG: `docs/architecture/system.png` (`7a68341`; include the repository link in the final submission)

## Reproducibility

- [ ] Node 22+ and Python prerequisites documented.
- [ ] Public build variables documented without secrets.
- [ ] Backend and local Supabase setup tested from a clean clone.
- [ ] Web Vitest, Deno, pytest, pgTAP, build, and built-environment scan recorded.
- [ ] Extension typecheck, Vitest, build, manifest validation, and unpacked Playwright recorded.
- [ ] Hosted allowlist and production smoke checks recorded, or visibly marked skipped because protected secrets are unavailable.

## Safety and sign-off

- [ ] Historical service-account credential rotation approved and recorded privately.
- [ ] No `.env`, service-account JSON, access token, refresh token, or service-role key is committed.
- [ ] Website, extension, README, report, and pitch use the same capability/privacy claims.
- [ ] Team members approve their contribution text.
- [ ] Mentor/team owner signs off the report, video, deployed URL, and final checklist.
