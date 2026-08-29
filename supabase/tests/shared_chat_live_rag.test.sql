-- Shared chat / live context / rubric RAG contract checks (pgTAP).
begin;
select plan(100);

-- ---------------------------------------------------------------------------
-- Schema shape
-- ---------------------------------------------------------------------------
select has_column('public', 'dashboard_chats', 'rubric_id', 'chats can pin a rubric');
select has_column('public', 'dashboard_chats', 'rubric_context_locked', 'chats record rubric lock state');
select has_column('public', 'dashboard_chats', 'context_summary', 'chats store rolling context summaries');
select has_column('public', 'dashboard_chats', 'summary_through_sequence', 'summary watermark is tracked');
select has_column('public', 'profiles', 'vertex_rag_corpus_name', 'profiles store Vertex RAG corpus');
select has_column('public', 'knowledge_documents', 'vertex_rag_file_name', 'documents store Vertex RAG file name');
select has_column('public', 'sessions', 'chat_id', 'sessions point at a canonical chat');
select has_table('public', 'live_chat_sessions', 'live chat sessions table exists');
select has_table('public', 'live_chat_rubric_lookups', 'live rubric lookup claims exist');

select ok(
  to_regclass('public.dashboard_chats_user_session_key') is null,
  'many sessions may share one chat (session unique index removed)'
);
select ok(
  to_regclass('public.rubrics_one_active_per_user') is not null,
  'at most one active rubric is enforced per user'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chats'::regclass
      and conname = 'dashboard_chats_rubric_owner_fkey'
  ),
  'chat to rubric ownership is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and conname = 'sessions_chat_owner_fkey'
  ),
  'session to chat ownership is constrained'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.live_chat_sessions'::regclass
      and conname = 'live_chat_sessions_chat_owner_fkey'
  ),
  'live sessions are linked to an owned chat'
);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'rubrics'
      and public = false
      and file_size_limit = 20971520
  ),
  'private rubrics storage bucket is provisioned at 20MB'
);

-- ---------------------------------------------------------------------------
-- Grants / RLS
-- ---------------------------------------------------------------------------
select is(has_table_privilege('authenticated', 'public.live_chat_sessions', 'select'), true,
  'authenticated users can read own live sessions');
select is(has_table_privilege('authenticated', 'public.live_chat_sessions', 'insert'), false,
  'authenticated users cannot insert live sessions');
select is(has_table_privilege('authenticated', 'public.live_chat_sessions', 'update'), false,
  'authenticated users cannot update live sessions');
select is(has_table_privilege('authenticated', 'public.live_chat_sessions', 'delete'), false,
  'authenticated users cannot delete live sessions');
select is(has_table_privilege('service_role', 'public.live_chat_sessions', 'insert'), true,
  'service role can write live sessions');
select is(has_table_privilege('authenticated', 'public.live_chat_rubric_lookups', 'select'), false,
  'authenticated users cannot read lookup claims');
select is(has_column_privilege('authenticated', 'public.dashboard_chats', 'rubric_id', 'update'), false,
  'authenticated users cannot rewrite chat rubric pins directly');
select is(has_column_privilege('authenticated', 'public.dashboard_chats', 'rubric_context_locked', 'update'), false,
  'authenticated users cannot unlock chat rubrics directly');
select is(has_column_privilege('authenticated', 'public.profiles', 'vertex_rag_corpus_name', 'update'), false,
  'authenticated users cannot rewrite profiles.vertex_rag_corpus_name');
select is(has_column_privilege('authenticated', 'public.profiles', 'vertex_rag_corpus_display_name', 'update'), false,
  'authenticated users cannot rewrite profiles.vertex_rag_corpus_display_name');
select is(has_column_privilege('authenticated', 'public.profiles', 'vertex_rag_corpus_name', 'select'), true,
  'authenticated users can still read own Vertex RAG corpus identifiers');
select is(has_column_privilege('authenticated', 'public.profiles', 'theme', 'update'), true,
  'authenticated users can still update profile preferences');
select is(has_column_privilege('service_role', 'public.profiles', 'vertex_rag_corpus_name', 'update'), true,
  'service role can write profiles Vertex RAG identifiers');
select is(has_column_privilege('authenticated', 'public.knowledge_documents', 'vertex_rag_file_name', 'update'), false,
  'authenticated users cannot rewrite knowledge_documents.vertex_rag_file_name');
