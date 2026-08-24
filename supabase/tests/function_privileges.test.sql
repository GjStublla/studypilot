-- ============================================================================
-- Function Privileges and Security Definer Checks (pgTAP)
--
-- Proves that:
-- 1. No SECURITY DEFINER function in public is granted to PUBLIC or anon.
-- 2. Sensitive internal RPCs (e.g. consume_ai_request) are restricted to service_role.
-- 3. User-callable RPCs (e.g. get_ai_usage) run as SECURITY INVOKER or have explicit checks.
-- ============================================================================

begin;
select plan(8);

-- ─── 1. SECURITY DEFINER Exposure Check ───────────────────────────────────────
-- Ensure that no SECURITY DEFINER function in public is executable by anon or PUBLIC

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('public', p.oid, 'execute')
      )
  ),
  0,
  'No SECURITY DEFINER function in public is executable by anon or public'
);

-- ─── 2. Critical RPC Privileges ───────────────────────────────────────────────

-- consume_ai_request must only be callable by service_role
select is(
  has_function_privilege('service_role', 'public.consume_ai_request(uuid)', 'execute'),
  true,
  'service_role can execute consume_ai_request'
);

select is(
  has_function_privilege('authenticated', 'public.consume_ai_request(uuid)', 'execute'),
  false,
  'authenticated cannot execute consume_ai_request'
);

select is(
  has_function_privilege('anon', 'public.consume_ai_request(uuid)', 'execute'),
  false,
  'anon cannot execute consume_ai_request'
);

-- get_ai_usage is a SECURITY INVOKER helper for authenticated users
select is(
  (
    select not p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_ai_usage'
  ),
  true,
  'get_ai_usage is SECURITY INVOKER'
);

select is(
  has_function_privilege('authenticated', 'public.get_ai_usage()', 'execute'),
  true,
  'authenticated can execute get_ai_usage'
);

select is(
  has_function_privilege('anon', 'public.get_ai_usage()', 'execute'),
  false,
  'anon cannot execute get_ai_usage'
);

-- ─── 3. Search Path Safety on SECURITY DEFINER Functions ──────────────────────

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and (
        p.proconfig is null
        or not array_to_string(p.proconfig, ',') like '%search_path=%'
      )
  ),
  0,
  'All SECURITY DEFINER functions set an explicit immutable search_path'
);

select * from finish();
rollback;
