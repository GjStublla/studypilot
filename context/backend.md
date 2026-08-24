# Backend & Auth Manual

This document explains the FastAPI backend, the auth system, and what the
frontend team needs to do to connect the dashboard to real data.

---

## 1. File Structure

```text
backend/
  main.py               ← FastAPI app, CORS, rate limiting, router registration
  supabase_client.py    ← Supabase client singletons + get_user_client()
  dependencies.py       ← Shared verify_token / get_token Depends() helpers
  rate_limit.py         ← Shared slowapi Limiter instance
  routers/
    auth.py             ← /auth/* — signup, login, logout, refresh
    users.py            ← /users/me — GET + PATCH profile
    sessions.py         ← /sessions/* — list, detail, create, messages
    rubrics.py          ← /rubrics — list with criteria
    action_items.py     ← /action-items — list + toggle
  .env                  ← secrets (never committed)
  .env.example          ← template for new developers
  requirements.txt      ← pinned Python dependencies
```

### Auth page

`src/components/AuthPage.tsx` — login, signup, and Google OAuth.
Rendered when the hash is `#auth`.

### Protected dashboard

`#dashboard` requires a valid JWT in `localStorage`. Missing token redirects
to `#auth`.

---

## 2. Running the Backend

Install dependencies (first time only):

```bash
cd backend
pip install -r requirements.txt
```

Activate the project virtualenv first — the backend uses `.venv` inside
the repo root:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
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
Interactive API docs: `http://localhost:8000/docs`

You need two terminals running simultaneously:

```text
Terminal 1          Terminal 2
──────────          ──────────
npm run dev         npm run backend
port 5173           port 8000
```

---

## 3. Environment Variables

### Backend (`backend/.env`)

Copy `backend/.env.example` and fill in the values:

```env
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...        ← Project Settings → API → anon/public
SUPABASE_SERVICE_ROLE_KEY=eyJ...← Project Settings → API → service_role (SECRET)
GEMINI_API_KEY=                 ← Google AI Studio
```

### Frontend (root `.env`)

Copy the root `.env.example` and fill in:

```env
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   ← same anon key as above
VITE_API_BASE_URL=              ← leave blank for localhost:8000 fallback in dev
```

### Rules

- Never commit either `.env` file — both are gitignored
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` to the browser
- The frontend may only use `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  and `VITE_API_BASE_URL`

### Security notes

- **Token storage.** Access + refresh tokens live in `localStorage` (XSS-exposed).
  A strict CSP and dependency hygiene are the mitigations during beta.
  httpOnly cookies with CSRF protection is the planned post-beta hardening.
- **Password policy.** `min_length=8` is enforced server-side on `SignUpRequest`.
  Also set the matching policy in Supabase dashboard → Auth → Policies.
- **Rate limiting.** In-memory slowapi limiter. Use a Redis backend if running
  multiple workers.
- **Anti-enumeration.** Signup always returns the same response regardless of
  whether the email already exists.

---

## 4. How Auth Works

### Email / password

```text
1. User submits login form
2. React POSTs to /auth/login
3. FastAPI → Supabase Auth → JWT returned
4. React stores tokens in localStorage:
     sp_access_token, sp_refresh_token, sp_user_id, sp_email
5. React calls GET /users/me, stores full profile
6. Redirected to #dashboard
```

### Google OAuth

```text
1. User clicks "Continue with Google"
2. supabase.auth.signInWithOAuth() → browser redirects to Google
3. Google → Supabase → redirects back to app root with #access_token=... in URL
4. App.tsx detects the fragment, calls supabase.auth.getSession()
5. Tokens stored via storeAuth(), redirected to #dashboard
6. FastAPI sees the same Supabase JWT — no backend changes needed
```

### Token refresh

`apiFetch()` in `src/lib/api.ts` handles refresh automatically. On a `401` it
calls `POST /auth/refresh` once and retries. If that also fails it clears tokens
and redirects to `#auth`.

---

## 5. Frontend API Client (`src/lib/api.ts`)

Always use these helpers — never call `fetch` directly:

| Helper | Use for |
|--------|---------|
| `apiPost(path, body)` | Unauthenticated POST (login, signup, refresh) |
| `apiFetch(path, options)` | Authenticated requests — handles token refresh + redirect on expiry |
| `storeAuth(tokens)` | Save tokens after login / OAuth callback |
| `clearAuth()` | Wipe tokens on logout |
| `getAccessToken()` | Read the current access token |

### Pattern for replacing mock data

```typescript
const [sessions, setSessions] = useState<Session[]>([]);

useEffect(() => {
  apiFetch('/sessions')
    .then((r) => (r.ok ? r.json() : []))
    .then(setSessions)
    .catch(() => {}); // expired session already redirects to #auth
}, []);
```

