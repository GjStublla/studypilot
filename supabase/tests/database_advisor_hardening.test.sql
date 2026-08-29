-- Production database advisor hardening checks (pgTAP).
begin;
select plan(9);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and roles @> array['public'::name]
  ),
  0,
  'public-schema RLS policies target authenticated users explicitly'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and (
        (qual like '%auth.uid()%' and qual not like '%SELECT auth.uid()%')
        or (
          with_check like '%auth.uid()%'
          and with_check not like '%SELECT auth.uid()%'
        )
      )
  ),
  0,
  'RLS ownership checks evaluate auth.uid once per statement'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dashboard_chat_turns'
      and policyname = 'Service role manages dashboard chat turns'
  ),
  'turn-claim service access is explicit'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'live_chat_rubric_lookups'
      and policyname = 'Service role manages live rubric lookup claims'
  ),
  'live lookup service access is explicit'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.ensure_chat_rubric_locked(uuid,uuid)',
    'execute'
  ),
  false,
  'the service-only chat lock RPC is not exposed to authenticated clients'
);

select is(
  has_function_privilege(
    'service_role',
    'public.ensure_chat_rubric_locked(uuid,uuid)',
    'execute'
  ),
  true,
  'the service role retains chat lock access'
);

select is(
  (
    with expected(index_name) as (
      values
        ('idx_action_items_rubric_id'),
        ('idx_action_items_session_id'),
        ('idx_dashboard_chat_messages_chat_owner'),
        ('idx_dashboard_chat_messages_session_owner'),
        ('idx_dashboard_chat_messages_user_id'),
        ('idx_dashboard_chat_turns_chat_owner'),
        ('idx_dashboard_chats_rubric_owner'),
        ('idx_dashboard_chats_session_owner'),
        ('idx_knowledge_documents_session_id'),
        ('idx_live_chat_rubric_lookups_live_owner'),
        ('idx_live_chat_sessions_chat_owner'),
        ('idx_live_chat_sessions_session_owner'),
        ('idx_rubrics_knowledge_document_id'),
        ('idx_sessions_chat_owner'),
        ('idx_sessions_rubric_owner')
    )
    select count(*)::integer
    from expected
    where to_regclass('public.' || index_name) is null
  ),
  0,
  'every foreign-key ownership path has a covering index'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.get_or_create_rubric_chat(uuid)'::regprocedure
  )
  and has_function_privilege(
    'authenticated',
    'public.get_or_create_rubric_chat(uuid)',
    'execute'
  ),
  'rubric chat creation keeps its reviewed authenticated definer boundary'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.link_dashboard_chat_session(uuid)'::regprocedure
  )
  and has_function_privilege(
    'authenticated',
    'public.link_dashboard_chat_session(uuid)',
    'execute'
  ),
  'chat/session linking keeps its reviewed authenticated definer boundary'
);

select * from finish();
rollback;
