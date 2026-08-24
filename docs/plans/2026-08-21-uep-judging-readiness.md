# Plan: StudyPilot UEP Judging-Readiness Remediation

**Prepared:** 2026-08-21  
**Executor:** Grok 4.6 or another zero-context implementation agent  
**Repositories:**

- Web, dashboard, FastAPI, and Supabase: `C:\Users\gjins\Desktop\studypilot`
- Canonical Chrome extension: `C:\Users\gjins\Desktop\studypilot-extension`

## Outcome

Ship an honest, stable, secure StudyPilot beta and produce every artifact required by the University Engagement Program 5.0 submission document:

1. A complete final report covering the project, problem, solution, development process, stack, architecture, features, challenges, and team contributions.
2. Clean, committed, documented code with reproducible setup and verification commands.
3. A deployed end-to-end product flow and a clear demo video no longer than two minutes.

The product story should be one sentence throughout the website, extension, report, and pitch:

> StudyPilot is a rubric-aware coaching loop across the browser and dashboard: it uses the page, the student's question, and an uploaded rubric to coach the next improvement, then carries the conversation and action items into the dashboard.

## Current Baseline

Record this baseline before editing so regressions are obvious:

| Surface | Current evidence on 2026-08-21 |
|---|---|
| Web unit/component tests | 53 passed |
| Supabase Edge/Deno tests | 42 passed |
| Web production build | Passed |
| Extension tests | 38 passed |
| Extension production build | Passed |
| FastAPI | `python -m compileall -q backend` passed; no endpoint test suite exists |
| Web Lighthouse | Performance 94, Accessibility 96, Best Practices 100, SEO 92 |
| Not yet verified | Local full stack, pgTAP against a running database, deployed Edge Function allowlist, unpacked Chrome E2E, real production smoke test |

Repository-state cautions:

- `studypilot` is at `0cd0d99`; `output/` is untracked and must be preserved.
- `studypilot-extension` is at `ff9f78b`. Git reports five modified files (`manifest.json`, `src/background/index.ts`, `src/shared/extensionMessages.ts`, `src/shared/studypilotSupabase.ts`, and `src/shared/types.ts`) even though `git diff` currently shows no text. Inspect and preserve this state before changing those files.
- The production extension is the sibling repository. The tracked `studypilot/extension/` directory is an obsolete scaffold.
- Never print, copy, or commit `.env` contents, service-account JSON, access tokens, refresh tokens, or Supabase service-role keys.

## Current status update — 2026-08-24

The historical baseline above is retained for auditability. Local verification
has since reached web Vitest 19/103, Deno 42, FastAPI pytest 26, Supabase pgTAP
5 files/291 tests after a fresh reset, web Playwright 4/4, extension Vitest
17/84, extension Playwright 13/13, production builds, and manifest/built-env
scans. A clean clone now passes the documented non-hosted gates after
`d694163` makes missing Supabase browser configuration loadable; a bare
production build still fails closed until public HTTPS variables are supplied.
Hosted deployment, real Vertex Live, credentials/history, pilot data, branch
protection, store access, and final report/video/team approvals remain open.

## Executor Contract

Grok must follow these rules during implementation:

1. Run `git status --short`, `git diff --stat`, and `git diff --cached --stat` in both repositories before every phase. Preserve unrelated or pre-existing work.
2. Work one phase at a time. Do not combine the whole plan into one unreviewable diff.
3. Add or update tests in the same phase as behavior changes. Do not lower assertions or delete tests to obtain a pass.
4. Run the phase verification commands and record their output in the implementation log.
5. Commit each completed phase separately and record its SHA beside the phase. Do not commit secrets, generated `dist/`, local Supabase state, or `node_modules/`.
6. Do not rewrite Git history, rotate credentials, deploy to production, alter DNS, publish a Chrome Web Store version, or send pilot invitations without a human explicitly approving that external action.
7. For Supabase work, read the current changelog and relevant official docs first. This repository uses imperative migrations; for the planned privilege fix use `npx supabase migration new harden_function_privileges` instead of inventing a timestamped filename.
8. If implementation must deviate from a locked decision below, document the deviation, reason, tests, and user-visible consequence before continuing.

## Locked Product and Architecture Decisions

These decisions remove ambiguity for the executor:

1. **Fix unsupported claims instead of adding tab-audio capture.** The current beta uses microphone audio, page context, selected text, optional screenshots, and rubric retrieval. Do not add tab audio or promise exact-second lecture citations for this submission.
2. **Cloud processing and storage are separate.** Live microphone audio is processed by Google Vertex AI while a live session is active. Dashboard persistence and screenshot capture are optional storage choices and default to off.
3. **An account connection is required for real coaching.** Remove “no account” language. Describe connection as a one-time sign-in between the web app and extension.
4. **The sibling extension is canonical.** Remove the obsolete in-repository scaffold only after confirming no current script or CI job depends on it.
5. **The browser never receives AI or service-role secrets.** All model access remains brokered by authenticated Supabase Edge Functions. Remove the unused public `VITE_GEMINI_API_KEY` path.
6. **Architecture boundaries are explicit.** FastAPI owns profile/session/rubric/action-item CRUD. Supabase Auth, Realtime, Postgres, Storage, and Edge Functions own authentication, chat/RAG/live-AI workflows, and cross-surface synchronization. Document this boundary; do not duplicate an endpoint on both backends.
7. **Rate limiting remains single-worker-safe for the ceremony.** Production must run one FastAPI worker unless `RATE_LIMIT_STORAGE_URI` points to shared storage. Startup must fail when multiple workers are configured with in-memory limiting.
8. **The golden demo uses real production behavior.** Automated tests may stub AI responses, but the recorded ceremony demo must use the deployed beta. Keep a backup recording and text-input fallback in case live audio or model access fails.
9. **Submission copy only claims demonstrated outcomes.** Do not claim learning improvement, citation accuracy, speed, privacy, or reliability without a measured result or a precisely qualified statement.

## Scope

**In scope**

- Privacy-default and settings propagation fixes.
- Website claim correction, install flow, legal pages, and dashboard extension-help behavior.
- Chrome manifest validation, dead-code removal, unpacked-extension testing, and responsive panel cleanup.
- Production environment validation, FastAPI tests, Supabase authorization verification, CI, and release smoke tests.
- Dashboard and extension type-safety/maintainability refactors without changing the product flow.
- Accessibility, SEO, performance, user validation, architecture documentation, final-report content, and demo preparation.

**Out of scope**

- Tab-audio capture.
- Exact-second lecture citations.
- Autonomous essay writing or answer generation positioned as cheating assistance.
- Billing, institution administration, mobile applications, Safari/Firefox ports, or a new model provider.
- A distributed FastAPI deployment before the ceremony; use the single-worker guard defined above.

## File Structure

The paths below are the intended final decomposition. Do not introduce a second file for the same responsibility.

### Web repository

