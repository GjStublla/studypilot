-- Canonical cross-surface chat/session contract checks (pgTAP).
begin;
select plan(131);

select has_table('public', 'dashboard_chat_turns', 'turn claim table exists');
select has_column('public', 'dashboard_chat_turns', 'lease_token', 'turn claims carry a fenced lease token');
select has_column('public', 'dashboard_chat_turns', 'lease_expires_at', 'turn claim leases expire');
select has_column('public', 'dashboard_chat_turns', 'quota_consumed_at', 'turn claims remember quota consumption');
select has_column('public', 'dashboard_chat_turns', 'attempt_count', 'turn claims count lease attempts');
select has_column('public', 'dashboard_chats', 'origin_surface', 'chats record their origin');
select has_column('public', 'dashboard_chats', 'client_key', 'chats support a stable legacy key');
select has_column('public', 'dashboard_chat_messages', 'request_id', 'chat messages record request IDs');
select has_column('public', 'dashboard_chat_messages', 'server_sequence', 'chat messages have server order');
select has_column('public', 'session_messages', 'server_sequence', 'session messages have server order');
select has_column('public', 'sessions', 'updated_at', 'sessions expose update timestamps');
select ok(
  (select attnotnull
   from pg_attribute
   where attrelid = 'public.dashboard_chat_messages'::regclass
     and attname = 'chat_id'),
  'legacy attachment allows chat IDs to be required'
);

select ok(
  to_regclass('public.dashboard_chats_user_session_key') is null,
  'many sessions may share one chat (session unique index removed)'
);
select ok(
  to_regclass('public.dashboard_chat_messages_request_role_key') is not null,
  'request role rows are unique within a chat'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chat_messages'::regclass
      and conname = 'dashboard_chat_messages_canonical_fields_check'
      and convalidated
  ),
  'non-legacy messages must carry canonical request fields'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and conname = 'sessions_rubric_owner_fkey'
  ),
  'session to rubric ownership is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chats'::regclass
      and conname = 'dashboard_chats_session_owner_fkey'
  ),
  'chat to session ownership is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chat_messages'::regclass
      and conname = 'dashboard_chat_messages_chat_owner_fkey'
  ),
  'message to chat ownership is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chat_messages'::regclass
      and conname = 'dashboard_chat_messages_session_owner_fkey'
  ),
  'legacy message session ownership is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chat_turns'::regclass
      and conname = 'dashboard_chat_turns_chat_owner_fkey'
  ),
  'turn claims are linked to an owned chat'
);

select is(has_table_privilege('authenticated', 'public.dashboard_chats', 'insert'), true,
  'authenticated users can create chats');
select is(has_column_privilege('authenticated', 'public.dashboard_chats', 'title', 'update'), true,
  'authenticated users can rename owned chats');
select is(has_column_privilege('authenticated', 'public.dashboard_chats', 'user_id', 'update'), false,
  'authenticated users cannot reassign chat owners');
select is(has_column_privilege('authenticated', 'public.dashboard_chats', 'session_id', 'update'), false,
  'authenticated users cannot move chats between sessions');
select is(has_column_privilege('authenticated', 'public.dashboard_chats', 'client_key', 'update'), false,
  'authenticated users cannot change canonical client keys');
select is(has_column_privilege('authenticated', 'public.dashboard_chats', 'origin_surface', 'update'), false,
  'authenticated users cannot rewrite chat origins');
select is(has_column_privilege('authenticated', 'public.dashboard_chats', 'updated_at', 'update'), false,
  'authenticated users cannot forge chat activity timestamps');
select is(has_table_privilege('authenticated', 'public.dashboard_chat_messages', 'select'), true,
  'authenticated users can read chat messages');
select is(has_table_privilege('authenticated', 'public.dashboard_chat_messages', 'insert'), false,
  'authenticated users cannot bypass Edge message writes');
select is(has_table_privilege('authenticated', 'public.dashboard_chat_messages', 'delete'), false,
  'authenticated users cannot delete canonical messages');
