# Backend & Auth Manual

This document explains the FastAPI backend, the auth system, and what the frontend team needs to do to connect the dashboard to real data.

---

## 1. What Was Built

### FastAPI Backend

A Python backend lives in `backend/`. It sits between the React frontend and Supabase, handling auth and data operations.

```text
backend/
  main.py               ← FastAPI app entry point, CORS config
  supabase_client.py    ← Supabase connections (anon + admin) + get_user_client()
  rate_limit.py         ← shared slowapi limiter (kept separate to avoid a circular import)
  routers/
    auth.py             ← signup, login, logout, refresh (rate-limited)
    users.py            ← GET /users/me (RLS-scoped read)
  .env                  ← secrets (never committed)
  .env.example          ← template for new developers
  requirements.txt      ← Python dependencies
```

### Auth Page

A login/signup UI lives at `src/components/AuthPage.tsx` with matching styles in `src/components/AuthPage.css`.

It is rendered when the hash is `#auth`.

### Protected Dashboard

The `#dashboard` route now requires a valid JWT. If no token is found in `localStorage`, the user is redirected to `#auth`.

---

## 2. Running the Backend

Install dependencies (first time only):

```bash
cd backend
pip install -r requirements.txt
```

Start the backend:

```bash
npm run backend
```

Or manually:

```bash
cd backend
python -m uvicorn main:app --reload
```

The backend runs on `http://localhost:8000`.

Interactive API docs are available at `http://localhost:8000/docs`.

You need two terminals running simultaneously:

```text
Terminal 1          Terminal 2
──────────          ──────────
npm run dev         npm run backend
port 5173           port 8000
```

---

## 3. Environment Variables

Copy `.env.example` to `.env` inside the `backend/` folder and fill in the values:

```env
SUPABASE_URL=https://rqszloxxegvxaedptcqj.supabase.co
SUPABASE_ANON_KEY=eyJ...        ← from Supabase Project Settings → API → anon/public
SUPABASE_SERVICE_ROLE_KEY=eyJ...← from Supabase Project Settings → API → service_role
GEMINI_API_KEY=                 ← from Google AI Studio
```

Rules:
- Never commit `.env` — it is in `.gitignore`
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` to the frontend or extension
- The frontend may only use public `VITE_*` vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL`

### Frontend env

The web app talks to this backend through `src/lib/api.ts`, which reads
`VITE_API_BASE_URL` (set it in a root `.env`) and falls back to
`http://localhost:8000` when unset — so no `.env` is needed for local dev.

### Security notes

- **Token storage.** The access + refresh tokens are kept in `localStorage`.
  Convenient, but readable by any script on the page, so it is exposed to XSS — a
  strict CSP and dependency hygiene are the practical mitigations during the
  beta. Moving to httpOnly cookies (with CSRF protection) is the planned
  post-beta hardening. Refresh-on-`401` is handled centrally by `apiFetch()` in
  `src/lib/api.ts`.
- **Password policy.** Signup enforces a minimum length server-side via
  `Field(min_length=8)` on `SignUpRequest` (the client check is only UX). Because
  there is no `supabase/config.toml`, also set the matching minimum in the
  Supabase dashboard (Auth → Policies) and enable leaked-password protection in
  production.
- **Rate limiting.** `/auth/login` and `/auth/signup` are capped at 5
  requests/minute per IP (slowapi). Storage is in-memory — use a Redis backend if
  you run multiple workers.
- **Anti-enumeration.** Signup returns the same "check your email" response
  whether or not the email already exists, so it can't be used to discover which
  accounts are registered.

---

## 4. API Endpoints