select is(has_column_privilege('authenticated', 'public.knowledge_documents', 'vertex_rag_corpus_name', 'update'), false,
  'authenticated users cannot rewrite knowledge_documents.vertex_rag_corpus_name');
select is(has_column_privilege('authenticated', 'public.knowledge_documents', 'storage_path', 'update'), false,
  'authenticated users cannot rewrite knowledge_documents.storage_path');
select is(has_column_privilege('authenticated', 'public.knowledge_documents', 'storage_bucket', 'update'), false,
  'authenticated users cannot rewrite knowledge_documents.storage_bucket');
select is(has_column_privilege('authenticated', 'public.knowledge_documents', 'storage_path', 'select'), true,
  'authenticated users can still read own knowledge document storage paths');
select is(has_column_privilege('service_role', 'public.knowledge_documents', 'storage_path', 'update'), true,
  'service role can write knowledge document storage identifiers');
select is(
  has_function_privilege('authenticated', 'public.rubrics_storage_path_is_owned(text)', 'execute'),
  true,
  'authenticated users can evaluate owned rubrics storage paths'
);
select is(
  has_function_privilege('anon', 'public.rubrics_storage_path_is_owned(text)', 'execute'),
  false,
  'anonymous users cannot evaluate owned rubrics storage paths'
);

select is(
  has_function_privilege('authenticated', 'public.get_or_create_rubric_chat(uuid)', 'execute'),
  true,
  'authenticated users can open durable rubric chats'
);
select is(
  has_function_privilege('anon', 'public.get_or_create_rubric_chat(uuid)', 'execute'),
  false,
  'anonymous users cannot open rubric chats'
);
select is(
  has_function_privilege('authenticated', 'public.set_active_rubric(uuid)', 'execute'),
  true,
  'authenticated users can atomically activate a rubric'
);
select is(
  has_function_privilege('authenticated', 'public.ensure_chat_rubric_locked(uuid, uuid)', 'execute'),
  false,
  'authenticated users cannot call the service-only chat rubric lock'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.start_live_chat_session(uuid,uuid,uuid,boolean,text,text,text,uuid)',
    'execute'
  ),
  false,
  'authenticated users cannot start live sessions'
);
select is(
  has_function_privilege(
    'service_role',
    'public.start_live_chat_session(uuid,uuid,uuid,boolean,text,text,text,uuid)',
    'execute'
  ),
  true,
  'service role can start live sessions'
);
select is(
  has_function_privilege(
    'service_role',
    'public.commit_live_turn(uuid,uuid,uuid,uuid,uuid,text,text,integer,text,boolean,text,jsonb)',
    'execute'
  ),
  true,
  'service role can commit live turns'
);
select is(
  has_function_privilege(
    'service_role',
    'public.claim_live_rubric_lookup(uuid,uuid)',
    'execute'
  ),
  true,
  'service role can claim live rubric lookups'
);
select is(
  has_function_privilege(
    'service_role',
    'public.finish_live_chat_session(uuid,uuid,text,integer,text)',
    'execute'
  ),
  true,
  'service role can finish live sessions'
);
select is(
  has_function_privilege(
    'service_role',
    'public.finish_ai_chat_turn(uuid,uuid,uuid,text,text,integer,text,boolean,text,jsonb)',
    'execute'
  ),
  true,
  'service role can finish AI turns with grounding args'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.finish_ai_chat_turn(uuid,uuid,uuid,text,text,integer,text,boolean,text,jsonb)',
    'execute'
  ),
  false,
  'authenticated users cannot finish AI turns'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.live_chat_sessions'::regclass),
  'live chat sessions have RLS enabled'
);
select policies_are(
  'public',
  'live_chat_sessions',
  array['Students can view their own live chat sessions'],
  'live sessions expose only owner select'
);
select policies_are(
  'public',
  'live_chat_rubric_lookups',
  array['Service role manages live rubric lookup claims'],
  'lookup claims expose only the explicit service-role policy'
);

select ok(exists (
  select 1 from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Students can upload own rubrics'
    and cmd = 'INSERT'
), 'owners may upload into the rubrics bucket');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Students can read own rubrics'
    and cmd = 'SELECT'
), 'owners may read their rubric objects');
select ok(
  (
    select count(*) = 4
      and bool_and(
        position(
          'rubrics_storage_path_is_owned'
          in coalesce(qual, '') || coalesce(with_check, '')
        ) > 0
      )
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Students can upload own rubrics',
        'Students can read own rubrics',
        'Students can update own rubrics',
        'Students can delete own rubrics'
      )
  ),
  'rubrics storage policies require owned {userId}/{rubricId}/ paths'
);

