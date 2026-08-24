-- RLS ownership and cross-user denial proofs (pgTAP).
-- This test intentionally covers every user-data table currently created by
-- the migrations and exercises representative authenticated read/write paths.
begin;
select plan(36);

-- Every exposed user-data table must have RLS enabled.
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'profiles'), true, 'profiles has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'sessions'), true, 'sessions has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'session_messages'), true, 'session_messages has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'rubrics'), true, 'rubrics has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'rubric_criteria'), true, 'rubric_criteria has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'action_items'), true, 'action_items has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'activity_logs'), true, 'activity_logs has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'ai_usage'), true, 'ai_usage has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'knowledge_documents'), true, 'knowledge_documents has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'dashboard_chats'), true, 'dashboard_chats has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'dashboard_chat_messages'), true, 'dashboard_chat_messages has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'dashboard_chat_turns'), true, 'dashboard_chat_turns has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'live_chat_sessions'), true, 'live_chat_sessions has RLS enabled');
select is((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'live_chat_rubric_lookups'), true, 'live_chat_rubric_lookups has RLS enabled');

create temp table rls_fixture_state as
select
  '11111111-1111-1111-1111-111111111111'::uuid as user_a,
  '22222222-2222-2222-2222-222222222222'::uuid as user_b,
  gen_random_uuid() as rubric_a_id,
  gen_random_uuid() as session_a_id,
  gen_random_uuid() as chat_a_id,
  gen_random_uuid() as item_a_id,
  gen_random_uuid() as document_a_id,
  gen_random_uuid() as message_a_id;

insert into auth.users (id, email, raw_user_meta_data, role, aud)
values
  ('11111111-1111-1111-1111-111111111111', 'student_a@university.edu', '{"name":"Student A"}'::jsonb, 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'student_b@university.edu', '{"name":"Student B"}'::jsonb, 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.rubrics (id, user_id, title, course, extracted_text, active)
select rubric_a_id, user_a, 'Rubric A', 'Writing 101', 'Criteria A', true from rls_fixture_state;
insert into public.sessions (id, user_id, title, mode, page_url, rubric_id)
select session_a_id, user_a, 'Session A', 'Essay Coach', 'https://example.com/essay', rubric_a_id from rls_fixture_state;
insert into public.dashboard_chats (id, user_id, title, session_id)
select chat_a_id, user_a, 'Chat A', session_a_id from rls_fixture_state;
insert into public.action_items (id, user_id, session_id, text, done)
select item_a_id, user_a, session_a_id, 'Action Item A', false from rls_fixture_state;
insert into public.knowledge_documents (id, user_id, title, extracted_text)
select document_a_id, user_a, 'Document A', 'Source text' from rls_fixture_state;
insert into public.dashboard_chat_messages (id, user_id, session_id, chat_id, role, text)
select message_a_id, user_a, session_a_id, chat_a_id, 'user', 'Question A' from rls_fixture_state;

grant select on rls_fixture_state to authenticated;

set local role authenticated;
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';
set local "request.jwt.claim.role" to 'authenticated';

select is((select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 0, 'User B cannot select User A profile');
select is((select count(*)::int from public.rubrics where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'User B cannot select User A rubric');
select is((select count(*)::int from public.sessions where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'User B cannot select User A session');
select is((select count(*)::int from public.dashboard_chats where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'User B cannot select User A chat');
select is((select count(*)::int from public.action_items where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'User B cannot select User A action item');
select is((select count(*)::int from public.knowledge_documents where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'User B cannot select User A document');
select is((select count(*)::int from public.dashboard_chat_messages where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'User B cannot select User A chat message');

update public.rubrics set title = 'Hacked Rubric' where user_id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.rubrics where title = 'Hacked Rubric'), 0, 'User B cannot update User A rubric');
update public.sessions set title = 'Hacked Session' where user_id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.sessions where title = 'Hacked Session'), 0, 'User B cannot update User A session');
update public.dashboard_chats set title = 'Hacked Chat' where user_id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.dashboard_chats where title = 'Hacked Chat'), 0, 'User B cannot update User A chat');
update public.action_items set text = 'Hacked Item' where user_id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.action_items where text = 'Hacked Item'), 0, 'User B cannot update User A action item');

delete from public.rubrics where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.action_items where user_id = '11111111-1111-1111-1111-111111111111';

set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.rubrics where id = (select rubric_a_id from rls_fixture_state)), 1, 'User A rubric remains after User B delete');
select is((select count(*)::int from public.action_items where id = (select item_a_id from rls_fixture_state)), 1, 'User A action item remains after User B delete');
select is((select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 1, 'User A can select own profile');
select is((select count(*)::int from public.rubrics where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'User A can select own rubric');
select is((select count(*)::int from public.sessions where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'User A can select own session');
select is((select count(*)::int from public.dashboard_chats where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'User A can select own chat');
select is((select count(*)::int from public.action_items where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'User A can select own action item');
select is((select count(*)::int from public.knowledge_documents where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'User A can select own document');
select is((select count(*)::int from public.dashboard_chat_messages where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'User A can select own chat message');

update public.rubrics set title = 'Updated Rubric A' where id = (select rubric_a_id from rls_fixture_state);
select is((select count(*)::int from public.rubrics where title = 'Updated Rubric A'), 1, 'User A can update own rubric');
update public.action_items set done = true where id = (select item_a_id from rls_fixture_state);
select is((select count(*)::int from public.action_items where done and id = (select item_a_id from rls_fixture_state)), 1, 'User A can mark own action item done');

select * from finish();
rollback;
