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
- Web: `f7f80695907b21a0ee925c0621632ad1d5129be7`

---

### Deviations

- Chrome Web Store URL is still unknown. UI is invite-only; no store listing URL was invented.
- Dashboard help modal was not exercised in a real browser (MCP tab unavailable; dashboard also requires a signed-in session). Unit tests cover the modal.

Human gates from Phase 0 remain: key rotation and history rewrite were **not** performed.

---

### Exit / next

Phase 3 dead-link replacement, hash legal routes, and extension-help modal are done. Coordinator may start Phase 4. This executor did not start Phase 4.

---

## Phase 3 recheck — 2026-08-23

**Executor:** Grok 4.6 (defect-first review of Phase 3 only; Phase 4 not started)

### Git state at recheck (before follow-up edits)

#### `C:\Users\gjins\Desktop\studypilot`

```
git status --short
?? docs/plans/2026-08-21-uep-judging-readiness.md
?? output/

git diff --stat / git diff --cached --stat
(empty)

git log -3 --oneline
0c708a7 Record Phase 3 commit SHAs in the implementation log.
f7f8069 replace dead install/legal anchors with a validated Chrome CTA, hash legal routes, and an extension-help modal
42377d9 Record Phase 2 commit SHAs in the implementation log.

HEAD: 0c708a74d0bb7192d85d354c846955e480f2aa03
```

Untracked `output/` left untouched. Untracked judging-readiness plan was edited in the worktree (Phase 3 checkboxes) and **not** staged.

#### `C:\Users\gjins\Desktop\studypilot-extension`

```
git status --short
(empty)

HEAD: 2ce8dc77969d858c40230061e4f949f3d4af6767
```

No extension files were edited.

### Defects found

| Defect | Severity | Action |
|---|---|---|
| Legal skip-to-content used `href="#legal-content"`, which in this hash-router unmounts the legal page | Medium | Fixed: preventDefault, focus `#legal-content`, keep `LEGAL_HASHES[page]` |
| `parseChromeWebStoreUrl` hash `javascript:` check never matched because `url.hash` starts with `#` | Low | Fixed: `url.hash.slice(1)` |
| Validation tests omitted `javascript:` and relative junk | Low | Added assertions; existing assertions were not lowered |

Not defects: invite-only CTA with no invented store URL; host `chromewebstore.google.com` matches the plan and the official store; `openExtension` now opens the help modal; `#dashboard` view selection is React state and does not collide with `#/privacy` routes; no new `any` / `@ts-ignore` / eslint-disable in Phase 3 files.

### Verification re-run

- `npx vitest run src/App.navigation.test.tsx` — 15 passed, exit 0 (was 14; +1 skip-link regression)
- `npx vitest run src/App.claims.test.tsx` — 1 passed, exit 0
- `npx vitest run` — 13 files, 69 tests, exit 0 (was 68)
- Dead `href="#chrome|#install|#privacy|#terms|#cookies|#changelog"` in `src`: no matches
- Browser MCP: **blocked** (`No browser tab available` after `browser_tabs` list/new and `browser_navigate`). Not treated as a pass.

### Follow-up commit

Web: `5e5bca55b2da98c6b783d39874575c53f259a0ea`

No commit in `studypilot-extension`. Phase 4 was not started.

---

## Phase 4 — Store-valid MV3 package and unpacked E2E

**Date:** 2026-08-23  
**Executor:** Grok 4.6 (Phase 4 only; Phase 5 not started)  
**Repos:** `studypilot` (web log), `studypilot-extension` (canonical Chrome extension)

### Baseline git state (before Phase 4 commits)

#### `C:\Users\gjins\Desktop\studypilot`

```
git status --short
?? docs/plans/2026-08-21-uep-judging-readiness.md
?? output/

git diff --stat / git diff --cached --stat
(empty)

git log -1 --oneline
7d21bda Record Phase 3 checker follow-up SHA in the implementation log.

HEAD: 7d21bda54da91e182d1e64a415a0fbed82cd52d0
```

Untracked `output/` left untouched. Untracked judging-readiness plan was not staged.

