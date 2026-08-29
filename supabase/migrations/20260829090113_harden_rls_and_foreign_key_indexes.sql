-- Make ownership policies explicit, avoid per-row auth function evaluation,
-- and cover every foreign key used by ownership and cascading-delete checks.

-- ---------------------------------------------------------------------------
-- Legacy public-role policies -> authenticated, statement-stable auth.uid()
-- ---------------------------------------------------------------------------

drop policy if exists "Students can view their own profile details"
  on public.profiles;
create policy "Students can view their own profile details"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Students can modify their own profile preferences"
  on public.profiles;
create policy "Students can modify their own profile preferences"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Students can read their own rubrics"
  on public.rubrics;
create policy "Students can read their own rubrics"
on public.rubrics for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can upload custom rubrics"
  on public.rubrics;
create policy "Students can upload custom rubrics"
on public.rubrics for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update their own rubrics"
  on public.rubrics;
create policy "Students can update their own rubrics"
on public.rubrics for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their own rubrics"
  on public.rubrics;
create policy "Students can delete their own rubrics"
on public.rubrics for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can view criteria for their rubrics"
  on public.rubric_criteria;
create policy "Students can view criteria for their rubrics"
on public.rubric_criteria for select to authenticated
using (
  exists (
    select 1
    from public.rubrics as rubric
    where rubric.id = rubric_criteria.rubric_id
      and rubric.user_id = (select auth.uid())
  )
);

drop policy if exists "Students can add criteria to their rubrics"
  on public.rubric_criteria;
create policy "Students can add criteria to their rubrics"
on public.rubric_criteria for insert to authenticated
with check (
  exists (
    select 1
    from public.rubrics as rubric
    where rubric.id = rubric_criteria.rubric_id
      and rubric.user_id = (select auth.uid())
  )
);

drop policy if exists "Students can read their own knowledge documents"
  on public.knowledge_documents;
create policy "Students can read their own knowledge documents"
on public.knowledge_documents for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can insert their own knowledge documents"
  on public.knowledge_documents;
create policy "Students can insert their own knowledge documents"
on public.knowledge_documents for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update their own knowledge documents"
  on public.knowledge_documents;
create policy "Students can update their own knowledge documents"
on public.knowledge_documents for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their own knowledge documents"
  on public.knowledge_documents;
create policy "Students can delete their own knowledge documents"
on public.knowledge_documents for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can view their checklist tasks"
  on public.action_items;
create policy "Students can view their checklist tasks"
on public.action_items for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can insert checklist tasks"
  on public.action_items;
create policy "Students can insert checklist tasks"
on public.action_items for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update their checklist tasks"
  on public.action_items;
create policy "Students can update their checklist tasks"
on public.action_items for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their checklist tasks"
  on public.action_items;
create policy "Students can delete their checklist tasks"
on public.action_items for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can view their recent action logs feed"
  on public.activity_logs;
create policy "Students can view their recent action logs feed"
on public.activity_logs for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can insert their own activity logs"
  on public.activity_logs;
create policy "Students can insert their own activity logs"
on public.activity_logs for insert to authenticated
with check ((select auth.uid()) = user_id);

-- Service-only state intentionally has no authenticated/anonymous grants.
-- Explicit policies document the access model and keep RLS linting complete.
drop policy if exists "Service role manages dashboard chat turns"
  on public.dashboard_chat_turns;
create policy "Service role manages dashboard chat turns"
on public.dashboard_chat_turns for all to service_role
using (true)
with check (true);

drop policy if exists "Service role manages live rubric lookup claims"
  on public.live_chat_rubric_lookups;
create policy "Service role manages live rubric lookup claims"
on public.live_chat_rubric_lookups for all to service_role
using (true)
with check (true);

-- This definer function is only used by service-role Edge Functions. Keeping
-- it off the authenticated Data API removes an unnecessary privilege path.
revoke execute on function public.ensure_chat_rubric_locked(uuid, uuid)
  from authenticated;
grant execute on function public.ensure_chat_rubric_locked(uuid, uuid)
  to service_role;

-- These two authenticated definer RPCs intentionally protect canonical link
-- columns that clients cannot update directly. Both bind writes to auth.uid(),
-- use an empty search_path, and have cross-user denial coverage in pgTAP.
comment on function public.get_or_create_rubric_chat(uuid) is
  'Reviewed SECURITY DEFINER boundary: creates an auth.uid()-owned rubric chat while protecting canonical columns.';
comment on function public.link_dashboard_chat_session(uuid) is
  'Reviewed SECURITY DEFINER boundary: links auth.uid()-owned chat/session rows while protecting canonical columns.';

-- ---------------------------------------------------------------------------
-- Cover child-side foreign keys for parent updates/deletes and ownership joins
-- ---------------------------------------------------------------------------

create index if not exists idx_action_items_rubric_id
  on public.action_items (rubric_id);
create index if not exists idx_action_items_session_id
  on public.action_items (session_id);

create index if not exists idx_dashboard_chat_messages_chat_owner
  on public.dashboard_chat_messages (chat_id, user_id);
create index if not exists idx_dashboard_chat_messages_session_owner
  on public.dashboard_chat_messages (session_id, user_id);
create index if not exists idx_dashboard_chat_messages_user_id
  on public.dashboard_chat_messages (user_id);

create index if not exists idx_dashboard_chat_turns_chat_owner
  on public.dashboard_chat_turns (chat_id, user_id);

create index if not exists idx_dashboard_chats_rubric_owner
  on public.dashboard_chats (rubric_id, user_id);
create index if not exists idx_dashboard_chats_session_owner
  on public.dashboard_chats (session_id, user_id);

create index if not exists idx_knowledge_documents_session_id
  on public.knowledge_documents (session_id);

create index if not exists idx_live_chat_rubric_lookups_live_owner
  on public.live_chat_rubric_lookups (live_session_id, user_id);

create index if not exists idx_live_chat_sessions_chat_owner
  on public.live_chat_sessions (chat_id, user_id);
create index if not exists idx_live_chat_sessions_session_owner
  on public.live_chat_sessions (session_id, user_id);

create index if not exists idx_rubrics_knowledge_document_id
  on public.rubrics (knowledge_document_id);

create index if not exists idx_sessions_chat_owner
  on public.sessions (chat_id, user_id);
create index if not exists idx_sessions_rubric_owner
  on public.sessions (rubric_id, user_id);
