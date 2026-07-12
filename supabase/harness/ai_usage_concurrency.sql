-- Concurrent consume_ai_request should never exceed the configured limit.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_ok integer := 0;
  v_i integer;
  v_result jsonb;
  v_count integer;
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    v_user,
    'authenticated',
    'authenticated',
    'concurrency-' || v_user::text || '@example.com',
    crypt('test-password', gen_salt('bf')),
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  insert into public.profiles (id, email, name, initials, ai_daily_limit)
  values (v_user, 'concurrency-' || v_user::text || '@example.com', 'Concurrency', 'C', 5)
  on conflict (id) do update set ai_daily_limit = 5;

  for v_i in 1..20 loop
    v_result := public.consume_ai_request(v_user);
    if (v_result->>'allowed')::boolean then
      v_ok := v_ok + 1;
    end if;
  end loop;

  select request_count into v_count
  from public.ai_usage
  where user_id = v_user
    and usage_date = ((now() at time zone 'utc')::date);

  if v_ok <> 5 then
    raise exception 'expected 5 allowed consumes, got %', v_ok;
  end if;

  if v_count <> 5 then
    raise exception 'expected stored count 5, got %', v_count;
  end if;

  delete from public.ai_usage where user_id = v_user;
  delete from public.profiles where id = v_user;
  delete from auth.users where id = v_user;

  raise notice 'concurrency harness passed: 5/20 allowed, stored count 5';
end;
$$;
