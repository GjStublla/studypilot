# ADR 0001: Runtime boundaries between FastAPI and Supabase

**Status:** Accepted for the beta and UEP submission
**Date:** 2026-08-24

## Decision

StudyPilot uses two deliberate service boundaries:

- FastAPI owns authenticated profile, session, rubric, transcript, and action-item CRUD. The React dashboard calls this boundary through `src/lib/api.ts` and `src/lib/dashboardApi.ts`.
- Supabase owns Auth, Postgres row-level security, Realtime, Storage, and Edge Functions. Chat, rubric retrieval/grounding, coaching streams, live-token brokering, and cross-surface synchronization use `src/lib/studypilot-api.ts` on the web and the authenticated facade in the canonical extension.
- Vertex AI/Gemini is reached only by server-side Edge/backend code. Browser bundles receive public Supabase configuration, never service-role credentials or model API keys.

The extension and React dashboard are clients. Neither client becomes a second CRUD backend.

## Alternatives considered

1. **Move all CRUD to Supabase.** Rejected for the beta because the existing FastAPI contract already provides typed profile/session/rubric/action-item routes and test coverage.
2. **Move chat/RAG/live workflows into FastAPI.** Rejected because the current Edge/Realtime/Storage path already provides streaming and cross-surface synchronization close to the client surfaces.
3. **Call Vertex/Gemini directly from the browser.** Rejected because it would expose a model credential and make quota, grounding, and abuse controls unenforceable.
4. **Duplicate endpoints in both services.** Rejected because duplicate ownership creates divergent authorization and synchronization behavior.

## Consequences

- New profile/session/rubric/action-item CRUD belongs in FastAPI and its Python tests.
- New chat/RAG/live/sync behavior belongs in Supabase Edge/Realtime/Storage and its Deno/pgTAP tests.
- Every exposed user-data table requires RLS policies and explicit privilege review; the security tests must cover both ownership and execution grants.
- A feature crossing both boundaries must define one owner and one adapter rather than duplicating the operation.
- Local verification must run both service stacks; production verification must additionally run the hosted function allowlist and smoke checks.

## Review trigger

Revisit this ADR only when the beta deliberately changes deployment topology, requires shared FastAPI rate-limit storage, or replaces the Supabase Edge workflow. A new endpoint must document its owner and authorization boundary before implementation.
