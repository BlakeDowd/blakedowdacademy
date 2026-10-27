-- Stable Usage tab counts:
--   Screen / tool events fold by calendar day (matches the 30-min client throttle better than by hour).
--   Practice minutes stay as sum(duration_minutes); the app only adds timed sessions to Practice hrs.

create or replace function public.coach_usage_events(p_since timestamptz)
returns table (user_id uuid, source text, detail text, qty integer, minutes integer, at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[] := '{}';
  ts text;
begin
  if not public.is_coach() then
    raise exception 'not_coach' using errcode = '42501';
  end if;

  -- Practice sessions, roadmap drills and combine tests. Tests write one row per hole, so rows
  -- of the same type within an hour are folded into one action.
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

  -- One row per player / screen / calendar day. Qty is how many times they opened it that day
  -- (client already throttles to once per 30 min, so qty is roughly half-hour visits).
  parts := parts || $q$select user_id, 'screen'::text, screen, count(*)::int, 0, max(created_at)
    from public.app_events where created_at >= $1
    group by user_id, screen, (created_at at time zone 'utc')::date$q$::text;

  return query execute
    'select u.* from (' || array_to_string(parts, ' union all ') || ') as u(user_id, source, detail, qty, minutes, at)
     where u.user_id is not null
       and not exists (
         select 1 from public.profiles p
         where p.id = u.user_id and lower(trim(coalesce(p.role, ''''))) = ''coach''
       )
     order by u.at desc
     limit 20000'
    using p_since;
end;
$$;

revoke all on function public.coach_usage_events(timestamptz) from public, anon;
grant execute on function public.coach_usage_events(timestamptz) to authenticated;

notify pgrst, 'reload schema';
