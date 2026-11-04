-- Cadet module tests: optional test on a curriculum week + per-student term results.

alter table public.cadet_curriculum_weeks
  add column if not exists is_test boolean not null default false;

alter table public.cadet_curriculum_weeks
  add column if not exists test_standard text
  check (
    test_standard is null
    or char_length(btrim(test_standard)) between 1 and 400
  );

alter table public.cadet_curriculum_weeks
  add column if not exists test_max_score smallint
  check (test_max_score is null or test_max_score between 1 and 200);

alter table public.cadet_curriculum_weeks
  add column if not exists test_skill_id text
  check (
    test_skill_id is null
    or char_length(btrim(test_skill_id)) between 1 and 80
  );

alter table public.cadet_curriculum_weeks
  add column if not exists gates_hole_group smallint
  check (gates_hole_group is null or gates_hole_group in (3, 5, 7, 10));

create table if not exists public.cadet_module_test_results (
  id uuid primary key default gen_random_uuid(),
  curriculum_week_id uuid not null references public.cadet_curriculum_weeks (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  program_year smallint not null check (program_year between 2020 and 2100),
  term smallint not null check (term in (1, 2, 3)),
  score numeric(8, 2) not null check (score >= 0 and score <= 9999),
  max_score smallint check (max_score is null or max_score between 1 and 200),
  outcome text not null check (outcome in ('pass', 'needs_practice')),
  notes text check (notes is null or char_length(notes) <= 500),
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (curriculum_week_id, player_id, program_year, term)
);

create index if not exists cadet_module_test_results_player_idx
  on public.cadet_module_test_results (player_id, program_year, term);

create index if not exists cadet_module_test_results_week_idx
  on public.cadet_module_test_results (curriculum_week_id);

alter table public.cadet_module_test_results enable row level security;

drop policy if exists "cadet_module_test_results_select" on public.cadet_module_test_results;
create policy "cadet_module_test_results_select" on public.cadet_module_test_results
  for select to authenticated using (public.is_coach() or player_id = auth.uid());

drop policy if exists "cadet_module_test_results_coach_write" on public.cadet_module_test_results;
create policy "cadet_module_test_results_coach_write" on public.cadet_module_test_results
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

grant select, insert, update, delete on public.cadet_module_test_results to authenticated;

notify pgrst, 'reload schema';