-- ---------------------------------------------------------------------------
-- Behavioral fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, email, aud, role, raw_user_meta_data, created_at, updated_at
)
values
  ('31111111-1111-4111-8111-111111111111', 'rag-a@example.test', 'authenticated', 'authenticated', '{"name":"Rag A"}', now(), now()),
  ('32222222-2222-4222-8222-222222222222', 'rag-b@example.test', 'authenticated', 'authenticated', '{"name":"Rag B"}', now(), now());

insert into public.rubrics (id, user_id, title, course, active)
values
  ('41111111-1111-4111-8111-111111111111', '31111111-1111-4111-8111-111111111111', 'Rubric A1', 'CS101', false),
  ('41222222-2222-4222-8222-222222222222', '31111111-1111-4111-8111-111111111111', 'Rubric A2', 'CS102', false),
  ('42222222-2222-4222-8222-222222222222', '32222222-2222-4222-8222-222222222222', 'Rubric B1', 'HIST', true);

insert into public.sessions (id, user_id, title, mode, rubric_id)
values
  ('51111111-1111-4111-8111-111111111111', '31111111-1111-4111-8111-111111111111', 'Session A1', 'Study Coach', '41111111-1111-4111-8111-111111111111'),
  ('51222222-2222-4222-8222-222222222222', '31111111-1111-4111-8111-111111111111', 'Session A2', 'Study Coach', '41111111-1111-4111-8111-111111111111'),
  ('52222222-2222-4222-8222-222222222222', '32222222-2222-4222-8222-222222222222', 'Session B1', 'Study Coach', '42222222-2222-4222-8222-222222222222');

create function pg_temp.rejects_cross_owner_rubric_chat()
returns boolean
language plpgsql
as $$
begin
  perform public.get_or_create_rubric_chat('42222222-2222-4222-8222-222222222222');
  return false;
exception when no_data_found then
  return true;
end;
$$;

create function pg_temp.rejects_cross_owner_active_rubric()
returns boolean
language plpgsql
as $$
begin
  perform public.set_active_rubric('42222222-2222-4222-8222-222222222222');
  return false;
exception when no_data_found then
  return true;
end;
$$;

create function pg_temp.rejects_cross_owner_chat_rubric()
returns boolean
language plpgsql
as $$
begin
  insert into public.dashboard_chats (
    user_id, title, origin_surface, rubric_id, rubric_context_locked
  )
  values (
    '31111111-1111-4111-8111-111111111111',
    'Stolen rubric',
    'dashboard',
    '42222222-2222-4222-8222-222222222222',
    true
  );
  return false;
exception when foreign_key_violation then
  return true;
end;
$$;

create function pg_temp.rejects_cross_owner_session_chat()
returns boolean
language plpgsql
as $$
begin
  update public.sessions
  set chat_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  where id = '51111111-1111-4111-8111-111111111111';
  return false;
exception when foreign_key_violation then
  return true;
when others then
  -- chat may not exist; still treat ownership FK failures as success path below
  return sqlstate = '23503';
end;
$$;

select set_config('request.jwt.claim.sub', '31111111-1111-4111-8111-111111111111', true);
set local role authenticated;

select throws_ok(
  $$update public.profiles
    set vertex_rag_corpus_name = 'stolen-corpus'
    where id = '31111111-1111-4111-8111-111111111111'$$,
  '42501',
  'permission denied for table profiles',
  'authenticated cannot UPDATE profiles.vertex_rag_corpus_name'
);
select throws_ok(
  $$update public.knowledge_documents
    set storage_path = 'stolen/path.pdf'
    where false$$,
  '42501',
  'permission denied for table knowledge_documents',
  'authenticated cannot UPDATE knowledge_documents.storage_path'
);
select is(
  public.rubrics_storage_path_is_owned(
    '31111111-1111-4111-8111-111111111111/41111111-1111-4111-8111-111111111111/essay.pdf'
  ),
  true,
  'owned {userId}/{rubricId}/ storage paths are allowed'
);
select is(
  public.rubrics_storage_path_is_owned(
    '31111111-1111-4111-8111-111111111111/essay.pdf'
  ),
  false,
  'rubrics paths without an owned rubric folder are rejected'
);
select is(
  public.rubrics_storage_path_is_owned(
    '31111111-1111-4111-8111-111111111111/42222222-2222-4222-8222-222222222222/essay.pdf'
  ),
  false,
  'rubrics paths under another owner rubric id are rejected'
);

