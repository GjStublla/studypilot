# Backend & Auth Manual

This document explains the FastAPI backend, the auth system, and what the frontend team needs to do to connect the dashboard to real data.

---

## 1. What Was Built

### FastAPI Backend

A Python backend lives in `backend/`. It sits between the React frontend and Supabase, handling auth and data operations.

```text
backend/
  main.py               ← FastAPI app entry point, CORS config
  supabase_client.py    ← Supabase connections (anon + admin)
  routers/
    auth.py             ← signup, login, logout, refresh
    users.py            ← GET /users/me
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
- The frontend may only use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

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

## 6. What the Frontend Team Needs to Do

### 6.1 Fetch real profile after login

After a successful login, call `GET /users/me` and store the result:

```typescript
const profileRes = await fetch('http://localhost:8000/users/me', {
  headers: { Authorization: `Bearer ${auth.access_token}` }
});
const profile = await profileRes.json();

// Store for use across the app
localStorage.setItem('sp_profile', JSON.stringify(profile));
```

Then read it anywhere:

```typescript
const profile = JSON.parse(localStorage.getItem('sp_profile') || '{}');
// profile.name, profile.initials, profile.theme, profile.default_coach_mode
```

### 6.2 Replace mock data in Dashboard.tsx

`Dashboard.tsx` currently uses hardcoded mock data at the top of the file:

```typescript
const STUDENT = { name: 'Maya', initials: 'M', email: 'maya.l@northcrest.edu' }
const RUBRICS = [...]
const SESSIONS = [...]
const ACTION_ITEMS_INITIAL = [...]
```

These need to be replaced with API calls. The backend endpoints for this are not built yet — they are listed in section 7 below.

When the endpoints are ready, replace each constant with a `useEffect` + `useState` fetch:

```typescript
const [sessions, setSessions] = useState([]);

useEffect(() => {
  const token = localStorage.getItem('sp_access_token');
  fetch('http://localhost:8000/sessions', {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(r => r.json())
    .then(setSessions);
}, []);
```

### 6.3 Handle token expiry

When any API call returns `401`, call `/auth/refresh` with the stored refresh token:

```typescript
async function refreshToken() {
  const refresh_token = localStorage.getItem('sp_refresh_token');
  const res = await fetch('http://localhost:8000/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token })
  });

  if (!res.ok) {
    // Refresh failed — force logout
    localStorage.clear();
    window.location.hash = '#auth';
    return null;
  }

  const data = await res.json();
  localStorage.setItem('sp_access_token', data.access_token);
  localStorage.setItem('sp_refresh_token', data.refresh_token);
  return data.access_token;
}
```

### 6.4 Logout

Call `/auth/logout` before clearing localStorage:

```typescript
async function logout() {
  const token = localStorage.getItem('sp_access_token');
  await fetch('http://localhost:8000/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  localStorage.clear();
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
- [ ] Change API_BASE in AuthPage.tsx from localhost to the production backend URL
- [ ] Deploy FastAPI to a server (Railway, Render, or Fly.io recommended)
```
