-- Cadet Program: hole-length groups (3 / 5 / 7 / 10) and scored rounds for term + year leaderboards.
-- Coach-only writes; enrolled cadets can read their own scores (player UI later).

create table if not exists public.cadet_enrollments (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  hole_group smallint not null check (hole_group in (3, 5, 7, 10)),
  enrolled_on date not null default (timezone('Australia/Sydney', now()))::date,
  status text not null default 'active' check (status in ('active', 'paused', 'alumni')),
  notes text check (notes is null or char_length(notes) <= 2000),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists cadet_enrollments_hole_group_idx
  on public.cadet_enrollments (hole_group)
  where status = 'active';

create table if not exists public.cadet_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  hole_group smallint not null check (hole_group in (3, 5, 7, 10)),
  played_on date not null default (timezone('Australia/Sydney', now()))::date,
  gross_score smallint not null check (gross_score between 1 and 120),
  /** Strokes vs par for that loop; null when par isn't recorded. */
  to_par smallint check (to_par is null or to_par between -40 and 80),
  course_name text check (course_name is null or char_length(btrim(course_name)) <= 80),
  notes text check (notes is null or char_length(notes) <= 500),
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists cadet_scores_leaderboard_idx
  on public.cadet_scores (hole_group, played_on desc);

create index if not exists cadet_scores_player_idx
  on public.cadet_scores (player_id, played_on desc);

alter table public.cadet_enrollments enable row level security;
alter table public.cadet_scores enable row level security;

drop policy if exists "cadet_enrollments_select" on public.cadet_enrollments;
create policy "cadet_enrollments_select" on public.cadet_enrollments
  for select to authenticated using (public.is_coach() or player_id = auth.uid());

drop policy if exists "cadet_enrollments_coach_write" on public.cadet_enrollments;
create policy "cadet_enrollments_coach_write" on public.cadet_enrollments
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "cadet_scores_select" on public.cadet_scores;
create policy "cadet_scores_select" on public.cadet_scores
  for select to authenticated using (public.is_coach() or player_id = auth.uid());

drop policy if exists "cadet_scores_coach_write" on public.cadet_scores;
create policy "cadet_scores_coach_write" on public.cadet_scores
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

grant select, insert, update, delete on public.cadet_enrollments to authenticated;
grant select, insert, update, delete on public.cadet_scores to authenticated;

notify pgrst, 'reload schema';
