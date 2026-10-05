-- Coaching feed: one private space per student shared with coaches (text + video posts).
-- Replaces the separate Swings (bunny_student_swings) and Feedback (coach_swing_feedback) tabs.

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(lower(auth.jwt() ->> 'email') in ('bdowd@pgamember.org.au', 'allendowd86@gmail.com'), false)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(trim(coalesce(p.role, ''))) = 'coach'
    );
$$;

grant execute on function public.is_coach() to authenticated;

create table if not exists public.coaching_posts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text,
  title text,
  bunny_video_id text,
  -- Raw copy ('swing-submissions') or legacy coach upload ('coach-feedback').
  storage_bucket text,
  storage_path text,
  key_issues text,
  contact_info text,
  directional_misses text,
  legacy_source text,
  legacy_id text,
  created_at timestamptz not null default now(),
  constraint coaching_posts_has_content check (
    coalesce(trim(body), '') <> ''
    or bunny_video_id is not null
    or storage_path is not null
  )
);

create index if not exists coaching_posts_student_created_idx
  on public.coaching_posts (student_id, created_at desc);
create index if not exists coaching_posts_created_idx
  on public.coaching_posts (created_at desc);
create unique index if not exists coaching_posts_legacy_uidx
  on public.coaching_posts (legacy_source, legacy_id)
  where legacy_source is not null;

alter table public.coaching_posts enable row level security;

drop policy if exists "coaching_posts_select" on public.coaching_posts;
create policy "coaching_posts_select"
  on public.coaching_posts for select to authenticated
  using (student_id = auth.uid() or public.is_coach());

drop policy if exists "coaching_posts_insert" on public.coaching_posts;
create policy "coaching_posts_insert"
  on public.coaching_posts for insert to authenticated
  with check (author_id = auth.uid() and (student_id = auth.uid() or public.is_coach()));

drop policy if exists "coaching_posts_delete_coach" on public.coaching_posts;
create policy "coaching_posts_delete_coach"
  on public.coaching_posts for delete to authenticated
  using (public.is_coach());

grant select, insert, delete on public.coaching_posts to authenticated;

-- Last time each user opened a student's space (drives unread badges).
create table if not exists public.coaching_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, student_id)
);

alter table public.coaching_reads enable row level security;

drop policy if exists "coaching_reads_own" on public.coaching_reads;
create policy "coaching_reads_own"
  on public.coaching_reads for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (student_id = auth.uid() or public.is_coach()));

grant select, insert, update on public.coaching_reads to authenticated;

-- Backfill existing swings and feedback so nothing disappears from the merged tab.
insert into public.coaching_posts (
  student_id, author_id, title, bunny_video_id, storage_bucket, storage_path,
  key_issues, contact_info, directional_misses, legacy_source, legacy_id, created_at
)
select
  s.uploaded_by, s.uploaded_by, s.title, lower(s.bunny_video_id),
  case when s.storage_path is not null then 'swing-submissions' end, s.storage_path,
  s.key_issues, s.contact_info, s.directional_misses,
  'bunny_student_swings', lower(s.bunny_video_id), s.created_at
from public.bunny_student_swings s
join public.profiles p on p.id = s.uploaded_by
on conflict (legacy_source, legacy_id) where legacy_source is not null do nothing;

insert into public.coaching_posts (
  student_id, author_id, body, storage_bucket, storage_path,
  key_issues, contact_info, directional_misses, legacy_source, legacy_id, created_at
)
select
  f.student_id, f.coach_id, f.notes, 'coach-feedback', f.storage_path,
  f.key_issues, f.contact_info, f.directional_misses,
  'coach_swing_feedback', f.id::text, f.created_at
from public.coach_swing_feedback f
on conflict (legacy_source, legacy_id) where legacy_source is not null do nothing;

do $$
begin
  alter publication supabase_realtime add table public.coaching_posts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
