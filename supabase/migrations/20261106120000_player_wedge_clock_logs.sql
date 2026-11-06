-- Wedge Clock / radar shot log (no video). Clock length optional; carry from radar optional.

create table if not exists public.player_wedge_clock_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_at timestamptz not null default now(),
  club text not null
    check (char_length(btrim(club)) between 1 and 40),
  target_clock text
    check (target_clock is null or char_length(btrim(target_clock)) between 1 and 12),
  measured_clock text
    check (measured_clock is null or char_length(btrim(measured_clock)) between 1 and 12),
  measured_degrees numeric(5, 1)
    check (measured_degrees is null or (measured_degrees >= 0 and measured_degrees <= 180)),
  goal_distance numeric(6, 1)
    check (goal_distance is null or (goal_distance >= 0 and goal_distance <= 400)),
  carry_distance numeric(6, 1)
    check (carry_distance is null or (carry_distance >= 0 and carry_distance <= 400)),
  distance_unit text
    check (distance_unit is null or distance_unit in ('m', 'yd')),
  note text
    check (note is null or char_length(note) <= 500),
  handedness text not null default 'right'
    check (handedness in ('right', 'left')),
  created_at timestamptz not null default now(),
  constraint player_wedge_clock_logs_has_reading check (
    measured_clock is not null or carry_distance is not null
  ),
  constraint player_wedge_clock_logs_distance_unit_pair check (
    (carry_distance is null and goal_distance is null and distance_unit is null)
    or (
      distance_unit is not null
      and (carry_distance is not null or goal_distance is not null)
    )
  )
);

create index if not exists player_wedge_clock_logs_user_logged_idx
  on public.player_wedge_clock_logs (user_id, logged_at desc);

comment on table public.player_wedge_clock_logs is
  'Wedge clock length and/or radar carry. No video stored.';

alter table public.player_wedge_clock_logs enable row level security;

drop policy if exists "player_wedge_clock_logs_select" on public.player_wedge_clock_logs;
create policy "player_wedge_clock_logs_select" on public.player_wedge_clock_logs
  for select to authenticated
  using (user_id = auth.uid() or public.is_coach());

drop policy if exists "player_wedge_clock_logs_insert" on public.player_wedge_clock_logs;
create policy "player_wedge_clock_logs_insert" on public.player_wedge_clock_logs
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_coach());

drop policy if exists "player_wedge_clock_logs_update" on public.player_wedge_clock_logs;
create policy "player_wedge_clock_logs_update" on public.player_wedge_clock_logs
  for update to authenticated
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());

drop policy if exists "player_wedge_clock_logs_delete" on public.player_wedge_clock_logs;
create policy "player_wedge_clock_logs_delete" on public.player_wedge_clock_logs
  for delete to authenticated
  using (user_id = auth.uid() or public.is_coach());
