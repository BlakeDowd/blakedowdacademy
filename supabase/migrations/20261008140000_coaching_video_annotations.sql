-- Lines, angles, circles and pen marks a coach saves on a coaching video for the player to see.
-- video_key is "bunny:<video id>" or "file:<storage path>". Shapes use 0–1 coordinates of the frame.

create table if not exists public.coaching_video_annotations (
  video_key text primary key,
  student_id uuid references public.profiles (id) on delete cascade,
  shapes jsonb not null default '[]'::jsonb,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint coaching_video_annotations_shapes_array check (jsonb_typeof(shapes) = 'array')
);

alter table public.coaching_video_annotations enable row level security;

drop policy if exists "coaching_video_annotations_select" on public.coaching_video_annotations;
create policy "coaching_video_annotations_select"
  on public.coaching_video_annotations
  for select
  to authenticated
  using (student_id = auth.uid() or student_id is null or public.is_coach());

drop policy if exists "coaching_video_annotations_insert" on public.coaching_video_annotations;
create policy "coaching_video_annotations_insert"
  on public.coaching_video_annotations
  for insert
  to authenticated
  with check (public.is_coach());

drop policy if exists "coaching_video_annotations_update" on public.coaching_video_annotations;
create policy "coaching_video_annotations_update"
  on public.coaching_video_annotations
  for update
  to authenticated
  using (public.is_coach())
  with check (public.is_coach());

drop policy if exists "coaching_video_annotations_delete" on public.coaching_video_annotations;
create policy "coaching_video_annotations_delete"
  on public.coaching_video_annotations
  for delete
  to authenticated
  using (public.is_coach());

grant select, insert, update, delete on public.coaching_video_annotations to authenticated;
grant all on public.coaching_video_annotations to service_role;