| File | Action | Responsibility |
|---|---|---|
| `src/App.tsx` | Modify | Accurate product copy, hash-based legal rendering, and real install CTA behavior |
| `src/App.claims.test.tsx` | Create | Regression tests that prohibit unsupported marketing claims |
| `src/App.navigation.test.tsx` | Create | Install and legal-route behavior |
| `src/components/AuthPage.tsx` | Modify | Real Terms and Privacy links |
| `src/components/LegalPage.tsx` | Create | Privacy, Terms, Cookies, and Changelog content selected by route |
| `src/components/LegalPage.css` | Create | Accessible legal-page layout |
| `src/lib/productLinks.ts` | Create | Validated Chrome Store and canonical product URLs |
| `src/components/Dashboard.tsx` | Modify | Typed orchestration shell; remove no-op extension action and extract views |
| `src/components/Dashboard.css` | Modify | Keep only shell/shared dashboard styles after extraction |
| `src/components/dashboard/dashboard-types.ts` | Create | Typed view props and dashboard UI state unions |
| `src/components/dashboard/DashboardShell.tsx` | Create | Sidebar, top bar, routing shell, and extension-help modal |
| `src/components/dashboard/HomeView.tsx` | Create | Dashboard summary cards and quick prompts |
| `src/components/dashboard/ChatView.tsx` | Create | Chat list, composer, streaming states, citations, and chat actions |
| `src/components/dashboard/SessionsView.tsx` | Create | Session list and session detail UI |
| `src/components/dashboard/RubricsView.tsx` | Create | Rubric list, activation, upload, indexing, and criterion display |
| `src/components/dashboard/ActionItemsView.tsx` | Create | Action-item list and completion actions |
| `src/components/dashboard/SettingsView.tsx` | Create | Theme and coach-mode settings |
| `src/components/dashboard/DashboardShell.css` | Create | Shell/sidebar/top-bar styles |
| `src/components/dashboard/ChatView.css` | Create | Chat-specific styles |
| `src/components/dashboard/ContentViews.css` | Create | Home/session/rubric/action/settings styles |
| `src/lib/studypilot-types.ts` | Modify | Canonical domain types used by all dashboard views |
| `src/lib/dashboardApi.ts` | Modify | Typed FastAPI CRUD boundary only |
| `src/lib/studypilot-api.ts` | Modify | Typed Supabase/Edge chat, RAG, live, and sync boundary only |
| `src/lib/deploymentConfig.ts` | Create | Pure validation for build-time public URLs |
| `src/lib/deploymentConfig.test.ts` | Create | Production rejects missing or loopback URLs; local mode accepts loopback URLs |
| `vite.config.ts` | Modify | Invoke production configuration validation |
| `.env.example` | Modify | Document required public URLs and Chrome Store URL without secrets |
| `Dockerfile` | Modify | Fail production build when required build arguments are absent or local |
| `docker-compose.prod.yml` | Modify | Pass explicit production build arguments and single-worker API posture |
| `public/robots.txt` | Create | Valid crawler policy |
| `public/sitemap.xml` | Create | Canonical marketing and legal URLs |
| `index.html` | Modify | Canonical metadata and preload the LCP product image |
| `e2e/golden-flow.spec.ts` | Create | Browser-level rubric-to-coaching-to-dashboard happy path with deterministic test doubles |
| `e2e/accessibility.spec.ts` | Create | Serious/critical axe checks for landing, auth, and dashboard states |
| `playwright.config.ts` | Create | Web E2E server and browser configuration |
| `package.json` / `package-lock.json` | Modify | Add lint, Playwright, E2E, and release-verification scripts with pinned lockfile |
| `backend/rate_limit.py` | Modify | Shared-storage option and multi-worker startup guard |
| `backend/main.py` | Modify | App factory, validated CORS, testable health endpoint, and startup checks |
| `backend/gemini_client.py` | Delete | Remove unused, unpinned, hard-coded Gemini client path |
| `backend/requirements.txt` | Modify | Runtime dependencies only, pinned |
| `backend/requirements-dev.txt` | Create | Pinned pytest/httpx test dependencies |
| `backend/tests/conftest.py` | Create | FastAPI test client and Supabase dependency fakes |
| `backend/tests/test_health.py` | Create | Healthy and unreachable-database responses |
| `backend/tests/test_authz.py` | Create | Missing, malformed, expired, and cross-user authorization tests |
| `supabase/tests/rls_ownership.test.sql` | Create | Ownership and denial tests for every exposed user-data table |
| `supabase/tests/function_privileges.test.sql` | Create | Edge/RPC execution grants and security-definer exposure checks |
| `scripts/verify-built-env.mjs` | Create | Scan built assets and fail on localhost URLs or forbidden secret names |
| `scripts/verify-function-allowlist.mjs` | Modify | CI-safe allowlist verification with actionable missing-auth failure |
| `.github/workflows/ci.yml` | Create | Web, Deno, Python, pgTAP, build, secret scan, and E2E gates |
| `.gitleaks.toml` | Create | Project-specific secret-scan allowlist with no real credentials |
| `SECURITY.md` | Create | Secret handling, disclosure, and credential-rotation runbook |
| `docs/adr/0001-runtime-boundaries.md` | Create | FastAPI versus Supabase ownership decision |
| `docs/architecture/system.mmd` | Create | Source for the labeled system/data-flow diagram |
| `docs/architecture/system.png` | Create | Rendered diagram for the report and pitch |
| `docs/validation/pilot-protocol.md` | Create | Consent, tasks, metrics, and interview questions for 10-15 students |
| `docs/validation/pilot-results.csv` | Create | Anonymous result rows with fixed columns and no student content |
| `docs/validation/pilot-summary.md` | Create | Evidence-backed findings, limitations, and approved quotes |
| `docs/submission/final-report-content.md` | Create | Complete text matching every PDF final-report section |
| `docs/submission/demo-script.md` | Create | Time-coded, sub-two-minute golden-demo script and fallback cues |
| `docs/submission/submission-checklist.md` | Create | Links, owners, verification evidence, and final sign-off |
| `README.md` | Modify | Accurate architecture, local/production setup, test commands, and canonical extension link |
| `context/app-map.md` | Modify | Current component map with no obsolete scaffold |
| `context/backend.md` | Modify | Remove mock-data guidance and document the actual API boundary |
| `context/dashboard.md` | Modify | Remove mock-only descriptions and document persisted chat behavior |
| `context/runbook.md` | Modify | Deployment, smoke test, rollback, and ceremony recovery steps |
| `extension/` | Delete after comparison | Remove the tracked obsolete extension scaffold from the submission repository |

### Extension repository

| File | Action | Responsibility |
|---|---|---|
| `manifest.json` | Modify | Valid MV3 permissions and accurate description |
| `src/shared/types.ts` | Modify | Explicit privacy options and typed UI/live state |
| `src/shared/extensionMessages.ts` | Modify | Privacy options carried through live-start messages |
| `src/background/index.ts` | Modify | Validate messages and pass exact privacy options to the live runtime |
| `src/background/liveRuntime.ts` | Modify | Honor dashboard-save and screenshot choices; no hard-coded `true` values |
| `src/content/FloatingStudyPilot.tsx` | Modify | Orchestration shell, truthful disclosure, uncrowded layout, and extracted behavior |
| `src/content/ExtensionPanel.tsx` | Create | Main panel composition only |
| `src/content/ContextSettings.tsx` | Create | Page URL, selected text, screenshot, and dashboard-save controls |
| `src/content/QuickActions.tsx` | Create | Responsive summarize/explain/quiz/flashcard controls |
| `src/content/useLiveCoaching.ts` | Create | Live-session state machine and cleanup-safe runtime messaging |
| `src/content/useDashboardWorkspace.ts` | Create | Auth, chat selection, reconciliation, and save queue orchestration |
| `src/content/privacyDefaults.test.tsx` | Create | Storage and screenshot default-off behavior and disclosures |
| `src/background/liveRuntime.privacy.test.ts` | Create | End-to-end option propagation into live-token requests |
| `src/styles/tailwind.css` | Modify | 360-390px responsive layout, focus states, and non-truncated quick actions |
| `src/shared/studypilotSupabase.ts` | Modify | Keep only authenticated Supabase/dashboard operations after extraction |
| `src/shared/studypilotSupabase.auth.ts` | Create | Session import, refresh, and connection behavior |
| `src/shared/studypilotSupabase.chat.ts` | Create | Chat/session/action-item persistence behavior |
| `src/content/VoiceSession.tsx` | Delete | Remove unused alternate voice UI |
| `src/shared/useVoiceSession.ts` | Delete | Remove unused alternate live implementation |
| `src/shared/mockDashboard.ts` | Delete | Remove unused mock dashboard path |
| `src/shared/geminiService.ts` | Delete | Remove forbidden browser-side Gemini API-key path |
| `e2e/extension.spec.ts` | Create | Load the unpacked extension and test install, toggle, settings, mic-denial, and dashboard handoff |
| `e2e/fixtures.ts` | Create | Persistent Chromium context and extension-ID discovery |
| `playwright.config.ts` | Create | Unpacked MV3 E2E configuration |
| `scripts/validate-manifest.mjs` | Create | Reject unsupported permissions, localhost production hosts, and missing offscreen setup |
| `.github/workflows/ci.yml` | Create | Typecheck, tests, build, manifest validation, E2E, and secret scan |
| `package.json` / `package-lock.json` | Modify | Remove `@google/generative-ai`; add release and E2E scripts |
| `README.md` | Modify | Install, permissions, privacy, local mode, test, release, and Chrome Store instructions |

