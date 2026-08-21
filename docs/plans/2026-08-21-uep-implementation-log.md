# UEP Implementation Log

## Phase 0 — Reconcile state and close the credential incident

**Date:** 2026-08-21  
**Executor:** Grok 4.6 (Phase 0 only; stopped for human review)  
**Repos:** `studypilot` (web), `studypilot-extension` (canonical Chrome extension)

Phase 1 and later were not started.

---

### Baseline git state (before edits)

#### `C:\Users\gjins\Desktop\studypilot`

```
git status --short
?? docs/
?? output/

git diff --stat
(empty)

git diff --cached --stat
(empty)

git log -1 --oneline
0cd0d99 chore: remove tracked service account credential

HEAD: 0cd0d9967ca6773662aca784602e837954dcad84
branch: main
```

Untracked `output/` was left untouched. Untracked `docs/plans/2026-08-21-uep-judging-readiness.md` was left untracked (pre-existing plan, not a Phase 0 product file).

#### `C:\Users\gjins\Desktop\studypilot-extension`

```
git status --short
 M manifest.json
 M src/background/index.ts
 M src/shared/extensionMessages.ts
 M src/shared/studypilotSupabase.ts
 M src/shared/types.ts

git diff --stat
(empty)

git diff --cached --stat
(empty)

git log -1 --oneline
ff9f78b Merge remote-tracking branch origin/gresa into main

HEAD: ff9f78b38c1b0926f66725da4fd945f42bb2bc38
branch: main
```

No extension files were edited, checked out, restaged, or EOL-normalized.

---

### Five-file mystery (extension)

**Question:** Why did git report five modified files when `git diff` showed no text?

**Cause:** Stale / racy index stat cache after a same-second mtime bump, with **zero** content, mode, or EOL change versus `HEAD`.

**Proof (files not rewritten):**

| Check | Result |
|---|---|
| `git diff`, `git diff --raw`, `git diff --stat`, `git diff --numstat`, `git diff --ignore-cr-at-eol --ignore-space-at-eol` | Empty |
| `git ls-files -v` / `-t` | `H` (normal cached; not skip-worktree, not assume-unchanged) |
| Index mode | `100644` for all five; `flags: 0` |
| `git hash-object` vs `git hash-object --path` vs index blob vs `HEAD:<path>` | Identical SHA for every file |
| Worktree size vs index `size` | Identical |
| Line endings | Worktree is CRLF, no LF-only, no BOM. Raw blob SHA matches index, so the index blob is the same CRLF bytes (no conversion pending). |
| `core.autocrlf` | `true` (Git for Windows system config). No repo `.gitattributes`. `git check-attr -a` empty for these paths. |
| Filters | No smudge/clean/ident attributes |

Worktree `LastWriteTime` for all five files was `2026-08-21 11:20:28` local (same second). Index `mtime` already stored that timestamp with NTFS 100-ns fractions; `dev`/`ino` are `0` (typical on Windows). `git update-index --refresh` reported `needs update` and exited `1` (stat cache not trusted; **it did not rewrite file bytes**).

A later `git status` hashed the blobs, found them equal to the index, and refreshed the cached stat as a normal Git side effect. After that, `git status --short` in the extension repo was clean. That is a harmless index-stat refresh, not an EOL normalization.

**Not done:** `git add`, `git checkout --`, `.gitattributes` changes, or `core.autocrlf` changes.

**Owner confirmation still requested:** the simultaneous 11:20:28 mtime bump on exactly the Phase 1 paths looks like an editor, sync tool, or another agent touching those files without leaving a content diff. Confirm that no intentional uncommitted work was expected there.

---

### Credential history search (values never printed)

```
git log --all --name-only -- backend/service-account.json
```

- `1e0f6bb` (`2026-08-06`) — **created** `backend/service-account.json`
- `0cd0d99` (`2026-08-20`) — **removed** the tracked file (`chore: remove tracked service account credential`)

`git log --all --name-only -- backend/service-account.json` lists only those two commits. Merges may have carried the blob without being a third path-changing commit.

Metadata-only inspection of blob `1e0f6bb:backend/service-account.json`:

