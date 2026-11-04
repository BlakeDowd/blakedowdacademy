-- Cadet year framework: coach-authored subjects / modules by term week (3 terms).

create table if not exists public.cadet_curriculum_weeks (
  id uuid primary key default gen_random_uuid(),
  program_year smallint not null check (program_year between 2020 and 2100),
  term smallint not null check (term in (1, 2, 3)),
  week_number smallint not null check (week_number between 1 and 20),
  subject text not null check (char_length(btrim(subject)) between 1 and 120),
  module_notes text check (module_notes is null or char_length(module_notes) <= 4000),
  bunny_video_id text check (
    bunny_video_id is null
    or bunny_video_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  drill_refs jsonb not null default '[]'::jsonb,
  sort_order smallint not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists cadet_curriculum_weeks_plan_idx
  on public.cadet_curriculum_weeks (program_year, term, week_number, sort_order);

alter table public.cadet_curriculum_weeks enable row level security;

drop policy if exists "cadet_curriculum_weeks_select" on public.cadet_curriculum_weeks;
create policy "cadet_curriculum_weeks_select" on public.cadet_curriculum_weeks
  for select to authenticated using (public.is_coach());

drop policy if exists "cadet_curriculum_weeks_coach_write" on public.cadet_curriculum_weeks;
create policy "cadet_curriculum_weeks_coach_write" on public.cadet_curriculum_weeks
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

grant select, insert, update, delete on public.cadet_curriculum_weeks to authenticated;

notify pgrst, 'reload schema';