## Phase 0: Reconcile State and Close the Credential Incident [external gate]

**Files:** `SECURITY.md`, `.gitleaks.toml`, `.github/workflows/ci.yml`  
**Posture:** characterization-first  
**Estimate:** 2-3 hours of code work plus human credential rotation/history coordination

### Tasks

- [x] Record `git status --short`, `git diff --stat`, `git diff --cached --stat`, and `git log -1 --oneline` for both repositories in the implementation log.
- [x] Resolve why five extension files appear modified with no textual diff; do not normalize line endings or stage files until the owner confirms whether this is intentional working state.
- [x] Search tracked history for credential filenames and secret signatures without printing secret values: `git log --all --name-only -- backend/service-account.json` and a configured Gitleaks scan.
- [x] Add `SECURITY.md` with permitted secret locations, revocation steps, incident contacts, and the rule that browser-facing `VITE_*` variables may contain only public values.
- [x] Add `.gitleaks.toml` with path-only allowlists for known fake local-development fixtures; never allowlist a real token pattern.
- [x] Add a secret-scan job to `.github/workflows/ci.yml` that fails pull requests and pushes when a credential is detected.
- [ ] Ask a human owner to rotate the previously tracked Google service-account key immediately if it was ever valid.
- [ ] Ask a human owner to approve and coordinate `git filter-repo --path backend/service-account.json --invert-paths` plus protected-branch force-push if the file contained a valid credential. Grok must not perform the rewrite without that approval.

**Verify**

- `gitleaks git --redact --no-banner --config .gitleaks.toml` is **fail-closed** on the historical `backend/service-account.json` private key until a human rotates that key (if it was ever valid) and, if required, rewrites history. Do not allowlist that finding. After a coordinated rewrite, this command should exit 0. Until then, exit 1 is expected and the CI secret-scan job must stay red for the same reason.
- `git ls-files | rg -i "service-account|credentials|\.env$"` returns only approved examples or documentation, never a real secret.
- Human owner records the rotation date and affected key ID in a private incident record, not in Git.

**Exit:** Both worktrees are understood and preserved, automated secret scanning exists, and the exposed-key decision is owned by a human.

## Phase 1: Make Privacy Controls True End to End [test-first]

**Files:** extension `src/shared/types.ts`, `src/shared/extensionMessages.ts`, `src/background/index.ts`, `src/background/liveRuntime.ts`, `src/content/FloatingStudyPilot.tsx`, `src/content/privacyDefaults.test.tsx`, `src/background/liveRuntime.privacy.test.ts`, web `src/App.tsx`  
**Estimate:** 4-6 hours

### Tasks

- [x] Add a single `SessionPrivacyOptions` type with `captureScreenshot: boolean` and `saveToDashboard: boolean` in `src/shared/types.ts` (`dcfe82d`).
- [x] Add a `DEFAULT_SESSION_PRIVACY` constant whose two values are both `false`; initialize extension settings from that constant (`dcfe82d`).
- [x] Change `STUDYPILOT_LIVE_START` to require a complete `privacy: SessionPrivacyOptions` payload instead of an optional screenshot flag (`dcfe82d`).
- [x] Validate both booleans in `src/background/index.ts` and reject malformed live-start messages with a typed error response (`dcfe82d`).
- [x] Pass `privacy.captureScreenshot` to page capture and `privacy.saveToDashboard` to the live-token request in `src/background/liveRuntime.ts`; remove every hard-coded live-start defaults (`dcfe82d`).
- [x] Update the settings UI to explain: microphone audio is sent to Google Vertex AI while Live is active; screenshots are sent only when enabled; chat/session persistence occurs only when “Save to dashboard” is enabled (`dcfe82d`).
- [x] Keep page URL and selected-text controls separate from screenshot and persistence controls so one toggle cannot silently enable another (`dcfe82d`).
- [x] Replace the landing-page “Local” claim with the same cloud-processing/storage distinction. (web commits `2cabd54` and `e5375b3`; claims suite passes)
- [x] Add tests proving both controls default off, each control can be enabled independently, and the live-token request receives the exact selected values (`dcfe82d`; extension privacy suite passes).

**Checkpoint:** Run extension tests after option propagation, then inspect the final UI copy before touching marketing copy elsewhere.

**Verify**

- `npm test -- --run src/content/privacyDefaults.test.tsx src/background/liveRuntime.privacy.test.ts` passes in the extension repository.
- `rg -n "captureScreenshot:\s*true|saveToDashboard:\s*true" src` has no result in a live-start default or token-request call.
- A manual session with both controls off creates no screenshot and no persisted dashboard session after Live stops.
- A manual session with only dashboard saving on persists text/session state but no screenshot.

**Exit:** The visible privacy choices, runtime message, token request, capture behavior, and persistence behavior agree.

## Phase 2: Align Every Public Claim with the Beta [test-first]

**Files:** web `src/App.tsx`, `src/App.claims.test.tsx`, `index.html`; extension `manifest.json`, `README.md`, `src/content/FloatingStudyPilot.tsx`; web `README.md`, `docs/submission/final-report-content.md`  
**Estimate:** 3-4 hours

### Tasks

- [x] Replace “picks up tab audio” with “uses your microphone and the page context you choose to share.” (verified in web/extension source and claims tests)
- [x] Replace “answers cite the exact second” with “answers can cite retrieved rubric or uploaded-document evidence when grounding is available.” (verified in web/extension source and claims tests)
- [x] Replace “audio and transcripts stay on your device” with the Phase 1 cloud-processing/storage disclosure. (verified in web/extension source and claims tests)
- [x] Replace “no account” or equivalent onboarding copy with “sign in once to connect the extension and dashboard.” (verified in web/extension source and claims tests)
- [x] Update the extension manifest description and README to use the same capability language. (verified in manifest/README/source audit)
- [x] Add `src/App.claims.test.tsx` assertions that the rendered landing page does not contain `tab audio`, `exact second`, `stay on your device`, or `no account` and does contain the approved processing disclosure. (verified in web claims suite)
- [x] Update `index.html` description to “StudyPilot is a rubric-aware study coach across your browser and dashboard.” (verified in metadata source audit)
- [x] Start `docs/submission/final-report-content.md` with an overview/problem/solution section that makes no unmeasured outcome claim.

**Verify**

- `npm test -- --run src/App.claims.test.tsx` passes in the web repository.
- `rg -ni "tab audio|exact second|stay on your device|no account" src README.md manifest.json docs/submission` returns no public product claim.
- One teammate reads the website, extension disclosure, README, and report overview side by side and confirms the capability statement is consistent.

