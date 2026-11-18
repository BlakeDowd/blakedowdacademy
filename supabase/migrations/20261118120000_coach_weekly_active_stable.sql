-- Weekly active players was drifting / going to zero on older weeks because
-- coach_usage_events truncated to the newest 20k rows globally. Past calendar
-- weeks then lost events as new activity arrived.
--
-- Fix:
--   1. coach_usage_events — scope to the coach's roster when given, drop the cap
--   2. coach_weekly_active_players — stable distinct-player counts per week window
--      (week boundaries come from the client so local Mon–Sun stays correct)

drop function if exists public.coach_usage_events(timestamptz);
drop function if exists public.coach_usage_events(timestamptz, uuid[]);

create or replace function public.coach_usage_events(
  p_since timestamptz,
  p_student_ids uuid[] default null
)
returns table (user_id uuid, source text, detail text, qty integer, minutes integer, at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[] := '{}';
  ts text;
  roster_filter text;
begin
  if not public.is_coach() then
    raise exception 'not_coach' using errcode = '42501';
  end if;

  roster_filter := case
    when p_student_ids is null then 'true'
    when cardinality(p_student_ids) = 0 then 'false'
    else 'u.user_id = any($2)'
  end;

  if public.app_usage_has_column('practice', 'user_id') and public.app_usage_has_column('practice', 'type') then
    ts := case
      when public.app_usage_has_column('practice', 'completed_at') and public.app_usage_has_column('practice', 'created_at')
        then 'coalesce(completed_at, created_at)'
      when public.app_usage_has_column('practice', 'completed_at') then 'completed_at'
      else 'created_at'
    end;
    parts := parts || format(
      $q$select user_id::uuid, 'practice'::text, type::text, count(*)::int, %2$s, max(%1$s)::timestamptz
         from public.practice where %1$s >= $1
         group by user_id, type, date_trunc('hour', %1$s)$q$,
      ts,
      case when public.app_usage_has_column('practice', 'duration_minutes')
        then 'coalesce(sum(duration_minutes), 0)::int' else '0' end
    );
  end if;

  if public.app_usage_has_column('practice_logs', 'log_type') then
    parts := parts || $q$select user_id::uuid, 'skills_log'::text, log_type::text, 1, 0, created_at::timestamptz
      from public.practice_logs where created_at >= $1$q$::text;
  end if;

  if public.app_usage_has_column('drill_score_logs', 'drill_key') then
    parts := parts || $q$select user_id::uuid, 'drill_score'::text, drill_key::text, count(*)::int, 0, max(created_at)::timestamptz
      from public.drill_score_logs where created_at >= $1
      group by user_id, drill_key, date_trunc('hour', created_at)$q$::text;
  end if;

  if public.app_usage_has_column('rounds', 'user_id') then
    ts := case
      when public.app_usage_has_column('rounds', 'created_at') then 'created_at'
      when public.app_usage_has_column('rounds', 'date') then 'date::timestamptz'
      else null
    end;
    if ts is not null then
      parts := parts || format(
        $q$select user_id::uuid, 'round'::text, null::text, 1, 0, (%1$s)::timestamptz from public.rounds where %1$s >= $1$q$,
        ts
      );
    end if;
  end if;

  if public.app_usage_has_column('library_lesson_completions', 'completed_at') then
    parts := parts || format(
      $q$select user_id::uuid, 'lesson'::text, %s, 1, 0, completed_at::timestamptz
         from public.library_lesson_completions where completed_at >= $1$q$,
      case when public.app_usage_has_column('library_lesson_completions', 'lesson_title')
        then 'lesson_title::text' else 'lesson_id::text' end
    );
  end if;

  if public.app_usage_has_column('user_trophies', 'user_id') then
    ts := case
      when public.app_usage_has_column('user_trophies', 'earned_at') and public.app_usage_has_column('user_trophies', 'unlocked_at')
        then 'coalesce(earned_at, unlocked_at)'
      when public.app_usage_has_column('user_trophies', 'earned_at') then 'earned_at'
      when public.app_usage_has_column('user_trophies', 'unlocked_at') then 'unlocked_at'
      when public.app_usage_has_column('user_trophies', 'created_at') then 'created_at'
      else null
    end;
    if ts is not null then
      parts := parts || format(
        $q$select user_id::uuid, 'trophy'::text, %2$s, 1, 0, (%1$s)::timestamptz
           from public.user_trophies where %1$s >= $1$q$,
        ts,
        case when public.app_usage_has_column('user_trophies', 'achievement_id')
          then 'achievement_id::text' else 'null::text' end
      );
    end if;
  end if;

  if public.app_usage_has_column('coaching_posts', 'author_id') then
    parts := parts || $q$select author_id::uuid, 'coaching_post'::text,
        case when bunny_video_id is not null then 'video' when image_path is not null then 'photo' else 'message' end,
        1, 0, created_at::timestamptz
      from public.coaching_posts where created_at >= $1 and author_id = student_id$q$::text;
  end if;

  if public.app_usage_has_column('bunny_student_swings', 'uploaded_by') then
    parts := parts || $q$select uploaded_by::uuid, 'swing_upload'::text, null::text, 1, 0, created_at::timestamptz
      from public.bunny_student_swings where created_at >= $1$q$::text;
  end if;

  parts := parts || $q$select user_id, 'screen'::text, screen, count(*)::int, 0, max(created_at)
    from public.app_events where created_at >= $1
    group by user_id, screen, (created_at at time zone 'utc')::date$q$::text;

  if p_student_ids is null then
    return query execute
      'select u.* from (' || array_to_string(parts, ' union all ') || ') as u(user_id, source, detail, qty, minutes, at)
       where u.user_id is not null
         and not exists (
           select 1 from public.profiles p
           where p.id = u.user_id and lower(trim(coalesce(p.role, ''''))) = ''coach''
         )
       order by u.at desc'
      using p_since;
  else
    return query execute
      'select u.* from (' || array_to_string(parts, ' union all ') || ') as u(user_id, source, detail, qty, minutes, at)
       where u.user_id is not null
         and (' || roster_filter || ')
         and not exists (
           select 1 from public.profiles p
           where p.id = u.user_id and lower(trim(coalesce(p.role, ''''))) = ''coach''
         )
       order by u.at desc'
      using p_since, p_student_ids;
  end if;
end;
$$;

revoke all on function public.coach_usage_events(timestamptz, uuid[]) from public, anon;
grant execute on function public.coach_usage_events(timestamptz, uuid[]) to authenticated;

-- Presence rows used only for weekly unique-player counts (one per player per source day).
create or replace function public.coach_weekly_active_players(
  p_week_starts timestamptz[],
  p_student_ids uuid[]
)
returns table (week_start timestamptz, player_count integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[] := '{}';
  ts text;
  since timestamptz;
  until_at timestamptz;
begin
  if not public.is_coach() then
    raise exception 'not_coach' using errcode = '42501';
  end if;

  if p_week_starts is null or cardinality(p_week_starts) = 0 or p_student_ids is null then
    return;
  end if;

  select min(w), max(w) + interval '7 days' into since, until_at from unnest(p_week_starts) as w;

  if public.app_usage_has_column('practice', 'user_id') then
    ts := case
      when public.app_usage_has_column('practice', 'completed_at') and public.app_usage_has_column('practice', 'created_at')
        then 'coalesce(completed_at, created_at)'
      when public.app_usage_has_column('practice', 'completed_at') then 'completed_at'
      else 'created_at'
    end;
    parts := parts || format(
      $q$select user_id::uuid, (%1$s)::timestamptz from public.practice
         where %1$s >= $1 and %1$s < $2 and user_id = any($3)$q$,
      ts
    );
  end if;

  if public.app_usage_has_column('practice_logs', 'user_id') then
    parts := parts || $q$select user_id::uuid, created_at::timestamptz from public.practice_logs
      where created_at >= $1 and created_at < $2 and user_id = any($3)$q$::text;
  end if;

  if public.app_usage_has_column('drill_score_logs', 'user_id') then
    parts := parts || $q$select user_id::uuid, created_at::timestamptz from public.drill_score_logs
      where created_at >= $1 and created_at < $2 and user_id = any($3)$q$::text;
  end if;

  if public.app_usage_has_column('rounds', 'user_id') then
    ts := case
      when public.app_usage_has_column('rounds', 'created_at') then 'created_at'
      when public.app_usage_has_column('rounds', 'date') then 'date::timestamptz'
      else null
    end;
    if ts is not null then
      parts := parts || format(
        $q$select user_id::uuid, (%1$s)::timestamptz from public.rounds
           where %1$s >= $1 and %1$s < $2 and user_id = any($3)$q$,
        ts
      );
    end if;
  end if;

  if public.app_usage_has_column('library_lesson_completions', 'completed_at') then
    parts := parts || $q$select user_id::uuid, completed_at::timestamptz from public.library_lesson_completions
      where completed_at >= $1 and completed_at < $2 and user_id = any($3)$q$::text;
  end if;

  if public.app_usage_has_column('coaching_posts', 'author_id') then
    parts := parts || $q$select author_id::uuid, created_at::timestamptz from public.coaching_posts
      where created_at >= $1 and created_at < $2 and author_id = student_id and author_id = any($3)$q$::text;
  end if;

  if public.app_usage_has_column('bunny_student_swings', 'uploaded_by') then
    parts := parts || $q$select uploaded_by::uuid, created_at::timestamptz from public.bunny_student_swings
      where created_at >= $1 and created_at < $2 and uploaded_by = any($3)$q$::text;
  end if;

  parts := parts || $q$select user_id, created_at from public.app_events
    where created_at >= $1 and created_at < $2 and user_id = any($3)$q$::text;

  if cardinality(parts) = 0 or cardinality(p_student_ids) = 0 then
    return query
      select w, 0
      from unnest(p_week_starts) as w
      order by w;
    return;
  end if;

  return query execute
    'with activity as (
       select distinct a.user_id, w.week_start
       from (' || array_to_string(parts, ' union all ') || ') as a(user_id, at)
       cross join unnest($4::timestamptz[]) as w(week_start)
       where a.at >= w.week_start and a.at < w.week_start + interval ''7 days''
     )
     select w.week_start, count(a.user_id)::int
     from unnest($4::timestamptz[]) as w(week_start)
     left join activity a using (week_start)
     group by w.week_start
     order by w.week_start'
    using since, until_at, p_student_ids, p_week_starts;
end;
$$;

revoke all on function public.coach_weekly_active_players(timestamptz[], uuid[]) from public, anon;
grant execute on function public.coach_weekly_active_players(timestamptz[], uuid[]) to authenticated;

notify pgrst, 'reload schema';
