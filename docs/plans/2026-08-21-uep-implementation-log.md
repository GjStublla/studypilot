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
- `adb9ac6` — merge that carried the file
- `0cd0d99` (`2026-08-20`) — **removed** the tracked file (`chore: remove tracked service account credential`)

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

Phase 0 is committed only in `studypilot` (web). Identify it with:

```
git log --oneline -1 -- SECURITY.md .gitleaks.toml .github/workflows/ci.yml
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

The plan’s “`gitleaks git` exits 0” line cannot be met without either rewriting history or allowlisting a real private key. Phase 0 chose **not** to hide the historical key. Everything else in Phase 0 was implemented.