select is(has_table_privilege('authenticated', 'public.dashboard_chat_turns', 'select'), false,
  'authenticated users cannot read turn claims');
select is(has_table_privilege('service_role', 'public.dashboard_chat_turns', 'insert'), true,
  'service role can claim turns');
select is(has_table_privilege('authenticated', 'public.session_messages', 'insert'), true,
  'authenticated users can save owned transcripts');

select is(
  has_function_privilege('authenticated', 'public.get_or_create_session_chat(uuid,text,text)', 'execute'),
  true,
  'authenticated users can get or create a linked chat'
);
select is(
  has_function_privilege('anon', 'public.get_or_create_session_chat(uuid,text,text)', 'execute'),
  false,
  'anonymous users cannot call the linked-chat RPC'
);
select is(
  (select not prosecdef from pg_proc where oid = 'public.touch_dashboard_chat()'::regprocedure),
  true,
  'chat touch trigger is SECURITY INVOKER'
);
select is(
  (select not prosecdef
   from pg_proc
   where oid = 'public.get_or_create_session_chat(uuid,text,text)'::regprocedure),
  true,
  'linked-chat RPC is SECURITY INVOKER'
);
select is(
  has_function_privilege('authenticated', 'public.touch_dashboard_chat()', 'execute'),
  false,
  'authenticated users cannot execute the trigger function directly'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.start_ai_chat_turn(uuid,uuid,uuid,text,text,text,boolean)',
    'execute'
  ),
  false,
  'authenticated users cannot invoke the service turn starter'
);
select is(
  has_function_privilege(
    'service_role',
    'public.start_ai_chat_turn(uuid,uuid,uuid,text,text,text,boolean)',
    'execute'
  ),
  true,
  'service role can atomically start AI turns'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.finish_ai_chat_turn(uuid,uuid,uuid,text,text,integer,text,boolean,text,jsonb)',
    'execute'
  ),
  false,
  'authenticated users cannot invoke the service turn finisher'
);
select is(
  has_function_privilege(
    'service_role',
    'public.finish_ai_chat_turn(uuid,uuid,uuid,text,text,integer,text,boolean,text,jsonb)',
    'execute'
  ),
  true,
  'service role can atomically finish AI turns'
);
select is(
  (select not prosecdef
   from pg_proc
   where oid = 'public.start_ai_chat_turn(uuid,uuid,uuid,text,text,text,boolean)'::regprocedure),
  true,
  'AI turn starter is SECURITY INVOKER'
);
select is(
  (select not prosecdef
   from pg_proc
   where oid = 'public.finish_ai_chat_turn(uuid,uuid,uuid,text,text,integer,text,boolean,text,jsonb)'::regprocedure),
  true,
  'AI turn finisher is SECURITY INVOKER'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.attach_legacy_dashboard_chat()',
    'execute'
  ),
  false,
  'authenticated users cannot execute the legacy attachment trigger directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.attach_legacy_dashboard_chat()',
    'execute'
  ),
  true,
  'service role can run the legacy attachment trigger during message writes'
);
select is(
  (select not prosecdef
   from pg_proc
   where oid = 'public.attach_legacy_dashboard_chat()'::regprocedure),
  true,
  'legacy attachment trigger is SECURITY INVOKER'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.link_dashboard_chat_session(uuid)',
    'execute'
  ),
  true,
  'authenticated users can invoke the narrow chat-session linker'
);
select is(
  has_function_privilege('anon', 'public.link_dashboard_chat_session(uuid)', 'execute'),
  false,
  'anonymous callers cannot link chat sessions'
);
select is(
  has_function_privilege('service_role', 'public.link_dashboard_chat_session(uuid)', 'execute'),
  false,
  'the chat-session linker is not a service-role API'
);
select is(
  (select prosecdef
   from pg_proc
   where oid = 'public.link_dashboard_chat_session(uuid)'::regprocedure),
  true,
  'the narrowly validated linker owns its relationship update privilege'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.dashboard_chats'::regclass),
  'dashboard chats have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.dashboard_chat_messages'::regclass),
  'dashboard messages have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.dashboard_chat_turns'::regclass),
  'turn claims have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sessions'::regclass),
  'sessions have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.session_messages'::regclass),
  'session messages have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'storage objects have RLS enabled'
);