#### `C:\Users\gjins\Desktop\studypilot-extension`

```
git log -1 --oneline
2ce8dc7 Align manifest, README, and panel copy with the beta's microphone, rubric-citation, and account-connection claims.

HEAD before Phase 4: 2ce8dc77969d858c40230061e4f949f3d4af6767
```

Pre-existing Phase 3 privacy defaults and honest claims were left in place. No Chrome Web Store URL was invented.

### What shipped

- Named permission `microphone` removed from `manifest.json`. Remaining named permissions: `activeTab`, `storage`, `offscreen`, `tabs`.
- Production Vite builds no longer inject loopback `host_permissions`. Only `npm run build:local` (`mode === 'studypilot-local'`) adds `http://127.0.0.1/*` and `http://localhost/*`.
- `scripts/validate-manifest.mjs` fails on named `microphone`, loopback host permissions, missing `offscreen`, or missing `USER_MEDIA` in dist/src runtime code.
- Persistent Chromium Playwright fixture loads unpacked `dist/` with `--disable-extensions-except` and `--load-extension`, waits for the MV3 service worker, and exposes the 32-character extension id.
- E2E covers: service worker + id, host mounts once, toolbar-equivalent toggle, launcher toggle, privacy defaults (screenshot and save-to-dashboard off), independent page-URL toggle, microphone denial with a recoverable status message, dashboard handoff via `window.open` without production secrets.
- Closed shadow root is still `mode: 'closed'`. E2E pierces it with CDP (`DOM.describeNode` + `Runtime.callFunctionOn`); product UI was not opened for testability.
- README documents the expected Chrome all-sites content-script warning, why `tabs`/`activeTab` remain, Windows and CI commands, and that a Playwright pass is not a `chrome://extensions` UI pass.

### Permissions kept and why

`rg` / search of `src` for `chrome.(tabs|scripting|activeTab)`:

- `chrome.tabs.query`, `chrome.tabs.sendMessage`, `chrome.tabs.captureVisibleTab` in `src/background/index.ts` and `src/background/liveRuntime.ts` → keep `tabs`.
- `chrome.tabs.captureVisibleTab` after a user gesture on pages not covered by API `host_permissions` → keep `activeTab`. Content-script matches are not host permissions.
- No `chrome.scripting` → do not request `scripting`.
- `chrome.storage.local` / `onChanged` → keep `storage`.
- `chrome.offscreen.createDocument` with reasons `USER_MEDIA` and `AUDIO_PLAYBACK` in `src/background/liveRuntime.ts` → keep `offscreen`. Mic capture stays getUserMedia in the offscreen document; there is no named `microphone` permission.
- Dashboard handoff uses `window.open(DASHBOARD_URL)`, not `chrome.tabs.create`.

Host permissions unchanged: Supabase, StudyPilot, Generative Language, Vertex AI. Content scripts still match `http://*/*` and `https://*/*`.

### Unpacked load / console result

Playwright Chromium (not the `chrome://extensions` page) loaded `dist/` successfully.

- Playwright 1.55.1, Chromium channel, headless persistent context.
- Service worker discovered; extension id matched `/^[a-p]{32}$/`.
- Built `dist/manifest.json` permissions: `["activeTab","storage","offscreen","tabs"]`.
- No named `microphone` permission. No loopback hosts in production `host_permissions`.
- Install log from `chrome.runtime.onInstalled`: `[StudyPilot] Installed. Click the toolbar icon to toggle the panel on any http/https page.` (listener still present; Playwright did not scrape `chrome://extensions`).
- `chrome://extensions` UI: **blocked** (not automated). Do not treat this phase as a manual Chrome Web Store / chrome://extensions pass.

### Verification

PowerShell in this environment does not accept `&&`, so the required chain was run as sequential commands that stop on nonzero exit.

#### `npm run typecheck`

```
> tsc -b --pretty false
exit code: 0
```

#### `npm test`

```
Test Files  11 passed (11)
     Tests  49 passed (49)
exit code: 0
```

#### `npm run build`

```
vite v6.4.3 building for production...
✓ 1993 modules transformed.
dist/manifest.json  1.70 kB
exit code: 0
```

