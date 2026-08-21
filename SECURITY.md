# Security Policy

StudyPilot credential handling is a product requirement. Browser and extension bundles must never receive model keys, service-role keys, or service-account JSON.

## Reporting a vulnerability or leaked credential

Do **not** open a public GitHub issue for secrets, tokens, private keys, or student data.

1. Email **hello@studypilot.app** (the same address used on the product site). Include the affected surface (web, API, extension, Supabase, Google Cloud), the time you noticed it, and if it is already in git the **path and commit**. Never paste the secret.
2. If private vulnerability reporting is enabled on the GitHub repository, you may also use **GitHub Security Advisories**.

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

This matches the current runtime, not a generic template:

| Secret | Where it may live | Where it must not live |
|---|---|---|
| Supabase service role | Gitignored `backend/.env`; hosted FastAPI environment | Git, browser, extension, `VITE_*` |
| Supabase anon key | Public env files and `VITE_SUPABASE_ANON_KEY` | Treated as public; still do not copy hosted keys into screenshots or the demo video |
| Vertex / Gemini service account | Hosted **Supabase Edge Function** secrets, or gitignored `supabase/functions/.env.local` (`GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`, or `GEMINI_SERVICE_ACCOUNT_CREDENTIALS`) | Git, `backend/service-account.json`, `backend/.env`, browser, extension |
| Gemini API key (unused on current Vertex paths) | Server / Edge secrets only, if ever reintroduced | Browser, extension, `VITE_GEMINI_API_KEY`, FastAPI |
| Database URL / JWT secret | Local Supabase CLI state and hosted project settings | Git |
| GitHub Actions secrets | Repository environment secrets | Workflow YAML, source, logs |

FastAPI does **not** call Vertex. Do not store a Google service-account JSON under `backend/`; that is how the known incident happened. Edge Functions broker all model access.

Tracked templates (`.env.example`, `backend/.env.example`, `supabase/functions/.env.local.example`, `.env.docker.example`) must keep **empty or placeholder** values.

`.env.studypilot-local` is the **official Supabase CLI local demo** URL and anon JWT used by `npm run dev:local`. It is tracked on purpose and is not a hosted project secret. Do not replace it with production keys. Gitleaks path-allowlists that file as a fixture; putting a real hosted secret there would also be ignored by the scanner.

`backend/service-account*.json` is gitignored. Never re-add a real key file.

## Revocation steps

Rotate first, then clean up copies. Do not wait for a git-history rewrite before revoking a live key.

### Google Cloud service account

1. In Google Cloud Console, open IAM → Service Accounts → the affected account → Keys.
2. Delete the leaked key immediately if it was ever valid.
3. Create a new key only if Edge Functions still need one, and store it in Edge Function secrets or gitignored `supabase/functions/.env.local` — not under `backend/`.
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
3. History rewrite (`git filter-repo --path backend/service-account.json --invert-paths` plus a coordinated protected-branch force-push) is **required if the file contained a valid key**, and optional only if an owner proves it never did. Do not rewrite history from an agent session without that approval.

## Known credential incident

`backend/service-account.json` was added in commit `1e0f6bb` (2026-08-06) and removed from the tree in `0cd0d99` (2026-08-20). Metadata-only inspection shows a Google `service_account` JSON object with a PEM private key. Treat it as **valid until an owner proves otherwise and records rotation**.

Gitleaks is configured to keep failing on that historical path. Do not allowlist the file or the private-key pattern. Until a human rotates the key (if it was ever valid) and, if required, rewrites history, **the CI secret-scan job is expected to fail**. That red X is the control working, not a broken workflow.

## Secret scanning

- Local: `gitleaks git --redact --no-banner --config .gitleaks.toml` from the web repo root (pin Gitleaks **8.30.1** to match CI).
- CI: `.github/workflows/ci.yml` job **Secret scan** on every push and pull request, full history, checksum-verified binary, `--redact`.
- [`.gitleaks.toml`](.gitleaks.toml) may path-allowlist **known fake local fixtures only**. Never allowlist a live token regex, a private key, or `backend/service-account.json`.

A HEAD-only scan can be used to check the current tree; it must not replace the full-history CI job.

## What a teammate should do next

1. If you have Google Cloud IAM on the affected project, rotate the historical service-account key now and record the date and key ID privately.
2. Decide whether `git filter-repo` + protected-branch force-push is required; an agent must not do that without explicit approval.
3. Confirm the five `studypilot-extension` files that previously looked dirty were not meant to hold uncommitted work.
4. Do not start later UEP phases from this document; wait for an explicit Phase 1 go-ahead.
