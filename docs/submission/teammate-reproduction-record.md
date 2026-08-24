# StudyPilot teammate clean-clone reproduction record

**Status:** human-owned execution record — not completed evidence. A person
must perform the walkthrough and fill the results; this file does not claim a
teammate run, hosted availability, pilot outcomes, or final approval.

Use this record after the reviewed commits have been published or when the
team intentionally tests an exact local commit. The teammate should follow
the repository README without verbal help, using only the documented commands
and the approved public-placeholder build values. Never put passwords, access
tokens, service-account JSON, private URLs, demo-account credentials, or
participant data in this file or the repository.

## Owner and scope

- **Record owner:** [release or engineering lead]
- **Independent teammate:** [name supplied by team]
- **Walkthrough date/time:** [team supplies]
- **Web commit under test:** [exact pushed commit]
- **Extension commit under test (if applicable):** [exact pushed commit]
- **Clone location or CI artifact:** [secure/non-secret location]
- **Operating system and tool versions:** [team supplies]

The teammate must record the exact commit checked out. A dirty worktree,
untracked fixture, or undocumented environment change is a deviation and must
be listed below rather than silently repaired.

## Preconditions

- [ ] The web and canonical extension commits are available at the exact
  reviewed heads.
- [ ] The teammate has read `README.md` and this record before starting.
- [ ] No private credential is needed for the non-hosted command sequence.
- [ ] Production build checks use only the documented public placeholders; no
  hosted secret is copied into the shell, repository, or recording.
- [ ] The local Supabase lifecycle is allowed on the machine, or the skipped
  database step is recorded with its prerequisite.

## README walkthrough

Record the command output or a secure link to a redacted log for each step.
The canonical command sequence is maintained in `README.md`; do not replace a
failed command with an undocumented workaround.

| Step | Command or action | Result | Redacted log/artifact | Notes or deviation |
|---|---|---|---|---|
| Fresh clone and exact commit | `git clone`, checkout, `git status --short` | [pending] | [link] | [notes] |
| Install dependencies | `npm ci` | [pending] | [link] | [notes] |
| Web and claim tests | `npm test`, claim checks, pitch guard | [pending] | [link] | [notes] |
| Submission and pilot-template checks | submission tests/validator, `validate:pilot`, `summarize:pilot` | [pending] | [link] | [notes] |
| Public-placeholder production build | documented `npm run build` and `verify-built-env` | [pending] | [link] | [notes] |
| Web Playwright and backend checks | documented E2E, pytest, and local pgTAP sequence | [pending] | [link] | [notes] |
| Canonical extension checks | typecheck, Vitest, build, manifest validation, unpacked Playwright | [pending] | [link] | [notes] |
| README-only completion | teammate repeats the sequence **without verbal help** | [pending] | [link] | [notes] |

The public-placeholder build is local reproducibility evidence only. It must
not be described as proof of a deployed URL, hosted Edge Function, Chrome Web
Store availability, or production smoke test.

## Deviations and recovery

List every failed command, missing prerequisite, retry, or manual intervention.
For each deviation, record whether the command was rerun from a clean state and
whether the release owner accepted the deviation.

- **Deviation:** [none recorded / team supplies]
- **Root cause and exact command:** [team supplies]
- **Clean rerun or follow-up:** [team supplies]
- **Owner decision:** [team supplies]

## Sign-off

- [ ] The independent teammate confirms that the README sequence was followed
  without verbal help.
- [ ] The release owner confirms the exact commits, logs, and deviations.
- [ ] The team confirms that no private credentials or participant data were
  recorded.
- [ ] The mentor/team owner reviews this record separately from hosted demo,
  pilot, and final submission approvals.

