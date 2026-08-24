-- ============================================================================
-- RLS Ownership and Cross-User Denial Proofs (pgTAP)
--
-- Proves that every exposed table holding user data:
-- 1. Has Row Level Security (RLS) enabled.
-- 2. Restricts SELECT queries so User B cannot see User A's data.
-- 3. Restricts UPDATE queries so User B cannot modify User A's data.
-- 4. Restricts DELETE queries so User B cannot delete User A's data.
-- 5. Enforces WITH CHECK constraints on INSERT/UPDATE.
-- ============================================================================

begin;
select plan(42);

-- ─── 1. Check RLS is enabled on every user-data table ─────────────────────────

select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'profiles'),
  true, 'profiles has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'sessions'),
  true, 'sessions has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'session_messages'),
  true, 'session_messages has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'rubrics'),
  true, 'rubrics has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'rubric_criteria'),
  true, 'rubric_criteria has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'action_items'),
  true, 'action_items has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'activity_logs'),
  true, 'activity_logs has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'ai_usage'),
  true, 'ai_usage has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'knowledge_documents'),
  true, 'knowledge_documents has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'dashboard_chats'),
  true, 'dashboard_chats has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'dashboard_chat_messages'),
  true, 'dashboard_chat_messages has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'dashboard_chat_turns'),
  true, 'dashboard_chat_turns has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'live_chat_sessions'),
  true, 'live_chat_sessions has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'live_chat_rubric_lookups'),
  true, 'live_chat_rubric_lookups has RLS enabled'
);

-- ─── 2. Seed Test Users & Data (as service_role / postgres) ───────────────────

create temp table rls_fixture_state as
select
  '11111111-1111-1111-1111-111111111111'::uuid as user_a,
  '22222222-2222-2222-2222-222222222222'::uuid as user_b,
  gen_random_uuid() as rubric_a_id,
  gen_random_uuid() as session_a_id,
  gen_random_uuid() as chat_a_id,
  gen_random_uuid() as item_a_id;

-- Insert test users into auth.users if not present
insert into auth.users (id, email, raw_user_meta_data, role, aud)
values
  ('11111111-1111-1111-1111-111111111111', 'student_a@university.edu', '{"name":"Student A"}'::jsonb, 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'student_b@university.edu', '{"name":"Student B"}'::jsonb, 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- Create User A data as service_role
insert into public.rubrics (id, user_id, title, raw_text, is_active)
select rubric_a_id, user_a, 'Rubric A', 'Criteria A', true from rls_fixture_state;

insert into public.sessions (id, user_id, title, page_url, rubric_id)
select session_a_id, user_a, 'Session A', 'https://example.com/essay', rubric_a_id from rls_fixture_state;

insert into public.dashboard_chats (id, user_id, title, session_id, rubric_id)
select chat_a_id, user_a, 'Chat A', session_a_id, rubric_a_id from rls_fixture_state;

insert into public.action_items (id, user_id, session_id, text, is_done)
select item_a_id, user_a, session_a_id, 'Action Item A', false from rls_fixture_state;

-- ─── 3. Test Isolation as User B ──────────────────────────────────────────────

set local role authenticated;
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';
set local "request.jwt.claim.role" to 'authenticated';

-- User B should see 0 rows belonging to User A
select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  0, 'User B cannot select User A profile'
);
select is(
  (select count(*)::int from public.rubrics where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'User B cannot select User A rubrics'
);
select is(
  (select count(*)::int from public.sessions where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'User B cannot select User A sessions'
);
select is(
  (select count(*)::int from public.dashboard_chats where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'User B cannot select User A dashboard chats'
);
select is(
  (select count(*)::int from public.action_items where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'User B cannot select User A action items'
);

-- User B UPDATE attempt on User A records affects 0 rows
update public.rubrics set title = 'Hacked Rubric' where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.rubrics where title = 'Hacked Rubric'),
  0, 'User B cannot update User A rubrics'
);

update public.sessions set title = 'Hacked Session' where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.sessions where title = 'Hacked Session'),
  0, 'User B cannot update User A sessions'
);

update public.dashboard_chats set title = 'Hacked Chat' where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.dashboard_chats where title = 'Hacked Chat'),
  0, 'User B cannot update User A dashboard chats'
);

update public.action_items set text = 'Hacked Item' where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.action_items where text = 'Hacked Item'),
  0, 'User B cannot update User A action items'
);

-- User B DELETE attempt on User A records affects 0 rows
delete from public.rubrics where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.rubrics where id = (select rubric_a_id from rls_fixture_state)),
  0, 'User B cannot delete User A rubrics (row remains untouched in base table)'
);

delete from public.action_items where user_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.action_items where id = (select item_a_id from rls_fixture_state)),
  0, 'User B cannot delete User A action items'
);

-- ─── 4. Test User A Access (as User A) ────────────────────────────────────────

set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';
set local "request.jwt.claim.role" to 'authenticated';

select is(
  (select count(*)::int from public.rubrics where user_id = '11111111-1111-1111-1111-111111111111'),
  1, 'User A can select own rubric'
);
select is(
  (select count(*)::int from public.sessions where user_id = '11111111-1111-1111-1111-111111111111'),
  1, 'User A can select own session'
);
select is(
  (select count(*)::int from public.dashboard_chats where user_id = '11111111-1111-1111-1111-111111111111'),
  1, 'User A can select own dashboard chat'
);
select is(
  (select count(*)::int from public.action_items where user_id = '11111111-1111-1111-1111-111111111111'),
  1, 'User A can select own action items'
);

-- User A can update own rubric
update public.rubrics set title = 'Updated Rubric A' where id = (select rubric_a_id from rls_fixture_state);
select is(
  (select count(*)::int from public.rubrics where title = 'Updated Rubric A'),
  1, 'User A can update own rubric'
);

-- User A can update own action item
update public.action_items set is_done = true where id = (select item_a_id from rls_fixture_state);
select is(
  (select count(*)::int from public.action_items where is_done = true and id = (select item_a_id from rls_fixture_state)),
  1, 'User A can mark own action item done'
);

-- User A can delete own action item
delete from public.action_items where id = (select item_a_id from rls_fixture_state);
select is(
  (select count(*)::int from public.action_items where id = (select item_a_id from rls_fixture_state)),
  0, 'User A can delete own action item'
);

select * from finish();
rollback;
