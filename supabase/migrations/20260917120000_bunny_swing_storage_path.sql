-- Store a raw copy path for reliable coach downloads (Bunny CDN may block /original).
alter table public.bunny_student_swings
  add column if not exists storage_path text;

-- Allow authenticated users to upload/read/delete their swing files in the existing bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'swing-submissions',
  'swing-submissions',
  false,
  209715200,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'application/octet-stream']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "swing_submissions_select_authenticated" on storage.objects;
create policy "swing_submissions_select_authenticated"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'swing-submissions');

drop policy if exists "swing_submissions_insert_authenticated" on storage.objects;
create policy "swing_submissions_insert_authenticated"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'swing-submissions');

drop policy if exists "swing_submissions_delete_authenticated" on storage.objects;
create policy "swing_submissions_delete_authenticated"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'swing-submissions');
