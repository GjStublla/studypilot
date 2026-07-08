# studypilot

An elegant, modern study assistant designed to elevate your learning experience. Built with React, TypeScript, and Vite.

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