#### `npm run validate:manifest`

```
validate-manifest: ok
  dist/manifest.json has no named microphone permission
  offscreen permission present
  no loopback host_permissions
  USER_MEDIA offscreen reason found in runtime code
  note: content_scripts still match http://*/* and https://*/* by design; Chrome will warn that the extension can read/change data on all websites
exit code: 0
```

#### `npx playwright test` (`npm run test:e2e`)

```
Running 8 tests using 1 worker
  ok 1 loads a service worker and assigns an extension id
  ok 2 injects the panel host once on an https-equivalent study page
  ok 3 toolbar-equivalent toggle opens and closes the panel
  ok 4 launcher toggle also opens the on-page panel
  ok 5 privacy defaults keep screenshot and dashboard save off
  ok 6 page URL context can be toggled independently of capture defaults
  ok 7 microphone denial shows a recoverable message
  ok 8 dashboard handoff opens a tab without production secrets
  8 passed (21.8s)
exit code: 0
```

Chromium was installed locally with `npx playwright install chromium` (browser binaries not committed).

#### Named `microphone` permission search

`Select-String -Path manifest.json,dist\manifest.json -Pattern 'microphone'`

```
(no matches)
```

String mentions of microphone in README/docs describe capture behavior and the absence of a named permission; they are not a manifest key.

### Deviations

- `chrome://extensions` was not driven by automation. Unpacked-load proof is Playwright only.
- E2E toolbar toggle sends `STUDYPILOT_TOGGLE_MODAL` from an extension page (`chrome-extension://<id>/src/offscreen.html`) because `serviceWorker.evaluate` did not expose `chrome.tabs` / `chrome.storage` in this Playwright version. That is the same message the real `chrome.action.onClicked` handler sends.
- Fixture session seed writes a shape-only `studypilot_supabase_access_session` so settings/mic UI is visible. It is not a production credential.
- Vitest excludes `e2e/**` so Playwright specs are not executed as unit tests.

Human gates from Phase 0 remain: key rotation and history rewrite were **not** performed. No deploy, no Chrome Web Store publish.

### Commits

- Extension: `809b8d1d6cab18f3545781d7e7430b2b459d32c7`
- Web: `d81cdf3bdd589ec2e01f12bf4672f801d8b75ac2`

### Exit / next

Phase 4 is done. Coordinator may run the Phase 4 checker. This executor did not start Phase 5.

---

## Phase 4 recheck — 2026-08-23

**Executor:** Grok 4.6 (defect-first review of Phase 4 only; Phase 5 not started)

### Git state at recheck (before follow-up)

#### `C:\Users\gjins\Desktop\studypilot`

```
?? docs/plans/2026-08-21-uep-judging-readiness.md
?? output/
HEAD: dbdcbf65f8dd17076eba6ad5e25d71ac48da6266
```

Untracked `output/` left untouched. Untracked judging-readiness plan was not staged.

#### `C:\Users\gjins\Desktop\studypilot-extension`

```
HEAD: 809b8d1d6cab18f3545781d7e7430b2b459d32c7
worktree clean before checker edits
```

### Defects found

| Defect | Severity | Action |
|---|---|---|
| Manifest validator had no self-test, so a regression that re-added `microphone` or loopback hosts would only fail after a full dist build | Medium | Fixed: `scripts/manifestPolicy.mjs` plus 9 unit tests that fail closed on microphone (named and optional), loopback hosts, missing `offscreen`, and missing `USER_MEDIA` |
| README treated Playwright as if it clicked the Chrome toolbar and denied Live offscreen `getUserMedia` | Low | Fixed: documented that toolbar E2E sends `STUDYPILOT_TOGGLE_MODAL` from `src/offscreen.html`, and mic E2E covers the in-page voice fallback |

Not defects: named `microphone` absent from source and `dist/manifest.json`; production `host_permissions` have no loopback; `scripting` absent and unused; `tabs` / `activeTab` used for `captureVisibleTab`, `tabs.sendMessage`, and `tabs.create`; content scripts still match `http://*/*` and `https://*/*` with the Chrome warning documented; Playwright 8/8 against unpacked `dist/`; `chrome://extensions` still not automated.

