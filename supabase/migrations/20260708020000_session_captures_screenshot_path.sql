alter table public.sessions
  add column if not exists screenshot_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-captures',
  'session-captures',
  false,
  2097152,
  array['image/jpeg']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Students can upload own session captures"
on storage.objects;

create policy "Students can upload own session captures"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'session-captures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students can read own session captures"
on storage.objects;

create policy "Students can read own session captures"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'session-captures'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
