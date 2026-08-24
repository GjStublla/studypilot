# StudyPilot Operations & Deployment Runbook

## 1. Local Development & Testing

### Web Frontend & Dashboard
```bash
# Install dependencies
npm install

# Start local dev server (default port 5173)
npm run dev

# Start in explicit local mode (uses local Supabase fixtures)
npm run dev:local

# Run web test suite
npm test

# Run TypeScript check & production build
npm run build

# Preview built production bundle
npm run preview
```

### Backend (FastAPI)
```bash
# Activate virtual environment
# Windows:
backend\.venv\Scripts\activate
# Linux/macOS:
source backend/.venv/bin/activate

# Install runtime & dev requirements
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt

# Run FastAPI test suite
pytest backend/tests -v

# Start FastAPI dev server
uvicorn backend.main:app --reload --port 8000
```

### Supabase Edge Functions & Database
```bash
# Run Deno Edge Function tests
npm run test:deno

# Start local Supabase containers (requires Docker)
npm run local:start

# Run pgTAP database & RLS tests
npx supabase test db

# Verify hosted Edge Function allowlist (requires Supabase Access Token)
SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=rqszloxxegvxaedptcqj npm run verify:functions
```

---

## 2. Production Deployment Workflow

### Prerequisites
- Build arguments for public HTTPS endpoints:
  - `VITE_API_BASE_URL`: `https://api.studypilot.app`
  - `VITE_SUPABASE_URL`: `https://auth.studypilot.app` (or Supabase project URL)
  - `VITE_SUPABASE_ANON_KEY`: Public JWT anon key
- Do NOT provide private service role keys or Google Cloud credentials to frontend builds.

### Release Verification Gate
```bash
# Runs tests, builds bundle, scans for loopback hosts and leaked secrets
npm run verify:release
```

### Docker Production Deployment
```bash
# Build and run the single-worker production stack
docker compose -f docker-compose.prod.yml up --build -d
```

---

## 3. Hosted Function Allowlist & Drift Prevention

StudyPilot enforces an exact inventory of 10 JWT-verified Edge Functions:
1. `live-token`
2. `live-rubric-search`
3. `live-turn`
4. `live-finish`
5. `ensure-file-search-store`
6. `extract-rubric`
7. `index-knowledge-document`
8. `socratic-coach`
9. `summarize-session`
10. `delete-knowledge-document`

Deploy individual functions with JWT verification:
```bash
npx supabase functions deploy <function-slug> --project-ref rqszloxxegvxaedptcqj
```

---

## 4. Rollback & Emergency Procedures

### Web Application Rollback
- Re-deploy the previously verified container image tag or static bundle.
- Previous release builds are tracked in Git history with discrete commit SHAs per phase.

### Edge Function Rollback
- Re-deploy the function from the previous release commit.
- Never disable `verify_jwt` on deployed functions.

### Secret Compromise / Rotation
- In the event of any credential exposure:
  1. Revoke the key immediately in the Google Cloud Console or Supabase Dashboard.
  2. Issue a replacement credential and update production environment variables.
  3. Log the rotation date and key ID in a private incident record outside Git (see `SECURITY.md`).

---

## 5. GitHub Branch Protection (Human/Admin Gate)

Do not run these commands until the reviewed local remediation heads have been
pushed, the historical credentials have been rotated, and a repository admin has
approved the settings. The commands below are intentionally read-first and use
repository placeholders; they do not belong in CI and must not receive tokens
through workflow YAML.

### Required non-secret checks

Protect each repository independently. For `GjStublla/studypilot`, require:

- `Secret scan` (after the historical service-account incident is resolved)
- `Web quality`
- `Web Playwright E2E`
- `Backend tests`
- `Supabase pgTAP`

Keep `Hosted function allowlist` as a protected-environment gate until its
Supabase secrets are configured; do not turn a missing-secret skip into evidence
that hosted verification passed. For `GjStublla/studypilot-extension`, require
`Extension secret scan` and `Extension quality`.

### Inspect before changing settings

```bash
gh api repos/<owner>/<repo>/branches/main/protection
gh run list --repo <owner>/<repo> --limit 20
```

### Apply after explicit admin approval (PowerShell)

Replace `<owner>/<repo>` with exactly one repository at a time. Review the
resulting JSON before piping it to `gh api`.

```powershell
$requiredChecks = @(
  'Secret scan',
  'Web quality',
  'Web Playwright E2E',
  'Backend tests',
  'Supabase pgTAP'
)
$protection = @{
  required_status_checks = @{
    strict = $true
    contexts = $requiredChecks
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = $false
    required_approving_review_count = 1
  }
  restrictions = $null
  required_linear_history = $true
  allow_force_pushes = $false
  allow_deletions = $false
} | ConvertTo-Json -Depth 6

$protection | gh api --method PUT `
  -H 'Accept: application/vnd.github+json' `
  repos/<owner>/<repo>/branches/main/protection `
  --input -
```

For the extension repository, set `$requiredChecks` to:

```powershell
$requiredChecks = @('Extension secret scan', 'Extension quality')
```

After each approved change, re-run the read-only inspection and record the
protection response plus the actual workflow run URLs in
`docs/submission/submission-checklist.md`. Do not mark CI green from a local
run or from a job that was skipped.
