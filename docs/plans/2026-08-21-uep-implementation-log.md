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

---

## Phase 1 — Make privacy controls true end to end

**Date:** 2026-08-23  
**Executor:** Grok 4.6 (Phase 1 only; stopped for human review)  
**Repos:** `studypilot` (web), `studypilot-extension` (canonical Chrome extension)

Phase 2 and later were not started.

Owner “go ahead” was interpreted as: start Phase 1; the five previously dirty extension files may be edited. Credentials were **not** rotated. Git history was **not** rewritten.

---

### Baseline git state (before Phase 1 edits)

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
075b472 docs: record Phase 0 recheck commit SHA in the implementation log

HEAD: 075b4725db8da45f59dbfd8b3f9bcd699da968ac
```

Untracked `output/` was left untouched. Untracked judging-readiness plan was not committed.

#### `C:\Users\gjins\Desktop\studypilot-extension`

```
git status --short
(empty)

git diff --stat / git diff --cached --stat
(empty)

git log -1 --oneline
ff9f78b Merge remote-tracking branch origin/gresa into main

HEAD: ff9f78b38c1b0926f66725da4fd945f42bb2bc38
```

---

### What changed

Privacy capture and dashboard persistence now default **off**, travel as a required `SessionPrivacyOptions` payload on `STUDYPILOT_LIVE_START`, and are honored in page capture and the live-token request. Settings copy and the landing-page “Local” claim use the same cloud-processing vs storage distinction.

Extension files:

- `src/shared/types.ts` — `SessionPrivacyOptions`, `DEFAULT_SESSION_PRIVACY` (both `false`), `DEFAULT_CONTEXT_SHARE_SETTINGS`, `isSessionPrivacyOptions`, `sessionPrivacyFromContext`
- `src/shared/extensionMessages.ts` — `STUDYPILOT_LIVE_START` requires `privacy`; `parseLiveStartPayload` rejects malformed payloads
- `src/background/index.ts` — validates live-start privacy; typed `{ ok: false, error }` on malformation
- `src/background/liveRuntime.ts` — `privacy.captureScreenshot` gates tab capture; `privacy.saveToDashboard` is sent to `fetchLiveToken`; reconnect uses stored privacy (no hardcoded `true` on the token path)
- `src/content/FloatingStudyPilot.tsx` — settings default off; independent page-context vs capture/save groups; Vertex / screenshot / dashboard disclosure
- `src/live/messages.ts` — live-start payload aligned
- `src/styles/tailwind.css` — settings group/disclosure styles
- `src/content/privacyDefaults.test.tsx` (new)
- `src/background/liveRuntime.privacy.test.ts` (new)

Web files:

- `src/App.tsx` — replaced the “Local” / stay-on-device claim with the same processing vs storage disclosure. The install blurb on that same landing page was updated so it would not contradict the replacement. Tab-audio / exact-second / no-account copy was left for Phase 2.

---

### Verification

#### Extension focused tests

`npm test -- --run src/content/privacyDefaults.test.tsx src/background/liveRuntime.privacy.test.ts`

```
Test Files  2 passed (2)
      Tests  11 passed (11)
exit code: 0
```

#### Extension full suite

`npm test`

```
Test Files  11 passed (11)
      Tests  49 passed (49)
exit code: 0
```

#### Extension typecheck

`npm run typecheck` — exit 0

#### Hardcoded live-start `true` search

`rg -n "captureScreenshot:\s*true|saveToDashboard:\s*true" src`

Matches only tests that assert a user-enabled `true`, plus the existing coaching fixture `src/shared/studypilotSupabase.chat.test.ts` (`saveToDashboard: true` is not a live-start default or token-request call).

No live-start default or `fetchLiveToken` call hardcodes `true`.

#### Web tests

No `App` unit test file exists. Did not add Phase 2 `App.claims.test.tsx`. Ran the existing web suite after the landing copy change:

`npm test`

```
Test Files  11 passed (11)
      Tests  53 passed (53)