### Logout

```typescript
async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' }); // best-effort
  } catch { /* ignore */ }
  clearAuth();
  window.location.hash = '#';
}
```

### Saving profile changes

```typescript
await apiFetch('/users/me', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ theme: 'light' }),          // send only changed fields
});
```

---

## 6. API Reference

All protected endpoints require:
```
Authorization: Bearer <access_token>
```

---

### Auth — `/auth`

| Method | Endpoint | Rate limit | Body | Description |
|--------|----------|-----------|------|-------------|
| `POST` | `/auth/signup` | 5/min | `{ email, password, name }` | Register new user |
| `POST` | `/auth/login` | 5/min | `{ email, password }` | Sign in, returns JWT |
| `POST` | `/auth/logout` | 20/min | — | Invalidate session (send Bearer token) |
| `POST` | `/auth/refresh` | 30/min | `{ refresh_token }` | Exchange refresh token for new access token |

#### POST /auth/signup — responses

Email confirmation **on** (default):
```json
{ "message": "...", "email_confirmation_required": true }
```

Email confirmation **off**:
```json
{ "access_token": "eyJ...", "refresh_token": "eyJ...", "user_id": "uuid", "email": "..." }
```

#### POST /auth/login — response
```json
{ "access_token": "eyJ...", "refresh_token": "eyJ...", "user_id": "uuid", "email": "..." }
```

---

### Users — `/users`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users/me` | Get the logged-in user's full profile |
| `PATCH` | `/users/me` | Update name, theme, or default_coach_mode |

#### GET /users/me — response
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

#### PATCH /users/me — request body
All fields are optional — send only the ones you want to change.
```json
{
  "name": "Alex Johnson",
  "theme": "light",
  "default_coach_mode": "lecture"
}
```
Valid values: `theme` → `"dark" | "light"`, `default_coach_mode` → `"essay" | "lecture" | "reader"`.

Updating `name` automatically recomputes `initials`.

Returns the full updated profile (same shape as GET /users/me).

---

### Sessions — `/sessions`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions` | List all sessions (summary, no transcript) |
| `GET` | `/sessions/{id}` | Full session: metadata + transcript + action items |
| `POST` | `/sessions` | Create a new session (called by the extension) |
| `POST` | `/sessions/{id}/messages` | Append a transcript message to a session |

#### GET /sessions — response
```json
[
  {
    "id": "uuid",
    "title": "Research Essay Draft",
    "source": "Chrome Extension",
    "mode": "Essay Coach",
    "duration": "24m",
    "when": "Today · 2:38 PM",
    "rubric_id": "uuid or null",
    "summary": "StudyPilot noticed your thesis..."
  }
]
```
Ordered by most recent first.

#### GET /sessions/{id} — response
```json
{
  "id": "uuid",
  "title": "Research Essay Draft",
  "source": "Chrome Extension",
  "mode": "Essay Coach",
  "duration": "24m",
  "when": "Today · 2:38 PM",
  "rubric_id": "uuid or null",
  "summary": "...",
  "transcript": [
    { "id": "uuid", "who": "You", "text": "Can you check my thesis?", "t": "2:39" },
    { "id": "uuid", "who": "StudyPilot", "text": "Your thesis is clear but...", "t": "2:39" }
  ],
  "action_items": [
    { "id": "uuid", "text": "Make the thesis more specific", "done": false }
  ]
}
```

#### POST /sessions — request body
```json
{
  "title": "Research Essay Draft",
  "mode": "Essay Coach",
  "duration_seconds": 1440,
  "rubric_id": "uuid (optional)",
  "page_title": "My Essay - Google Docs (optional)",
  "page_url": "https://docs.google.com/... (optional)",
  "summary": "Session summary text (optional)",
  "source": "Chrome Extension"
}
```
Valid `mode` values: `"Essay Coach"`, `"Presentation Coach"`, `"Study Coach"`, `"Lecture"`, `"Research Reader"`.

Returns: `{ "id": "uuid", "title": "..." }`  — status 201.

#### POST /sessions/{id}/messages — request body
```json
{
  "role": "user",
  "message_text": "Can you check my thesis?",
  "time_offset_seconds": 159
}
```
Valid `role` values: `"user"`, `"ai"`, `"system"`.

Returns: `{ "id": "uuid" }` — status 201.

---

### Rubrics — `/rubrics`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/rubrics` | List all rubrics with their criteria |
| `POST` | `/rubrics` | Create a new rubric with criteria |
| `DELETE` | `/rubrics/{id}` | Delete a rubric and all its criteria |
| `PATCH` | `/rubrics/{id}/active` | Set a rubric as the active one |