### Residual risks (not silent passes)

- Toolbar E2E does **not** fire `chrome.action.onClicked`. It sends the same toggle message the handler would send. A broken `onClicked` listener could still ship.
- Microphone E2E uses a shape-only session with no chats, so the mic button takes the in-page SpeechRecognition path, not Live offscreen `getUserMedia`.
- `chrome://extensions` UI remains a human gate.

### Verification re-run (extension)

- `npm run typecheck` — exit 0
- `npm test` — 12 files, 58 passed, exit 0 (was 49; +9 validator tests)
- `npm run build` — exit 0
- `npm run validate:manifest` — `validate-manifest: ok`, exit 0
- `npx playwright test` — 8 passed (20.7s), exit 0
- `microphone` in `manifest.json` and `dist/manifest.json` — no matches

### Follow-up commit

Extension: `f161f8cddf690da3159ee8ada0309bf56d55e94a`

Web: this log only. Phase 5 was not started.

---

## Phase 5–7 verification repair — 2026-08-24

**Executor:** Codex (reconciled the dirty Grok 4.6 worktree before continuing)

### Root causes found

- The working tree had reverted `backend/main.py` and `backend/rate_limit.py` to the pre-Phase-6 implementation while deleting the backend test suite. The committed app-factory/rate-limit guard was restored and the backend tests were restored.
- A TypeScript project-reference experiment changed the build to `tsc -b`, removed the Node types, and caused the production build to fail before Vite. The committed `tsc --noEmit` gate is the validated build path.
- The built-environment scanner had lost its narrow Supabase vendor-default sanitizer and therefore rejected the known `http://localhost:9999` GoTrue fallback in the generated bundle. The sanitizer was restored.
- The RLS pgTAP test used schema columns that do not exist (`raw_text`, `is_active`, `is_done`), omitted the required session `mode`, planned 42 assertions while running fewer, and attempted to read a temporary fixture table after switching to `authenticated`. The test was rewritten against the current migrations and grants `SELECT` on its fixture state before switching roles.
- Function privilege tests attempted to treat `public` as a Postgres role. The check now inspects ACL grantee `0` for PUBLIC and rejects malformed Management API responses before constructing the allowlist map.

### Verification

- `npm test` — 14 files, 85 tests passed.
- `python -m pytest backend/tests -q` — 25 tests passed (8 deprecation warnings from dependencies).
- Production build with approved placeholder public HTTPS values — passed.
- `node scripts/verify-built-env.mjs dist` — passed.
- `npx supabase test db` against a fresh local reset — 5 files, 287 tests passed.
- `npx supabase db lint --local --fail-on error` — exit 0; one existing warning for an unused local variable in `public.claim_live_rubric_lookup`.
- Commit: `7529dd3` (`test: restore release and database verification gates`).

### Remaining release gates

- `npm run verify:release` still requires public build environment variables in the invoking shell; hosted function verification remains skipped without `SUPABASE_ACCESS_TOKEN`.
- The historical Gitleaks finding for `backend/service-account.json` remains intentionally fail-closed until a human rotates the key and approves history rewriting.
- Dashboard and extension maintainability phases remain unstarted; existing `Dashboard.tsx` and `FloatingStudyPilot.tsx` are still oversized.

---

## Phase 10 CI gate start — 2026-08-24

- Web workflow now has independent non-secret jobs for Vitest/Deno/build scanning, Python pytest, local Supabase startup + pgTAP + unconditional cleanup, and a protected-main hosted function allowlist check with an explicit skip message when secrets are absent.
- Canonical extension workflow now runs Node 22 typecheck, Vitest, production build, manifest validation, Chromium installation, and unpacked-extension Playwright under Xvfb.
- Both workflows use dependency caching only and cancel superseded runs.
- Workflow YAML parsed successfully with PyYAML. Local equivalents for web, backend, and Supabase passed before this edit; extension’s previously recorded typecheck/Vitest/build/manifest/Playwright gates remain green.

---

## Phase 8A type-safety slice — 2026-08-24 (working tree)

