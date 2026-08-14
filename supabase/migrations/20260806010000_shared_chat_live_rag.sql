-- Shared chat, live context, and rubric RAG foundations.
-- Rubric-locked durable chats, sessions.chat_id (many sessions → one chat),
-- live_chat_sessions service lifecycle, rubrics storage bucket, and RPCs.

-- ---------------------------------------------------------------------------
-- Schema: dashboard_chats rubric/context columns
-- ---------------------------------------------------------------------------
alter table public.dashboard_chats
  add column if not exists rubric_id uuid,
  add column if not exists rubric_context_locked boolean not null default false,
  add column if not exists context_summary text,
  add column if not exists summary_through_sequence bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chats'::regclass
      and conname = 'dashboard_chats_rubric_owner_fkey'
  ) then
    alter table public.dashboard_chats
      add constraint dashboard_chats_rubric_owner_fkey
      foreign key (rubric_id, user_id)
      references public.rubrics (id, user_id)
      on delete set null (rubric_id)
      not valid;
  end if;
end
$$;

alter table public.dashboard_chats
  validate constraint dashboard_chats_rubric_owner_fkey;

create index if not exists idx_dashboard_chats_user_rubric
  on public.dashboard_chats (user_id, rubric_id)
  where rubric_id is not null;

-- ---------------------------------------------------------------------------
-- Schema: sessions.chat_id (authoritative link; keep dashboard_chats.session_id)
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists chat_id uuid;

-- Backfill while the historical one-chat-per-session unique still holds.
update public.sessions as session_row
set chat_id = chat.id
from public.dashboard_chats as chat
where chat.session_id = session_row.id
  and chat.user_id = session_row.user_id
  and session_row.chat_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and conname = 'sessions_chat_owner_fkey'
  ) then
    alter table public.sessions
      add constraint sessions_chat_owner_fkey
      foreign key (chat_id, user_id)
      references public.dashboard_chats (id, user_id)
      on delete set null (chat_id)
      not valid;
  end if;
end
$$;

alter table public.sessions
  validate constraint sessions_chat_owner_fkey;

create index if not exists idx_sessions_user_chat
  on public.sessions (user_id, chat_id)
  where chat_id is not null;

-- Many sessions may share one chat.
drop index if exists public.dashboard_chats_user_session_key;

-- At most one active rubric per owner (defense in depth for set_active_rubric).
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc nulls last, created_at desc nulls last, id
    ) as position
  from public.rubrics
  where active
)
update public.rubrics as rubric
set active = false
from ranked
where rubric.id = ranked.id
  and ranked.position > 1;

create unique index if not exists rubrics_one_active_per_user
  on public.rubrics (user_id)
  where active;

-- ---------------------------------------------------------------------------
-- Schema: live_chat_sessions (+ lookup claim rows for idempotent RAG caps)
-- ---------------------------------------------------------------------------
create table if not exists public.live_chat_sessions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null,
  chat_id uuid not null,
  session_id uuid,
  status text not null default 'starting',
  context_through_sequence bigint,
  save_to_dashboard boolean not null default false,
  rubric_lookup_count integer not null default 0,
  rubric_lookup_cap integer not null default 20,
  quota_request_id uuid,
  resume_handle text,
  page_title text,
  page_url text,
  mode text,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint live_chat_sessions_status_check
    check (status in ('starting', 'active', 'paused', 'finished', 'failed')),
  constraint live_chat_sessions_lookup_count_check
    check (
      rubric_lookup_count >= 0
      and rubric_lookup_cap >= 0
      and rubric_lookup_count <= rubric_lookup_cap
    ),
  constraint live_chat_sessions_duration_check
    check (duration_seconds is null or duration_seconds >= 0),
  constraint live_chat_sessions_id_user_id_key
    unique (id, user_id),
  constraint live_chat_sessions_user_fkey
    foreign key (user_id)
    references public.profiles (id)
    on delete cascade,
  constraint live_chat_sessions_chat_owner_fkey
    foreign key (chat_id, user_id)
    references public.dashboard_chats (id, user_id)
    on delete cascade,
  constraint live_chat_sessions_session_owner_fkey
    foreign key (session_id, user_id)
    references public.sessions (id, user_id)
    on delete set null (session_id)
);

create unique index if not exists live_chat_sessions_user_quota_request_key
  on public.live_chat_sessions (user_id, quota_request_id)
  where quota_request_id is not null;

create index if not exists idx_live_chat_sessions_user_created
  on public.live_chat_sessions (user_id, created_at desc, id);

