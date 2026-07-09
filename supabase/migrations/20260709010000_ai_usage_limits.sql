-- Per-user daily limit. Subscription tiers can override this value later.
alter table public.profiles
  add column if not exists ai_daily_limit integer not null default 50;

-- One row per user per UTC day. Writes are limited to the privileged RPC.
create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_usage enable row level security;

drop policy if exists "Users read own ai usage" on public.ai_usage;
create policy "Users read own ai usage"
  on public.ai_usage
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- New Supabase projects often grant broad table privileges to anon/authenticated.
-- Keep this read-only for authenticated users; all writes go through consume_ai_request().
revoke all on table public.ai_usage from anon;
revoke insert, update, delete, truncate, references, trigger on table public.ai_usage from authenticated;
grant select on table public.ai_usage to authenticated;

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
        and ai_usage.usage_date = current_date
    ),
    0
  ) into v_used;

  if v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  end if;

  insert into public.ai_usage (user_id, usage_date, request_count)
  values (p_user_id, current_date, 1)
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
          and ai_usage.usage_date = current_date
      ),
      0
    ) into v_used;

    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_count, 'limit', v_limit);
end;
$$;

create or replace function public.get_ai_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_used integer;
begin
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
        and ai_usage.usage_date = current_date
    ),
    0
  ) into v_used;

  return jsonb_build_object('used', v_used, 'limit', v_limit);
end;
$$;

revoke execute on function public.consume_ai_request(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_request(uuid) to service_role;

revoke execute on function public.get_ai_usage() from public, anon, authenticated;
grant execute on function public.get_ai_usage() to authenticated;
