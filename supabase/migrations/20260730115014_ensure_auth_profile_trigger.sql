-- Remote Supabase already has this trigger, but schema-only baselines can omit
-- triggers owned by the auth schema. Recreate it only when missing so a fresh
-- local stack always produces the profile rows required by StudyPilot FKs.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end
$$;

-- Repair users created locally before this migration was applied. Hosted
-- projects with a complete trigger already have matching rows, so this is a
-- no-op there.
insert into public.profiles (
  id,
  name,
  email,
  initials,
  theme,
  default_coach_mode
)
select
  users.id,
  coalesce(
    users.raw_user_meta_data ->> 'name',
    split_part(users.email, '@', 1)
  ),
  users.email,
  upper(substring(
    coalesce(users.raw_user_meta_data ->> 'name', users.email)
    from 1 for 1
  )),
  'dark',
  'essay'
from auth.users as users
where users.email is not null
  and not exists (
    select 1
    from public.profiles as profiles
    where profiles.id = users.id
  )
on conflict (id) do nothing;