### Auth

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/signup` | `{ email, password, name }` | Register new user |
| `POST` | `/auth/login` | `{ email, password }` | Sign in, returns JWT |
| `POST` | `/auth/logout` | — | Invalidates session (send Bearer token) |
| `POST` | `/auth/refresh` | `{ refresh_token }` | Get new access token |

### Users

| Method | Endpoint | Headers | Description |
|--------|----------|---------|-------------|
| `GET` | `/users/me` | `Authorization: Bearer <token>` | Get logged-in user's profile |

### Signup response

If email confirmation is enabled in Supabase, signup returns:

```json
{
  "message": "Account created. Please check your email to confirm your account, then sign in.",
  "email_confirmation_required": true
}
```

If email confirmation is disabled, signup returns a full `AuthResponse` with tokens.

### Login / Signup success response

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user_id": "uuid",
  "email": "user@example.com"
}
```

### GET /users/me response

```json
{
  "user_id": "uuid",
  "name": "Alex Johnson",
  "email": "alex@university.edu",
  "initials": "AJ",
  "theme": "dark",
  "default_coach_mode": "essay"
}
```

---

## 5. How Auth Works

```text
1. User submits login form
2. React POSTs to /auth/login
3. FastAPI calls Supabase Auth with email + password
4. Supabase returns a JWT
5. FastAPI returns the JWT to React
6. React stores it in localStorage:
     sp_access_token
     sp_refresh_token
     sp_user_id
     sp_email
7. React immediately calls GET /users/me with the token
8. Stores the full profile for use across the app
9. User is redirected to #dashboard
```

On every page load, `App.tsx` checks `localStorage` for `sp_access_token`. If found, the user is considered logged in. If not, `#dashboard` redirects to `#auth`.

---

## 6. Frontend API Client (`src/lib/api.ts`)

Auth and profile wiring is implemented in `src/lib/api.ts` — reuse it instead of
calling `fetch` directly:

- `apiPost(path, body)` — unauthenticated POST (login / signup / refresh).
- `apiFetch(path, options)` — authenticated fetch: attaches the bearer token and,
  on a `401`, refreshes once and retries; if refresh fails it clears the stored
  tokens and redirects to `#auth`. So token expiry is handled for you.
- `storeAuth(tokens)` / `clearAuth()` / `getAccessToken()` — helpers over the
  `sp_*` localStorage keys.

`AuthPage.tsx` already uses `apiPost` + `storeAuth`. `Dashboard.tsx` loads the
real profile on mount with `apiFetch('/users/me')` and threads it through as the
`student` prop (the old email-derived `STUDENT` guess is now just the first-paint
fallback).

### 6.1 Wiring the remaining mock data

`Dashboard.tsx` still has mock `RUBRICS`, `SESSIONS`, and `ACTION_ITEMS_INITIAL`.
Once the endpoints in section 7 exist, replace each with the same pattern:

```typescript
const [sessions, setSessions] = useState<Session[]>([]);
useEffect(() => {
  apiFetch('/sessions')
    .then((r) => (r.ok ? r.json() : []))
    .then(setSessions)
    .catch(() => {}); // expired session already redirects to #auth
}, []);
```

### 6.2 Logout

```typescript
import { apiFetch, clearAuth } from '../lib/api';

async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' }); // best-effort
  } catch {
    /* ignore — we clear locally regardless */
  }
  clearAuth();
  window.location.hash = '#';
}
```

---

## 7. Backend Endpoints Still To Build

These are needed to replace the mock data in the dashboard:

```text
GET  /sessions              → list user's sessions
GET  /sessions/{id}         → session detail + transcript + action items
GET  /rubrics               → list user's rubrics with criteria
GET  /action-items          → list user's action items
PATCH /action-items/{id}    → toggle done/undone
POST /sessions              → save a new session from the extension
POST /sessions/{id}/messages → save transcript messages
```

---

## 8. Production Checklist

Before deploying:

```text
- [ ] Set SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY as environment variables on the server
- [ ] Update CORS origins in main.py to include the real production domain
- [ ] Enable email confirmation in Supabase Auth
- [ ] Set up a custom SMTP provider (Resend, SendGrid, or Brevo) to avoid the 2 email/hour limit
- [ ] Enable leaked password protection (requires Supabase Pro)
- [ ] Set VITE_API_BASE_URL to the production backend URL (read by src/lib/api.ts)
- [ ] Deploy FastAPI to a server (Railway, Render, or Fly.io recommended)
```
