# Security Policy

StudyPilot treats credential handling as a product requirement, not an afterthought. This document is the runbook for secret locations, rotation, and incident response.

## Reporting a vulnerability or leaked credential

Do **not** open a public GitHub issue for secrets, tokens, private keys, or student data.

1. Email **hello@studypilot.app** with a short description, the affected surface (web, API, extension, Supabase, Google Cloud), and the time you noticed it.
2. If the GitHub repository has private vulnerability reporting enabled, you may also use **GitHub Security Advisories**.
3. If a credential is already in git, say so and name the **path and commit**, never paste the secret.

Record rotation dates and key IDs in a **private incident record outside git**. Do not commit those values here.

## Browser-facing `VITE_*` variables may contain only public values

Vite inlines every `VITE_*` variable into the JavaScript sent to the browser and the Chrome extension.

Allowed in `VITE_*` (and other public build-time config):

- Public HTTPS (or explicit local) API base URL
- Supabase project URL
- Supabase **anon / publishable** key
- Chrome Web Store URL and other public product links

Never put any of the following in `VITE_*`, `index.html`, the extension bundle, or client source:

- Supabase **service_role** key
- Google service-account JSON, private keys, or `GOOGLE_APPLICATION_CREDENTIALS` paths
- Gemini / Vertex API keys
- Access tokens, refresh tokens, or session JWTs for real users
- Database passwords, webhook secrets, or GitHub tokens

If a value would let someone impersonate the backend or bypass RLS, it is not a `VITE_*` variable.

## Permitted secret locations

| Secret | Where it may live | Where it must not live |
|---|---|---|
| Supabase service role | `backend/.env` (gitignored); hosted FastAPI environment | Git, browser, extension, `VITE_*` |
| Supabase anon key | Public env files and `VITE_SUPABASE_ANON_KEY` | Treated as public; still do not copy hosted keys into screenshots or the demo video |
| Vertex / Gemini service account | Hosted Edge Function secrets; gitignored `supabase/functions/.env.local` | Git, `backend/service-account.json`, browser |
| Gemini API key (if ever used) | Server / Edge secrets only | Browser, extension, `VITE_GEMINI_API_KEY` |
| Database URL / JWT secret | Local Supabase CLI state and hosted project settings | Git |
| GitHub Actions secrets | Repository environment secrets | Workflow YAML, source, logs |

Tracked templates such as `.env.example`, `backend/.env.example`, `supabase/functions/.env.local.example`, and `.env.docker.example` must keep **empty or placeholder** values.

`.env.studypilot-local` is the **official Supabase CLI local demo** URL and anon JWT used by `npm run dev:local`. It is not a hosted project secret. Do not replace it with production keys.

`backend/service-account*.json` is gitignored. Never re-add a real key file.

## Revocation steps

Rotate first, then clean up copies. Do not wait for a git-history rewrite before revoking a live key.

### Google Cloud service account

1. In Google Cloud Console, open IAM → Service Accounts → the affected account → Keys.
2. Delete the leaked key immediately if it was ever valid.
3. Create a new key only if the workload still needs one, and store it in Edge Function secrets or a gitignored local file.
4. Confirm Vertex / Gemini calls still succeed with the new key, then destroy local copies you no longer need.
5. Write the rotation date and key ID in the private incident record.

### Supabase

1. Rotate the **service_role** key (and the JWT secret if a service role or JWT leaked).
2. Update hosted FastAPI / Edge secrets and every developer `backend/.env`.
3. Sign out existing sessions if an auth secret was exposed.

### GitHub and other tokens

1. Revoke the token in the issuing console.
2. Issue a replacement into GitHub Actions secrets or a password manager, not into source.

### After revocation

1. Search developer machines, CI logs, chat, and email for copies of the old material.
2. Keep automated secret scanning enabled so a reintroduction fails CI.
3. A history rewrite (`git filter-repo --path backend/service-account.json --invert-paths` plus a coordinated protected-branch force-push) is **optional only if the file never contained a valid key**. If it did, an owner must approve and perform the rewrite. Do not rewrite history from an agent session without that approval.

## Known credential incident

`backend/service-account.json` was added in commit `1e0f6bb` and removed from the tree in `0cd0d99`. Metadata-only inspection shows a Google `service_account` JSON object with a PEM private key. Treat it as **valid until an owner proves otherwise and records rotation**.

Gitleaks is configured to keep failing on that historical path. Do not allowlist the file or the private-key pattern.

## Secret scanning

- Local / CI: `gitleaks git --redact --no-banner` with `.gitleaks.toml`
- `.gitleaks.toml` may path-allowlist **known fake local fixtures only**
- Never allowlist a live token regex, a private key, or `backend/service-account.json`
