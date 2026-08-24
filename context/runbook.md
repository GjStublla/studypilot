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
