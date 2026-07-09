create extension if not exists "uuid-ossp";

create table if not exists public.dashboard_chats (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  title text not null default 'New chat',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

grant select, insert, update, delete on table public.dashboard_chats to authenticated;

drop trigger if exists set_timestamp_dashboard_chats on public.dashboard_chats;
create trigger set_timestamp_dashboard_chats
before update on public.dashboard_chats
for each row execute function trigger_set_timestamp();

create index if not exists idx_dashboard_chats_user_updated
  on public.dashboard_chats(user_id, updated_at desc);

alter table public.dashboard_chats enable row level security;

drop policy if exists "Students can view their own dashboard chats" on public.dashboard_chats;
create policy "Students can view their own dashboard chats"
on public.dashboard_chats for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Students can create their own dashboard chats" on public.dashboard_chats;
create policy "Students can create their own dashboard chats"
on public.dashboard_chats for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can update their own dashboard chats" on public.dashboard_chats;
create policy "Students can update their own dashboard chats"
on public.dashboard_chats for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their own dashboard chats" on public.dashboard_chats;
create policy "Students can delete their own dashboard chats"
on public.dashboard_chats for delete
to authenticated
using ((select auth.uid()) = user_id);

alter table public.dashboard_chat_messages
  add column if not exists chat_id uuid references public.dashboard_chats(id) on delete cascade;

create index if not exists idx_chat_messages_chat
  on public.dashboard_chat_messages(chat_id);

drop policy if exists "Students can delete their own dashboard follow-up chat messages"
on public.dashboard_chat_messages;
create policy "Students can delete their own dashboard follow-up chat messages"
on public.dashboard_chat_messages for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.touch_dashboard_chat()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.dashboard_chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists touch_dashboard_chat_on_message on public.dashboard_chat_messages;
create trigger touch_dashboard_chat_on_message
after insert on public.dashboard_chat_messages
for each row when (new.chat_id is not null)
execute function public.touch_dashboard_chat();
