-- Canonical cross-surface chats and captured-session synchronization.
-- Existing clients remain rollout-compatible: chat message session_id and
-- nullable legacy request_id are retained, while a compatibility trigger
-- attaches old chat-less writes before canonical constraints are checked.

alter table public.dashboard_chats
  add column if not exists origin_surface text not null default 'dashboard',
  add column if not exists client_key text;

alter table public.dashboard_chat_messages
  add column if not exists origin_surface text not null default 'legacy',
  add column if not exists request_id uuid,
  add column if not exists server_sequence bigint;

alter table public.session_messages
  add column if not exists server_sequence bigint;

-- Adding an identity directly assigns legacy rows in heap order. Backfill first
-- so canonical history is deterministic, then advance each identity without
-- ever rewinding a sequence that may already have served values.
do $$
declare
  v_is_identity text;
  v_sequence text;
  v_max bigint;
  v_last bigint;
  v_called boolean;
  v_next bigint;
begin
  select attribute.attidentity
  into v_is_identity
  from pg_attribute as attribute
  where attribute.attrelid = 'public.dashboard_chat_messages'::regclass
    and attribute.attname = 'server_sequence'
    and not attribute.attisdropped;

  if coalesce(v_is_identity, '') = '' then
    with sequence_base as (
      select coalesce(max(server_sequence), 0) as value
      from public.dashboard_chat_messages
    ), ranked as (
      select
        message.id,
        sequence_base.value + row_number() over (
          order by message.created_at asc nulls last, message.id
        ) as value
      from public.dashboard_chat_messages as message
      cross join sequence_base
      where message.server_sequence is null
    )
    update public.dashboard_chat_messages as message
    set server_sequence = ranked.value
    from ranked
    where message.id = ranked.id;

    alter table public.dashboard_chat_messages
      alter column server_sequence set not null;
    alter table public.dashboard_chat_messages
      alter column server_sequence add generated always as identity;
  end if;

  v_sequence := pg_get_serial_sequence(
    'public.dashboard_chat_messages',
    'server_sequence'
  );
  select coalesce(max(server_sequence), 0)
  into v_max
  from public.dashboard_chat_messages;
  execute format(
    'select last_value, is_called from %s',
    v_sequence::regclass
  ) into v_last, v_called;
  v_next := greatest(
    v_max + 1,
    case when v_called then v_last + 1 else v_last end
  );
  perform pg_catalog.setval(v_sequence::regclass, v_next, false);
end
$$;

do $$
declare
  v_is_identity text;
  v_sequence text;
  v_max bigint;
  v_last bigint;
  v_called boolean;
  v_next bigint;
begin
  select attribute.attidentity
  into v_is_identity
  from pg_attribute as attribute
  where attribute.attrelid = 'public.session_messages'::regclass
    and attribute.attname = 'server_sequence'
    and not attribute.attisdropped;

  if coalesce(v_is_identity, '') = '' then
    with sequence_base as (
      select coalesce(max(server_sequence), 0) as value
      from public.session_messages
    ), ranked as (
      select
        message.id,
        sequence_base.value + row_number() over (
          order by
            message.time_offset_seconds asc,
            message.created_at asc nulls last,
            message.id
        ) as value
      from public.session_messages as message
      cross join sequence_base
      where message.server_sequence is null
    )
    update public.session_messages as message
    set server_sequence = ranked.value
    from ranked
    where message.id = ranked.id;

    alter table public.session_messages
      alter column server_sequence set not null;
    alter table public.session_messages
      alter column server_sequence add generated always as identity;
  end if;

  v_sequence := pg_get_serial_sequence(
    'public.session_messages',
    'server_sequence'
  );
  select coalesce(max(server_sequence), 0)
  into v_max
  from public.session_messages;
  execute format(
    'select last_value, is_called from %s',
    v_sequence::regclass
  ) into v_last, v_called;
  v_next := greatest(
    v_max + 1,
    case when v_called then v_last + 1 else v_last end
  );
  perform pg_catalog.setval(v_sequence::regclass, v_next, false);
end
$$;

