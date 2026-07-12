-- Revoke PUBLIC/anon/authenticated execute from legacy helper functions if present.
do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'handle_new_user',
        'sync_rubric_sessions_count',
        'rls_auto_enable'
      )
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      r.schema_name,
      r.function_name,
      r.args
    );
  end loop;
end;
$$;