select policies_are(
  'public',
  'dashboard_chats',
  array[
    'Students can create their own dashboard chats',
    'Students can delete their own dashboard chats',
    'Students can update their own dashboard chats',
    'Students can view their own dashboard chats'
  ],
  'dashboard chats expose only owner policies'
);
select policies_are(
  'public',
  'dashboard_chat_messages',
  array['Students can view dashboard follow-up chat histories'],
  'chat messages expose only owner reads'
);
select policies_are(
  'public',
  'dashboard_chat_turns',
  array['Service role manages dashboard chat turns'],
  'turn claims expose only the explicit service-role policy'
);

select ok(exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dashboard_chats'
), 'dashboard chats are published to Realtime');
select ok(exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dashboard_chat_messages'
), 'dashboard messages are published to Realtime');
select ok(exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'
), 'sessions are published to Realtime');
select ok(exists (
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_messages'
), 'session messages are published to Realtime');
select ok(
  (select count(*) = 3 from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename in ('knowledge_documents', 'action_items', 'rubrics')),
  'existing dashboard invalidation tables are published to Realtime'
);

select ok(exists (
  select 1 from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Students can update own session captures'
    and cmd = 'UPDATE'
), 'owners may overwrite a stable session capture');
select is(
  has_sequence_privilege('authenticated', 'public.dashboard_chat_messages_server_sequence_seq', 'usage'),
  false,
  'authenticated users cannot allocate canonical chat sequence values directly'
);
select is(
  has_sequence_privilege('authenticated', 'public.session_messages_server_sequence_seq', 'usage'),
  true,
  'authenticated transcript inserts can allocate session sequence values'
);

-- Two users exercise RLS, owner-matching relationships, convergence, stable
-- transcript IDs, turn claims, and deterministic server ordering.
insert into auth.users (
  id, email, aud, role, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-4111-8111-111111111111', 'sync-a@example.test', 'authenticated', 'authenticated', '{"name":"Sync A"}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'sync-b@example.test', 'authenticated', 'authenticated', '{"name":"Sync B"}', now(), now());

insert into public.sessions (id, user_id, title, mode)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'A session', 'Study Coach'),
  ('abababab-abab-4bab-8bab-abababababab', '11111111-1111-4111-8111-111111111111', 'A imported session', 'Study Coach'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'B session', 'Study Coach');

insert into public.dashboard_chats (
  id, user_id, session_id, title, origin_surface
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'B shared chat',
  'dashboard'
);

insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values
  (
    'eeeeeeee-1111-4eee-8eee-eeeeeeeeeeee',
    'session-captures',
    '11111111-1111-4111-8111-111111111111/session-a.jpg',
    '11111111-1111-4111-8111-111111111111',
    '{}'::jsonb
  ),
  (
    'eeeeeeee-2222-4eee-8eee-eeeeeeeeeeee',
    'session-captures',
    '22222222-2222-4222-8222-222222222222/session-b.jpg',
    '22222222-2222-4222-8222-222222222222',
    '{}'::jsonb
  );

create function pg_temp.rejects_cross_owner_chat()
returns boolean
language plpgsql
as $$
begin
  insert into public.dashboard_chats (user_id, session_id, title, origin_surface)
  values (
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'invalid',
    'dashboard'
  );
  return false;
exception when foreign_key_violation then
  return true;
end;
$$;

create function pg_temp.rejects_cross_owner_rpc()
returns boolean
language plpgsql
as $$
begin
  perform public.get_or_create_session_chat(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Not mine',
    'dashboard'
  );
  return false;
exception when no_data_found then
  return true;
end;
$$;