#### GET /rubrics — response
```json
[
  {
    "id": "uuid",
    "title": "Argumentative Essay Rubric",
    "course": "ENG 102 · Composition II",
    "uploaded_at": "2026-04-12T10:00:00+00:00",
    "active": true,
    "sessions_count": 3,
    "file_search_status": "not_indexed",
    "criteria": [
      { "id": "uuid", "name": "Thesis clarity", "score": 0, "max_score": 4 }
    ]
  }
]
```

#### POST /rubrics — request body
```json
{
  "title": "Argumentative Essay Rubric",
  "course": "ENG 102 · Composition II",
  "criteria": [
    { "name": "Thesis clarity", "max_score": 4 },
    { "name": "Evidence quality", "max_score": 4 },
    { "name": "Organization", "max_score": 4 }
  ]
}
```
`criteria` is optional — you can create a rubric with no criteria and add them later.
Returns: `{ "id": "uuid", "title": "...", "course": "..." }` — status 201.

#### DELETE /rubrics/{id}
Returns 204 No Content. Criteria are deleted automatically by the DB cascade.
Returns 409 if the rubric is currently active — set another rubric as active first.

#### PATCH /rubrics/{id}/active
No request body. Marks the rubric as active and deactivates all others.
Returns the full updated rubric (same shape as GET).

---

### Action Items — `/action-items`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/action-items` | List all action items (open first, then done) |
| `PATCH` | `/action-items/{id}` | Toggle done state |
| `DELETE` | `/action-items/{id}` | Permanently delete an action item |

#### GET /action-items — response
```json
[
  {
    "id": "uuid",
    "text": "Make the thesis more specific",
    "session_id": "uuid or null",
    "rubric_id": "uuid or null",
    "done": false
  }
]
```
Open items (`done: false`) come before completed ones.

#### PATCH /action-items/{id} — request body
```json
{ "done": true }
```
Returns the full updated action item (same shape as list item).

#### DELETE /action-items/{id}
Returns 204 No Content. Use PATCH to mark done instead of deleting.

---

### Health — `/health`

```
GET /health
```
Returns `200` when the server and DB are reachable:
```json
{ "status": "ok", "db": "ok" }
```
Returns `503` if the DB is unreachable:
```json
{ "status": "ok", "db": "unreachable" }
```

---

## 7. Security Model

Every protected route uses `Depends(verify_token)` from `dependencies.py`:

```text
Request arrives
  → verify_token() extracts Bearer token
  → supabase.auth.get_user(token) validates JWT with Supabase
  → returns verified user_id
  → route handler runs with trusted user_id

DB queries use get_user_client(token):
  → creates anon Supabase client scoped to the user's JWT
  → PostgREST runs as that user
  → RLS policies enforce row-level ownership at the DB
  → even if application logic has a bug, the DB won't return other users' data
```

The service-role client (`supabase_admin`) is used **only** in:
- `POST /auth/logout` — to call `admin.sign_out()` which requires elevated permissions

---

## 8. Current frontend integration

The dashboard is backed by live typed adapters. The current adapters are:

| Responsibility | Current owner |
|---|---|
| Profile, session, rubric, transcript, and action-item CRUD | src/lib/dashboardApi.ts -> FastAPI |
| Chat, rubric grounding/indexing, usage, signed captures, and session/chat continuation | src/lib/studypilot-api.ts -> Supabase/Edge |
| Realtime reconciliation | src/lib/useRealtime.ts and src/lib/dashboard-chat-state.ts |
| Dashboard view composition | src/components/dashboard/ plus Dashboard.tsx orchestration |

When changing a data path, preserve the typed adapter boundary and add a route/component test in the same phase. Do not reintroduce static seed data or direct model calls from the browser.

The dashboard currently verifies 14 Vitest files / 85 tests, while backend pytest verifies 25 tests. A clean local Supabase reset runs 287 pgTAP assertions across five test files.

## 9. Production checklist

## 9. Production Checklist

Before deploying:

```text
- [ ] Remove localhost entries from CORS origins in main.py
- [ ] Set all env vars on the server (SUPABASE_*, GEMINI_API_KEY)
- [ ] Set VITE_API_BASE_URL to the production backend URL
- [ ] Enable email confirmation in Supabase Auth
- [ ] Set up custom SMTP (Resend, SendGrid, or Brevo) — free tier is 2 emails/hour
- [ ] Enable leaked password protection in Supabase (Pro plan)
- [ ] Switch rate limiter to Redis backend if running multiple workers
- [ ] Deploy FastAPI to Railway, Render, or Fly.io
```