alter table public.sessions
  add column if not exists updated_at timestamptz;

update public.sessions
set updated_at = coalesce(created_at, when_timestamp, now())
where updated_at is null;

alter table public.sessions
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chats'::regclass
      and conname = 'dashboard_chats_origin_surface_check'
  ) then
    alter table public.dashboard_chats
      add constraint dashboard_chats_origin_surface_check
      check (origin_surface in ('dashboard', 'extension', 'legacy')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chat_messages'::regclass
      and conname = 'dashboard_chat_messages_origin_surface_check'
  ) then
    alter table public.dashboard_chat_messages
      add constraint dashboard_chat_messages_origin_surface_check
      check (origin_surface in ('dashboard', 'extension', 'legacy')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chat_messages'::regclass
      and conname = 'dashboard_chat_messages_canonical_fields_check'
  ) then
    alter table public.dashboard_chat_messages
      add constraint dashboard_chat_messages_canonical_fields_check
      check (
        origin_surface = 'legacy'
        or (chat_id is not null and request_id is not null)
      ) not valid;
  end if;
end
$$;

alter table public.dashboard_chats
  validate constraint dashboard_chats_origin_surface_check;

alter table public.dashboard_chat_messages
  validate constraint dashboard_chat_messages_origin_surface_check;

alter table public.dashboard_chat_messages
  validate constraint dashboard_chat_messages_canonical_fields_check;

-- Repair relationship rows that predate owner-matching foreign keys.
update public.sessions as session_row
set rubric_id = null
where rubric_id is not null
  and not exists (
    select 1
    from public.rubrics as rubric
    where rubric.id = session_row.rubric_id
      and rubric.user_id = session_row.user_id
  );

update public.dashboard_chats as chat
set session_id = null
where session_id is not null
  and not exists (
    select 1
    from public.sessions as session_row
    where session_row.id = chat.session_id
      and session_row.user_id = chat.user_id
  );

update public.dashboard_chat_messages as message
set chat_id = null
where chat_id is not null
  and not exists (
    select 1
    from public.dashboard_chats as chat
    where chat.id = message.chat_id
      and chat.user_id = message.user_id
  );

update public.dashboard_chat_messages as message
set session_id = null
where session_id is not null
  and not exists (
    select 1
    from public.sessions as session_row
    where session_row.id = message.session_id
      and session_row.user_id = message.user_id
  );

-- Parent composite keys allow foreign keys to enforce ownership as well as ID.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rubrics'::regclass
      and conname = 'rubrics_id_user_id_key'
  ) then
    alter table public.rubrics
      add constraint rubrics_id_user_id_key unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sessions'::regclass
      and conname = 'sessions_id_user_id_key'
  ) then
    alter table public.sessions
      add constraint sessions_id_user_id_key unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_chats'::regclass
      and conname = 'dashboard_chats_id_user_id_key'
  ) then
    alter table public.dashboard_chats
      add constraint dashboard_chats_id_user_id_key unique (id, user_id);
  end if;
end
$$;

-- Consolidate historical duplicate session-linked chats before adding the
-- unique partial index. Keep the most recently active chat as canonical.
with ranked as (
  select
    id,
    first_value(id) over (
      partition by user_id, session_id
      order by updated_at desc nulls last, created_at desc nulls last, id
    ) as canonical_id,
    row_number() over (
      partition by user_id, session_id
      order by updated_at desc nulls last, created_at desc nulls last, id
    ) as position
  from public.dashboard_chats
  where session_id is not null
), duplicates as (
  select id, canonical_id from ranked where position > 1
)
update public.dashboard_chat_messages as message
set chat_id = duplicate.canonical_id
from duplicates as duplicate
where message.chat_id = duplicate.id;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, session_id
      order by updated_at desc nulls last, created_at desc nulls last, id
    ) as position
  from public.dashboard_chats
  where session_id is not null
)
delete from public.dashboard_chats as chat
using ranked
where chat.id = ranked.id
  and ranked.position > 1;

create unique index if not exists dashboard_chats_user_session_key
  on public.dashboard_chats (user_id, session_id)
  where session_id is not null;