create function pg_temp.rejects_protected_chat_update(p_chat_id uuid)
returns boolean
language plpgsql
as $$
begin
  update public.dashboard_chats
  set session_id = null
  where id = p_chat_id;
  return false;
exception when insufficient_privilege then
  return true;
end;
$$;

create function pg_temp.rejects_client_message_insert(p_chat_id uuid)
returns boolean
language plpgsql
as $$
begin
  insert into public.dashboard_chat_messages (
    user_id, chat_id, session_id, role, text, origin_surface, request_id
  )
  values (
    '11111111-1111-4111-8111-111111111111',
    p_chat_id,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'user',
    'Bypass attempt',
    'dashboard',
    'ffffffff-1111-4fff-8fff-ffffffffffff'
  );
  return false;
exception when insufficient_privilege then
  return true;
end;
$$;

create function pg_temp.rejects_turn_read()
returns boolean
language plpgsql
as $$
begin
  perform 1 from public.dashboard_chat_turns limit 1;
  return false;
exception when insufficient_privilege then
  return true;
end;
$$;

create function pg_temp.rejects_cross_owner_link()
returns boolean
language plpgsql
as $$
begin
  perform public.link_dashboard_chat_session(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );
  return false;
exception when no_data_found then
  return true;
end;
$$;

create function pg_temp.rejects_noncanonical_message(p_chat_id uuid)
returns boolean
language plpgsql
as $$
begin
  insert into public.dashboard_chat_messages (
    user_id, chat_id, session_id, role, text, origin_surface, request_id
  )
  values (
    '11111111-1111-4111-8111-111111111111',
    p_chat_id,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'user',
    'Missing request ID',
    'extension',
    null
  );
  return false;
exception when check_violation then
  return true;
end;
$$;

create function pg_temp.update_capture(p_object_id uuid)
returns integer
language plpgsql
as $$
declare
  v_changed integer;
begin
  update storage.objects
  set metadata = '{"updated_by":"caller"}'::jsonb
  where id = p_object_id;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;

select is((select count(*)::integer from public.sessions), 2,
  'RLS exposes only caller sessions');
select ok(pg_temp.rejects_cross_owner_chat(),
  'an owner cannot link a chat to another user session');

insert into public.dashboard_chats (
  id, user_id, session_id, title, origin_surface
)
values (
  'abababab-abab-4bab-8bab-abababababab',
  '11111111-1111-4111-8111-111111111111',
  null,
  'Extension-created chat',
  'extension'
);

select is(
  public.link_dashboard_chat_session(
    'abababab-abab-4bab-8bab-abababababab'
  )->>'session_id',
  'abababab-abab-4bab-8bab-abababababab',
  'an owner can link the extension chat to its same-ID imported session'
);
select is(
  public.link_dashboard_chat_session(
    'abababab-abab-4bab-8bab-abababababab'
  )->>'session_id',
  'abababab-abab-4bab-8bab-abababababab',
  'linking an already-linked same-ID chat is idempotent'
);
select ok(pg_temp.rejects_cross_owner_link(),
  'the definer linker cannot access another owner chat');

create temporary table first_linked_chat as
select public.get_or_create_session_chat(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'A shared chat',
  'extension'
) as value;

select ok((select value ? 'id' from first_linked_chat),
  'linked-chat RPC returns a canonical chat');
select is(
  public.get_or_create_session_chat(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'A renamed attempt',
    'dashboard'
  )->>'id',
  (select value->>'id' from first_linked_chat),
  'dashboard and extension converge on the same session chat'
);
select ok(pg_temp.rejects_cross_owner_rpc(),
  'the SECURITY INVOKER RPC cannot open another owner session');
select is((select count(*)::integer from public.dashboard_chats), 2,
  'chat RLS exposes only caller chats');

reset role;
update public.dashboard_chats
set updated_at = '2020-01-01T00:00:00Z'
where id = (select (value->>'id')::uuid from first_linked_chat);
set local role authenticated;

update public.dashboard_chats
set title = 'Renamed by owner'
where id = (select (value->>'id')::uuid from first_linked_chat);