- Replaced the three `Session`/`Rubric`/`ActionItem` `any` aliases in `Dashboard.tsx` with the typed dashboard API domain models.
- Added the persisted `screenshotPath` field to the dashboard session model and mapper, then removed snake_case fallback reads that masked type drift.
- `npx tsc --noEmit`, `npm test` (14 files / 85 tests), and an approved-environment production build passed; the built-environment scan passed afterward.
- This slice remains uncommitted because `Dashboard.tsx` already contained unrelated whitespace-only working-tree edits from the prior agent. The semantic changes are intentionally preserved for the next dashboard extraction commit.
- Follow-up commit `5f68749` adds compatibility aliases for realtime rows; targeted dashboard/chat tests pass (3 files / 19 tests).

### Phase 8A extraction result

- Commit `60fdd2b` extracted `DashboardShell`, `HomeView`, `ActionItemsView`, `SettingsView`, and shared dashboard primitives/types into `src/components/dashboard/`.
- `Dashboard.tsx` is now 2,461 lines (down from 3,249) and the extracted files range from 60 to 203 lines.
- `npx tsc --noEmit`, full Vitest (14 files / 85 tests), approved-environment production build, and `verify-built-env` all passed after extraction.
- The remaining 2,461-line shell still owns chat/session/rubric orchestration and views; Phase 8B is the next refactor slice.

### Phase 8B vertical-slice extraction — 2026-08-24

- Commit `23ab897` extracted chat rendering/composer, sessions and session detail, rubrics/upload/indexing, rubric status, and the right-side context panel into `src/components/dashboard/`.
- `Dashboard.tsx` is now 1,161 lines and retains data fetching, mutations, routing, and orchestration; no extracted component exceeds 800 lines.
- The extraction preserved the existing dashboard API boundary and typed rubric/session criteria instead of retaining the former `any` callback maps.
- `npx tsc --noEmit`, full Vitest (14 files / 85 tests), approved-environment production build, and `node scripts/verify-built-env.mjs dist` all passed after the extraction.
- Remaining Phase 8 work: split dashboard styles, replace boolean request flags with explicit state unions, and reduce the orchestration shell below the plan's 1,000-line target without changing behavior.

### Phase 9C dead-code and browser-AI cleanup — 2026-08-24

- Canonical extension commit `d9f9fb1` removed the unreferenced `VoiceSession.tsx`, `useVoiceSession.ts`, `mockDashboard.ts`, and browser-side `geminiService.ts` implementations after repository-wide import searches found no runtime consumers.
- Removed `@google/generative-ai` from `package.json` and `package-lock.json`; `npm prune --ignore-scripts` left `npm ls @google/generative-ai --depth=0` empty.
- Extension `npm run typecheck`, `npm test` (12 files / 58 tests), `npm run build`, and `npm run validate:manifest` all passed. Source/dist scans found no `VITE_GEMINI_API_KEY`, `GoogleGenerativeAI`, or `@google/generative-ai` references.
- Phase 9A/9B remain open: the large content-panel orchestration and Supabase facade still need characterization-first extraction.

### Phase 9B Supabase facade extraction — 2026-08-24

- Canonical extension commit `e281450` split the 1,100-line `studypilotSupabase.ts` into a two-line public facade plus `studypilotSupabase.auth.ts` (authentication/session transport) and `studypilotSupabase.chat.ts` (chat, coaching, session sync, and mapping).
- The facade re-exports the stable public API, so background and tests retain their existing imports. Auth and chat modules share the same authenticated REST/Edge transport helpers; no UI state was introduced.
- Targeted chat/local/sync tests passed (3 files / 9 tests), followed by the full extension suite (12 files / 58 tests), typecheck, production build, and manifest validation.
- Phase 9A remains open: `FloatingStudyPilot.tsx` still owns live/workspace orchestration and needs characterization-first hooks/panel extraction.

### Phase 9A safe panel-component extraction — 2026-08-24

