-- Weekly goals: as well as practice hours, players can set how many rounds, drills, combines and
-- Library lessons they want to get through each week (0 = not a goal). Finishing every goal in a
-- week (Monday to Sunday, Sydney time) earns 1,000 XP once. weekly_goals_status() counts progress
-- from the database and pays the award, so the app can't award it twice or for unfinished goals.
-- Requires drill_xp_apply (20261008190000), round_xp_awards (20261011100000) and is_coach().

alter table public.player_goals
  add column if not exists weekly_rounds_goal integer not null default 0,
  add column if not exists weekly_drills_goal integer not null default 0,
  add column if not exists weekly_combines_goal integer not null default 0,
  add column if not exists weekly_lessons_goal integer not null default 0;

do $$
begin
  alter table public.player_goals add constraint player_goals_weekly_counts_check check (
    weekly_rounds_goal between 0 and 14
    and weekly_drills_goal between 0 and 50
    and weekly_combines_goal between 0 and 20
    and weekly_lessons_goal between 0 and 30
  );
exception when duplicate_object then null;
end $$;

-- One row per finished combine session. Combine results are saved in several tables, so the app
-- records each finish here when it pays the combine XP.
create table if not exists public.combine_completions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_at timestamptz not null default now()
);

create index if not exists combine_completions_user_idx
  on public.combine_completions (user_id, completed_at desc);

alter table public.combine_completions enable row level security;

drop policy if exists "combine_completions_select" on public.combine_completions;
create policy "combine_completions_select" on public.combine_completions
  for select to authenticated using (user_id = auth.uid() or public.is_coach());

-- Coaches running a combine for a player ("Test <name>") record it under the player.
drop policy if exists "combine_completions_insert" on public.combine_completions;
create policy "combine_completions_insert" on public.combine_completions
  for insert to authenticated with check (user_id = auth.uid() or public.is_coach());

grant select, insert on public.combine_completions to authenticated;
grant all on public.combine_completions to service_role;

-- One award per player per week. Readable by everyone signed in so the leaderboards can count it.
create table if not exists public.weekly_goal_xp_awards (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  xp integer not null default 1000,
  earned_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create index if not exists weekly_goal_xp_awards_earned_idx on public.weekly_goal_xp_awards (earned_at desc);

alter table public.weekly_goal_xp_awards enable row level security;

drop policy if exists "weekly_goal_xp_awards_select" on public.weekly_goal_xp_awards;
create policy "weekly_goal_xp_awards_select" on public.weekly_goal_xp_awards
  for select to authenticated using (true);

grant select on public.weekly_goal_xp_awards to authenticated;
grant all on public.weekly_goal_xp_awards to service_role;

create or replace function public.weekly_goals_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_week date := date_trunc('week', now() at time zone 'Australia/Sydney')::date;
  v_from timestamptz := v_week::timestamp at time zone 'Australia/Sydney';
  v_to timestamptz := (v_week + 7)::timestamp at time zone 'Australia/Sydney';
  g public.player_goals%rowtype;
  v_practice_minutes numeric;
  v_log_minutes numeric;
  v_minutes numeric;
  v_rounds integer;
  v_drills integer;
  v_combines integer;
  v_lessons integer;
  v_complete boolean;
  v_awarded boolean;
  v_awarded_now boolean := false;
  v_added integer;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select * into g from public.player_goals
   where user_id = v_user
   order by updated_at desc nulls last
   limit 1;

  select coalesce(sum(duration_minutes), 0) into v_practice_minutes
    from public.practice
   where user_id = v_user and created_at >= v_from and created_at < v_to;

  select coalesce(sum(duration_minutes), 0) into v_log_minutes
    from public.practice_logs
   where user_id = v_user and created_at >= v_from and created_at < v_to;

  -- Some sessions save to both tables, so take the larger rather than adding them.
  v_minutes := greatest(v_practice_minutes, v_log_minutes);

  select count(*) into v_rounds
    from public.round_xp_awards
   where user_id = v_user and earned_at >= v_from and earned_at < v_to;

  select
    (select count(*) from public.drill_xp_awards
      where user_id = v_user and day >= v_week and day < v_week + 7)
    + (select count(*) from public.practice
      where user_id = v_user and created_at >= v_from and created_at < v_to
        and notes::text like '%Completed Drill%')
    into v_drills;

  select count(*) into v_combines
    from public.combine_completions
   where user_id = v_user and completed_at >= v_from and completed_at < v_to;

  select count(*) into v_lessons
    from public.library_lesson_completions
   where user_id = v_user and completed_at >= v_from and completed_at < v_to;

  v_complete := g.user_id is not null
    and v_minutes >= coalesce(g.weekly_hour_commitment, 0) * 60
    and v_rounds >= coalesce(g.weekly_rounds_goal, 0)
    and v_drills >= coalesce(g.weekly_drills_goal, 0)
    and v_combines >= coalesce(g.weekly_combines_goal, 0)
    and v_lessons >= coalesce(g.weekly_lessons_goal, 0);

  select exists (
    select 1 from public.weekly_goal_xp_awards where user_id = v_user and week_start = v_week
  ) into v_awarded;

  if v_complete and not v_awarded then
    insert into public.weekly_goal_xp_awards (user_id, week_start, xp)
    values (v_user, v_week, 1000)
    on conflict do nothing;
    get diagnostics v_added = row_count;
    if v_added > 0 then
      perform public.drill_xp_apply(v_user, 1000);
      v_awarded_now := true;
    end if;
    v_awarded := true;
  end if;

  return jsonb_build_object(
    'week_start', v_week,
    'has_goals', g.user_id is not null,
    'xp', 1000,
    'complete', v_complete,
    'awarded', v_awarded,
    'awarded_now', v_awarded_now,
    'targets', jsonb_build_object(
      'hours', coalesce(g.weekly_hour_commitment, 0),
      'rounds', coalesce(g.weekly_rounds_goal, 0),
      'drills', coalesce(g.weekly_drills_goal, 0),
      'combines', coalesce(g.weekly_combines_goal, 0),
      'lessons', coalesce(g.weekly_lessons_goal, 0)
    ),
    'done', jsonb_build_object(
      'minutes', v_minutes,
      'rounds', v_rounds,
      'drills', v_drills,
      'combines', v_combines,
      'lessons', v_lessons
    )
  );
end;
$$;

revoke all on function public.weekly_goals_status() from public, anon;
grant execute on function public.weekly_goals_status() to authenticated;

notify pgrst, 'reload schema';