**Exit:** Judges cannot find a contradiction between the product, privacy controls, and public explanation.

### Phase 1/2 audit update — 2026-08-24

- The privacy and approved-claims implementation is present in the extension/web sources and covered by the existing privacy and claims tests. The extension privacy suite verifies both defaults are off, the controls are independent, and the exact selected values reach the live-token request. The web claims suite verifies the retired phrases are absent and the approved cloud-processing disclosure is present.
- The website, extension panel, manifest, README, metadata, and report overview were rechecked against the same capability language; the Phase 1/2 implementation rows above are now marked complete with source/test evidence. Completion evidence is also recorded in `docs/plans/2026-08-24-grok-4-6-handoff.md` and `docs/plans/2026-08-21-uep-implementation-log.md`.
- A real hosted Live session with both privacy controls off and a real hosted dashboard session are still external evidence gates; local tests do not claim those manual outcomes.

## Phase 3: Replace Dead Links and the No-Op Extension Action [test-first]

**Files:** `src/lib/productLinks.ts`, `src/App.tsx`, `src/components/AuthPage.tsx`, `src/components/Dashboard.tsx`, `src/components/LegalPage.tsx`, `src/components/LegalPage.css`, `src/App.navigation.test.tsx`, `.env.example`  
**Estimate:** 5-7 hours

### Tasks

- [x] Add `VITE_CHROME_STORE_URL` to `.env.example` and validate it as an `https://chromewebstore.google.com/` URL in `src/lib/productLinks.ts`.
- [x] Render “Add to Chrome” as an external link only when a valid store URL is configured; otherwise render an honest disabled “Chrome beta - invite only” control plus `mailto:hello@studypilot.app?subject=StudyPilot%20beta%20access`.
- [x] Replace `#chrome` and `#install` dead anchors with the validated install behavior.
- [x] Replace the dashboard `openExtension` no-op with an extension-help modal that tells users to install, pin, and click the StudyPilot toolbar icon; include the configured store link when available.
- [x] Implement hash routes `#/privacy`, `#/terms`, `#/cookies`, and `#/changelog` in `LegalPage.tsx` without adding a router dependency.
- [x] State in the cookie page that the current beta uses essential authentication/local-storage data and no advertising cookies; link back to the Phase 1 cloud-processing disclosure.
- [x] Point landing, footer, and authentication links to the legal routes and ensure browser Back returns to the previous view.
- [x] Add navigation tests for configured/unconfigured store URL, legal-route rendering, and the dashboard help modal.

**Verify**

- `npm test -- --run src/App.navigation.test.tsx` passes.
- `rg -n 'href="#(chrome|install|privacy|terms|cookies|changelog)"' src` returns no dead fragment link.
- Every visible landing/footer/auth link reaches content, a valid external destination, or a clearly disabled beta control.

**Exit:** No call to action is a no-op, and every trust/legal link has real content.

## Phase 4: Make the Chrome Package Store-Valid and Test It Unpacked [characterization-first]

**Files:** extension `manifest.json`, `scripts/validate-manifest.mjs`, `e2e/fixtures.ts`, `e2e/extension.spec.ts`, `playwright.config.ts`, `package.json`, `package-lock.json`, `README.md`  
**Estimate:** 6-8 hours

### Tasks

- [x] Add `scripts/validate-manifest.mjs` that parses `dist/manifest.json` and fails on the unsupported named permission `microphone`, loopback production host permissions, missing `offscreen`, or a missing `USER_MEDIA` offscreen reason in runtime code.
- [x] Remove `microphone` from named permissions; retain `offscreen` for `getUserMedia`, `storage` for extension state, and only permissions with a verified `chrome.*` call.
- [x] Use `rg -n "chrome\.(tabs|scripting|activeTab)" src` to remove an unused `tabs`, `activeTab`, or future `scripting` permission only when no runtime call or required user flow depends on it.
- [x] Keep broad HTTP(S) content-script matches for the “available on study pages” beta, document the Chrome warning plainly, and do not broaden API host permissions beyond Supabase, StudyPilot, Google Generative Language, and Vertex AI hosts already required by runtime calls.
- [x] Add a persistent Chromium fixture that loads `dist/` with `--disable-extensions-except` and `--load-extension`, discovers the MV3 service worker, and exposes the extension ID.
- [x] Add E2E cases for toolbar toggle, panel mount once, settings defaults, microphone denial with a recoverable message, page-context toggle, and dashboard handoff.
- [x] Add `validate:manifest` and `test:e2e` scripts, pin Playwright in the lockfile, and document Windows and CI commands.
- [x] Manually load `dist/` in current stable Chrome and record the exact manifest/console result in the release checklist. (Playwright unpacked `dist/` load recorded; `chrome://extensions` UI was not automated — see implementation log.)

**Verify**

- `npm run typecheck && npm test && npm run build && npm run validate:manifest` passes.
- `npx playwright test` passes locally with the unpacked extension.
- Chrome's `chrome://extensions` page shows no manifest error and the offscreen microphone flow works after a user gesture.

**Exit:** A clean build installs unpacked, requests only explainable permissions, and completes its critical browser flow.

## Phase 5: Prevent Localhost or Missing URLs from Shipping [test-first]

**Files:** `src/lib/deploymentConfig.ts`, `src/lib/deploymentConfig.test.ts`, `vite.config.ts`, `.env.example`, `Dockerfile`, `docker-compose.prod.yml`, `scripts/verify-built-env.mjs`, `package.json`  
**Estimate:** 4-6 hours

### Tasks

- [x] Implement pure URL validation that requires HTTPS, rejects loopback/private hosts in production, and allows `http://127.0.0.1`/`http://localhost` only in explicit local mode.
- [x] Require non-empty production values for `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`; validate only shape/presence for the public key and never log its value.
- [x] Invoke validation from `vite.config.ts` before the production bundle is built; commit `5fcb87e` removes stale generated `vite.config.js`/`.d.ts` files that previously bypassed this gate.
- [x] Make the Docker build fail before `npm run build` when required build arguments are absent.
- [x] Set the production compose API to one Uvicorn worker and pass explicit public frontend build arguments.
- [x] Add `scripts/verify-built-env.mjs` to scan `dist/` for `localhost`, `127.0.0.1`, `SUPABASE_SERVICE_ROLE`, `GOOGLE_APPLICATION_CREDENTIALS`, `PRIVATE KEY`, and `VITE_GEMINI_API_KEY`.
- [x] Add `verify:release` to run tests, build, built-environment scan, and function allowlist verification when deployment credentials are available.
- [x] Add tests for missing URL, malformed URL, loopback production URL, valid HTTPS URL, and explicit local mode.

**Verify**

- `npm test -- --run src/lib/deploymentConfig.test.ts` passes.
- A production build with `VITE_API_BASE_URL=http://localhost:8000` fails with a value-free error message.
- A production build with approved public URLs passes, then `node scripts/verify-built-env.mjs dist` exits 0.

**Exit:** A successful release build is proof that the browser bundle points to public services and contains no forbidden secret names.

## Phase 6: Prove API and Supabase Authorization [test-first]

**Files:** `backend/main.py`, `backend/rate_limit.py`, `backend/requirements.txt`, `backend/requirements-dev.txt`, `backend/tests/conftest.py`, `backend/tests/test_health.py`, `backend/tests/test_authz.py`, `supabase/tests/rls_ownership.test.sql`  
**Estimate:** 1-2 days

### Tasks