- Canonical extension commit `279e91f` moved the pure panel/view components (`FlashcardViewer`, `QuizViewer`, `Orb`, controls, settings sheet, and quick-action glyphs) into `src/content/PanelComponents.tsx` while preserving the `SettingsSheet` export used by its privacy tests.
- `FloatingStudyPilot.tsx` fell from 3,218 to 2,748 lines; the remaining shell still owns live/workspace state and was intentionally not split without characterization coverage.
- Full extension Vitest (12 files / 58 tests), typecheck, and production build passed after extraction.
- Remaining Phase 9A work: extract the live and dashboard-workspace state machines, then compose the panel from focused `ExtensionPanel`, `ContextSettings`, and `QuickActions` components with narrow-width E2E coverage.
- The unpacked extension Playwright suite was re-run after the extraction: 8/8 tests passed, including panel injection, toolbar-equivalent toggle, privacy defaults, independent page-URL context, microphone denial recovery, and dashboard handoff.

### Phase 9A live-state characterization slice — 2026-08-24

- Canonical extension commit `c295320` added the pure `liveCoachingState` boundary and characterization tests for busy states and microphone/pause/freeze/fallback derivation.
- Fixed cleanup leaks in the extension shell: `voiceschanged` and dashboard `visibilitychange` listeners now remove the exact callback, and unmount cleanup stops speech recognition, cancels speech synthesis, and clears the notice timer.
- Extension verification after the slice: 13 Vitest files / 60 tests, typecheck, production build, manifest validation, and 8/8 unpacked Playwright tests passed.
- The full `useLiveCoaching` and `useDashboardWorkspace` extraction remains open; this slice deliberately reduces risk before moving those closures.

### Phase 10 extension CI secret-scan slice — 2026-08-24

- Canonical extension commit `5ea85a0` added a full-history Gitleaks job with checksum verification to the extension workflow, alongside the existing typecheck/test/build/manifest/Playwright quality job.
- Workflow YAML parsed successfully and the current source/browser-secret marker scan is clean. GitHub execution remains a CI/external gate.

### Phase 9A live coaching hook extraction — 2026-08-24

- Canonical extension commit `818a500` moved Live start/stop/pause/resume, microphone fallback/error mapping, runtime status application, and speech-recognition cleanup into `src/content/useLiveCoaching.ts`.
- `FloatingStudyPilot.tsx` fell from 2,748 to approximately 2,584 lines; the hook exposes the live state/control boundary while preserving the existing panel callbacks and privacy payload.
- Extension verification: 13 Vitest files / 60 tests, typecheck, production build, manifest validation, and 8/8 unpacked Playwright tests passed.
- Remaining Phase 9A work: workspace/chat reconciliation hook, focused panel composition, explicit invalid-state rendering, and 360/390px layout tests.

### Phase 12 architecture/documentation slice — 2026-08-24

- Added `docs/adr/0001-runtime-boundaries.md` documenting the FastAPI versus Supabase ownership decision, alternatives, consequences, and review trigger.
- Added `docs/architecture/system.mmd`, a left-to-right browser/dashboard → FastAPI/Supabase → Postgres/Storage/Vertex data-flow source.
- Rewrote `context/backend.md`, `context/dashboard.md`, and `context/app-map.md` to describe the current typed adapters, extracted dashboard views, canonical sibling extension, and verified commands instead of mock-only behavior.
- Updated README wording to identify the sibling extension as canonical and added the SEO artifact slice separately in commit `1e630dc`.
- Mermaid CLI is not installed in the environment, so the rendered `system.png` remains an explicit open artifact; do not mark it complete until the source is rendered and visually inspected.

### Phase 13 pilot-preparation slice — 2026-08-24

- Added `docs/validation/pilot-protocol.md` with one controlled rubric-to-dashboard task, fixed measures, neutral facilitation, consent, and privacy rules.
- Added `docs/validation/pilot-results.csv` with the locked anonymous schema and `pilot-summary.md` with evidence/limitations/quote sections.
- No participants were recruited or data collected; those remain human-approved external gates.

### Phase 14 submission-preparation slice — 2026-08-24

