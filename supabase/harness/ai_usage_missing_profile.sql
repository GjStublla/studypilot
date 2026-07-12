do $$
declare
  v_user uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user, 'authenticated', 'authenticated',
    'noprofile-' || v_user::text || '@example.com',
    crypt('x', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  v_result := public.consume_ai_request(v_user);
  if not (v_result->>'allowed')::boolean then
    raise exception 'expected allow without profile, got %', v_result;
  end if;
  if (v_result->>'limit')::int <> 50 then
    raise exception 'expected default limit 50, got %', v_result;
  end if;

  delete from public.ai_usage where user_id = v_user;
  delete from auth.users where id = v_user;
end;
$$;
