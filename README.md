# studypilot

StudyPilot is a rubric-aware coaching loop across the browser and dashboard: it uses the page, the student's question, and an uploaded rubric to coach the next improvement, then carries the conversation and action items into the dashboard.

The beta uses your microphone and the page context you choose to share. Answers can cite retrieved rubric or uploaded-document evidence when grounding is available. Sign in once to connect the extension and dashboard.

Live microphone audio is processed by Google Vertex AI while a session is active. Screenshots are sent only when you enable them. Chat and session history save only when “Save to dashboard” is on.

Built with React, TypeScript, and Vite.

## Local quality gate

Run the full non-hosted quality baseline before opening a pull request:

```bash
npm ci
npm run quality
```

The command checks Prettier formatting, ESLint, TypeScript, unit tests, a
production build with public placeholder values, and the built-environment
scan. It deliberately does not contact Supabase or run the hosted function
allowlist; use `npm run verify:release` in an authorized release environment
when those hosted checks are required.

The canonical Chrome extension lives in the sibling repo
[`../studypilot-extension`](../studypilot-extension). The repository-local
legacy scaffold is not part of releases. `npm run extension:build` builds the
canonical sibling.

## Local full-stack development

The explicit local mode uses the Supabase CLI stack, creates a disposable
`dev@studypilot.local` user automatically, and bypasses AI request counting
inside local Edge Functions. Production builds still require login and enforce
the hosted daily limit.

### Prerequisites

- Node.js 22 or later
- Python 3.13 when running the FastAPI backend or pytest outside Docker (the backend image pins `python:3.13-slim`)
- Docker Desktop
- A Google Cloud project with the Vertex AI API and billing enabled
- Each developer's own service-account credentials with the Vertex AI User role for real local AI responses

Install dependencies and start local Supabase:

```bash
npm install
npm run local:start
npm run local:status
```

The repository tracks `.env.studypilot-local` with the standard public local
Supabase URL and anon key, so no frontend secret setup is required. Use
`npm run local:status` when you need to inspect the running service URLs.

For real Gemini calls, every developer must create their own ignored local file by copying
[`supabase/functions/.env.local.example`](supabase/functions/.env.local.example)
to `supabase/functions/.env.local` and filling in either the service-account
JSON or the split email/private-key values. A `GEMINI_API_KEY` is not sufficient:
StudyPilot's text, RAG, and Live paths use Vertex service-account OAuth. Do not
commit this file or send one shared private key to the team; use one
least-privilege service account per developer in the same Google Cloud project.

```powershell
Copy-Item supabase/functions/.env.local.example supabase/functions/.env.local
# Edit the copied file, then validate it without printing any secret values.
npm run local:check
```

The tracked example enables the AI-usage bypass, but the server also verifies
that it is running against a local Supabase hostname before honoring it. The
preflight validates local file structure and required variables; the first AI
request is still the authoritative check that the credential is active, the
Vertex AI API is enabled, and the service account has access.

Run the functions and dashboard in separate terminals:

```bash
npm run local:functions
npm run dev:local
```

Open `http://127.0.0.1:5173/#dashboard`. No login form is required: the
dashboard signs in or creates the deterministic local developer account before
rendering data. The normal `npm run dev` and `npm run build` commands do not
enable this behavior.

Stop the local services with:

```bash
npm run local:stop
```

### Local Gemini troubleshooting

| Symptom                                             | Cause / fix                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `missing supabase/functions/.env.local`             | Copy the tracked example, add your own Vertex service-account values, then run `npm run local:check`.                                                        |
| `GEMINI_API_KEY is not used`                        | This app is Vertex-only. Configure `GEMINI_SERVICE_ACCOUNT_CREDENTIALS`, or both `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY`.                             |
| Google `401` or `invalid_grant`                     | The service-account key is malformed, revoked, or does not match the email. Create a fresh key for that developer and replace only their local ignored file. |
| Google `403` or `PERMISSION_DENIED`                 | Enable billing and the Vertex AI API in the configured project, then grant that developer's service account the Vertex AI User role.                         |
| Supabase status reports a missing container         | Start Docker Desktop, run `npm run local:stop`, then `npm run local:start`; each computer needs its own local Supabase stack.                                |
| The extension calls `127.0.0.1` on another computer | Loopback always means that friend's computer, not yours. They must run their own local stack and local Edge Functions.                                       |

The default model IDs are intentional: text/RAG uses `gemini-3.5-flash`, Live
uses `gemini-3.1-flash-live-preview`, Vertex interactions default to `global`,
and Vertex RAG defaults to `us-central1`.