select is(
  (select title from public.dashboard_chats
   where id = (select (value->>'id')::uuid from first_linked_chat)),
  'Renamed by owner',
  'an owner can rename a chat'
);
select ok(
  (select updated_at > '2020-01-01T00:00:00Z'::timestamptz
   from public.dashboard_chats
   where id = (select (value->>'id')::uuid from first_linked_chat)),
  'renaming a chat still applies timestamp touch semantics'
);
select ok(
  pg_temp.rejects_protected_chat_update(
    (select (value->>'id')::uuid from first_linked_chat)
  ),
  'an owner cannot move a chat to a different session'
);
select ok(
  pg_temp.rejects_client_message_insert(
    (select (value->>'id')::uuid from first_linked_chat)
  ),
  'authenticated clients cannot bypass canonical Edge message writes'
);
select ok(pg_temp.rejects_turn_read(),
  'authenticated clients cannot inspect service-only turn claims');

insert into public.session_messages (
  id, session_id, role, message_text, time_offset_seconds
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'user',
  'Stable transcript turn',
  0
)
on conflict (id) do nothing;

insert into public.session_messages (
  id, session_id, role, message_text, time_offset_seconds
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'user',
  'Stable transcript turn',
  0
)
on conflict (id) do nothing;

select is(
  (select count(*)::integer from public.session_messages
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  1,
  're-importing a stable transcript ID creates one row'
);

reset role;

select ok(
  pg_temp.rejects_noncanonical_message(
    (select (value->>'id')::uuid from first_linked_chat)
  ),
  'non-legacy messages without request IDs are rejected'
);

set local role service_role;
insert into public.dashboard_chat_messages (
  id, user_id, chat_id, session_id, role, text, origin_surface, request_id
)
values (
  'eeeeeeee-3333-4eee-8eee-eeeeeeeeeeee',
  '11111111-1111-4111-8111-111111111111',
  null,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'user',
  'Rolling deployment legacy row',
  'legacy',
  null
);
reset role;

select ok(
  (select chat_id is not null
   from public.dashboard_chat_messages
   where id = 'eeeeeeee-3333-4eee-8eee-eeeeeeeeeeee'),
  'the insert trigger attaches rollout-window legacy rows'
);
select is(
  (select chat_id::text
   from public.dashboard_chat_messages
   where id = 'eeeeeeee-3333-4eee-8eee-eeeeeeeeeeee'),
  (select value->>'id' from first_linked_chat),
  'session-linked legacy rows converge on the existing canonical chat'
);

set local role service_role;
insert into public.dashboard_chat_messages (
  id, user_id, chat_id, session_id, role, text, origin_surface, request_id
)
values (
  'eeeeeeee-4444-4eee-8eee-eeeeeeeeeeee',
  '11111111-1111-4111-8111-111111111111',
  null,
  null,
  'user',
  'Unlinked rolling deployment row',
  'legacy',
  null
);
reset role;

select is(
  (select chat.client_key
   from public.dashboard_chats as chat
   join public.dashboard_chat_messages as message on message.chat_id = chat.id
   where message.id = 'eeeeeeee-4444-4eee-8eee-eeeeeeeeeeee'),
  'legacy-general',
  'unlinked legacy rows converge on the deterministic general chat'
);

insert into public.dashboard_chat_turns (
  user_id, id, chat_id, request_hash, origin_surface
)
select
  '11111111-1111-4111-8111-111111111111',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  (select (value->>'id')::uuid from first_linked_chat),
  'same-request-hash',
  'extension'
from generate_series(1, 20)
on conflict (user_id, id) do nothing;

select is(
  (select count(*)::integer from public.dashboard_chat_turns
   where user_id = '11111111-1111-4111-8111-111111111111'
     and id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  1,
  'twenty duplicate claims have one winner'
);

insert into public.dashboard_chat_messages (
  user_id, chat_id, session_id, role, text, origin_surface, request_id, created_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    (select (value->>'id')::uuid from first_linked_chat),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'user', 'first', 'extension',
    'ffffffff-2222-4fff-8fff-ffffffffffff',
    '2026-08-04T00:00:00Z'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    (select (value->>'id')::uuid from first_linked_chat),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'ai', 'second', 'extension',
    'ffffffff-2222-4fff-8fff-ffffffffffff',
    '2026-08-04T00:00:00Z'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'user', 'B private message', 'dashboard',
    'ffffffff-3333-4fff-8fff-ffffffffffff',
    '2026-08-04T00:00:01Z'
  );

select ok(
  (select max(server_sequence) > min(server_sequence)
   from public.dashboard_chat_messages
   where chat_id = (select (value->>'id')::uuid from first_linked_chat)),
  'equal timestamps still receive deterministic server order'
);

select is(
  (select origin_surface from public.dashboard_chats
   where id = (select (value->>'id')::uuid from first_linked_chat)),
  'extension',
  'the creating surface remains visible across later continuation'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.dashboard_chat_messages),
  4,
  'message RLS exposes every caller message and hides another owner messages'
);
select is(
  (select count(*)::integer
   from public.dashboard_chat_messages
   where user_id = '22222222-2222-4222-8222-222222222222'),
  0,
  'message RLS cannot be bypassed with another owner filter'
);
select is(
  (select count(*)::integer from public.dashboard_chats),
  3,
  'chat RLS hides the other owner chat after all convergence paths run'
);
select is(
  pg_temp.update_capture('eeeeeeee-1111-4eee-8eee-eeeeeeeeeeee'),
  1,
  'storage policy allows an owner to replace a stable capture'
);
select is(
  pg_temp.update_capture('eeeeeeee-2222-4eee-8eee-eeeeeeeeeeee'),
  0,
  'storage policy blocks updates to another owner capture'
);

reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.dashboard_chat_messages),
  1,
  'the second owner sees only their canonical message'
);
select is(
  (select count(*)::integer from public.dashboard_chats),
  1,
  'the second owner sees only their chat'
);

