-- Up to 5 videos per coaching post. The first stays in bunny_video_id/storage_path;
-- the rest are listed here as [{ "bunny_video_id": "...", "storage_path": "..." | null }].

alter table public.coaching_posts
  add column if not exists extra_videos jsonb not null default '[]'::jsonb;

alter table public.coaching_posts drop constraint if exists coaching_posts_extra_videos_shape;
alter table public.coaching_posts add constraint coaching_posts_extra_videos_shape check (
  jsonb_typeof(extra_videos) = 'array' and jsonb_array_length(extra_videos) <= 4
);

notify pgrst, 'reload schema';