exit code: 0
```

#### Manual sessions

**Blocked.** Prerequisites missing: a loaded unpacked extension build and a signed-in dashboard user. This agent did not load Chrome or run a live mic session. Do not treat this as a pass.

Required later:

1. Both controls off → no screenshot, no persisted dashboard session after Live stops.
2. Save-only → persist text/session, no screenshot.

---

### Commits

- Extension: `dcfe82ded53a08a7c25182a88cec8b24b54cc220`
- Web: `2cabd54fece42985e7549b5ee371fbdf92624ce3`

---

### Deviations

None from locked product decisions.

Related notes (not deviations):

- Live reconnect now sends the session’s stored `saveToDashboard` instead of a hardcoded `true`, so a later token request cannot silently persist after the user started with save off.
- The landing install paragraph was updated with the Local-claim replacement so that one surface would not still say audio stays on-device.
- `const seed = true` in `startLive` still means “seed chat history on a fresh LIVE_START”, not screenshot/save defaults.

Human gates from Phase 0 remain: key rotation and history rewrite were **not** performed.

---

### Exit / next

Phase 1 code and automated checks are done. Manual unpacked-extension sessions are blocked. Request approval to begin Phase 2.

---

## Phase 2 — Align every public claim with the beta

**Date:** 2026-08-23  
**Executor:** Grok 4.6 (Phase 2 only; stopped for human review)  
**Repos:** `studypilot` (web), `studypilot-extension` (canonical Chrome extension)

Phase 3 and later were not started.

Owner “Start phase 2” was interpreted as: align public claims only. Privacy defaults from Phase 1 were **not** reverted. No LegalPage, productLinks, Playwright, or dashboard extract.

---

### Baseline git state (before Phase 2 edits)

#### `C:\Users\gjins\Desktop\studypilot`

```
git status --short
?? docs/plans/2026-08-21-uep-judging-readiness.md
?? output/

git diff --stat / git diff --cached --stat
(empty)

git log -1 --oneline
56de4a2 docs: record Phase 1 commit SHAs in the implementation log

HEAD: 56de4a2cf7864a3b5d94c8b417eb59e216ceb777
```

Untracked `output/` was left untouched. Untracked judging-readiness plan was not committed.

#### `C:\Users\gjins\Desktop\studypilot-extension`

```
git status --short
(empty)

git log -1 --oneline
dcfe82d Make screenshot capture and dashboard save default off and honor the chosen privacy options in the live session path.

HEAD: dcfe82ded53a08a7c25182a88cec8b24b54cc220
```

---

### Pre-edit search (forbidden phrases)

Web `src`, `README.md`, and `docs/submission` (path did not exist yet):

- `src/App.tsx` Listen: “Picks up tab audio…”
- `src/App.tsx` Ask: “cite the exact second…”
- `src/App.tsx` workflow: “No accounts to wire up…”
- `src/components/Dashboard.tsx` settings: “Audio and transcripts stay on your device…”

Extension `src`, `README.md`, `manifest.json`: no `tab audio` / `exact second` / `stay on your device` / `no account` hits. Connect copy already asked users to sign in; it was rewritten to the locked phrase.

---

### What changed (user-visible replacements)

| Before | After |
|---|---|
| “picks up tab audio” | “Uses your microphone and the page context you choose to share.” |
| “answers cite the exact second” | “Answers can cite retrieved rubric or uploaded-document evidence when grounding is available.” |
| “audio and transcripts stay on your device” (dashboard settings) | Phase 1 disclosure: live mic audio is processed by Google Vertex AI while a session is active; screenshots only when enabled; chat/session save only when “Save to dashboard” is on. |
| “No accounts to wire up…” | “Sign in once to connect the extension and dashboard.” |
| `index.html` description | “StudyPilot is a rubric-aware study coach across your browser and dashboard.” |
| Extension manifest description | Same rubric-aware coach sentence. |
| Extension connect panel / `STUDYPILOT_CONNECT_MESSAGE` | “Sign in once to connect the extension and dashboard.” |

Related copy (same phase, so the landing would not contradict the replacements):

- Capabilities intro no longer says “Nothing to upload”.
- Fast principle no longer claims “under a second”.
- Footer no longer says “Privacy-first”.
- READMEs now use the locked product story and processing disclosure.

`docs/submission/final-report-content.md` was started with Overview / Problem / Solution only. No unmeasured outcome claims. Later report sections were not written.

---

### Extra files beyond the listed set

- `src/components/Dashboard.tsx` — required. The verify `rg` searches all of `src`; the settings privacy card was a public product claim.
- `src/shared/config.ts` (extension) — user-visible connect error string in `src`, aligned to the same sign-in phrase.

Not done: LegalPage, productLinks, Playwright, dashboard extract, deleting `studypilot/extension/`.

---

### Verification

#### Web claims test

`npm test -- --run src/App.claims.test.tsx`

```
Test Files  1 passed (1)
      Tests  1 passed (1)
