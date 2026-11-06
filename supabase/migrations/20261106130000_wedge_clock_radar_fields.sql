-- Add radar distance fields; make clock optional for distance-only logs.
-- Safe if 20261106120000 already created the full schema.

alter table public.player_wedge_clock_logs
  alter column measured_clock drop not null;

alter table public.player_wedge_clock_logs
  add column if not exists goal_distance numeric(6, 1);

alter table public.player_wedge_clock_logs
  add column if not exists carry_distance numeric(6, 1);

alter table public.player_wedge_clock_logs
  add column if not exists distance_unit text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'player_wedge_clock_logs_goal_distance_check'
  ) then
    alter table public.player_wedge_clock_logs
      add constraint player_wedge_clock_logs_goal_distance_check
      check (goal_distance is null or (goal_distance >= 0 and goal_distance <= 400));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'player_wedge_clock_logs_carry_distance_check'
  ) then
    alter table public.player_wedge_clock_logs
      add constraint player_wedge_clock_logs_carry_distance_check
      check (carry_distance is null or (carry_distance >= 0 and carry_distance <= 400));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'player_wedge_clock_logs_distance_unit_check'
  ) then
    alter table public.player_wedge_clock_logs
      add constraint player_wedge_clock_logs_distance_unit_check
      check (distance_unit is null or distance_unit in ('m', 'yd'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'player_wedge_clock_logs_has_reading'
  ) then
    alter table public.player_wedge_clock_logs
      add constraint player_wedge_clock_logs_has_reading
      check (measured_clock is not null or carry_distance is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'player_wedge_clock_logs_distance_unit_pair'
  ) then
    alter table public.player_wedge_clock_logs
      add constraint player_wedge_clock_logs_distance_unit_pair
      check (
        (carry_distance is null and goal_distance is null and distance_unit is null)
        or (
          distance_unit is not null
          and (carry_distance is not null or goal_distance is not null)
        )
      );
  end if;
end $$;

comment on table public.player_wedge_clock_logs is
  'Wedge clock length and/or radar carry. No video stored.';
