-- Up to 20 videos per coaching post or announcement (1 main + 19 extras),
-- and "game plan" posts: the coach's end-of-lesson "what to work on" video, shown on the player's profile.

alter table public.coaching_posts drop constraint if exists coaching_posts_extra_videos_shape;
alter table public.coaching_posts add constraint coaching_posts_extra_videos_shape check (
  jsonb_typeof(extra_videos) = 'array' and jsonb_array_length(extra_videos) <= 19
);

alter table public.coaching_announcements drop constraint if exists coaching_announcements_extra_videos_shape;
alter table public.coaching_announcements add constraint coaching_announcements_extra_videos_shape check (
  jsonb_typeof(extra_videos) = 'array' and jsonb_array_length(extra_videos) <= 19
);

alter table public.coaching_posts
  add column if not exists is_game_plan boolean not null default false;

create index if not exists coaching_posts_game_plan_idx
  on public.coaching_posts (student_id, created_at desc)
  where is_game_plan;

-- Same rule as 20261006130000_coaching_invites.sql, plus: only coaches can post game plans.
drop policy if exists "coaching_posts_insert" on public.coaching_posts;
create policy "coaching_posts_insert"
  on public.coaching_posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      student_id = auth.uid()
      or (public.is_coach() and public.coaching_space_key_exists(student_id))
    )
    and (image_path is null or split_part(image_path, '/', 1) = student_id::text)
    and (
      coaching_posts.parent_id is null
      or exists (
        select 1 from public.coaching_posts parent
        where parent.id = coaching_posts.parent_id
          and parent.student_id = coaching_posts.student_id
          and parent.parent_id is null
      )
    )
    and (not coaching_posts.is_game_plan or public.is_coach())
  );

notify pgrst, 'reload schema';
