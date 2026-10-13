-- Coach-tuned practice handicap benchmarks per combine, edited from the Practice handicap card.
-- test_id is the combine's leaderboard id (e.g. tee_shot_hazard). anchors is an array of
-- [handicap, typical score] pairs; combines without a row use the defaults in practiceHandicapBenchmarks.ts.

create table if not exists public.practice_handicap_benchmarks (
  test_id text primary key check (char_length(test_id) between 1 and 60),
  anchors jsonb not null check (jsonb_typeof(anchors) = 'array' and jsonb_array_length(anchors) between 2 and 12),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.practice_handicap_benchmarks enable row level security;

drop policy if exists "practice_handicap_benchmarks_select" on public.practice_handicap_benchmarks;
create policy "practice_handicap_benchmarks_select" on public.practice_handicap_benchmarks
  for select to anon, authenticated using (true);

drop policy if exists "practice_handicap_benchmarks_coach_insert" on public.practice_handicap_benchmarks;
create policy "practice_handicap_benchmarks_coach_insert" on public.practice_handicap_benchmarks
  for insert to authenticated with check (public.is_coach());

drop policy if exists "practice_handicap_benchmarks_coach_update" on public.practice_handicap_benchmarks;
create policy "practice_handicap_benchmarks_coach_update" on public.practice_handicap_benchmarks
  for update to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "practice_handicap_benchmarks_coach_delete" on public.practice_handicap_benchmarks;
create policy "practice_handicap_benchmarks_coach_delete" on public.practice_handicap_benchmarks
  for delete to authenticated using (public.is_coach());

grant select on public.practice_handicap_benchmarks to anon, authenticated;
grant insert, update, delete on public.practice_handicap_benchmarks to authenticated;

notify pgrst, 'reload schema';
