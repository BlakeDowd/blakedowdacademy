-- Photos on coaching posts. Stored in a private bucket under "{student_id}/...", readable only by
-- that student and coaches (same visibility as the post itself).

alter table public.coaching_posts add column if not exists image_path text;

alter table public.coaching_posts drop constraint if exists coaching_posts_has_content;
alter table public.coaching_posts add constraint coaching_posts_has_content check (
  coalesce(trim(body), '') <> ''
  or bunny_video_id is not null
  or storage_path is not null
  or image_path is not null
);

alter table public.coaching_posts drop constraint if exists coaching_posts_image_in_space;
alter table public.coaching_posts add constraint coaching_posts_image_in_space check (
  image_path is null or split_part(image_path, '/', 1) = student_id::text
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coaching-photos',
  'coaching-photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "coaching_photos_select" on storage.objects;
create policy "coaching_photos_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'coaching-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach())
  );

drop policy if exists "coaching_photos_insert" on storage.objects;
create policy "coaching_photos_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'coaching-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach())
  );

drop policy if exists "coaching_photos_delete_coach" on storage.objects;
create policy "coaching_photos_delete_coach"
  on storage.objects for delete to authenticated
  using (bucket_id = 'coaching-photos' and public.is_coach());

notify pgrst, 'reload schema';
