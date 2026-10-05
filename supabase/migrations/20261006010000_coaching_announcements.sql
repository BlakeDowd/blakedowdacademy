-- Coach announcements to every player (weekly games, free-lesson draws, etc.).
-- The announcement is visible to all signed-in players; replies are ordinary coaching_posts rows
-- tagged with announcement_id, so each player's reply stays private between them and coaches.

create table if not exists public.coaching_announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  body text,
  bunny_video_id text,
  extra_videos jsonb not null default '[]'::jsonb,
  image_path text,
  pinned_until timestamptz,
  created_at timestamptz not null default now(),
  constraint coaching_announcements_has_content check (
    coalesce(trim(body), '') <> '' or bunny_video_id is not null or image_path is not null
  ),
  constraint coaching_announcements_extra_videos_shape check (
    jsonb_typeof(extra_videos) = 'array' and jsonb_array_length(extra_videos) <= 4
  ),
  constraint coaching_announcements_image_folder check (
    image_path is null or split_part(image_path, '/', 1) = 'announcements'
  )
);

create index if not exists coaching_announcements_created_idx
  on public.coaching_announcements (created_at desc);

alter table public.coaching_announcements enable row level security;

drop policy if exists "coaching_announcements_select" on public.coaching_announcements;
create policy "coaching_announcements_select"
  on public.coaching_announcements for select to authenticated
  using (true);

drop policy if exists "coaching_announcements_insert_coach" on public.coaching_announcements;
create policy "coaching_announcements_insert_coach"
  on public.coaching_announcements for insert to authenticated
  with check (public.is_coach() and author_id = auth.uid());

drop policy if exists "coaching_announcements_update_coach" on public.coaching_announcements;
create policy "coaching_announcements_update_coach"
  on public.coaching_announcements for update to authenticated
  using (public.is_coach())
  with check (public.is_coach());

drop policy if exists "coaching_announcements_delete_coach" on public.coaching_announcements;
create policy "coaching_announcements_delete_coach"
  on public.coaching_announcements for delete to authenticated
  using (public.is_coach());

grant select, insert, update, delete on public.coaching_announcements to authenticated;

-- Replies to an announcement live in the replying player's space.
alter table public.coaching_posts
  add column if not exists announcement_id uuid references public.coaching_announcements (id) on delete cascade;

create index if not exists coaching_posts_announcement_idx
  on public.coaching_posts (announcement_id, student_id, created_at)
  where announcement_id is not null;

alter table public.coaching_posts drop constraint if exists coaching_posts_announcement_flat;
alter table public.coaching_posts add constraint coaching_posts_announcement_flat check (
  announcement_id is null or parent_id is null
);

-- Announcement photos sit in "announcements/..." and every signed-in player can view them.
-- Uploading there is already coach-only (players may only write to their own folder).
drop policy if exists "coaching_photos_select_announcements" on storage.objects;
create policy "coaching_photos_select_announcements"
  on storage.objects for select to authenticated
  using (bucket_id = 'coaching-photos' and (storage.foldername(name))[1] = 'announcements');

do $$
begin
  alter publication supabase_realtime add table public.coaching_announcements;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