exit code: 0
```

#### Web full unit suite

`npm test`

```
Test Files  12 passed (12)
      Tests  54 passed (54)
exit code: 0
```

(Was 53 tests before this phase; +1 claims test.)

#### Extension full unit suite (copy-only change)

`npm test`

```
Test Files  11 passed (11)
      Tests  49 passed (49)
exit code: 0
```

#### Phrase search after edits

Web (listed paths):

`rg -ni "tab audio|exact second|stay on your device|no account" src README.md docs/submission`

Hits (not product claims):

```
src/App.claims.test.tsx:50:    expect(lower).not.toContain('tab audio');
src/App.claims.test.tsx:51:    expect(lower).not.toContain('exact second');
src/App.claims.test.tsx:52:    expect(lower).not.toContain('stay on your device');
src/App.claims.test.tsx:53:    expect(lower).not.toContain('no account');
```

Those lines exist only to assert the phrases are **absent** from the rendered landing page. They were not rewritten.

Same command with test files excluded: no matches (rg exit 1).

Web has no `manifest.json`. That path was omitted so rg would not fail on a missing file.

Extension:

`rg -ni "tab audio|exact second|stay on your device|no account" src README.md manifest.json`

```
(no matches)
rg exit: 1
```

Outside search paths (left unchanged):

- Extension `package.json` description still says “voice-first” (not in the listed Phase 2 files or the verify `rg` paths).
- Web README local-dev note “No login form is required” does **not** match `no account`. It describes local developer auth, not product onboarding.

#### Human read-through

**Awaiting owner.** One teammate should read the website, extension disclosure, README, and report overview side by side. This agent did not mark that check as passed.

#### Browser landing check

Cursor browser MCP could not open a tab (`No browser tab available` after `browser_tabs` new + `browser_navigate`). The claims test rendered `<App />` in jsdom and asserted the replacement strings plus `PROCESSING_DISCLOSURE`. Vite was started at `http://127.0.0.1:5173/` for a manual look.

---

### Commits

- Extension: `2ce8dc77969d858c40230061e4f949f3d4af6767`
- Web: `e5375b3270a5728f2844198f8b4c51e65d397cf5`

---

### Deviations

None from locked product decisions. Phase 1 privacy defaults were not reverted.

Human gates from Phase 0 remain: key rotation and history rewrite were **not** performed.

---

### Exit / next

Phase 2 public-claim alignment and automated checks are done. Human side-by-side read-through is awaiting the owner. Request approval to begin Phase 3.

---

## Phase 3 — Replace dead links and the no-op extension action

**Date:** 2026-08-23  
**Executor:** Grok 4.6 (Phase 3 only; did not start Phase 4)  
**Repos:** `studypilot` (web). Extension was not modified.

---

### Baseline git state (before Phase 3 edits)

#### `C:\Users\gjins\Desktop\studypilot`

