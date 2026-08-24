# UEP submission checklist

## Evidence and links

- [ ] Web repository commit: [exact SHA]
- [ ] Canonical extension repository commit: [exact SHA]
- [ ] Deployed web URL: [URL or explicit not-deployed statement]
- [ ] Chrome Web Store/beta-access state: [link or state]
- [ ] Demo video: [link]
- [ ] Backup video/screenshots: [secure location]
- [ ] Pilot summary: [link after approved collection]
- [ ] Architecture diagram PNG: [link after rendering]

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
