-- AI usage hardening checks (pgTAP).
begin;
select plan(12);

select has_table('public', 'ai_usage', 'ai_usage exists');
select has_column('public', 'profiles', 'ai_daily_limit', 'profiles.ai_daily_limit exists');

select ok(
  exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'ai_usage'
      and c.conname = 'ai_usage_user_id_fkey'
      and c.confrelid = 'auth.users'::regclass
  ),
  'ai_usage.user_id references auth.users'
);

select is(
  (
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'consume_ai_request'
  ) like '%(now() at time zone ''utc'')::date%',
  true,
  'consume_ai_request uses UTC day'
);

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
  has_function_privilege('authenticated', 'public.consume_ai_request(uuid)', 'execute'),
  false,
  'authenticated cannot execute consume_ai_request'
);

select is(
  has_function_privilege('service_role', 'public.consume_ai_request(uuid)', 'execute'),
  true,
  'service_role can execute consume_ai_request'
);

select is(
  has_table_privilege('authenticated', 'public.ai_usage', 'select'),
  true,
  'authenticated can select ai_usage'
);

select is(
  has_table_privilege('authenticated', 'public.ai_usage', 'insert'),
  false,
  'authenticated cannot insert ai_usage'
);

select policies_are(
  'public',
  'ai_usage',
  array['Users read own ai usage'],
  'ai_usage has the expected select policy'
);

select is(
  (
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'ai_usage'
  ),
  true,
  'ai_usage has RLS enabled'
);

select * from finish();
rollback;
