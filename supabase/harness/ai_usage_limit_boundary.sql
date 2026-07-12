do $$
declare
  v_user uuid := gen_random_uuid();
  v_ok int := 0;
  v_i int;
  v_result jsonb;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user, 'authenticated', 'authenticated',
    'limit2-' || v_user::text || '@example.com',
    crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  insert into public.profiles (id, email, name, initials, ai_daily_limit)
  values (v_user, 'limit2-' || v_user::text || '@example.com', 'L2', 'L', 2)
  on conflict (id) do update set ai_daily_limit = 2;

  for v_i in 1..3 loop
    v_result := public.consume_ai_request(v_user);
    if (v_result->>'allowed')::boolean then
      v_ok := v_ok + 1;
    end if;
  end loop;

  if v_ok <> 2 then
    raise exception 'expected 2 allowed, got % last=%', v_ok, v_result;
  end if;

  delete from public.ai_usage where user_id = v_user;
  delete from public.profiles where id = v_user;
  delete from auth.users where id = v_user;
end;
$$;