create unique index if not exists dashboard_chats_user_client_key
  on public.dashboard_chats (user_id, client_key)
  where client_key is not null;

-- Backfill legacy chat-less messages into one chat per owned session and one
-- deterministic general legacy chat per user when no session is available.
insert into public.dashboard_chats (
  id,
  user_id,
  session_id,
  title,
  origin_surface,
  created_at,
  updated_at
)
select
  extensions.uuid_generate_v4(),
  message.user_id,
  message.session_id,
  coalesce(max(session_row.title), 'Imported legacy chat'),
  'legacy',
  min(coalesce(message.created_at, now())),
  max(coalesce(message.created_at, now()))
from public.dashboard_chat_messages as message
join public.sessions as session_row
  on session_row.id = message.session_id
 and session_row.user_id = message.user_id
where message.chat_id is null
  and message.session_id is not null
  and message.origin_surface = 'legacy'
group by message.user_id, message.session_id
on conflict (user_id, session_id) where session_id is not null do nothing;

insert into public.dashboard_chats (
  id,
  user_id,
  session_id,
  title,
  origin_surface,
  client_key,
  created_at,
  updated_at
)
select
  extensions.uuid_generate_v4(),
  message.user_id,
  null,
  'Imported legacy chat',
  'legacy',
  'legacy-general',
  min(coalesce(message.created_at, now())),
  max(coalesce(message.created_at, now()))
from public.dashboard_chat_messages as message
where message.chat_id is null
  and message.session_id is null
  and message.origin_surface = 'legacy'
group by message.user_id
on conflict (user_id, client_key) where client_key is not null do nothing;

update public.dashboard_chat_messages as message
set chat_id = chat.id
from public.dashboard_chats as chat
where message.chat_id is null
  and message.origin_surface = 'legacy'
  and chat.user_id = message.user_id
  and (
    (message.session_id is not null and chat.session_id = message.session_id)
    or
    (message.session_id is null and chat.client_key = 'legacy-general')
  );

-- The chat is authoritative for the deprecated message-level session link.
update public.dashboard_chat_messages as message
set session_id = chat.session_id
from public.dashboard_chats as chat
where chat.id = message.chat_id
  and chat.user_id = message.user_id
  and message.session_id is distinct from chat.session_id;

do $$
begin
  if exists (select 1 from public.dashboard_chat_messages where chat_id is null) then
    raise exception 'Could not assign every legacy dashboard chat message to a canonical chat';
  end if;
end
$$;

-- Replace ID-only relationships with owner-matching foreign keys. The
-- message-level session constraint remains during the rollout for old clients.
alter table public.sessions
  drop constraint if exists sessions_rubric_id_fkey;
alter table public.dashboard_chats
  drop constraint if exists dashboard_chats_session_id_fkey;
alter table public.dashboard_chat_messages
  drop constraint if exists dashboard_chat_messages_chat_id_fkey;
alter table public.dashboard_chat_messages
  drop constraint if exists dashboard_chat_messages_session_id_fkey;

alter table public.sessions
  add constraint sessions_rubric_owner_fkey
  foreign key (rubric_id, user_id)
  references public.rubrics (id, user_id)
  on delete set null (rubric_id)
  not valid;

alter table public.dashboard_chats
  add constraint dashboard_chats_session_owner_fkey
  foreign key (session_id, user_id)
  references public.sessions (id, user_id)
  on delete set null (session_id)
  not valid;

alter table public.dashboard_chat_messages
  add constraint dashboard_chat_messages_chat_owner_fkey
  foreign key (chat_id, user_id)
  references public.dashboard_chats (id, user_id)
  on delete cascade
  not valid;

alter table public.dashboard_chat_messages
  add constraint dashboard_chat_messages_session_owner_fkey
  foreign key (session_id, user_id)
  references public.sessions (id, user_id)
  on delete set null (session_id)
  not valid;

