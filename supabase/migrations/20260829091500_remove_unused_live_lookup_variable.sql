-- Keep the live-rubric lookup claim function warning-free without changing its
-- locking, idempotency, or quota behavior.
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

  perform 1
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
