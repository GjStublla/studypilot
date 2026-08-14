-- Vertex-only RAG columns + service-role-safe chat rubric lock.

-- ---------------------------------------------------------------------------
-- Schema: Vertex RAG corpus / file resource names
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists vertex_rag_corpus_name text,
  add column if not exists vertex_rag_corpus_display_name text;

alter table public.knowledge_documents
  add column if not exists vertex_rag_corpus_name text,
  add column if not exists vertex_rag_file_name text;

create index if not exists idx_profiles_vertex_rag_corpus
  on public.profiles (vertex_rag_corpus_name)
  where vertex_rag_corpus_name is not null;

create index if not exists idx_knowledge_documents_vertex_rag_file
  on public.knowledge_documents (vertex_rag_file_name)
  where vertex_rag_file_name is not null;

-- ---------------------------------------------------------------------------
-- ensure_chat_rubric_locked: accept p_user_id for service_role callers
-- (Edge functions use the service-role client, so auth.uid() is null.)
-- ---------------------------------------------------------------------------
drop function if exists public.ensure_chat_rubric_locked(uuid);

create or replace function public.ensure_chat_rubric_locked(
  p_chat_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt_uid uuid := (select auth.uid());
  v_user_id uuid;
  v_chat public.dashboard_chats%rowtype;
  v_rubric_id uuid;
  v_is_service boolean := (
    coalesce(
      current_setting('request.jwt.claim.role', true),
      (select auth.role())
    ) = 'service_role'
  );
begin
  if p_chat_id is null then
    raise exception 'Chat id is required' using errcode = '22023';
  end if;

  if v_jwt_uid is not null then
    -- Invoker JWT path: ignore p_user_id; always bind to the authenticated user.
    v_user_id := v_jwt_uid;
  elsif v_is_service then
    if p_user_id is null then
      raise exception
        'p_user_id is required when calling ensure_chat_rubric_locked as service_role'
        using errcode = '22023';
    end if;
    v_user_id := p_user_id;
  else
    raise exception 'Authentication required' using errcode = '42501';
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

revoke execute on function public.ensure_chat_rubric_locked(uuid, uuid)
  from public, anon;
grant execute on function public.ensure_chat_rubric_locked(uuid, uuid)
  to authenticated, service_role;