alter table public.sessions validate constraint sessions_rubric_owner_fkey;
alter table public.dashboard_chats validate constraint dashboard_chats_session_owner_fkey;
alter table public.dashboard_chat_messages validate constraint dashboard_chat_messages_chat_owner_fkey;
alter table public.dashboard_chat_messages validate constraint dashboard_chat_messages_session_owner_fkey;

-- The previous Edge Function writes legacy rows with chat_id = NULL. Keep a
-- DB-first rollout safe by attaching those rows before constraints run. The
-- no-op conflict updates serialize concurrent first writes and RETURNING gives
-- every contender the same canonical chat ID.
create or replace function public.attach_legacy_dashboard_chat()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.chat_id is not null or new.origin_surface <> 'legacy' then
    return new;
  end if;

  if new.session_id is not null then
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
    on conflict (user_id, session_id) where session_id is not null
    do update set session_id = excluded.session_id
    returning id into new.chat_id;

    if new.chat_id is null then
      raise exception 'Legacy message session is not owned by the message user'
        using errcode = '23503';
    end if;
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

drop trigger if exists attach_legacy_dashboard_chat_on_message
  on public.dashboard_chat_messages;
create trigger attach_legacy_dashboard_chat_on_message
before insert on public.dashboard_chat_messages
for each row execute function public.attach_legacy_dashboard_chat();

alter table public.dashboard_chat_messages
  alter column chat_id set not null;

create unique index if not exists dashboard_chat_messages_server_sequence_key
  on public.dashboard_chat_messages (server_sequence);
create index if not exists idx_dashboard_chat_messages_chat_sequence
  on public.dashboard_chat_messages (chat_id, server_sequence, id);
create unique index if not exists dashboard_chat_messages_request_role_key
  on public.dashboard_chat_messages (chat_id, request_id, role)
  where chat_id is not null and request_id is not null;

create unique index if not exists session_messages_server_sequence_key
  on public.session_messages (server_sequence);
create index if not exists idx_session_messages_session_sequence
  on public.session_messages (session_id, time_offset_seconds, server_sequence, id);
create index if not exists idx_sessions_user_updated
  on public.sessions (user_id, updated_at desc, id);

-- A service-only claim separates retry idempotency from visible messages. This
-- prevents a denied prompt from being persisted and prevents concurrent retry
-- requests from each consuming quota or calling Gemini.
create table if not exists public.dashboard_chat_turns (
  user_id uuid not null,
  id uuid not null,
  chat_id uuid not null,
  request_hash text not null,
  origin_surface text not null,
  status text not null default 'pending',
  user_message_id uuid not null default extensions.uuid_generate_v4(),
  assistant_message_id uuid not null default extensions.uuid_generate_v4(),
  error_status integer,
  error_message text,
  lease_token uuid,
  lease_expires_at timestamptz,
  quota_consumed_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, id),
  unique (user_message_id),
  unique (assistant_message_id),
  constraint dashboard_chat_turns_origin_surface_check
    check (origin_surface in ('dashboard', 'extension', 'legacy')),
  constraint dashboard_chat_turns_status_check
    check (status in ('pending', 'completed', 'failed', 'rejected')),
  constraint dashboard_chat_turns_error_status_check
    check (error_status is null or error_status between 400 and 599),
  constraint dashboard_chat_turns_attempt_count_check
    check (attempt_count >= 0),
  constraint dashboard_chat_turns_chat_owner_fkey
    foreign key (chat_id, user_id)
    references public.dashboard_chats (id, user_id)
    on delete cascade
);

alter table public.dashboard_chat_turns
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists quota_consumed_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dashboard_chat_turns'::regclass
      and conname = 'dashboard_chat_turns_attempt_count_check'
  ) then
    alter table public.dashboard_chat_turns
      add constraint dashboard_chat_turns_attempt_count_check
      check (attempt_count >= 0);
  end if;
end;
$$;

-- Pre-hardening pending requests may already have consumed quota. Assuming
-- they did is the cost-safe reconciliation choice and prevents retry billing.
update public.dashboard_chat_turns
set quota_consumed_at = coalesce(quota_consumed_at, created_at)
where status = 'pending'
  and quota_consumed_at is null;

