-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RPC access for SECURITY DEFINER functions.
--
-- create_rubric_with_criteria and set_active_rubric are called by the FastAPI
-- backend via get_user_client(token) which uses the anon key scoped with the
-- user's JWT — this runs as the authenticated role. Both functions must keep
-- the authenticated grant.
--
-- The security advisor warning about SECURITY DEFINER functions is acknowledged.
-- Both functions enforce ownership via p_user_id = user_id row filters, so
-- cross-user exploitation is not possible even though authenticated can call them.
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure grants are in place (idempotent).
grant execute on function public.create_rubric_with_criteria(uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.set_active_rubric(uuid, uuid)
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Composite index for rubric list queries.
--
-- FastAPI GET /rubrics does:
--   SELECT ... FROM rubrics WHERE user_id = ? ORDER BY uploaded_at DESC
--
-- The existing idx_rubrics_user (user_id only) satisfies the WHERE but forces
-- a separate sort step. A (user_id, uploaded_at DESC) composite index covers
-- both the filter and the sort in one index scan.
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists idx_rubrics_user_uploaded
  on public.rubrics (user_id, uploaded_at desc);

-- The old single-column index is now redundant — the composite index covers
-- every query that used it.
drop index if exists public.idx_rubrics_user;
