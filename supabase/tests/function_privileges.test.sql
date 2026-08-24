-- Function privilege and SECURITY DEFINER checks (pgTAP).
begin;
select plan(8);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
        )
      )
  ),
  0,
  'No SECURITY DEFINER function in public is executable by anon or PUBLIC'
);

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

select is(
  (select not p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_ai_usage'),
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

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and (p.proconfig is null or not array_to_string(p.proconfig, ',') like '%search_path=%')
  ),
  0,
  'All SECURITY DEFINER functions set an explicit search_path'
);

select * from finish();
rollback;
