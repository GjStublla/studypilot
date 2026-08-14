-- Harden Vertex RAG identifiers, rubrics storage ownership, and live session linking.
-- Match the dashboard_chats lock-column grant pattern: revoke table UPDATE, then
-- grant UPDATE only on columns clients may write. Edge writes locked fields with
-- service_role.

-- ---------------------------------------------------------------------------
-- Grants: Vertex RAG / storage identifiers are service-role writes
-- ---------------------------------------------------------------------------
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

do $$
declare
  v_allowed text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into v_allowed
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name not like 'vertex_rag\_%' escape '\';

  if v_allowed is null then
    raise exception 'profiles has no client-updatable columns after locking vertex_rag_*';
  end if;

  execute format(
    'grant update (%s) on table public.profiles to authenticated',
    v_allowed
  );
end
$$;

revoke all on table public.knowledge_documents from anon, authenticated;
grant select, insert, delete on table public.knowledge_documents to authenticated;
grant all on table public.knowledge_documents to service_role;

do $$
declare
  v_allowed text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into v_allowed
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'knowledge_documents'
    and column_name not like 'vertex_rag\_%' escape '\'
    and column_name not in ('storage_path', 'storage_bucket');

  if v_allowed is null then
    raise exception
      'knowledge_documents has no client-updatable columns after locking RAG/storage identifiers';
  end if;

  execute format(
    'grant update (%s) on table public.knowledge_documents to authenticated',
    v_allowed
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Storage: rubrics objects must live under {userId}/{ownedRubricId}/
-- ---------------------------------------------------------------------------
create or replace function public.rubrics_storage_path_is_owned(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (storage.foldername(p_name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.rubrics as rubric
      where rubric.user_id = (select auth.uid())
        and rubric.id::text = (storage.foldername(p_name))[2]
    ),
    false
  );
$$;

revoke execute on function public.rubrics_storage_path_is_owned(text)
  from public, anon;
grant execute on function public.rubrics_storage_path_is_owned(text)
  to authenticated, service_role;

drop policy if exists "Students can upload own rubrics"
on storage.objects;
create policy "Students can upload own rubrics"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rubrics'
  and public.rubrics_storage_path_is_owned(name)
);

drop policy if exists "Students can read own rubrics"
on storage.objects;
create policy "Students can read own rubrics"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'rubrics'
  and public.rubrics_storage_path_is_owned(name)
);

drop policy if exists "Students can update own rubrics"
on storage.objects;
create policy "Students can update own rubrics"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'rubrics'
  and public.rubrics_storage_path_is_owned(name)
)
with check (
  bucket_id = 'rubrics'
  and public.rubrics_storage_path_is_owned(name)
);

drop policy if exists "Students can delete own rubrics"
on storage.objects;
create policy "Students can delete own rubrics"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'rubrics'
  and public.rubrics_storage_path_is_owned(name)
);

