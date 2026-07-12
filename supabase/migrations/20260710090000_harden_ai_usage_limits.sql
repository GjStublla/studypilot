-- Harden AI usage limits: UTC day keys, auth.users FK, invoker read RPC.

-- Prefer auth.users so usage can be recorded even if a profile row is missing.
alter table public.ai_usage
  drop constraint if exists ai_usage_user_id_fkey;

alter table public.ai_usage
  add constraint ai_usage_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Keep the column default aligned with the RPC's UTC day selection.
alter table public.ai_usage
  alter column usage_date set default ((now() at time zone 'utc')::date);

create or replace function public.consume_ai_request(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_used integer;
  v_count integer;
  v_today date := (now() at time zone 'utc')::date;
begin
  select coalesce(
    (
      select profiles.ai_daily_limit
      from public.profiles
      where profiles.id = p_user_id
    ),
    50
  ) into v_limit;

  select coalesce(
    (
      select ai_usage.request_count
      from public.ai_usage
      where ai_usage.user_id = p_user_id
        and ai_usage.usage_date = v_today
    ),
    0
  ) into v_used;

  if v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  end if;

  insert into public.ai_usage (user_id, usage_date, request_count)
  values (p_user_id, v_today, 1)
  on conflict (user_id, usage_date) do update
    set request_count = ai_usage.request_count + 1,
        updated_at = now()
    where ai_usage.request_count < v_limit
  returning request_count into v_count;

  if v_count is null then
    select coalesce(
      (
        select ai_usage.request_count
        from public.ai_usage
        where ai_usage.user_id = p_user_id
          and ai_usage.usage_date = v_today
      ),
      0
    ) into v_used;

    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_count, 'limit', v_limit);
end;
$$;

-- Recreate as SECURITY INVOKER so reads honor caller RLS on ai_usage/profiles.
create or replace function public.get_ai_usage()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_used integer;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  select coalesce(
    (
      select profiles.ai_daily_limit
      from public.profiles
      where profiles.id = v_user_id
    ),
    50
  ) into v_limit;

  select coalesce(
    (
      select ai_usage.request_count
      from public.ai_usage
      where ai_usage.user_id = v_user_id
        and ai_usage.usage_date = v_today
    ),
    0
  ) into v_used;

  return jsonb_build_object('used', v_used, 'limit', v_limit);
end;
$$;

revoke all on table public.ai_usage from anon;
revoke insert, update, delete, truncate, references, trigger on table public.ai_usage from authenticated;
grant select on table public.ai_usage to authenticated;

revoke execute on function public.consume_ai_request(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_request(uuid) to service_role;

revoke execute on function public.get_ai_usage() from public, anon;
grant execute on function public.get_ai_usage() to authenticated;