- [x] Refactor `backend/main.py` to expose `create_app()` so tests can inject a fake Supabase client without contacting production.
- [x] Parse `CORS_ORIGINS` as validated origins; reject wildcard origins when credentials are enabled and remove the “update when known” production comment.
- [x] Configure the limiter from `RATE_LIMIT_STORAGE_URI`, default to `memory://`, and raise a startup error when `WEB_CONCURRENCY` is greater than one while storage is in memory.
- [x] Pin pytest and HTTPX in `backend/requirements-dev.txt`; keep test-only packages out of the production image.
- [x] Test `/health` returns 200 with `{"status":"ok","db":"ok"}` and 503 with `{"status":"ok","db":"unreachable"}` using a fake database client.
- [x] Test protected routes reject a missing header, a non-Bearer header, an expired token, and a token whose user ID does not own the requested row. Commit `d85b27f` adds the `/users/me` ownership-specific route fixture; missing/non-Bearer/expired cases remain covered.
- [x] Add pgTAP ownership tests for `profiles`, `sessions`, `session_messages`, `rubrics`, `rubric_criteria`, `action_items`, `activity_logs`, `ai_usage`, `knowledge_documents`, `dashboard_chats`, `dashboard_chat_messages`, `dashboard_chat_turns`, `live_chat_sessions`, and `live_chat_rubric_lookups`.
- [x] Assert every update policy has both ownership visibility and ownership check behavior by attempting same-user and cross-user updates. Commit `d85b27f` expands the pgTAP matrix to profiles, knowledge documents, rubrics, sessions, dashboard chats, and action items (40 assertions total).

**Checkpoint:** Run Python tests before adding database assertions; then run pgTAP against a fresh local reset so application mocks cannot hide RLS defects.

**Verify**

- `python -m pytest backend/tests -q` passes.
- `npx supabase db reset` succeeds against the local stack.
- Discover the installed command with `npx supabase test --help`, then run the documented database-test command; all SQL tests pass.
- `npx supabase db advisors` reports no security advisory introduced by the phase. If the installed CLI lacks the command, use the Supabase MCP advisor and record the result.

**Exit:** The API has executable tests and every exposed user-data table has a cross-user denial proof.

## Phase 7: Verify RPC Grants and Deployed Edge Functions [test-first]

**Files:** `supabase/tests/function_privileges.test.sql`, `scripts/verify-function-allowlist.mjs`, `supabase/config.toml`, `.github/workflows/ci.yml`, `context/runbook.md`  
**Estimate:** 4-6 hours plus a human-supplied CI token

### Tasks

- [x] Add SQL assertions that no `SECURITY DEFINER` function in `public` is executable by `PUBLIC` or `anon` without the explicit privilege contract.
- [x] Assert all deployed Edge Functions remain listed in `supabase/config.toml` with `verify_jwt = true`.
- [x] Make `verify-function-allowlist.mjs` distinguish “authentication missing,” “network failure,” “unexpected deployed function,” and “expected function missing” without printing tokens.
- [x] Add a CI job that runs the allowlist check only on protected branches when `SUPABASE_ACCESS_TOKEN` and project reference secrets are present; skipped secret-dependent checks must be visibly reported, not silently passed. The workflow uses `github.ref_protected` and emits an explicit `SKIPPED` message when either secret is missing.
- [x] Read `https://supabase.com/changelog.md` and current official RLS/Edge deployment docs before changing any Supabase configuration.
- [x] If a privilege test fails, correct the test against the current schema and rerun a fresh local reset; no schema migration was required.
- [x] Document exact function deployment, allowlist verification, rollback, and log-inspection commands in `context/runbook.md`.

**Verify**

- Deno tests remain 42/42 or higher.
- All pgTAP tests pass after a clean local reset.
- `npm run verify:functions` passes against the intended hosted project with a human-supplied token.

**Exit:** Local SQL and the hosted function inventory both prove the intended security boundary.

## Phase 8: Split and Type the Dashboard Without Changing Behavior [characterization-first]

This refactor is two context-safe slices. Run all existing dashboard tests after each slice.

### Phase 8A: Type the shell and extract low-coupling views

**Files:** `src/components/Dashboard.tsx`, `src/lib/studypilot-types.ts`, `src/components/dashboard/dashboard-types.ts`, `src/components/dashboard/DashboardShell.tsx`, `src/components/dashboard/HomeView.tsx`, `src/components/dashboard/ActionItemsView.tsx`, `src/components/dashboard/SettingsView.tsx`, `src/components/dashboard/DashboardShell.css`  
**Estimate:** 1 day

#### Tasks

- [x] Replace the three `Session`, `Rubric`, and `ActionItem` `any` aliases with typed dashboard API domain models (the runtime uses the camelCase adapter types in `src/lib/dashboardApi.ts`).
- [x] Replace boolean loading/error combinations with discriminated states: `idle | loading | success | error`. Dashboard bootstrap, transcript, chat-list, rubric-index, and chat-turn lifecycles now use typed request-state unions or reducer states.
- [x] Define explicit prop interfaces in `dashboard-types.ts`; commit `03a2da1` centralizes the extracted dashboard view and primitive contracts with no inline prop-object types, `any`, `@ts-ignore`, or suppressed lint rules.
- [x] Move sidebar/top-bar/view selection into `DashboardShell.tsx` while keeping data ownership in `Dashboard.tsx`.
- [x] Move `HomeView`, `ActionItemsView`, and `SettingsView` into their named files without changing labels, callbacks, or empty states.
- [x] Move shell/shared styles into `DashboardShell.css` and leave selectors scoped under `.app-dashboard`. (The extracted components retain existing scoped selectors; stylesheet splitting is recorded in `e1632fe`.)
- [x] Preserve async cancellation and listener cleanup during extraction; add cleanup tests when an operation can resolve after unmount. Chat-stream, transcript, chat-list, realtime, and rubric-index guards are covered by the current web tests.

#### Verify

- `npm test -- --run src/components/Dashboard.chat-sync.test.tsx src/components/Dashboard.rubric-rag.test.tsx src/components/ChatView.ai-usage.test.tsx` passes.
- `npm run build` passes with zero TypeScript errors.
- `rg -n "type (Session|Rubric|ActionItem) = any|@ts-ignore|eslint-disable" src/components` returns no new violation.

#### Exit

The dashboard shell and three views are typed, independently readable, and behaviorally unchanged.

### Phase 8B: Extract chat, session, and rubric vertical slices

**Files:** `src/components/Dashboard.tsx`, `src/components/dashboard/ChatView.tsx`, `src/components/dashboard/SessionsView.tsx`, `src/components/dashboard/RubricsView.tsx`, `src/components/dashboard/ChatView.css`, `src/components/dashboard/ContentViews.css`, `src/lib/dashboardApi.ts`, `src/lib/studypilot-api.ts`  
**Estimate:** 1-2 days

#### Tasks

- [x] Move chat list, message rendering, citations, composer, rename/delete actions, and per-chat pending state into `ChatView.tsx`.
- [x] Keep remote chat data in Supabase/Edge helpers and CRUD data in `dashboardApi.ts`; commit `4bd77c8` removes the Supabase runtime import from `dashboardApi.ts` and makes rubric activation FastAPI-only.
- [x] Move session list and detail into `SessionsView.tsx`, including screenshot, transcript, and “continue in chat” behavior.
- [x] Move rubric list, activation, upload modal, indexing status, retry, and criterion display into `RubricsView.tsx`.
- [x] Split chat styles into `ChatView.css` and content-view styles into `ContentViews.css`; retain only shared tokens/shell rules in `Dashboard.css`.
- [x] Use explicit request states and cancellation for chat sends, rubric indexing, and view changes so stale promises cannot update an unmounted view.
- [x] Keep existing test selectors accessible by role or label; add tests for error and retry states exposed by the new state unions.

#### Verify

- `npm test && npm run build` passes.
- `Dashboard.tsx` is below 1,000 lines and contains orchestration rather than view markup.
- No extracted component exceeds 800 lines; if one does, split only a repeated subcomponent already used three or more times.