- Expanded `docs/submission/final-report-content.md` into the PDF's required nine-section order with evidence-qualified stack, architecture, features, challenges, and contribution placeholders.
- Added `docs/submission/demo-script.md` with the sub-two-minute golden path, fallback, and recording rules.
- Added `docs/submission/submission-checklist.md` for exact commits, links, verification evidence, safety sign-off, and human approvals.
- The report, video, deployed URL, pilot results, diagram PNG, and contribution approvals remain incomplete external deliverables.

### Phase 9A workspace and narrow-viewport follow-up — 2026-08-24

- Commit `d9ff60d` moved deterministic shared-chat selection and canonical-message presentation into `dashboardChatState.ts` with characterization tests; the full extension suite reached 14 Vitest files / 66 tests.
- Commit `1b33f60` extracted the quick-action chip composition into `QuickActions.tsx` without changing the parent panel wrapper or callback behavior.
- Commit `7a7051c` made the pause control unavailable outside an active Live state and prevented `togglePause` from creating an impossible idle/paused combination.
- Commit `f19a8ec` extracted auth, shared-chat reconciliation, session continuation, in-flight tracking, and dashboard bridging into `useDashboardWorkspace.ts`; it also hardens the no-runtime Live fallback to text/speech coaching.
- The extension now has 10 unpacked Playwright checks: rapid open/close host stability plus settled geometry assertions at 360×640 and 390×700. Typecheck, 14 Vitest files / 66 tests, production build, manifest validation, and the targeted repeated microphone fallback check passed. One full-suite run still exposed a timing-sensitive microphone assertion that reported the stale `Mic muted` label; rerun that case before treating the browser gate as green.
- Remaining Phase 9A: focused `ExtensionPanel`/context composition, direct workspace-hook characterization, save-queue coverage, and a browser-backed connected-chat golden flow.

### Phase 9A panel-shell composition — 2026-08-24

- Commit `da2dfb0` extracted the animated panel shell, header controls, menu, personality picker, and drag-handler wiring into `src/content/ExtensionPanel.tsx`.
- `FloatingStudyPilot.tsx` is now approximately 2,159 lines; the body still owns study/live/chat rendering and is the next composition boundary.
- Extension verification after the extraction: typecheck, 14 Vitest files / 66 tests, production build, manifest validation, and 10/10 unpacked Playwright checks passed, including narrow viewport and rapid-toggle coverage.

### Phase 9A chat-switcher composition — 2026-08-24

- Commit `53a3715` extracted the typed shared-chat selector, rubric readiness badge, create-chat action, and refresh action into `src/content/ChatSwitcher.tsx`.
- `FloatingStudyPilot.tsx` is now approximately 2,103 lines; the remaining body composition still contains study mode, voice dock, composer, history, and answer-card rendering.
- Extension verification after the extraction: typecheck, 14 Vitest files / 66 tests, production build, manifest validation, and 10/10 unpacked Playwright checks passed.

### Phase 9A save-queue characterization — 2026-08-24

- Commit `dfd0e14` added tests proving per-chat concurrency, aggregate busy-state cleanup, pending-drain behavior after executor errors, and recovery after a failed save.
- The queue behavior is now evidence-backed without changing the production queue implementation; targeted queue verification passed (7 tests).

### Phase 8A dashboard request-state slice — 2026-08-24

- Commit `281dafa` replaced the dashboard bootstrap `loading`/`loadError` boolean pair with the explicit `DashboardBootstrapState` union (`loading | ready | error`).
- The existing `Promise.allSettled` partial-load behavior and retry UI are preserved; fatal error remains limited to the authenticated case where sessions, rubrics, and action items all fail.
- Targeted dashboard chat/rubric tests (12 tests) and the production build passed. The pre-existing whitespace-only dashboard change remains unstaged and preserved.

### Phase 9A context-settings boundary — 2026-08-24

- Commit `a5d6687` moved the privacy/context `SettingsSheet` and toggle primitive into `src/content/ContextSettings.tsx`; `FloatingStudyPilot` continues to re-export the same component for existing tests/imports.
- `PanelComponents.tsx` now contains the visual study/quick-action primitives only; no privacy behavior changed.
- Extension verification after the extraction: typecheck, 14 Vitest files / 66 tests, production build, manifest validation, and 10/10 unpacked Playwright checks passed.