create index if not exists idx_dashboard_chat_turns_chat_created
  on public.dashboard_chat_turns (chat_id, created_at, id);
create index if not exists idx_dashboard_chat_turns_pending_lease
  on public.dashboard_chat_turns (lease_expires_at, user_id, id)
  where status = 'pending';

alter table public.dashboard_chat_turns enable row level security;

drop trigger if exists set_timestamp_sessions on public.sessions;
create trigger set_timestamp_sessions
before update on public.sessions
for each row execute function public.trigger_set_timestamp();

drop trigger if exists set_timestamp_dashboard_chat_turns on public.dashboard_chat_turns;
create trigger set_timestamp_dashboard_chat_turns
before update on public.dashboard_chat_turns
for each row execute function public.trigger_set_timestamp();

-- Claim or replay a deterministic turn. The row lock serializes duplicate
-- callers; quota reservation and the visible user row share this transaction.
-- A stale lease can be taken over without consuming quota again.
create or replace function public.start_ai_chat_turn(
  p_user_id uuid,
  p_request_id uuid,
  p_chat_id uuid,
  p_request_hash text,
  p_origin_surface text,
  p_user_message text,
  p_skip_quota boolean default false
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
  v_created boolean := false;
  v_lease_token uuid;
  v_usage jsonb;
  v_error_message text;
  v_retry_after integer;
begin
  if p_user_id is null or p_request_id is null or p_chat_id is null then
    raise exception 'Turn identity fields are required' using errcode = '22023';
  end if;
  if nullif(btrim(p_request_hash), '') is null then
    raise exception 'request hash is required' using errcode = '22023';
  end if;
  if nullif(btrim(p_user_message), '') is null then
    raise exception 'user message is required' using errcode = '22023';
  end if;
  if p_origin_surface not in ('dashboard', 'extension', 'legacy') then
    raise exception 'Invalid origin surface' using errcode = '22023';
  end if;

  select chat.session_id
  into v_session_id
  from public.dashboard_chats as chat
  where chat.id = p_chat_id
    and chat.user_id = p_user_id;
  if not found then
    raise exception 'Chat not found' using errcode = 'P0002';
  end if;

  insert into public.dashboard_chat_turns (
    user_id,
    id,
    chat_id,
    request_hash,
    origin_surface,
    status
  )
  values (
    p_user_id,
    p_request_id,
    p_chat_id,
    p_request_hash,
    p_origin_surface,
    'pending'
  )
  on conflict (user_id, id) do nothing
  returning * into v_turn;
  v_created := found;

  if not v_created then
    select *
    into v_turn
    from public.dashboard_chat_turns
    where user_id = p_user_id
      and id = p_request_id
    for update;
  end if;

  if v_turn.id is null then
    raise exception 'Unable to claim AI turn';
  end if;

  if v_turn.chat_id is distinct from p_chat_id
    or v_turn.request_hash is distinct from p_request_hash
    or v_turn.origin_surface is distinct from p_origin_surface
  then
    return jsonb_build_object(
      'action', 'conflict',
      'errorStatus', 409,
      'errorMessage', 'requestId was already used for a different request'
    );
  end if;

  select *
  into v_user_row
  from public.dashboard_chat_messages
  where id = v_turn.user_message_id;

  if v_user_row.id is not null and (
    v_user_row.user_id is distinct from p_user_id
    or v_user_row.chat_id is distinct from p_chat_id
    or v_user_row.request_id is distinct from p_request_id
    or v_user_row.origin_surface is distinct from p_origin_surface
    or v_user_row.role is distinct from 'user'
    or v_user_row.text is distinct from p_user_message
  ) then
    return jsonb_build_object(
      'action', 'conflict',
      'errorStatus', 409,
      'errorMessage', 'Persisted user message does not match this request'
    );
  end if;

  select *
  into v_assistant_row
  from public.dashboard_chat_messages
  where id = v_turn.assistant_message_id;

  -- Durable message rows are authoritative after a pre-hardening crash.
  if v_assistant_row.id is not null then
    if v_user_row.id is null
      or v_assistant_row.user_id is distinct from p_user_id
      or v_assistant_row.chat_id is distinct from p_chat_id
      or v_assistant_row.request_id is distinct from p_request_id
      or v_assistant_row.origin_surface is distinct from p_origin_surface
      or v_assistant_row.role is distinct from 'ai'
      or nullif(btrim(v_assistant_row.text), '') is null
    then
      v_error_message := 'Persisted AI request rows are incomplete';
      update public.dashboard_chat_turns
      set
        status = 'failed',
        error_status = 503,
        error_message = v_error_message,
        lease_expires_at = null
      where user_id = p_user_id
        and id = p_request_id;
      return jsonb_build_object(
        'action', 'error',
        'errorStatus', 503,
        'errorMessage', v_error_message
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
      'action', 'replay',
      'userMessageId', v_turn.user_message_id,
      'assistantMessageId', v_turn.assistant_message_id,
      'userSequence', v_user_row.server_sequence,
      'assistantSequence', v_assistant_row.server_sequence,
      'assistantText', v_assistant_row.text
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

  if not v_created
    and v_turn.lease_token is not null
    and v_turn.lease_expires_at > clock_timestamp()
  then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (
        v_turn.lease_expires_at - clock_timestamp()
      )))::integer
    );
    return jsonb_build_object(
      'action', 'in_progress',
      'retryAfterSeconds', v_retry_after
    );
  end if;

  if v_turn.quota_consumed_at is null then
    if coalesce(p_skip_quota, false) then
      v_usage := jsonb_build_object(
        'allowed', true,
        'used', 0,
        'limit', 50
      );
    else
      begin
        v_usage := public.consume_ai_request(p_user_id);
        if jsonb_typeof(v_usage) is distinct from 'object'
          or jsonb_typeof(v_usage -> 'allowed') is distinct from 'boolean'
          or jsonb_typeof(v_usage -> 'used') is distinct from 'number'
          or jsonb_typeof(v_usage -> 'limit') is distinct from 'number'
        then
          raise exception 'Malformed quota response';
        end if;
      exception when others then
        v_error_message :=
          'AI usage tracking is temporarily unavailable. Please try again in a moment.';
        update public.dashboard_chat_turns
        set
          status = 'rejected',
          error_status = 503,
          error_message = v_error_message,
          lease_token = null,
          lease_expires_at = null
        where user_id = p_user_id
          and id = p_request_id;
        return jsonb_build_object(
          'action', 'error',
          'errorStatus', 503,
          'errorMessage', v_error_message
        );
      end;
    end if;

    if not (v_usage ->> 'allowed')::boolean then
      v_error_message := format(
        'Daily AI limit reached (%s of %s used). Your limit resets at midnight UTC.',
        v_usage ->> 'used',
        v_usage ->> 'limit'
      );
      update public.dashboard_chat_turns
      set
        status = 'rejected',
        error_status = 429,
        error_message = v_error_message,
        lease_token = null,
        lease_expires_at = null
      where user_id = p_user_id
        and id = p_request_id;
      return jsonb_build_object(
        'action', 'error',
        'errorStatus', 429,
        'errorMessage', v_error_message,
        'usage', v_usage
      );
    end if;
  end if;

  if v_user_row.id is null then
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
      v_turn.user_message_id,
      p_user_id,
      p_chat_id,
      v_session_id,
      p_request_id,
      p_origin_surface,
      'user',
      p_user_message
    )
    returning * into v_user_row;
  end if;

  v_lease_token := extensions.uuid_generate_v4();
  update public.dashboard_chat_turns
  set
    status = 'pending',
    error_status = null,
    error_message = null,
    completed_at = null,
    lease_token = v_lease_token,
    lease_expires_at = clock_timestamp() + interval '15 minutes',
    quota_consumed_at = coalesce(quota_consumed_at, clock_timestamp()),
    attempt_count = attempt_count + 1
  where user_id = p_user_id
    and id = p_request_id
  returning * into v_turn;

  return jsonb_build_object(
    'action', 'start',
    'leaseToken', v_turn.lease_token,
    'leaseExpiresAt', v_turn.lease_expires_at,
    'attemptCount', v_turn.attempt_count,
    'userMessageId', v_turn.user_message_id,
    'assistantMessageId', v_turn.assistant_message_id,
    'userSequence', v_user_row.server_sequence,
    'usage', v_usage
  );