### Clean-clone verification

These commands reproduce the non-hosted release gates without private
credentials. Unit tests work before `.env` exists; the production build is
intentionally fail-closed until public HTTPS values are supplied.

```bash
git clone <repository-url> studypilot-clean
cd studypilot-clean
npm ci
npm test
npm run test:deno
node --test scripts/validate-claims.test.mjs
npm run validate:claims
npm run validate:pitch
node --test scripts/validate-submission-package.test.mjs
npm run validate:submission
npm run validate:pilot
npm run summarize:pilot
npx playwright install chromium
npm run test:e2e -- --reporter=line
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python -m pytest backend/tests -q
npx supabase start
npx supabase test db
npx supabase stop --no-backup
```

For the public-placeholder production build, set only non-secret values in the
shell that invokes the build:

```bash
export VITE_API_BASE_URL=https://api.example.invalid
export VITE_SUPABASE_URL=https://project.supabase.co
export VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjaS1wbGFjZWhvbGRlciJ9.ci-placeholder-key
npm run build
node scripts/verify-built-env.mjs dist
```

On PowerShell, assign the same values with `$env:VITE_API_BASE_URL =
'https://api.example.invalid'` and equivalent assignments for the two
Supabase variables before running the build commands. Replace placeholders
only through a secure release environment; never commit hosted keys.

When both repositories are checked out side by side, include the canonical
extension README in the claim check:

```powershell
npm run validate:claims -- --extension-root ../studypilot-extension --require-extension
```

The claim check guards the web README, landing/legal copy, final report draft,
the time-coded demo script for retired claims, and (when present) the canonical
extension README. It does not certify the separately owned pitch wording or
approve the demo's hosted/learning-impact evidence.

`npm run validate:submission` separately checks the report's nine-section order,
the seven-segment 1:58 demo timeline, fallback instructions, and checklist
markers. It reports remaining human-owned inputs without treating them as
complete; use `node scripts/validate-submission-package.mjs
--require-final-inputs` only after the hosted URL, pilot, media, contribution,
and sign-off inputs are actually supplied.

## Running with Docker

The whole stack (React frontend + FastAPI backend) runs in Docker and talks to hosted Supabase. Node and Python run inside the containers, so the only tool you need locally is Docker.

### 1. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Engine and Compose v2)

Verify:

```bash
docker --version
docker compose version
```

### 2. Create the environment files

Two `.env` files are required and are **gitignored** (they hold secrets), so you must create them after cloning. See [`.env.docker.example`](.env.docker.example) for the full reference.

**`backend/.env`** — copy from [`backend/.env.example`](backend/.env.example):

| Variable | Secret | Notes |
|----------|--------|-------|
| `SUPABASE_URL` | no | Supabase project URL |
| `SUPABASE_ANON_KEY` | no | Public / browser-safe key |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Server-only, bypasses RLS — never commit or share publicly |

**`.env`** at the repo root — copy from [`.env.example`](.env.example):

```
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=<same as SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<same as SUPABASE_ANON_KEY>
```

Get these values from Supabase Dashboard → Project Settings → API, or from a teammate via a secure channel (never the repo).

### 3. Start the stack

Development (hot reload):

```bash
docker compose up --build
# frontend -> http://localhost:5173
# backend  -> http://localhost:8000/docs
```

Production-style build (static frontend served by nginx):

```bash
docker compose -f docker-compose.prod.yml up --build
# frontend -> http://localhost:8080
# backend  -> http://localhost:8000
```

There are also npm shortcuts: `npm run docker:dev` and `npm run docker:prod`.

### 4. Verify it's healthy

```bash
docker compose ps                 # both services should be "Up"
curl http://localhost:8000/health # expect {"status":"ok","db":"ok"}
```

### 5. Stop it

```bash
docker compose down
```

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| `env file ... not found` | Create both `.env` and `backend/.env` before running |
| `/health` returns `db: unreachable` | Wrong/missing Supabase keys in `backend/.env` |
| Port 5173 / 8000 already in use | Stop the conflicting process, then retry |
| First frontend load is slow / times out | Vite's initial startup — refresh after a few seconds |
| CORS errors on the prod frontend (port 8080) | Set `CORS_ORIGINS=http://localhost:8080` in `backend/.env` |

## Security

Do not commit `.env` files, service-account JSON, or any `VITE_*` value that is not public. Report leaked credentials to **hello@studypilot.app** with path and commit only — never the secret. See [SECURITY.md](SECURITY.md) for permitted locations, rotation, and the Gitleaks CI gate.
