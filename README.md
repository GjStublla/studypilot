# studypilot

An elegant, modern study assistant designed to elevate your learning experience. Built with React, TypeScript, and Vite.

The Chrome extension that ships lives in the sibling repo
[`../studypilot-extension`](../studypilot-extension). `extension/` in this repo
is a non-production scaffold and is **not shipped**. `npm run extension:build`
builds the canonical sibling, not the scaffold.

## Local full-stack development

The explicit local mode uses the Supabase CLI stack, creates a disposable
`dev@studypilot.local` user automatically, and bypasses AI request counting
inside local Edge Functions. Production builds still require login and enforce
the hosted daily limit.

### Prerequisites

- Node.js 22 or later
- Docker Desktop
- Gemini service-account credentials for real local AI responses

Install dependencies and start local Supabase:

```bash
npm install
npm run local:start
npm run local:status
```

The repository tracks `.env.studypilot-local` with the standard public local
Supabase URL and anon key, so no frontend secret setup is required. Use
`npm run local:status` when you need to inspect the running service URLs.

For real Gemini calls, copy
[`supabase/functions/.env.local.example`](supabase/functions/.env.local.example)
to `supabase/functions/.env.local` and fill in the service-account values. The
tracked example enables the AI-usage bypass, but the server also verifies that
it is running against a local Supabase hostname before honoring it.

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
