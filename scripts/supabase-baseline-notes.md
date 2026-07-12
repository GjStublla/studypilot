# Supabase baseline + verification notes

## Completed (2026-07-10)
- Remote hardening migrations pushed and verified
- Baseline dump committed as `supabase/migrations/20240529000000_remote_baseline.sql`
- Remote migration history repaired so baseline is marked applied
- `supabase db reset` succeeds locally (analytics disabled on Windows)
- pgTAP: `supabase/tests/ai_usage_limits.test.sql` (12/12)
- Harness SQL (run manually): `supabase/harness/*.sql`
- Gated functions redeployed: socratic-coach v52, summarize-session v25, extract-rubric v24
- Exactly 7 functions, all `verify_jwt: true`; `ai-generate` absent
- `db push --dry-run` reports remote up to date

## Local start tip (Windows)
Analytics requires Docker TCP; config sets `[analytics] enabled = false`.
If start fails on analytics health, use that setting and/or `--ignore-health-check`.