end;
$$;

-- Fence the worker by its current lease. Successful completion inserts the
-- assistant row and flips the claim in this same database transaction.
create or replace function public.finish_ai_chat_turn(
  p_user_id uuid,
  p_request_id uuid,
  p_lease_token uuid,
  p_outcome text,
  p_assistant_text text,
  p_error_status integer,
  p_error_message text
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

  -- An already durable pair wins over a late failure or an ambiguous RPC
  -- response. Returning it is safe even for an old fenced worker.
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
      'assistantText', v_assistant_row.text
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
    text
  )
  values (
    v_turn.assistant_message_id,
    v_turn.user_id,
    v_turn.chat_id,
    v_session_id,
    v_turn.id,
    v_turn.origin_surface,
    'ai',
    btrim(p_assistant_text)
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
    'assistantText', v_assistant_row.text
  );
end;
$$;

revoke execute on function public.start_ai_chat_turn(
  uuid, uuid, uuid, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.start_ai_chat_turn(
  uuid, uuid, uuid, text, text, text, boolean
) to service_role;

revoke execute on function public.finish_ai_chat_turn(
  uuid, uuid, uuid, text, text, integer, text
) from public, anon, authenticated;
grant execute on function public.finish_ai_chat_turn(
  uuid, uuid, uuid, text, text, integer, text
) to service_role;

create or replace function public.touch_dashboard_chat()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.dashboard_chats
  set updated_at = now()
  where id = new.chat_id
    and user_id = new.user_id;
  return new;
end;
$$;

revoke execute on function public.touch_dashboard_chat() from public, anon, authenticated;
grant execute on function public.touch_dashboard_chat() to service_role;

-- Authenticated clients use one concurrency-safe operation when opening a
-- captured session in chat. A null session is reserved for legacy callers.
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
    if not exists (
      select 1
      from public.sessions
      where id = p_session_id
        and user_id = v_user_id
    ) then
      raise exception 'Session not found' using errcode = 'P0002';
    end if;

    insert into public.dashboard_chats (
      user_id,
      session_id,
      title,
      origin_surface,
      client_key
    )
    values (
      v_user_id,
      p_session_id,
      v_title,
      p_origin_surface,
      null
    )
    on conflict (user_id, session_id) where session_id is not null do nothing;

    select * into v_chat
    from public.dashboard_chats
    where user_id = v_user_id
      and session_id = p_session_id;
  end if;

  if v_chat.id is null then
    raise exception 'Unable to create session chat';
  end if;

  return jsonb_build_object(
    'id', v_chat.id,
    'user_id', v_chat.user_id,
    'session_id', v_chat.session_id,
    'title', v_chat.title,
    'origin_surface', v_chat.origin_surface,
    'client_key', v_chat.client_key,
    'created_at', v_chat.created_at,
    'updated_at', v_chat.updated_at
  );
end;
$$;

revoke execute on function public.get_or_create_session_chat(uuid, text, text)
  from public, anon;
grant execute on function public.get_or_create_session_chat(uuid, text, text)
  to authenticated, service_role;

-- Extension import creates chat and session with the same UUID, then links the
-- previously unlinked chat. Direct client UPDATE remains title-only; this
-- narrowly scoped definer RPC is the only authenticated relationship write.
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

  return jsonb_build_object(
    'id', v_chat.id,
    'user_id', v_chat.user_id,
    'session_id', v_chat.session_id,
    'title', v_chat.title,
    'origin_surface', v_chat.origin_surface,
    'client_key', v_chat.client_key,
    'created_at', v_chat.created_at,
    'updated_at', v_chat.updated_at
  );
end;
$$;

revoke execute on function public.link_dashboard_chat_session(uuid)
  from public, anon, service_role;
grant execute on function public.link_dashboard_chat_session(uuid)
  to authenticated;

-- Replace broad baseline privileges with the explicit operations needed by
-- authenticated clients. Message and turn mutations are service-only.
revoke all on table public.dashboard_chats from anon, authenticated;
revoke all on table public.dashboard_chat_messages from anon, authenticated;
revoke all on table public.dashboard_chat_turns from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.session_messages from anon, authenticated;

grant select, insert, delete on table public.dashboard_chats to authenticated;
grant update (title) on table public.dashboard_chats to authenticated;
grant select on table public.dashboard_chat_messages to authenticated;
grant select, insert, update, delete on table public.sessions to authenticated;
grant select, insert on table public.session_messages to authenticated;

grant all on table public.dashboard_chats to service_role;
grant all on table public.dashboard_chat_messages to service_role;
grant all on table public.dashboard_chat_turns to service_role;
grant all on table public.sessions to service_role;
grant all on table public.session_messages to service_role;

revoke all on sequence public.dashboard_chat_messages_server_sequence_seq
  from public, anon, authenticated;
grant usage, select on sequence public.dashboard_chat_messages_server_sequence_seq
  to service_role;

revoke all on sequence public.session_messages_server_sequence_seq
  from public, anon;
grant usage, select on sequence public.session_messages_server_sequence_seq
  to authenticated, service_role;

drop policy if exists "Students can view their own dashboard chats"
  on public.dashboard_chats;
drop policy if exists "Students can create their own dashboard chats"
  on public.dashboard_chats;
drop policy if exists "Students can update their own dashboard chats"
  on public.dashboard_chats;
drop policy if exists "Students can delete their own dashboard chats"
  on public.dashboard_chats;

create policy "Students can view their own dashboard chats"
on public.dashboard_chats for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Students can create their own dashboard chats"
on public.dashboard_chats for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Students can update their own dashboard chats"
on public.dashboard_chats for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Students can delete their own dashboard chats"
on public.dashboard_chats for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can view dashboard follow-up chat histories"
  on public.dashboard_chat_messages;
drop policy if exists "Students can post messages to dashboard follow-up chats"
  on public.dashboard_chat_messages;
drop policy if exists "Students can delete their own dashboard follow-up chat messages"
  on public.dashboard_chat_messages;

create policy "Students can view dashboard follow-up chat histories"
on public.dashboard_chat_messages for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can read their own imported sessions"
  on public.sessions;
drop policy if exists "Students can import new coaching sessions"
  on public.sessions;
drop policy if exists "Students can update their own sessions"
  on public.sessions;
drop policy if exists "Students can delete their own sessions"
  on public.sessions;

create policy "Students can read their own imported sessions"
on public.sessions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Students can import new coaching sessions"
on public.sessions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Students can update their own sessions"
on public.sessions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Students can delete their own sessions"
on public.sessions for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can read transcripts from their sessions"
  on public.session_messages;
drop policy if exists "Students can save messages into transcripts"
  on public.session_messages;

create policy "Students can read transcripts from their sessions"
on public.session_messages for select to authenticated
using (
  exists (
    select 1
    from public.sessions
    where sessions.id = session_messages.session_id
      and sessions.user_id = (select auth.uid())
  )
);

create policy "Students can save messages into transcripts"
on public.session_messages for insert to authenticated
with check (
  exists (
    select 1
    from public.sessions
    where sessions.id = session_messages.session_id
      and sessions.user_id = (select auth.uid())
  )
);

-- Supabase Postgres Changes requires explicit publication membership. Events
-- are cache invalidations only; clients still refetch on focus/reconnect.
do $$
declare
  v_table text;
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
      and puballtables
  ) then
    foreach v_table in array array[
      'sessions',
      'session_messages',
      'dashboard_chats',
      'dashboard_chat_messages',
      'knowledge_documents',
      'action_items',
      'rubrics'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          v_table
        );
      end if;
    end loop;
  end if;
end
$$;

drop policy if exists "Students can update own session captures"
  on storage.objects;

create policy "Students can update own session captures"
on storage.objects for update to authenticated
using (
  bucket_id = 'session-captures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'session-captures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