-- Exercise the service-only leased lifecycle after all client-facing RLS
-- counts above. Each request uses deterministic UUIDs so replay and fencing
-- assertions are explicit and independent.
reset role;
grant select on first_linked_chat to service_role;
update public.profiles
set ai_daily_limit = 2
where id = '11111111-1111-4111-8111-111111111111';
delete from public.ai_usage
where user_id = '11111111-1111-4111-8111-111111111111';
set local role service_role;

create temporary table turn_start_one as
select public.start_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000001',
  (select (value->>'id')::uuid from first_linked_chat),
  'turn-one-hash',
  'dashboard',
  'Atomic first question',
  false
) as value;

select is((select value->>'action' from turn_start_one), 'start',
  'a fresh request acquires a turn lease');
select is(
  (select request_count from public.ai_usage
   where user_id = '11111111-1111-4111-8111-111111111111'
     and usage_date = (now() at time zone 'utc')::date),
  1,
  'starting a fresh turn consumes one quota unit'
);
select is(
  (select count(*)::integer from public.dashboard_chat_messages
   where request_id = '10000000-0000-4000-8000-000000000001'
     and role = 'user'
     and text = 'Atomic first question'),
  1,
  'the quota transaction persists exactly one deterministic user row'
);

create temporary table turn_start_duplicate as
select public.start_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000001',
  (select (value->>'id')::uuid from first_linked_chat),
  'turn-one-hash',
  'dashboard',
  'Atomic first question',
  false
) as value;

select is((select value->>'action' from turn_start_duplicate), 'in_progress',
  'a concurrent duplicate sees the active lease');
select is(
  (select request_count from public.ai_usage
   where user_id = '11111111-1111-4111-8111-111111111111'
     and usage_date = (now() at time zone 'utc')::date),
  1,
  'a concurrent duplicate does not consume quota again'
);
select is(
  public.start_ai_chat_turn(
    '11111111-1111-4111-8111-111111111111',
    '10000000-0000-4000-8000-000000000001',
    (select (value->>'id')::uuid from first_linked_chat),
    'different-hash',
    'dashboard',
    'Atomic first question',
    false
  )->>'action',
  'conflict',
  'reusing a request ID for different content is rejected'
);