create index if not exists idx_live_chat_sessions_chat_created
  on public.live_chat_sessions (chat_id, created_at desc, id);

drop trigger if exists set_timestamp_live_chat_sessions on public.live_chat_sessions;
create trigger set_timestamp_live_chat_sessions
before update on public.live_chat_sessions
for each row execute function public.trigger_set_timestamp();

create table if not exists public.live_chat_rubric_lookups (
  live_session_id uuid not null,
  user_id uuid not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (live_session_id, request_id),
  constraint live_chat_rubric_lookups_live_owner_fkey
    foreign key (live_session_id, user_id)
    references public.live_chat_sessions (id, user_id)
    on delete cascade
);

create index if not exists idx_live_chat_rubric_lookups_user
  on public.live_chat_rubric_lookups (user_id, created_at desc);

alter table public.live_chat_sessions enable row level security;
alter table public.live_chat_rubric_lookups enable row level security;

drop policy if exists "Students can view their own live chat sessions"
  on public.live_chat_sessions;
create policy "Students can view their own live chat sessions"
on public.live_chat_sessions for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.live_chat_sessions from anon, authenticated;
revoke all on table public.live_chat_rubric_lookups from anon, authenticated;
grant select on table public.live_chat_sessions to authenticated;
grant all on table public.live_chat_sessions to service_role;
grant all on table public.live_chat_rubric_lookups to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private rubrics bucket (owner-path policies)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rubrics',
  'rubrics',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Students can upload own rubrics"
on storage.objects;
create policy "Students can upload own rubrics"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rubrics'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students can read own rubrics"
on storage.objects;
create policy "Students can read own rubrics"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'rubrics'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students can update own rubrics"
on storage.objects;
create policy "Students can update own rubrics"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'rubrics'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'rubrics'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students can delete own rubrics"
on storage.objects;
create policy "Students can delete own rubrics"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'rubrics'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_chat_json(p_chat public.dashboard_chats)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_chat.id,
    'user_id', p_chat.user_id,
    'session_id', p_chat.session_id,
    'title', p_chat.title,
    'origin_surface', p_chat.origin_surface,
    'client_key', p_chat.client_key,
    'rubric_id', p_chat.rubric_id,
    'rubric_context_locked', p_chat.rubric_context_locked,
    'context_summary', p_chat.context_summary,
    'summary_through_sequence', p_chat.summary_through_sequence,
    'created_at', p_chat.created_at,
    'updated_at', p_chat.updated_at
  );
$$;

revoke execute on function public.dashboard_chat_json(public.dashboard_chats)
  from public, anon;
grant execute on function public.dashboard_chat_json(public.dashboard_chats)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Legacy attachment: prefer sessions.chat_id after dropping session unique
-- ---------------------------------------------------------------------------
create or replace function public.attach_legacy_dashboard_chat()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session_chat_id uuid;
begin
  if new.chat_id is not null or new.origin_surface <> 'legacy' then
    return new;
  end if;

  if new.session_id is not null then
    select session_row.chat_id
    into v_session_chat_id
    from public.sessions as session_row
    where session_row.id = new.session_id
      and session_row.user_id = new.user_id;

    if not found then
      raise exception 'Legacy message session is not owned by the message user'
        using errcode = '23503';
    end if;

    if v_session_chat_id is not null then
      new.chat_id := v_session_chat_id;
      return new;
    end if;

    select chat.id
    into new.chat_id
    from public.dashboard_chats as chat
    where chat.user_id = new.user_id
      and chat.session_id = new.session_id
    order by chat.updated_at desc nulls last, chat.created_at desc nulls last, chat.id
    limit 1;

    if new.chat_id is null then
      insert into public.dashboard_chats (
        user_id,
        session_id,
        title,
        origin_surface,
        client_key
      )
      select
        new.user_id,
        session_row.id,
        session_row.title,
        'legacy',
        null
      from public.sessions as session_row
      where session_row.id = new.session_id
        and session_row.user_id = new.user_id
      returning id into new.chat_id;
    end if;

    if new.chat_id is null then
      raise exception 'Legacy message session is not owned by the message user'
        using errcode = '23503';
    end if;

    update public.sessions
    set chat_id = new.chat_id
    where id = new.session_id
      and user_id = new.user_id
      and chat_id is null;
  else
    insert into public.dashboard_chats (
      user_id,
      session_id,
      title,
      origin_surface,
      client_key
    )
    values (
      new.user_id,
      null,
      'Imported legacy chat',
      'legacy',
      'legacy-general'
    )
    on conflict (user_id, client_key) where client_key is not null
    do update set client_key = excluded.client_key
    returning id into new.chat_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.attach_legacy_dashboard_chat()
  from public, anon, authenticated;