- Size: 2365 bytes
- JSON keys present: `type`, `project_id`, `private_key_id`, `private_key`, `client_email`, `client_id`, `auth_uri`, `token_uri`, `auth_provider_x509_cert_url`, `client_x509_cert_url`, `universe_domain`
- `type == service_account`: yes
- `private_key` present, looks like PEM, length 1704 characters
- **No key IDs, emails, project IDs, or PEM bodies were copied into this log**

Treat as a real Google service-account key until an owner proves otherwise.

Gitleaks **default** scan (redacted, before project config): 39 commits, **2** findings:

1. Rule `private-key` — `backend/service-account.json` — commit `1e0f6bb`
2. Rule `jwt` — `.env.studypilot-local` — commit `e36e01d` (official Supabase CLI local demo anon JWT; not a hosted secret)

---

### Files added (web repo only)

| File | Role |
|---|---|
| `SECURITY.md` | Permitted secret locations, `VITE_*` public-only rule, revocation steps, contacts, known incident |
| `.gitleaks.toml` | Default rules plus **path-only** allowlist for `.env.studypilot-local` |
| `.github/workflows/ci.yml` | Minimal CI: secret-scan job only (later phases expand tests) |
| `docs/plans/2026-08-21-uep-implementation-log.md` | This log |

`.gitleaks.toml` does **not** allowlist `backend/service-account.json` or any private-key/token regex.

---

### Verification