create temporary table turn_finish_one as
select public.finish_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000001',
  (select (value->>'leaseToken')::uuid from turn_start_one),
  'completed',
  'Atomic first answer',
  null,
  null
) as value;

select is((select value->>'action' from turn_finish_one), 'completed',
  'the active lease atomically completes the turn');
select is(
  (select status from public.dashboard_chat_turns
   where user_id = '11111111-1111-4111-8111-111111111111'
     and id = '10000000-0000-4000-8000-000000000001'),
  'completed',
  'atomic completion marks the claim completed'
);
select is(
  (select count(*)::integer from public.dashboard_chat_messages
   where request_id = '10000000-0000-4000-8000-000000000001'
     and role = 'ai'
     and text = 'Atomic first answer'),
  1,
  'atomic completion inserts exactly one assistant row'
);

create temporary table turn_replay_one as
select public.start_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000001',
  (select (value->>'id')::uuid from first_linked_chat),
  'turn-one-hash',
  'dashboard',
  'Atomic first question',
  false
) as value;

select is((select value->>'action' from turn_replay_one), 'replay',
  'a completed duplicate replays canonical rows');
select is((select value->>'assistantText' from turn_replay_one), 'Atomic first answer',
  'replay returns the durable assistant text');

create temporary table turn_start_two as
select public.start_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000002',
  (select (value->>'id')::uuid from first_linked_chat),
  'turn-two-hash',
  'extension',
  'Atomic failed question',
  false
) as value;

select is((select value->>'action' from turn_start_two), 'start',
  'a second request acquires its own lease');
select is(
  (select request_count from public.ai_usage
   where user_id = '11111111-1111-4111-8111-111111111111'
     and usage_date = (now() at time zone 'utc')::date),
  2,
  'the second unique request consumes the second quota unit'
);

create temporary table turn_fail_two as
select public.finish_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000002',
  (select (value->>'leaseToken')::uuid from turn_start_two),
  'failed',
  null,
  503,
  'Upstream unavailable'
) as value;

select is((select value->>'action' from turn_fail_two), 'error',
  'a fenced failure settles the request as an error');
select is(
  (select status from public.dashboard_chat_turns
   where user_id = '11111111-1111-4111-8111-111111111111'
     and id = '10000000-0000-4000-8000-000000000002'),
  'failed',
  'failed completion records the durable failed state'
);
select is(
  (select count(*)::integer from public.dashboard_chat_messages
   where request_id = '10000000-0000-4000-8000-000000000002'
     and role = 'ai'),
  0,
  'a failed turn retains its user row without inventing an assistant row'
);

create temporary table turn_denied_three as
select public.start_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000003',
  (select (value->>'id')::uuid from first_linked_chat),
  'turn-three-hash',
  'dashboard',
  'Quota denied question',
  false
) as value;

select is((select value->>'action' from turn_denied_three), 'error',
  'an exhausted request is rejected inside the start transaction');
select is((select value->>'errorStatus' from turn_denied_three), '429',
  'quota exhaustion reports HTTP 429 semantics');
select is(
  (select count(*)::integer from public.dashboard_chat_messages
   where request_id = '10000000-0000-4000-8000-000000000003'),
  0,
  'a quota-denied prompt is never persisted'
);
select is(
  (select request_count from public.ai_usage
   where user_id = '11111111-1111-4111-8111-111111111111'
     and usage_date = (now() at time zone 'utc')::date),
  2,
  'quota denial cannot advance usage past the limit'
);

reset role;
update public.profiles
set ai_daily_limit = 10
where id = '11111111-1111-4111-8111-111111111111';
set local role service_role;

create temporary table turn_stale_first as
select public.start_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000004',
  (select (value->>'id')::uuid from first_linked_chat),
  'turn-stale-hash',
  'extension',
  'Recover this request',
  false
) as value;