```
git status --short
(empty tracked work; untracked plan + output/)

git diff --stat
(empty)

git diff --cached --stat
(empty)

git log -1 --oneline
42377d9 Record Phase 2 commit SHAs in the implementation log.

HEAD: 42377d9f952756f5acd24a88f16efd3bbcf2a861
```

Untracked `output/` was left untouched. Untracked `docs/plans/2026-08-21-uep-judging-readiness.md` was left untracked.

#### `C:\Users\gjins\Desktop\studypilot-extension`

```
git status --short
(empty)

git log -1 --oneline
2ce8dc7 Align manifest, README, and panel copy with the beta's microphone, rubric-citation, and account-connection claims.

HEAD: 2ce8dc77969d858c40230061e4f949f3d4af6767
```

No extension files were edited.

Phase 1 privacy defaults and Phase 2 claim language were left in place.

---

### What shipped

- `.env.example` documents optional `VITE_CHROME_STORE_URL`. Invalid or empty values are treated as unconfigured. No store URL is present in local env files; production without a store URL shows invite-only UI rather than crashing.
- `src/lib/productLinks.ts` accepts only `https://chromewebstore.google.com/` URLs (https, exact host, no credentials).
- Landing, nav, install, and footer Chrome CTAs: valid store URL → “Add to Chrome”; otherwise disabled “Chrome beta — invite only” plus `mailto:hello@studypilot.app?subject=StudyPilot%20beta%20access`.
- Dead `#chrome` / `#install` / `#privacy` / `#terms` / `#cookies` / `#changelog` fragment links removed. Legal routes are `#/privacy`, `#/terms`, `#/cookies`, `#/changelog`.
- Dashboard “Open extension” opens a help modal: install, pin, click the toolbar icon; store link when configured, otherwise the beta mailto.
- Auth card links to `#/privacy` and `#/terms`. Cookie page states essential auth/local-storage only, no advertising cookies, and repeats the Phase 1 cloud-processing disclosure with a link to Privacy Policy.
- Hash routing uses the existing `hashchange` listener so browser Back returns to the previous view. No router library added.

---

### Verification

#### `npx vitest run src/App.navigation.test.tsx`

```
Test Files  1 passed (1)
     Tests  14 passed (14)
exit code: 0
```

#### `npx vitest run src/App.claims.test.tsx`

```
Test Files  1 passed (1)
     Tests  1 passed (1)
exit code: 0
```

#### `npx vitest run` (full web suite)

```
Test Files  13 passed (13)
     Tests  68 passed (68)
exit code: 0
```

#### Dead fragment search

`rg -n 'href="#(chrome|install|privacy|terms|cookies|changelog)"' src`

```
(no matches)
rg exit: 1
```

Legal routes in source are `#/privacy` etc., not `#privacy`.

Forbidden claim phrases (`tab audio`, `exact second`, `stay on your device`, `no account`) appear only as negative assertions in tests.

#### Browser

Cursor browser MCP could not open a tab (`No browser tab available` after `browser_tabs` list + `browser_navigate` with `newTab: true`). Same blocker as Phase 2. Vite was running at `http://127.0.0.1:5174/` (5173 already in use). Landing CTA, footer privacy → Back, and dashboard help modal were covered by unit tests, not a visual browser pass.

---

### Commits

- Extension: unchanged (`2ce8dc77969d858c40230061e4f949f3d4af6767`)
- Web: pending SHA-record after the Phase 3 work commit

---

### Deviations

- Chrome Web Store URL is still unknown. UI is invite-only; no store listing URL was invented.
- Dashboard help modal was not exercised in a real browser (MCP tab unavailable; dashboard also requires a signed-in session). Unit tests cover the modal.

Human gates from Phase 0 remain: key rotation and history rewrite were **not** performed.

---

### Exit / next

Phase 3 dead-link replacement, hash legal routes, and extension-help modal are done. Coordinator may start Phase 4. This executor did not start Phase 4.