select ok(pg_temp.rejects_cross_owner_rubric_chat(),
  'rubric chat RPC rejects another owner rubric');
select ok(pg_temp.rejects_cross_owner_active_rubric(),
  'active rubric RPC rejects another owner rubric');

create temporary table active_one as
select public.set_active_rubric('41111111-1111-4111-8111-111111111111') as value;

select is((select value->>'active' from active_one), 'true',
  'set_active_rubric activates the target rubric');
select is(
  (select count(*)::integer from public.rubrics
   where user_id = '31111111-1111-4111-8111-111111111111' and active),
  1,
  'activating a rubric clears other actives for the same user'
);

select is(
  (public.set_active_rubric('41222222-2222-4222-8222-222222222222')->>'id'),
  '41222222-2222-4222-8222-222222222222',
  'set_active_rubric can switch the unique active rubric'
);
select is(
  (select active from public.rubrics where id = '41111111-1111-4111-8111-111111111111'),
  false,
  'the previously active rubric is cleared atomically'
);

create temporary table rubric_chat_one as
select public.get_or_create_rubric_chat('41111111-1111-4111-8111-111111111111') as value;

select is((select value->>'client_key' from rubric_chat_one),
  'rubric:41111111-1111-4111-8111-111111111111',
  'rubric chats use a durable client_key');
select is((select value->>'rubric_context_locked' from rubric_chat_one), 'true',
  'rubric chats lock rubric context on create');
select is(
  public.get_or_create_rubric_chat('41111111-1111-4111-8111-111111111111')->>'id',
  (select value->>'id' from rubric_chat_one),
  'concurrent rubric chat opens converge on one row'
);

create temporary table session_chat_one as
select public.get_or_create_session_chat(
  '51111111-1111-4111-8111-111111111111',
  'Shared A chat',
  'dashboard'
) as value;

select is((select value->>'rubric_id' from session_chat_one),
  '41111111-1111-4111-8111-111111111111',
  'new session chats inherit the session rubric');
select is((select value->>'rubric_context_locked' from session_chat_one), 'true',
  'inherited session rubrics are locked on create');
select is(
  (select chat_id::text from public.sessions
   where id = '51111111-1111-4111-8111-111111111111'),
  (select value->>'id' from session_chat_one),
  'get_or_create_session_chat sets sessions.chat_id'
);
select is(
  public.get_or_create_session_chat(
    '51111111-1111-4111-8111-111111111111',
    'Ignored rename',
    'extension'
  )->>'id',
  (select value->>'id' from session_chat_one),
  'reopening a session reuses sessions.chat_id'
);

-- Many sessions may point at the same chat.
reset role;
update public.sessions
set chat_id = (select (value->>'id')::uuid from session_chat_one)
where id = '51222222-2222-4222-8222-222222222222';
set local role authenticated;

select is(
  (select count(*)::integer from public.sessions
   where chat_id = (select (value->>'id')::uuid from session_chat_one)),
  2,
  'two sessions can share one canonical chat'
);

select ok(pg_temp.rejects_cross_owner_chat_rubric(),
  'owner-matching FK rejects a foreign rubric on a chat');

reset role;
insert into public.dashboard_chats (
  id, user_id, title, origin_surface
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '32222222-2222-4222-8222-222222222222',
  'B only',
  'dashboard'
);
select ok(pg_temp.rejects_cross_owner_session_chat(),
  'owner-matching FK rejects linking a session to another owner chat');

-- Locked chat keeps null rubric_id after the pinned rubric is deleted.
set local role authenticated;
create temporary table locked_chat as
select public.get_or_create_rubric_chat('41222222-2222-4222-8222-222222222222') as value;

reset role;
delete from public.rubrics
where id = '41222222-2222-4222-8222-222222222222';

select is(
  (select rubric_id from public.dashboard_chats
   where id = (select (value->>'id')::uuid from locked_chat)),
  null,
  'deleting a rubric nulls chat.rubric_id via ON DELETE SET NULL'
);
select is(
  (select rubric_context_locked from public.dashboard_chats
   where id = (select (value->>'id')::uuid from locked_chat)),
  true,
  'rubric_context_locked remains true after rubric delete'
);