#### Exit

The dashboard has typed, testable vertical slices and no 3,000-line component or 2,000-line single stylesheet.

## Phase 9: Decompose the Extension and Remove the Browser-Side AI Path [characterization-first]

This phase also fixes the crowded 360-390px panel.

### Phase 9A: Extract live and workspace behavior

**Files:** extension `src/content/FloatingStudyPilot.tsx`, `src/content/ExtensionPanel.tsx`, `src/content/ContextSettings.tsx`, `src/content/QuickActions.tsx`, `src/content/useLiveCoaching.ts`, `src/content/useDashboardWorkspace.ts`, `src/shared/types.ts`, `src/styles/tailwind.css`  
**Estimate:** 1-2 days

#### Tasks

- [x] Capture current mount, chat reconciliation, save queue, and live-session behavior with tests before moving code.
- [x] Move live-session start/pause/resume/stop, timer cleanup, runtime status, and microphone error mapping into `useLiveCoaching.ts`.
- [x] Represent live state as `idle | starting | live | paused | stopping | error`; make invalid button combinations unrenderable.
- [x] Move auth refresh, workspace load, chat selection, reconciliation, and dashboard persistence into `useDashboardWorkspace.ts` (canonical extension commit `fe8d5f5` moves the save request, single-flight lock, and mounted-response guard into the hook).
- [x] Move the panel shell/header to `ExtensionPanel.tsx`, context toggles to `ContextSettings.tsx`, and quick actions to `QuickActions.tsx`.
- [x] Make the four quick-action labels fully visible at 360px and 390px; E2E now checks all four labels and asserts no horizontal overflow after the panel settles.
- [x] Keep secondary header controls in the existing menu while keeping mic status and close controls visible.
- [x] Return cleanup functions for runtime listeners, speech recognition, animation frames, timers, and pending async operations. `7927799`, `8499b79`, `7301083`, `18f5273`, and `6630915` cover teardown ownership, mounted/latest-operation guards, explicit Live intents, correlated service-worker operations, and the panel remount race.

**Follow-up evidence — 2026-08-24:** `6630915` hydrates the panel from `STUDYPILOT_GET_LIVE_STATUS` on mount and adds a deterministic delayed-token Playwright scenario covering Live start, panel unmount/reopen, Live stop, delayed start failure suppression, and page/extension-page console-error assertions. `397c682` then extracts the Pomodoro picker and weekly progress chart, and `6138fb0` extracts the selection tooltip into typed components, reducing the large parent without changing timer, selection-listener, or action behavior. This is local transport characterization only; a real hosted Vertex Live session remains an external gate.

#### Verify

- [x] `npm test && npm run typecheck && npm run build` passes.
- [x] Playwright screenshots at 360x640 and 390x700 show no clipped labels, overlapping header controls, or horizontal scroll. Commit `933b1ca` adds settled screenshot artifacts and the short-height responsive layout; both artifacts were visually inspected locally.
- [x] Rapid open/close/live-start/live-stop E2E produces no duplicate listener, unmounted-update, or unhandled-promise console error. The unpacked suite passes 13/13, including the deterministic panel remount race in `6630915` and keyboard activation of the launcher/settings/minimize controls in `a77fe49`.
- [x] Exercise keyboard activation for the launcher, settings, and minimize controls through the closed shadow root. `a77fe49` adds the CDP focus helper and unpacked browser assertion; a broader manual keyboard review of every secondary action remains a submission review item.

#### Exit

The extension shell is readable, state transitions are explicit, and the panel remains usable at its minimum width.

### Phase 9B: Split Supabase helpers

**Files:** extension `src/shared/studypilotSupabase.ts`, `src/shared/studypilotSupabase.auth.ts`, `src/shared/studypilotSupabase.chat.ts`, `src/shared/studypilotSupabase.chat.test.ts`, `src/shared/studypilotSupabase.local.test.ts`, `src/shared/studypilotSupabase.sync.test.ts`  
**Estimate:** 3-5 hours

#### Tasks

- [x] Move session import/refresh/connect behavior into `studypilotSupabase.auth.ts`.
- [x] Move chat/session/action-item persistence into `studypilotSupabase.chat.ts`.
- [x] Keep `studypilotSupabase.ts` as the small public facade used by the extension UI and tests.
- [x] Update the chat, local-mode, and synchronization tests to import only the public facade and assert the same requests and return values as before extraction.
- [x] Keep auth refresh and chat persistence cancellation-safe; an expired refresh result must not replace a newer session.

#### Verify

- `npm test -- --run src/shared/studypilotSupabase.chat.test.ts src/shared/studypilotSupabase.local.test.ts src/shared/studypilotSupabase.sync.test.ts` passes.
- `npm run typecheck && npm run build` passes.
- `studypilotSupabase.ts` is below 400 lines and contains no UI state.

#### Exit

Authentication and chat persistence have separate, tested modules behind one stable facade.

### Phase 9C: Delete alternate implementations and the public AI-key dependency

**Files:** extension `src/content/VoiceSession.tsx`, `src/shared/useVoiceSession.ts`, `src/shared/mockDashboard.ts`, `src/shared/geminiService.ts`, `package.json`, `package-lock.json`  
**Estimate:** 1-2 hours

#### Tasks

- [x] Use `rg` to prove `VoiceSession.tsx`, `useVoiceSession.ts`, `mockDashboard.ts`, and `geminiService.ts` have no runtime import before deleting them.
- [x] Delete the four unused modules and remove `@google/generative-ai` from `package.json` and the lockfile.
- [x] Search the compiled bundle and source for `VITE_GEMINI_API_KEY`, `GoogleGenerativeAI`, and `@google/generative-ai`; require zero results.

#### Verify

- `npm test && npm run typecheck && npm run build` passes.
- `npm ls @google/generative-ai` reports the package absent.
- `rg -n "VITE_GEMINI_API_KEY|GoogleGenerativeAI|@google/generative-ai" src dist package.json` returns no result.

#### Exit

The extension has one live implementation, one dashboard integration path, and no browser-side model key path.

## Phase 10: Add CI and Release Gates to Both Repositories [test-first]

**Files:** web `.github/workflows/ci.yml`, `package.json`, `playwright.config.ts`, `e2e/golden-flow.spec.ts`; extension `.github/workflows/ci.yml`, `package.json`, `playwright.config.ts`, `e2e/extension.spec.ts`  
**Estimate:** 1 day

### Tasks

- [x] Add a web CI matrix for Node 22 install, TypeScript build, Vitest, Deno tests, Python pytest, secret scan, and built-environment scan. (Implemented as separate web-quality, backend-tests, and secret-scan jobs; production build uses documented public placeholders.)
- [x] Add a Linux Supabase job that starts the local stack, resets migrations, runs pgTAP, and always stops the stack in cleanup.
- [x] Add a web Playwright golden-flow test that uploads a fixture rubric, opens its chat, sends a coached prompt through deterministic network responses, creates an action item, and verifies the same chat after reload. (Implemented in `2b47d6c`; latest run 1/1.)
- [x] Add an extension CI workflow for typecheck, Vitest, production build, manifest validation, secret scan, and unpacked-extension Playwright under Xvfb. (Workflow and extension-specific history secret scan are present; branch-protection configuration remains an admin gate.)
- [x] Cache package downloads only; never cache `.env`, Supabase local volumes, auth storage, or built extension sessions.
- [ ] Make branch protection require all non-secret CI jobs; keep deployed-project allowlist and production smoke checks as explicit protected-environment gates. (Repository settings are a human/admin gate.)
- [x] Add concurrency cancellation so a superseded branch run does not publish stale release evidence.

**Verify**