grant execute on function public.attach_legacy_dashboard_chat()
  to service_role;

-- ---------------------------------------------------------------------------
-- Authenticated RPCs: rubric chat, active rubric, session chat, lock helper
-- ---------------------------------------------------------------------------
-- Definer so concurrent creators can serialize on client_key and lock rubric
-- columns without granting those updates to authenticated clients.
create or replace function public.get_or_create_rubric_chat(p_rubric_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_chat public.dashboard_chats%rowtype;
  v_client_key text;
  v_title text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_rubric_id is null then
    raise exception 'Rubric id is required' using errcode = '22023';
  end if;

  select rubric.title
  into v_title
  from public.rubrics as rubric
  where rubric.id = p_rubric_id
    and rubric.user_id = v_user_id;
  if not found then
    raise exception 'Rubric not found' using errcode = 'P0002';
  end if;

  v_client_key := 'rubric:' || p_rubric_id::text;

  insert into public.dashboard_chats (
    user_id,
    session_id,
    title,
    origin_surface,
    client_key,
    rubric_id,
    rubric_context_locked
  )
  values (
    v_user_id,
    null,
    coalesce(nullif(btrim(v_title), ''), 'Rubric chat'),
    'dashboard',
    v_client_key,
    p_rubric_id,
    true
  )
  on conflict (user_id, client_key) where client_key is not null
  do update set client_key = excluded.client_key
  returning * into v_chat;

  if v_chat.id is null then
    select * into v_chat
    from public.dashboard_chats
    where user_id = v_user_id
      and client_key = v_client_key;
  end if;

  if v_chat.id is null then
    raise exception 'Unable to create rubric chat';
  end if;

  -- Durable chats stay locked to this rubric even if unlocked somehow.
  if v_chat.rubric_id is distinct from p_rubric_id
    or v_chat.rubric_context_locked is distinct from true
  then
    update public.dashboard_chats
    set
      rubric_id = p_rubric_id,
      rubric_context_locked = true
    where id = v_chat.id
      and user_id = v_user_id
    returning * into v_chat;
  end if;

  return public.dashboard_chat_json(v_chat);
end;
$$;

revoke execute on function public.get_or_create_rubric_chat(uuid)
  from public, anon;
grant execute on function public.get_or_create_rubric_chat(uuid)
  to authenticated, service_role;

create or replace function public.set_active_rubric(p_rubric_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rubric public.rubrics%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_rubric_id is null then
    raise exception 'Rubric id is required' using errcode = '22023';
  end if;

  select *
  into v_rubric
  from public.rubrics
  where id = p_rubric_id
    and user_id = v_user_id
  for update;
  if not found then
    raise exception 'Rubric not found' using errcode = 'P0002';
  end if;

  update public.rubrics
  set active = false
  where user_id = v_user_id
    and active
    and id is distinct from p_rubric_id;

  update public.rubrics
  set active = true
  where id = p_rubric_id
    and user_id = v_user_id
  returning * into v_rubric;

  return jsonb_build_object(
    'id', v_rubric.id,
    'user_id', v_rubric.user_id,
    'title', v_rubric.title,
    'course', v_rubric.course,
    'active', v_rubric.active,
    'file_search_status', v_rubric.file_search_status,
    'updated_at', v_rubric.updated_at
  );
end;
$$;

revoke execute on function public.set_active_rubric(uuid)
  from public, anon;
grant execute on function public.set_active_rubric(uuid)
  to authenticated, service_role;

-- Narrow definer write: lock effective rubric when the chat is still unlocked.
create or replace function public.ensure_chat_rubric_locked(p_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_chat public.dashboard_chats%rowtype;
  v_rubric_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_chat_id is null then
    raise exception 'Chat id is required' using errcode = '22023';
  end if;

  select *
  into v_chat
  from public.dashboard_chats
  where id = p_chat_id
    and user_id = v_user_id
  for update;
  if not found then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  if v_chat.rubric_context_locked then
    return public.dashboard_chat_json(v_chat);
  end if;

  if v_chat.session_id is not null then
    select session_row.rubric_id
    into v_rubric_id
    from public.sessions as session_row
    where session_row.id = v_chat.session_id
      and session_row.user_id = v_user_id;
  end if;

  if v_rubric_id is null then
    select session_row.rubric_id
    into v_rubric_id
    from public.sessions as session_row
    where session_row.chat_id = v_chat.id
      and session_row.user_id = v_user_id
      and session_row.rubric_id is not null
    order by session_row.updated_at desc nulls last, session_row.created_at desc nulls last, session_row.id
    limit 1;
  end if;

  if v_rubric_id is null then
    select rubric.id
    into v_rubric_id
    from public.rubrics as rubric
    where rubric.user_id = v_user_id
      and rubric.active
    limit 1;
  end if;

  if v_rubric_id is null then
    return public.dashboard_chat_json(v_chat);
  end if;

  update public.dashboard_chats
  set
    rubric_id = v_rubric_id,
    rubric_context_locked = true
  where id = v_chat.id
    and user_id = v_user_id
  returning * into v_chat;

  return public.dashboard_chat_json(v_chat);
end;
$$;

revoke execute on function public.ensure_chat_rubric_locked(uuid)
  from public, anon;
grant execute on function public.ensure_chat_rubric_locked(uuid)
  to authenticated, service_role;

create or replace function public.get_or_create_session_chat(
  p_session_id uuid default null,
  p_title text default 'New chat',
  p_origin_surface text default 'dashboard'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_chat public.dashboard_chats%rowtype;
  v_session public.sessions%rowtype;
  v_title text := coalesce(nullif(btrim(p_title), ''), 'New chat');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_origin_surface not in ('dashboard', 'extension', 'legacy') then
    raise exception 'Invalid origin surface' using errcode = '22023';
  end if;

  if p_session_id is null then
    insert into public.dashboard_chats (
      user_id,
      session_id,
      title,
      origin_surface,
      client_key
    )
    values (
      v_user_id,
      null,
      v_title,
      p_origin_surface,
      'legacy-general'
    )
    on conflict (user_id, client_key) where client_key is not null do nothing;

    select * into v_chat
    from public.dashboard_chats
    where user_id = v_user_id
      and client_key = 'legacy-general';
  else
    select *
    into v_session
    from public.sessions
    where id = p_session_id
      and user_id = v_user_id
    for update;
    if not found then
      raise exception 'Session not found' using errcode = 'P0002';
    end if;

    if v_session.chat_id is not null then
      select * into v_chat
      from public.dashboard_chats
      where id = v_session.chat_id
        and user_id = v_user_id;
    end if;

    if v_chat.id is null then
      select * into v_chat
      from public.dashboard_chats
      where user_id = v_user_id
        and session_id = p_session_id
      order by updated_at desc nulls last, created_at desc nulls last, id
      limit 1;
    end if;

    if v_chat.id is null then
      insert into public.dashboard_chats (
        user_id,
        session_id,
        title,
        origin_surface,
        client_key,
        rubric_id,
        rubric_context_locked
      )
      values (
        v_user_id,
        p_session_id,
        v_title,
        p_origin_surface,
        null,
        v_session.rubric_id,
        v_session.rubric_id is not null
      )
      returning * into v_chat;
    end if;

    update public.sessions
    set chat_id = v_chat.id
    where id = p_session_id
      and user_id = v_user_id
      and chat_id is distinct from v_chat.id;
  end if;

  if v_chat.id is null then
    raise exception 'Unable to create session chat';
  end if;

  return public.dashboard_chat_json(v_chat);
end;
$$;

revoke execute on function public.get_or_create_session_chat(uuid, text, text)
  from public, anon;
grant execute on function public.get_or_create_session_chat(uuid, text, text)
  to authenticated, service_role;

create or replace function public.link_dashboard_chat_session(p_chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_chat public.dashboard_chats%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_chat
  from public.dashboard_chats
  where id = p_chat_id
    and user_id = v_user_id
  for update;

  if v_chat.id is null then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.sessions
    where id = p_chat_id
      and user_id = v_user_id
  ) then
    raise exception 'Matching session not found' using errcode = 'P0002';
  end if;

  if v_chat.session_id is not null and v_chat.session_id <> p_chat_id then
    raise exception 'Chat is already linked to another session'
      using errcode = '23514';
  end if;

  update public.dashboard_chats
  set session_id = p_chat_id
  where id = p_chat_id
    and user_id = v_user_id
  returning * into v_chat;

  update public.sessions
  set chat_id = p_chat_id
  where id = p_chat_id
    and user_id = v_user_id
    and chat_id is distinct from p_chat_id;

  return public.dashboard_chat_json(v_chat);
end;
$$;

revoke execute on function public.link_dashboard_chat_session(uuid)
  from public, anon, service_role;
grant execute on function public.link_dashboard_chat_session(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Service-only: extend finish_ai_chat_turn with grounding metadata
-- ---------------------------------------------------------------------------
drop function if exists public.finish_ai_chat_turn(
  uuid, uuid, uuid, text, text, integer, text
);

create function public.finish_ai_chat_turn(
  p_user_id uuid,
  p_request_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_assistant_text text,
  p_error_status integer,
  p_error_message text,
  p_used_file_search boolean default false,
  p_file_search_store_name text default null,
  p_grounding_metadata jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_turn public.dashboard_chat_turns%rowtype;
  v_user_row public.dashboard_chat_messages%rowtype;
  v_assistant_row public.dashboard_chat_messages%rowtype;
  v_session_id uuid;
begin
  select *
  into v_turn
  from public.dashboard_chat_turns
  where user_id = p_user_id
    and id = p_request_id
  for update;

  if v_turn.id is null then
    raise exception 'AI turn not found' using errcode = 'P0002';
  end if;

  select *
  into v_user_row
  from public.dashboard_chat_messages
  where id = v_turn.user_message_id;

  select *
  into v_assistant_row
  from public.dashboard_chat_messages
  where id = v_turn.assistant_message_id;

  if v_assistant_row.id is not null then
    if v_user_row.id is null
      or v_assistant_row.user_id is distinct from v_turn.user_id
      or v_assistant_row.chat_id is distinct from v_turn.chat_id
      or v_assistant_row.request_id is distinct from v_turn.id
      or v_assistant_row.origin_surface is distinct from v_turn.origin_surface
      or v_assistant_row.role is distinct from 'ai'
      or nullif(btrim(v_assistant_row.text), '') is null
    then
      return jsonb_build_object(
        'action', 'error',
        'errorStatus', 503,
        'errorMessage', 'Persisted AI request rows are incomplete'
      );
    end if;

    update public.dashboard_chat_turns
    set
      status = 'completed',
      error_status = null,
      error_message = null,
      completed_at = coalesce(completed_at, clock_timestamp()),
      lease_expires_at = null
    where user_id = p_user_id
      and id = p_request_id
    returning * into v_turn;

    return jsonb_build_object(
      'action', 'completed',
      'userMessageId', v_turn.user_message_id,
      'assistantMessageId', v_turn.assistant_message_id,
      'userSequence', v_user_row.server_sequence,
      'assistantSequence', v_assistant_row.server_sequence,
      'assistantText', v_assistant_row.text,
      'usedFileSearch', coalesce(v_assistant_row.used_file_search, false),
      'fileSearchStoreName', v_assistant_row.file_search_store_name,
      'groundingMetadata', v_assistant_row.grounding_metadata
    );
  end if;

  if v_turn.status = 'completed' then
    return jsonb_build_object(
      'action', 'error',
      'errorStatus', 503,
      'errorMessage', 'Completed AI request is unavailable'
    );
  end if;

  if v_turn.status in ('failed', 'rejected') then
    return jsonb_build_object(
      'action', 'error',
      'errorStatus', coalesce(v_turn.error_status, 409),
      'errorMessage', coalesce(
        v_turn.error_message,
        'This AI request did not complete. Retry with a new requestId.'
      )
    );
  end if;

  if v_turn.lease_token is distinct from p_lease_token
    or v_turn.lease_expires_at is null
    or v_turn.lease_expires_at <= clock_timestamp()
  then
    return jsonb_build_object(
      'action', 'fenced',
      'errorStatus', 409,
      'errorMessage', 'AI turn lease is no longer active'
    );
  end if;

  if p_outcome = 'failed' then
    if p_error_status is null
      or p_error_status < 400
      or p_error_status > 599
      or nullif(btrim(p_error_message), '') is null
    then
      raise exception 'A failed outcome requires an HTTP error and message'
        using errcode = '22023';
    end if;

    update public.dashboard_chat_turns
    set
      status = 'failed',
      error_status = p_error_status,
      error_message = p_error_message,
      lease_expires_at = null
    where user_id = p_user_id
      and id = p_request_id
      and lease_token = p_lease_token
    returning * into v_turn;

    return jsonb_build_object(
      'action', 'error',
      'errorStatus', v_turn.error_status,
      'errorMessage', v_turn.error_message
    );
  end if;

  if p_outcome <> 'completed' then
    raise exception 'Outcome must be completed or failed' using errcode = '22023';
  end if;
  if nullif(btrim(p_assistant_text), '') is null then
    raise exception 'Completed outcome requires assistant text'
      using errcode = '22023';
  end if;
  if v_user_row.id is null
    or v_user_row.user_id is distinct from v_turn.user_id
    or v_user_row.chat_id is distinct from v_turn.chat_id
    or v_user_row.request_id is distinct from v_turn.id
    or v_user_row.origin_surface is distinct from v_turn.origin_surface
    or v_user_row.role is distinct from 'user'
  then
    raise exception 'Durable user message is missing or invalid'
      using errcode = '23514';
  end if;

  select chat.session_id
  into v_session_id
  from public.dashboard_chats as chat
  where chat.id = v_turn.chat_id
    and chat.user_id = v_turn.user_id;
  if not found then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  insert into public.dashboard_chat_messages (
    id,
    user_id,
    chat_id,
    session_id,
    request_id,
    origin_surface,
    role,
    text,
    used_file_search,
    file_search_store_name,
    grounding_metadata
  )
  values (
    v_turn.assistant_message_id,
    v_turn.user_id,
    v_turn.chat_id,
    v_session_id,
    v_turn.id,
    v_turn.origin_surface,
    'ai',
    btrim(p_assistant_text),
    coalesce(p_used_file_search, false),
    nullif(btrim(p_file_search_store_name), ''),
    p_grounding_metadata
  )
  returning * into v_assistant_row;

  update public.dashboard_chat_turns
  set
    status = 'completed',
    error_status = null,
    error_message = null,
    completed_at = clock_timestamp(),
    lease_expires_at = null
  where user_id = p_user_id
    and id = p_request_id
    and status = 'pending'
    and lease_token = p_lease_token
  returning * into v_turn;

  if v_turn.id is null then
    raise exception 'AI turn lease changed during completion'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'action', 'completed',
    'userMessageId', v_turn.user_message_id,
    'assistantMessageId', v_turn.assistant_message_id,
    'userSequence', v_user_row.server_sequence,
    'assistantSequence', v_assistant_row.server_sequence,
    'assistantText', v_assistant_row.text,
    'usedFileSearch', coalesce(v_assistant_row.used_file_search, false),
    'fileSearchStoreName', v_assistant_row.file_search_store_name,
    'groundingMetadata', v_assistant_row.grounding_metadata
  );
end;
$$;

revoke execute on function public.finish_ai_chat_turn(
  uuid, uuid, uuid, text, text, integer, text, boolean, text, jsonb
) from public, anon, authenticated;
grant execute on function public.finish_ai_chat_turn(
  uuid, uuid, uuid, text, text, integer, text, boolean, text, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- Service-only live lifecycle RPCs
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

    update public.dashboard_chats
    set session_id = v_session_id
    where id = p_chat_id
      and user_id = p_user_id;
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

create or replace function public.commit_live_turn(
  p_user_id uuid,
  p_live_session_id uuid,
  p_request_id uuid,
  p_user_message_id uuid,
  p_assistant_message_id uuid,
  p_user_text text,
  p_assistant_text text,
  p_time_offset_seconds integer default 0,
  p_origin_surface text default 'extension',
  p_used_file_search boolean default false,
  p_file_search_store_name text default null,
  p_grounding_metadata jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live public.live_chat_sessions%rowtype;
  v_user_row public.dashboard_chat_messages%rowtype;
  v_assistant_row public.dashboard_chat_messages%rowtype;
  v_chat_session_id uuid;
  v_offset integer := greatest(coalesce(p_time_offset_seconds, 0), 0);
begin
  if p_user_id is null
    or p_live_session_id is null
    or p_request_id is null
    or p_user_message_id is null
    or p_assistant_message_id is null
  then
    raise exception 'Live turn identity fields are required'
      using errcode = '22023';
  end if;
  if nullif(btrim(p_user_text), '') is null
    or nullif(btrim(p_assistant_text), '') is null
  then
    raise exception 'Live turn texts are required' using errcode = '22023';
  end if;
  if p_origin_surface not in ('dashboard', 'extension', 'legacy') then
    raise exception 'Invalid origin surface' using errcode = '22023';
  end if;

  select *
  into v_live
  from public.live_chat_sessions
  where id = p_live_session_id
    and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Live session not found' using errcode = 'P0002';
  end if;
  if v_live.status in ('finished', 'failed') then
    raise exception 'Live session is already closed' using errcode = '23514';
  end if;

  select chat.session_id
  into v_chat_session_id
  from public.dashboard_chats as chat
  where chat.id = v_live.chat_id
    and chat.user_id = p_user_id;

  insert into public.dashboard_chat_messages (
    id,
    user_id,
    chat_id,
    session_id,
    request_id,
    origin_surface,
    role,
    text
  )
  values (
    p_user_message_id,
    p_user_id,
    v_live.chat_id,
    coalesce(v_live.session_id, v_chat_session_id),
    p_request_id,
    p_origin_surface,
    'user',
    btrim(p_user_text)
  )
  on conflict (id) do nothing;

  select * into v_user_row
  from public.dashboard_chat_messages
  where id = p_user_message_id;

  if v_user_row.id is null
    or v_user_row.user_id is distinct from p_user_id
    or v_user_row.chat_id is distinct from v_live.chat_id
    or v_user_row.request_id is distinct from p_request_id
    or v_user_row.role is distinct from 'user'
    or v_user_row.text is distinct from btrim(p_user_text)
  then
    return jsonb_build_object(
      'action', 'conflict',
      'errorStatus', 409,
      'errorMessage', 'Persisted live user message does not match this request'
    );
  end if;

  insert into public.dashboard_chat_messages (
    id,
    user_id,
    chat_id,
    session_id,
    request_id,
    origin_surface,
    role,
    text,
    used_file_search,
    file_search_store_name,
    grounding_metadata
  )
  values (
    p_assistant_message_id,
    p_user_id,
    v_live.chat_id,
    coalesce(v_live.session_id, v_chat_session_id),
    p_request_id,
    p_origin_surface,
    'ai',
    btrim(p_assistant_text),
    coalesce(p_used_file_search, false),
    nullif(btrim(p_file_search_store_name), ''),
    p_grounding_metadata
  )
  on conflict (id) do nothing;

  select * into v_assistant_row
  from public.dashboard_chat_messages
  where id = p_assistant_message_id;

  if v_assistant_row.id is null
    or v_assistant_row.user_id is distinct from p_user_id
    or v_assistant_row.chat_id is distinct from v_live.chat_id
    or v_assistant_row.request_id is distinct from p_request_id
    or v_assistant_row.role is distinct from 'ai'
    or v_assistant_row.text is distinct from btrim(p_assistant_text)
  then
    return jsonb_build_object(
      'action', 'conflict',
      'errorStatus', 409,
      'errorMessage', 'Persisted live assistant message does not match this request'
    );
  end if;

  if v_live.save_to_dashboard and v_live.session_id is not null then
    insert into public.session_messages (
      id,
      session_id,
      role,
      message_text,
      time_offset_seconds
    )
    values (
      p_user_message_id,
      v_live.session_id,
      'user',
      btrim(p_user_text),
      v_offset
    )
    on conflict (id) do nothing;

    insert into public.session_messages (
      id,
      session_id,
      role,
      message_text,
      time_offset_seconds
    )
    values (
      p_assistant_message_id,
      v_live.session_id,
      'ai',
      btrim(p_assistant_text),
      v_offset
    )
    on conflict (id) do nothing;
  end if;

  update public.live_chat_sessions
  set
    status = case when status = 'starting' then 'active' else status end,
    context_through_sequence = greatest(
      coalesce(context_through_sequence, 0),
      v_assistant_row.server_sequence
    )
  where id = p_live_session_id
    and user_id = p_user_id
  returning * into v_live;

  return jsonb_build_object(
    'action', 'committed',
    'userMessageId', v_user_row.id,
    'assistantMessageId', v_assistant_row.id,
    'userSequence', v_user_row.server_sequence,
    'assistantSequence', v_assistant_row.server_sequence,
    'sessionId', v_live.session_id,
    'contextThroughSequence', v_live.context_through_sequence
  );
end;
$$;

revoke execute on function public.commit_live_turn(
  uuid, uuid, uuid, uuid, uuid, text, text, integer, text, boolean, text, jsonb
) from public, anon, authenticated;
grant execute on function public.commit_live_turn(
  uuid, uuid, uuid, uuid, uuid, text, text, integer, text, boolean, text, jsonb
) to service_role;

create or replace function public.claim_live_rubric_lookup(
  p_live_session_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live public.live_chat_sessions%rowtype;
  v_existing public.live_chat_rubric_lookups%rowtype;
  v_inserted boolean := false;
begin
  if p_live_session_id is null or p_request_id is null then
    raise exception 'Lookup claim identity fields are required'
      using errcode = '22023';
  end if;

  select *
  into v_live
  from public.live_chat_sessions
  where id = p_live_session_id
  for update;
  if not found then
    raise exception 'Live session not found' using errcode = 'P0002';
  end if;
  if v_live.status in ('finished', 'failed') then
    return jsonb_build_object(
      'action', 'error',
      'errorStatus', 409,
      'errorMessage', 'Live session is already closed',
      'rubricLookupCount', v_live.rubric_lookup_count,
      'rubricLookupCap', v_live.rubric_lookup_cap
    );
  end if;

  select *
  into v_existing
  from public.live_chat_rubric_lookups
  where live_session_id = p_live_session_id
    and request_id = p_request_id;
  if found then
    return jsonb_build_object(
      'action', 'replay',
      'allowed', true,
      'rubricLookupCount', v_live.rubric_lookup_count,
      'rubricLookupCap', v_live.rubric_lookup_cap
    );
  end if;

  if v_live.rubric_lookup_count >= v_live.rubric_lookup_cap then
    return jsonb_build_object(
      'action', 'denied',
      'allowed', false,
      'errorStatus', 429,
      'errorMessage', 'Live rubric lookup cap reached',
      'rubricLookupCount', v_live.rubric_lookup_count,
      'rubricLookupCap', v_live.rubric_lookup_cap
    );
  end if;

  insert into public.live_chat_rubric_lookups (
    live_session_id,
    user_id,
    request_id
  )
  values (
    p_live_session_id,
    v_live.user_id,
    p_request_id
  )
  on conflict (live_session_id, request_id) do nothing;
  v_inserted := found;

  if not v_inserted then
    select *
    into v_live
    from public.live_chat_sessions
    where id = p_live_session_id;
    return jsonb_build_object(
      'action', 'replay',
      'allowed', true,
      'rubricLookupCount', v_live.rubric_lookup_count,
      'rubricLookupCap', v_live.rubric_lookup_cap
    );
  end if;

  update public.live_chat_sessions
  set rubric_lookup_count = rubric_lookup_count + 1
  where id = p_live_session_id
  returning * into v_live;

  return jsonb_build_object(
    'action', 'claimed',
    'allowed', true,
    'rubricLookupCount', v_live.rubric_lookup_count,
    'rubricLookupCap', v_live.rubric_lookup_cap
  );
end;
$$;

revoke execute on function public.claim_live_rubric_lookup(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_live_rubric_lookup(uuid, uuid)
  to service_role;

create or replace function public.finish_live_chat_session(
  p_user_id uuid,
  p_live_session_id uuid,
  p_status text default 'finished',
  p_duration_seconds integer default null,
  p_resume_handle text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live public.live_chat_sessions%rowtype;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'finished');
begin
  if p_user_id is null or p_live_session_id is null then
    raise exception 'Live session identity fields are required'
      using errcode = '22023';
  end if;
  if v_status not in ('finished', 'failed', 'paused') then
    raise exception 'Invalid live session finish status' using errcode = '22023';
  end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'Duration must be non-negative' using errcode = '22023';
  end if;

  select *
  into v_live
  from public.live_chat_sessions
  where id = p_live_session_id
    and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Live session not found' using errcode = 'P0002';
  end if;

  if v_live.status in ('finished', 'failed') then
    return jsonb_build_object(
      'action', 'replay',
      'id', v_live.id,
      'status', v_live.status,
      'durationSeconds', v_live.duration_seconds,
      'finishedAt', v_live.finished_at,
      'resumeHandle', v_live.resume_handle,
      'sessionId', v_live.session_id
    );
  end if;

  update public.live_chat_sessions
  set
    status = v_status,
    duration_seconds = coalesce(p_duration_seconds, duration_seconds),
    resume_handle = coalesce(nullif(btrim(p_resume_handle), ''), resume_handle),
    finished_at = case
      when v_status in ('finished', 'failed') then coalesce(finished_at, clock_timestamp())
      else finished_at
    end
  where id = p_live_session_id
    and user_id = p_user_id
  returning * into v_live;

  if v_live.session_id is not null and p_duration_seconds is not null then
    update public.sessions
    set duration_seconds = p_duration_seconds
    where id = v_live.session_id
      and user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'action', 'finished',
    'id', v_live.id,
    'status', v_live.status,
    'durationSeconds', v_live.duration_seconds,
    'finishedAt', v_live.finished_at,
    'resumeHandle', v_live.resume_handle,
    'sessionId', v_live.session_id
  );
end;
$$;

revoke execute on function public.finish_live_chat_session(
  uuid, uuid, text, integer, text
) from public, anon, authenticated;
grant execute on function public.finish_live_chat_session(
  uuid, uuid, text, integer, text
) to service_role;
