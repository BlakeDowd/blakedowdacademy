-- Coach-chosen scoring method per drill, set from the drill card / library in the app.
-- drill_key is the drill's code (e.g. PUTT-GATE-001) or its id for drills without one, lower-cased.
-- score_type uses the same values as drills.score_type: streak | makes/10 | count: <unit> | strokes: <unit> | time: <unit> | completion.

create table if not exists public.drill_scoring (
  drill_key text primary key check (char_length(drill_key) between 1 and 80),
  score_type text not null check (char_length(score_type) between 1 and 60),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.drill_scoring enable row level security;

drop policy if exists "drill_scoring_select" on public.drill_scoring;
create policy "drill_scoring_select" on public.drill_scoring
  for select to anon, authenticated using (true);

drop policy if exists "drill_scoring_coach_insert" on public.drill_scoring;
create policy "drill_scoring_coach_insert" on public.drill_scoring
  for insert to authenticated with check (public.is_coach());

drop policy if exists "drill_scoring_coach_update" on public.drill_scoring;
create policy "drill_scoring_coach_update" on public.drill_scoring
  for update to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "drill_scoring_coach_delete" on public.drill_scoring;
create policy "drill_scoring_coach_delete" on public.drill_scoring
  for delete to authenticated using (public.is_coach());

grant select on public.drill_scoring to anon, authenticated;
grant insert, update, delete on public.drill_scoring to authenticated;

notify pgrst, 'reload schema';