- Both workflows pass from a fresh clone with only documented public local configuration.
- A deliberate `localhost` production value, unsupported manifest permission, failing RLS assertion, and fake secret each fail the expected CI job.

**Exit:** The previously manual unit/build evidence becomes a repeatable merge gate, and missing integration coverage is visible.

## Phase 11: Fix Accessibility, SEO, and Measured Performance Regressions [test-first]

**Files:** `src/index.css`, `src/App.tsx`, `index.html`, `public/robots.txt`, `public/sitemap.xml`, `e2e/accessibility.spec.ts`, `playwright.config.ts`, `context/performance-notes.md`  
**Estimate:** 4-6 hours

### Tasks

- [x] Add axe assertions that landing, login, signup, and dashboard have zero serious or critical violations. (Public states are covered in `e2e/accessibility.spec.ts`; dashboard is covered by the golden flow.)
- [x] Raise muted-text and interactive-control contrast until normal text meets 4.5:1 and large text/control boundaries meet 3:1 in both themes. (Implemented in `f89d658`.)
- [x] Give every icon-only button an accessible name and visible focus indicator; keep reduced-motion behavior intact. (Axe coverage is green for public/authenticated tested states; focus-visible rules remain in the shared styles.)
- [x] Create a syntactically valid `robots.txt` and a sitemap for `/`, `/#/privacy`, `/#/terms`, `/#/cookies`, and `/#/changelog` using the canonical production domain.
- [x] Preload `/assets/studypilot-modal-demo.svg` in `index.html` and set `fetchPriority="high"` on the above-the-fold product image; do not lazy-load the LCP element.
- [x] Add canonical, Open Graph, and descriptive title metadata matching the accurate product statement.
- [x] Run mobile and desktop Lighthouse three times against the production build and record medians in `context/performance-notes.md`. (Post-change medians meet the mobile thresholds: landing/auth performance 0.96, accessibility/best practices/SEO 1.00, LCP 2.63/2.58s, CLS 0.)

**Verify**

- Axe reports zero serious/critical violations for the tested states.
- Mobile Lighthouse medians are Performance >= 90, Accessibility >= 95, Best Practices >= 95, SEO >= 95, CLS < 0.1, and LCP < 3.0 seconds.
- `robots.txt` passes Lighthouse validation.

**Exit:** The known contrast, robots, and LCP-discovery findings are closed with automated checks and measured evidence.

## Phase 12: Remove Architecture Ambiguity and Stale Documentation [characterization-first]

**Files:** `docs/adr/0001-runtime-boundaries.md`, `docs/architecture/system.mmd`, `docs/architecture/system.png`, `README.md`, `context/app-map.md`, `context/backend.md`, `context/dashboard.md`, tracked `extension/` scaffold  
**Estimate:** 1 day

### Tasks

- [x] Write ADR 0001 with the locked FastAPI/Supabase ownership boundary, alternatives considered, consequences, and rule for placing future endpoints.
- [x] Draw a left-to-right Mermaid diagram with browser extension and React frontend as clients; FastAPI CRUD and Supabase Auth/Realtime/Edge as service boundaries; Postgres/Storage and Vertex AI as downstream systems; label every data-flow direction.
- [x] Render `system.mmd` to `system.png` at report-readable resolution and inspect labels for clipping. (Committed as `7a68341` at 3× scale.)
- [x] Replace stale mock-data descriptions in `context/backend.md` and `context/dashboard.md` with current persisted chat/RAG/live behavior.
- [x] Update `README.md` and `context/app-map.md` so the sibling repository is the only extension implementation.
- [x] Compare the tracked `extension/` scaffold against the canonical sibling for any unique production behavior, confirm `npm run extension:build` uses the sibling, then delete the tracked scaffold in one dedicated commit. (No unique production behavior; removed as `6a08fac`; root build verified against the sibling.)
- [x] Run the stale-architecture search and remove obsolete architecture statements from README/context documentation; the remaining scaffold mention is a release exclusion rather than a shipped-path claim.

**Verify**

- A zero-context teammate can identify where auth, CRUD, chat/RAG, live voice, storage, and model calls execute from the diagram and ADR.
- `git ls-files extension` returns no result after the approved removal commit.
- Web and extension test/build suites still pass.

**Exit:** The repository, README, ADR, diagram, and actual runtime describe one coherent system.

## Phase 13: Collect Product Evidence Without Recording Student Content [external gate]

**Files:** `docs/validation/pilot-protocol.md`, `docs/validation/pilot-results.csv`, `docs/validation/pilot-summary.md`  
**Estimate:** 3-4 hours preparation, then 3-5 calendar days for 10-15 participants

### Tasks

- [x] Define one controlled task: upload a rubric, ask for feedback on a weak paragraph, answer a Socratic follow-up, save one action item, and find the continued chat in the dashboard.
- [x] Define fixed metrics: task completion, time to first useful feedback, before/after rubric score from the same assessor, citation-grounding accuracy, error-free session rate, median response latency, and SUS score.
- [x] Add CSV columns `participant_id`, `completed`, `time_to_feedback_seconds`, `before_score`, `after_score`, `citations_checked`, `citations_supported`, `error_free`, `median_latency_ms`, `sus_score`, and `quote_approved`.
- [x] State that participant IDs are anonymous, draft text/audio is not copied into the research file, and quotes require explicit approval.
- [ ] Recruit 10-15 students matching the target audience and run the exact same task and script.
- [ ] Calculate completion rate, median time, mean score change with sample size, grounding precision, error-free rate, median latency, and mean SUS; report limitations instead of presenting a small pilot as causal proof.
- [ ] Select at most two approved short quotes that explain the observed value or friction.

**Verify**

- Every result row has the fixed columns and no email, name, audio, essay text, access token, or rubric content.
- `pilot-summary.md` can trace every number to CSV rows and labels the evidence as a pilot.
- `npm run validate:pilot -- docs/validation/pilot-results.csv` enforces the fixed schema and privacy boundary; the checked-in header-only template reports “no participant rows” and `--require-data` fails until approved rows exist.

**Exit:** The final report and pitch can present real validation instead of assumptions or competitor comparisons alone.

## Phase 14: Build the Final Submission and Two-Minute Demo [external gate]

**Files:** `docs/submission/final-report-content.md`, `docs/submission/demo-script.md`, `docs/submission/submission-checklist.md`, `docs/architecture/system.png`, `README.md`, extension `README.md`, `context/runbook.md`  
**Estimate:** 1-2 days plus recording time

### Tasks

- [x] Draft all nine required report sections in the PDF's exact order and link the readable architecture diagram. Team contribution text remains a separate human-approval task below and is intentionally still placeholder text.
- [x] Populate the technical-stack table with React 19, TypeScript, Vite, FastAPI, Python, Supabase Auth/Postgres/Realtime/Storage/Edge Functions, Deno, Vertex AI/Gemini, Chrome MV3/offscreen documents, Docker, GitHub Actions, Vitest, pgTAP, and Playwright only when each appears in the final code. The current draft lists only technologies present in the repositories.
- [x] Use three evidence-backed challenges: cross-surface chat synchronization, privacy-safe live context/persistence controls, and grounded rubric retrieval with secure model brokering. The current draft ties each to implementation boundaries and tests without claiming measured outcomes.
- [ ] Obtain each member's approved role/contribution text; do not infer contribution percentages from Git commit counts.
- [ ] Add repository links, deployed web URL, Chrome Store or beta-access state, video link, environment prerequisites, and exact setup/test commands to `submission-checklist.md`.
- [ ] Prepare a deterministic demo account with one short rubric, one deliberately weak paragraph, one existing chat, and one empty action-item slot; store credentials outside Git.
- [ ] Record this golden path: `0:00-0:12` problem and promise; `0:12-0:28` rubric upload/selection; `0:28-0:48` weak paragraph in browser; `0:48-1:13` grounded coaching and Socratic follow-up; `1:13-1:31` create action item; `1:31-1:47` open same chat/session in dashboard; `1:47-1:58` measured pilot result and closing differentiator.
- [ ] Edit out loading pauses, notifications, unrelated tabs, credentials, personal data, and browser debug UI; keep the final video under 1:58 to leave upload/transcode margin below two minutes.
- [ ] Record a backup video and prepare a text-input fallback plus screenshots of each golden-path checkpoint.
- [ ] Run the full release checklist from a clean clone, then have a teammate follow the README without verbal help.

