-- Cadet hole-by-hole scorecards for progress + practice recommendations.
-- Columns per hole: par, shots to <30m, chips, bunker shots, putts, total strokes.

create table if not exists public.cadet_scorecards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  hole_group smallint not null check (hole_group in (3, 5, 7, 10)),
  played_on date not null default (timezone('Australia/Sydney', now()))::date,
  course_name text check (course_name is null or char_length(btrim(course_name)) <= 80),
  notes text check (notes is null or char_length(notes) <= 500),
  total_strokes smallint not null check (total_strokes between 1 and 200),
  total_to_par smallint check (total_to_par is null or total_to_par between -40 and 80),
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cadet_scorecards_player_idx
  on public.cadet_scorecards (player_id, played_on desc);

create index if not exists cadet_scorecards_group_idx
  on public.cadet_scorecards (hole_group, played_on desc);

create table if not exists public.cadet_scorecard_holes (
  id uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.cadet_scorecards (id) on delete cascade,
  hole_number smallint not null check (hole_number between 1 and 10),
  par smallint not null check (par between 3 and 5),
  /** Strokes taken to get the ball inside ~30m of the hole. */
  shots_to_30m smallint not null check (shots_to_30m between 0 and 20),
  chips smallint not null default 0 check (chips between 0 and 15),
  bunker_shots smallint not null default 0 check (bunker_shots between 0 and 15),
  putts smallint not null check (putts between 0 and 15),
  total_strokes smallint not null check (total_strokes between 1 and 20),
  unique (scorecard_id, hole_number)
);

create index if not exists cadet_scorecard_holes_card_idx
  on public.cadet_scorecard_holes (scorecard_id, hole_number);

alter table public.cadet_scorecards enable row level security;
alter table public.cadet_scorecard_holes enable row level security;

drop policy if exists "cadet_scorecards_select" on public.cadet_scorecards;
create policy "cadet_scorecards_select" on public.cadet_scorecards
  for select to authenticated using (public.is_coach() or player_id = auth.uid());

drop policy if exists "cadet_scorecards_coach_write" on public.cadet_scorecards;
create policy "cadet_scorecards_coach_write" on public.cadet_scorecards
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "cadet_scorecard_holes_select" on public.cadet_scorecard_holes;
create policy "cadet_scorecard_holes_select" on public.cadet_scorecard_holes
  for select to authenticated using (
    public.is_coach()
    or exists (
      select 1 from public.cadet_scorecards s
      where s.id = scorecard_id and s.player_id = auth.uid()
    )
  );

drop policy if exists "cadet_scorecard_holes_coach_write" on public.cadet_scorecard_holes;
create policy "cadet_scorecard_holes_coach_write" on public.cadet_scorecard_holes
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

grant select, insert, update, delete on public.cadet_scorecards to authenticated;
grant select, insert, update, delete on public.cadet_scorecard_holes to authenticated;

notify pgrst, 'reload schema';