-- ---------------------------------------------------------------------------
-- start_live_chat_session: keep an existing dashboard_chats.session_id
-- (original linked session chip). New Live sessions still attach via
-- sessions.chat_id so context can prefer the latest linked session.
-- ---------------------------------------------------------------------------
create or replace function public.start_live_chat_session(
  p_user_id uuid,
  p_live_session_id uuid,
  p_chat_id uuid,
  p_save_to_dashboard boolean default false,
  p_page_title text default null,
  p_page_url text default null,
  p_mode text default null,
  p_quota_request_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live public.live_chat_sessions%rowtype;
  v_chat public.dashboard_chats%rowtype;
  v_session_id uuid;
  v_mode text;
  v_created boolean := false;
begin
  if p_user_id is null or p_live_session_id is null or p_chat_id is null then
    raise exception 'Live session identity fields are required'
      using errcode = '22023';
  end if;

  select *
  into v_chat
  from public.dashboard_chats
  where id = p_chat_id
    and user_id = p_user_id;
  if not found then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  if p_quota_request_id is not null then
    select *
    into v_live
    from public.live_chat_sessions
    where user_id = p_user_id
      and quota_request_id = p_quota_request_id;
    if found then
      return jsonb_build_object(
        'action', 'replay',
        'id', v_live.id,
        'chatId', v_live.chat_id,
        'sessionId', v_live.session_id,
        'status', v_live.status,
        'saveToDashboard', v_live.save_to_dashboard,
        'contextThroughSequence', v_live.context_through_sequence,
        'rubricLookupCount', v_live.rubric_lookup_count,
        'rubricLookupCap', v_live.rubric_lookup_cap
      );
    end if;
  end if;

  select *
  into v_live
  from public.live_chat_sessions
  where id = p_live_session_id
  for update;

  if found then
    if v_live.user_id is distinct from p_user_id
      or v_live.chat_id is distinct from p_chat_id
    then
      return jsonb_build_object(
        'action', 'conflict',
        'errorStatus', 409,
        'errorMessage', 'liveSessionId was already used for a different request'
      );
    end if;

    return jsonb_build_object(
      'action', 'replay',
      'id', v_live.id,
      'chatId', v_live.chat_id,
      'sessionId', v_live.session_id,
      'status', v_live.status,
      'saveToDashboard', v_live.save_to_dashboard,
      'contextThroughSequence', v_live.context_through_sequence,
      'rubricLookupCount', v_live.rubric_lookup_count,
      'rubricLookupCap', v_live.rubric_lookup_cap,
      'resumeHandle', v_live.resume_handle
    );
  end if;

  v_mode := case
    when p_mode in (
      'Essay Coach',
      'Presentation Coach',
      'Study Coach',
      'Lecture',
      'Research Reader'
    ) then p_mode
    else 'Study Coach'
  end;

  begin
    insert into public.live_chat_sessions (
      id,
      user_id,
      chat_id,
      session_id,
      status,
      save_to_dashboard,
      quota_request_id,
      page_title,
      page_url,
      mode
    )
    values (
      p_live_session_id,
      p_user_id,
      p_chat_id,
      null,
      'active',
      coalesce(p_save_to_dashboard, false),
      p_quota_request_id,
      nullif(btrim(p_page_title), ''),
      nullif(btrim(p_page_url), ''),
      v_mode
    )
    returning * into v_live;
    v_created := found;
  exception
    when unique_violation then
      if p_quota_request_id is not null then
        select *
        into v_live
        from public.live_chat_sessions
        where user_id = p_user_id
          and quota_request_id = p_quota_request_id;
        if found then
          return jsonb_build_object(
            'action', 'replay',
            'id', v_live.id,
            'chatId', v_live.chat_id,
            'sessionId', v_live.session_id,
            'status', v_live.status,
            'saveToDashboard', v_live.save_to_dashboard,
            'contextThroughSequence', v_live.context_through_sequence,
            'rubricLookupCount', v_live.rubric_lookup_count,
            'rubricLookupCap', v_live.rubric_lookup_cap
          );
        end if;
      end if;

      select *
      into v_live
      from public.live_chat_sessions
      where id = p_live_session_id;
      if found
        and v_live.user_id = p_user_id
        and v_live.chat_id = p_chat_id
      then
        return jsonb_build_object(
          'action', 'replay',
          'id', v_live.id,
          'chatId', v_live.chat_id,
          'sessionId', v_live.session_id,
          'status', v_live.status,
          'saveToDashboard', v_live.save_to_dashboard,
          'contextThroughSequence', v_live.context_through_sequence,
          'rubricLookupCount', v_live.rubric_lookup_count,
          'rubricLookupCap', v_live.rubric_lookup_cap,
          'resumeHandle', v_live.resume_handle
        );
      end if;
      raise;
  end;

  if not v_created or v_live.id is null then
    raise exception 'Unable to start live chat session';
  end if;

  if v_live.save_to_dashboard and v_live.session_id is null then
    insert into public.sessions (
      user_id,
      chat_id,
      rubric_id,
      title,
      source,
      mode,
      page_title,
      page_url
    )
    values (
      p_user_id,
      p_chat_id,
      v_chat.rubric_id,
      coalesce(nullif(btrim(p_page_title), ''), v_chat.title, 'Live session'),
      'Chrome Extension',
      v_mode,
      nullif(btrim(p_page_title), ''),
      nullif(btrim(p_page_url), '')
    )
    returning id into v_session_id;

    update public.live_chat_sessions
    set session_id = v_session_id
    where id = v_live.id
      and user_id = p_user_id
    returning * into v_live;

    -- Only stamp the original linked session chip when the chat has none.
    update public.dashboard_chats
    set session_id = v_session_id
    where id = p_chat_id
      and user_id = p_user_id
      and session_id is null;
  end if;

  return jsonb_build_object(
    'action', 'start',
    'id', v_live.id,
    'chatId', v_live.chat_id,
    'sessionId', v_live.session_id,
    'status', v_live.status,
    'saveToDashboard', v_live.save_to_dashboard,
    'contextThroughSequence', v_live.context_through_sequence,
    'rubricLookupCount', v_live.rubric_lookup_count,
    'rubricLookupCap', v_live.rubric_lookup_cap
  );
end;
$$;

revoke execute on function public.start_live_chat_session(
  uuid, uuid, uuid, boolean, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.start_live_chat_session(
  uuid, uuid, uuid, boolean, text, text, text, uuid
) to service_role;