Gitleaks **8.30.1** was not on PATH. It was installed user-locally to `%LOCALAPPDATA%\Programs\gitleaks\` from the official Windows x64 zip (SHA-256 `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`).

#### Required: `gitleaks git --redact --no-banner`

With `--config .gitleaks.toml`:

```
39 commits scanned.
scanned ~1979949 bytes (1.98 MB)
leaks found: 1
exit code: 1
```

Remaining finding (redacted): rule `private-key`, file `backend/service-account.json`, commit `1e0f6bbe5cdf`. The local-demo JWT allowlist worked.

**This check did not exit 0.** That is expected until a human rotates the key (if it was ever valid) and, if required, rewrites history. CI is supposed to keep failing on this finding. Do not allowlist it.

#### Required: `git ls-files | rg -i "service-account|credentials|\.env$"`

```
(no filename matches)
rg exit: 1
```

No tracked file named like a real secret. Broader filename listing (still contents not printed) of tracked env-related paths:

- `.env.docker.example`
- `.env.example`
- `.env.studypilot-local` (approved local Supabase CLI fixture)
- `backend/.env.example`
- `supabase/functions/.env.local.example`

#### Extra (not the Phase 0 gate): `gitleaks directory`

Exits `1` on this machine because it walks **gitignored** local files (`kind` only, no values):

- jwt: `.env`, `.env.local`, `backend/.env` (expected local developer env; do not commit)
- jwt: `dist/assets/*.js` (built bundle; `dist/` is gitignored)
- generic-api-key: `backend/.venv/...` (third-party false positives)
- jwt / generic-api-key: `supabase/.temp/start-secrets/...` (local CLI state; gitignored)

CI uses `gitleaks git` on the repository, not a dirty worktree directory scan.

---

### Commit

Phase 0 web commit: `ea4489e888ab2fbe3ed6054d7862c1db3506586d`

```
ea4489e chore: add secret scanning, SECURITY.md, and gitleaks config so credential incidents fail CI without rewriting history
```

No commit in `studypilot-extension`.

---

### Blockers and human gates

1. **Rotate** the Google service-account key that lived at `backend/service-account.json` immediately if it was ever valid. Record rotation date and key ID in a **private incident record, not in git**.
2. **Approve and coordinate** `git filter-repo --path backend/service-account.json --invert-paths` plus protected-branch force-push **only if** that file contained a valid credential. Do not perform the rewrite from this agent session.
3. **`gitleaks git` exit 1** until history no longer contains that private key. The new CI job will fail pushes/PRs for the same reason.
4. Confirm the five extension files were not meant to hold uncommitted work (mtime bump 2026-08-21 11:20:28).
5. Do not start Phase 1 until the owner accepts this Phase 0 report.

---

### Deviations from the written verify line

The plan originally said “`gitleaks git` exits 0”. That cannot be met without either rewriting history or allowlisting a real private key. Phase 0 chose **not** to hide the historical key. The plan verify line was corrected during the Phase 0 recheck (plan file remains untracked). Everything else in Phase 0 was implemented.

---

## Phase 0 recheck — 2026-08-21

**Executor:** Grok 4.6 (defect-first review of Phase 0 only; Phase 1 not started)

### Git state at recheck (before follow-up edits)

#### `C:\Users\gjins\Desktop\studypilot`

```
git status --short
?? docs/plans/2026-08-21-uep-judging-readiness.md
?? output/

git diff --stat
(empty)

git diff --cached --stat
(empty)

git log -1 --oneline
175bbbe docs: record Phase 0 commit SHA in the implementation log
```

Untracked `output/` left untouched. Untracked plan file was edited in the worktree (Phase 0 checkboxes + honest verify line) and **not** staged.

#### `C:\Users\gjins\Desktop\studypilot-extension`

```
git status --short
(empty)

git diff --stat / git diff --cached --stat
(empty)

git log -1 --oneline
ff9f78b Merge remote-tracking branch origin/gresa into main
```

Five previously dirty files (`manifest.json`, `src/background/index.ts`, `src/shared/extensionMessages.ts`, `src/shared/studypilotSupabase.ts`, `src/shared/types.ts`): `git diff --raw` empty; `git ls-files -v` shows `H` (normal cached). No EOL normalization, checkout, or restage.

### Defects found

| Defect | Severity | Action |
|---|---|---|
| `ci.yml` used floating `actions/checkout@v4`, piped Gitleaks into `/usr/local/bin` with no checksum (install could fail for the wrong reason, or run a tampered binary) | High | Fixed: pin checkout SHA, checksum the upstream tarball, install into `$RUNNER_TEMP` |
| CI missing concurrency, `persist-credentials: false`, timeout, and a teammate-facing “expected red until history rewrite” header | Medium | Fixed |
| `SECURITY.md` implied Vertex keys might belong near FastAPI/`backend/`; the incident was a service-account JSON in `backend/`, while Edge Functions own Vertex | Medium | Fixed: table and runbook now match the repo |
| Plan verify line claimed `gitleaks git` exits 0 | Medium | Corrected in the untracked plan; not committed |
| Log listed merge `adb9ac6` as a `service-account.json` path commit; `git log --all --name-only -- backend/service-account.json` does not | Low | Corrected above |
| README had no pointer to `SECURITY.md` | Low | Added a short Security section |

Not defects: historical Gitleaks finding still present (expected); Gitleaks allowlist is path-only for `.env.studypilot-local`; human rotation / `filter-repo` were documented and not performed; Gitleaks assertions were not lowered.

### Verification re-run (redacted)

Gitleaks **8.30.1** at `%LOCALAPPDATA%\Programs\gitleaks\gitleaks.exe` (official windows_x64 zip SHA-256 `d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e` matches upstream `gitleaks_8.30.1_checksums.txt`).

#### `gitleaks git --redact --no-banner --config .gitleaks.toml`

```
41 commits scanned.
scanned ~1994843 bytes (1.99 MB)
leaks found: 1
exit code: 1
```

Remaining finding (redacted): rule `private-key`, file `backend/service-account.json`, commit `1e0f6bbe5cdf`. Extra check: `--log-opts=HEAD^..HEAD` scanned 1 commit, **no leaks, exit 0** — current tree is clean; only history still fails. CI must keep scanning full history.

#### `git ls-files` filtered `service-account\|credentials\|\.env$`

```
(no filename matches)
```

Approved tracked env-related paths (contents not printed): `.env.docker.example`, `.env.example`, `.env.studypilot-local`, `backend/.env.example`, `supabase/functions/.env.local.example`. Also tracked: `src/vite-env.d.ts` (TypeScript types, not a secret file).

### Follow-up commit

Recheck web commit: `656b7b73918e327c95c1badd18959c612585298e`

```
656b7b7 fix: harden Phase 0 secret-scan CI so historical credentials fail closed for the right reason
```

No commit in `studypilot-extension`.

### Human gates (unchanged)

1. Rotate the Google service-account key from `backend/service-account.json` if it was ever valid. Private incident record only.
2. Approve/coordinate `git filter-repo --path backend/service-account.json --invert-paths` plus protected-branch force-push if that key was valid.
3. Confirm the five extension files were not meant to hold uncommitted work.
4. Do not start Phase 1 until the owner accepts Phase 0.