-- ensure_chat_rubric_locked pins the active rubric when unlocked.
insert into public.dashboard_chats (
  id, user_id, title, origin_surface, rubric_context_locked
)
values (
  'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
  '31111111-1111-4111-8111-111111111111',
  'Unlocked chat',
  'dashboard',
  false
);
-- Recreate an owned active rubric after the earlier delete/switch.
insert into public.rubrics (id, user_id, title, course, active)
values (
  '41333333-3333-4333-8333-333333333333',
  '31111111-1111-4111-8111-111111111111',
  'Rubric A3',
  'CS103',
  true
)
on conflict (id) do update set active = true;

select set_config('request.jwt.claim.sub', '31111111-1111-4111-8111-111111111111', true);
set local role authenticated;
update public.rubrics
set active = false
where user_id = '31111111-1111-4111-8111-111111111111'
  and id is distinct from '41333333-3333-4333-8333-333333333333';
update public.rubrics
set active = true
where id = '41333333-3333-4333-8333-333333333333';

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

select is(
  public.ensure_chat_rubric_locked(
    'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
    '31111111-1111-4111-8111-111111111111'
  )->>'rubric_id',
  '41333333-3333-4333-8333-333333333333',
  'service role ensure_chat_rubric_locked pins the active rubric when unlocked'
);

-- Live session RLS visibility
reset role;
-- session_chat_one was created under authenticated; service_role cannot read it
-- unless granted (same pattern as grant select on live_start to authenticated below).
grant select on session_chat_one to service_role;
set local role service_role;
create temporary table live_start as
select public.start_live_chat_session(
  '31111111-1111-4111-8111-111111111111',
  '61111111-1111-4111-8111-111111111111',
  (select (value->>'id')::uuid from session_chat_one),
  true,
  'Essay page',
  'https://example.test/essay',
  'Essay Coach',
  '71111111-1111-4111-8111-111111111111'
) as value;

select is((select value->>'action' from live_start), 'start',
  'service role can start a live chat session');
select is((select value->>'saveToDashboard' from live_start), 'true',
  'save_to_dashboard is recorded on the live row');
select ok((select value ? 'sessionId' from live_start)
  and (select value->>'sessionId' from live_start) is not null,
  'save_to_dashboard creates a dashboard session');
select is(
  (select session_id::text from public.dashboard_chats
   where id = (select (value->>'id')::uuid from session_chat_one)),
  '51111111-1111-4111-8111-111111111111',
  'start_live does not overwrite an existing chat.session_id'
);
select is(
  (select chat_id::text from public.sessions
   where id = (select (value->>'sessionId')::uuid from live_start)),
  (select value->>'id' from session_chat_one),
  'start_live still links the new Live session via sessions.chat_id'
);
select isnt(
  (select value->>'sessionId' from live_start),
  '51111111-1111-4111-8111-111111111111',
  'the Live dashboard session is distinct from the original linked session'
);

select is(
  public.start_live_chat_session(
    '31111111-1111-4111-8111-111111111111',
    '61111111-1111-4111-8111-111111111111',
    (select (value->>'id')::uuid from session_chat_one),
    true,
    'Essay page',
    'https://example.test/essay',
    'Essay Coach',
    '71111111-1111-4111-8111-111111111111'
  )->>'action',
  'replay',
  'starting with the same live id is idempotent'
);

reset role;
insert into public.dashboard_chats (
  id, user_id, title, origin_surface
)
values (
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
  '31111111-1111-4111-8111-111111111111',
  'Unlinked chat',
  'dashboard'
);
set local role service_role;
create temporary table live_start_unlinked as
select public.start_live_chat_session(
  '31111111-1111-4111-8111-111111111111',
  '63333333-3333-4333-8333-333333333333',
  'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1',
  true,
  'Live page',
  'https://example.test/live',
  'Study Coach',
  '73333333-3333-4333-8333-333333333333'
) as value;

select is((select value->>'action' from live_start_unlinked), 'start',
  'service role can start live on a chat with no linked session');