**Verify**

- The final video is <= 2:00, stable, legible at 1080p, and shows the complete extension-to-dashboard flow.
- The repository commit in the submission is pushed, CI-green, secret-scan-clean, and reproducible from README instructions.
- Every PDF checklist item has a link, evidence file, or named owner in `submission-checklist.md`.

**Exit:** The code, report, deployed demo, and video form one consistent, evidence-backed submission package.

## Critical Path and Suggested Schedule

Do not begin refactors until the claim/privacy/deployment path is stable.

| Track | Phases | Suggested focused time | Dependency |
|---|---|---:|---|
| Ship blockers | 0-7 | 4-6 engineering days | Human secret/store/deployment access |
| Maintainability and UX | 8-12 | 4-6 engineering days | Ship-blocker behavior frozen |
| Evidence and submission | 13-14 | 2-3 work days plus pilot calendar time | Stable deployed build |

Recommended order:

1. Phase 0, then Phases 1-3.
2. Phases 4-7 and a production smoke test.
3. Phases 8-9, rerunning all browser flows after each extraction.
4. Phases 10-12.
5. Start pilot preparation during Phase 10, but collect results only after Phase 11 is deployed.
6. Freeze features before Phase 14; accept only release-blocking fixes afterward.

If the ceremony is less than one week away, complete Phases 0-7, 11, 13, and 14 first. Phases 8-10 and 12 still remain required for the full remediation, but must not destabilize the golden demo immediately before submission.

## Manual Gates Requiring the Team

These are not decisions Grok may make alone:

1. Confirm/rotate the removed service-account credential and approve any Git history rewrite.
2. Supply the real production website/API URLs, Chrome Web Store URL or invite-only status, Supabase CI token, and deployment access through a secure channel.
3. Recruit pilot participants, approve quotes, supply exact team contributions, and publish the final repository/deployment/video.

## Full Definition of Done

### Product integrity

- [ ] Website, extension, README, report, and pitch make the same capability/privacy claims.
- [x] Screenshot capture and dashboard persistence default off and are independently honored. (extension privacy tests and E2E settings coverage)
- [x] No browser bundle contains or requests a Gemini API key or service-role secret. (source/bundle scan and extension dependency audit)
- [x] Install, extension-help, privacy, terms, cookies, and changelog actions all work. (web navigation tests and extension handoff coverage)

### Functional quality

- [ ] A new user can sign in, connect the extension, select/upload a rubric, receive grounded coaching, create an action item, and see the same session/chat in the dashboard.
- [x] Local recovery behavior is characterized for network/auth expiry/login/OAuth (`3212aca`), microphone denial (extension E2E), model/SSE errors (`socraticCoach.test.ts` and dashboard chat tests), indexing failure/retry (`Dashboard.rubric-rag.test.tsx`), and bootstrap retry. Hosted clean-profile failure handling remains an external gate.
- [ ] The golden flow works twice in succession from a clean Chrome profile.

### Code submission quality

- [x] No domain-model `any` aliases, 3,000-line UI component, obsolete extension scaffold, dead browser-side AI client, or stale mock-only documentation remains. (architecture/source audit commits `6a08fac`, `7a68341`, `03a2da1`, and extension bundle scan)
- [ ] Web Vitest, Deno, Python, pgTAP, web E2E, extension Vitest, extension build, manifest validation, and unpacked-extension E2E are CI-green.
- [x] README setup succeeds from a fresh clone and all dependencies/environment variables are documented. The 2026-08-24 isolated clone passed npm ci, tests, public-placeholder build/scan, backend pytest, local Supabase pgTAP, and web Playwright; teammate walkthrough remains external.
- [ ] Secret scan, RLS ownership tests, function privilege tests, and hosted function allowlist pass.

### User experience and evidence

- [ ] Extension labels do not truncate at 360px or 390px and all primary controls are keyboard accessible.
- [x] Axe has no serious/critical findings and local production-preview Lighthouse meets the Phase 11 thresholds. (public/authenticated axe and three-run medians in `context/performance-notes.md`; hosted dashboard Lighthouse remains external)
- [ ] Pilot summary contains traceable results from 10-15 target users and clearly states limitations.

### UEP submission checklist

- [ ] Final report contains every required section and a readable architecture diagram.
- [ ] GitHub links point to the exact submitted commits; all required code is committed and pushed.
- [ ] Demo video shows all key features end to end, is clearly edited, and is no longer than two minutes.
- [x] An explicit “not deployed in this workspace” statement is included in `docs/submission/submission-checklist.md`; a verified deployed URL remains the preferred human-owned submission state.

## Rollback Strategy

- Commit each phase separately so any regression can be reverted without discarding unrelated user work.
- Before database deployment, record the migration list and create a rollback SQL file for destructive schema/grant changes; test rollback locally.
- Deploy Edge Functions and web assets to a staging/preview environment first, then promote the exact verified commit.
- Keep the previous extension package ZIP and version available; increment the manifest version only for a verified release candidate.
- Keep the previous deployed web image/tag and FastAPI image/tag so the team can roll back without rebuilding during the ceremony.
- Never roll back by restoring an exposed credential or weakening RLS/function grants.

## Open Questions

1. What are the final public marketing, dashboard, API, and Chrome Store URLs? Until supplied, production builds must fail or show the explicit invite-only state.
2. Was `backend/service-account.json` ever a valid credential, and has its key already been revoked? This determines whether coordinated history rewriting is mandatory.
3. Who owns each team contribution and which 10-15 students can participate in the pilot? Code work can proceed, but the final report/evidence cannot be completed without these human inputs.

## Copy-Paste Prompt for Grok 4.6

```text
You are implementing the StudyPilot UEP judging-readiness plan.

Read this entire file first:
C:\Users\gjins\Desktop\studypilot\docs\plans\2026-08-21-uep-judging-readiness.md

Work in these repositories only:
- C:\Users\gjins\Desktop\studypilot
- C:\Users\gjins\Desktop\studypilot-extension

Start with Phase 0 and stop after that phase for review. Before editing, inspect git status, unstaged diff, staged diff, and the latest commit in both repositories. Preserve all pre-existing and unrelated changes. The extension currently reports five modified files with no visible textual diff; resolve and document that state before touching them.

Follow the locked product/architecture decisions exactly. Add tests with behavior changes. Run every verification command for the phase. Do not claim a phase is complete when a required check was skipped; report the check as blocked with the exact missing prerequisite. Commit one phase at a time and record the commit SHA in the plan or implementation log.

Never expose or print secrets. Do not rewrite Git history, rotate keys, deploy, publish an extension, alter DNS, or contact pilot participants without explicit human approval. For Supabase work, check the current official changelog/docs first, use the project's imperative migration workflow, and verify with a clean local reset plus pgTAP.

At the end of each phase, return:
1. Outcome and user-visible behavior.
2. Files changed.
3. Tests/checks run with pass counts.
4. Remaining blockers or deviations.
5. Commit SHA.
6. A request for approval to begin the next phase.
```