select is((select value->>'action' from turn_stale_first), 'start',
  'a recoverable request starts normally');
select is(
  (select request_count from public.ai_usage
   where user_id = '11111111-1111-4111-8111-111111111111'
     and usage_date = (now() at time zone 'utc')::date),
  3,
  'the recoverable request consumes quota once'
);

update public.dashboard_chat_turns
set lease_expires_at = clock_timestamp() - interval '1 second'
where user_id = '11111111-1111-4111-8111-111111111111'
  and id = '10000000-0000-4000-8000-000000000004';

create temporary table turn_stale_second as
select public.start_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000004',
  (select (value->>'id')::uuid from first_linked_chat),
  'turn-stale-hash',
  'extension',
  'Recover this request',
  false
) as value;

select is((select value->>'action' from turn_stale_second), 'start',
  'an expired pending lease can be taken over');
select isnt(
  (select value->>'leaseToken' from turn_stale_second),
  (select value->>'leaseToken' from turn_stale_first),
  'stale takeover fences the previous worker with a new token'
);
select is(
  (select attempt_count from public.dashboard_chat_turns
   where user_id = '11111111-1111-4111-8111-111111111111'
     and id = '10000000-0000-4000-8000-000000000004'),
  2,
  'stale takeover records a second execution attempt'
);
select is(
  (select request_count from public.ai_usage
   where user_id = '11111111-1111-4111-8111-111111111111'
     and usage_date = (now() at time zone 'utc')::date),
  3,
  'stale takeover reuses the original quota reservation'
);

create temporary table turn_stale_fenced as
select public.finish_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000004',
  (select (value->>'leaseToken')::uuid from turn_stale_first),
  'completed',
  'Old worker answer',
  null,
  null
) as value;

select is((select value->>'action' from turn_stale_fenced), 'fenced',
  'the expired worker cannot commit after takeover');
select is(
  (select count(*)::integer from public.dashboard_chat_messages
   where request_id = '10000000-0000-4000-8000-000000000004'
     and role = 'ai'),
  0,
  'a fenced worker leaves no assistant row behind'
);

create temporary table turn_stale_finish as
select public.finish_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000004',
  (select (value->>'leaseToken')::uuid from turn_stale_second),
  'completed',
  'Recovered answer',
  null,
  null
) as value;

select is((select value->>'action' from turn_stale_finish), 'completed',
  'the replacement lease can atomically complete');
select is(
  (select text from public.dashboard_chat_messages
   where request_id = '10000000-0000-4000-8000-000000000004'
     and role = 'ai'),
  'Recovered answer',
  'stale recovery persists only the replacement answer'
);

create temporary table turn_local_bypass as
select public.start_ai_chat_turn(
  '11111111-1111-4111-8111-111111111111',
  '10000000-0000-4000-8000-000000000005',
  (select (value->>'id')::uuid from first_linked_chat),
  'turn-local-hash',
  'extension',
  'Local bypass request',
  true
) as value;

select is((select value->>'action' from turn_local_bypass), 'start',
  'the trusted service path can explicitly start a local bypass turn');
select is(
  (select request_count from public.ai_usage
   where user_id = '11111111-1111-4111-8111-111111111111'
     and usage_date = (now() at time zone 'utc')::date),
  3,
  'the local bypass does not mutate production quota counters'
);
select is(
  (select count(*)::integer from public.dashboard_chat_messages
   where request_id = '10000000-0000-4000-8000-000000000005'
     and role = 'user'),
  1,
  'the local bypass still uses the canonical durable user row'
);
select is(
  public.finish_ai_chat_turn(
    '11111111-1111-4111-8111-111111111111',
    '10000000-0000-4000-8000-000000000005',
    (select (value->>'leaseToken')::uuid from turn_local_bypass),
    'failed',
    null,
    503,
    'Expected local test failure'
  )->>'action',
  'error',
  'a local bypass turn still settles through the fenced lifecycle'
);

select * from finish();
rollback;