select is(
  (select session_id::text from public.dashboard_chats
   where id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'),
  (select value->>'sessionId' from live_start_unlinked),
  'start_live stamps chat.session_id when the chat has no linked session'
);

create temporary table live_turn as
select public.commit_live_turn(
  '31111111-1111-4111-8111-111111111111',
  '61111111-1111-4111-8111-111111111111',
  '81111111-1111-4111-8111-111111111111',
  '91111111-1111-4111-8111-111111111111',
  '92222222-2222-4222-8222-222222222222',
  'Live user question',
  'Live assistant answer',
  12,
  'extension',
  true,
  'fileSearchStores/demo',
  '{"citations":[{"title":"Rubric"}]}'::jsonb
) as value;

select is((select value->>'action' from live_turn), 'committed',
  'commit_live_turn dual-writes the finalized pair');
select is(
  (select count(*)::integer from public.dashboard_chat_messages
   where request_id = '81111111-1111-4111-8111-111111111111'),
  2,
  'live turns persist user and assistant chat messages'
);
select is(
  (select count(*)::integer from public.session_messages
   where id in (
     '91111111-1111-4111-8111-111111111111',
     '92222222-2222-4222-8222-222222222222'
   )),
  2,
  'save_to_dashboard writes the same stable IDs into session_messages'
);
select is(
  (select used_file_search from public.dashboard_chat_messages
   where id = '92222222-2222-4222-8222-222222222222'),
  true,
  'live assistant rows persist grounding flags'
);
select is(
  public.commit_live_turn(
    '31111111-1111-4111-8111-111111111111',
    '61111111-1111-4111-8111-111111111111',
    '81111111-1111-4111-8111-111111111111',
    '91111111-1111-4111-8111-111111111111',
    '92222222-2222-4222-8222-222222222222',
    'Live user question',
    'Live assistant answer',
    12,
    'extension',
    true,
    'fileSearchStores/demo',
    '{"citations":[{"title":"Rubric"}]}'::jsonb
  )->>'action',
  'committed',
  'commit_live_turn is idempotent for the same stable IDs'
);

-- Lookup cap + idempotency (force a tiny cap).
update public.live_chat_sessions
set rubric_lookup_cap = 1, rubric_lookup_count = 0
where id = '61111111-1111-4111-8111-111111111111';

select is(
  public.claim_live_rubric_lookup(
    '61111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111'
  )->>'action',
  'claimed',
  'first lookup claim under the cap succeeds'
);
select is(
  public.claim_live_rubric_lookup(
    '61111111-1111-4111-8111-111111111111',
    'a1111111-1111-4111-8111-111111111111'
  )->>'action',
  'replay',
  'duplicate lookup request ids are idempotent'
);
select is(
  public.claim_live_rubric_lookup(
    '61111111-1111-4111-8111-111111111111',
    'a2222222-2222-4222-8222-222222222222'
  )->>'action',
  'denied',
  'lookup claims beyond the cap are denied'
);

select is(
  public.finish_live_chat_session(
    '31111111-1111-4111-8111-111111111111',
    '61111111-1111-4111-8111-111111111111',
    'finished',
    42,
    'resume-handle-1'
  )->>'action',
  'finished',
  'finish_live_chat_session closes the lifecycle'
);
select is(
  (select status from public.live_chat_sessions
   where id = '61111111-1111-4111-8111-111111111111'),
  'finished',
  'finished live sessions record terminal status'
);
select is(
  public.finish_live_chat_session(
    '31111111-1111-4111-8111-111111111111',
    '61111111-1111-4111-8111-111111111111',
    'finished',
    99,
    'ignored'
  )->>'action',
  'replay',
  'finishing an already-closed live session is idempotent'
);

-- Cross-user live start rejection
select throws_ok(
  $$select public.start_live_chat_session(
      '32222222-2222-4222-8222-222222222222',
      '62222222-2222-4222-8222-222222222222',
      (select (value->>'id')::uuid from session_chat_one),
      false,
      null,
      null,
      null,
      null
    )$$,
  'P0002',
  'Chat not found',
  'live start rejects a chat owned by another user'
);

-- Live session RLS: owner sees own row, other user does not.
grant select on live_start to authenticated;
select set_config('request.jwt.claim.sub', '31111111-1111-4111-8111-111111111111', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.live_chat_sessions
   where id = '61111111-1111-4111-8111-111111111111'),
  1,
  'live session RLS exposes the owner row'
);
reset role;
select set_config('request.jwt.claim.sub', '32222222-2222-4222-8222-222222222222', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.live_chat_sessions
   where id = '61111111-1111-4111-8111-111111111111'),
  0,
  'live session RLS hides another owner row'
);

select * from finish();
rollback;
