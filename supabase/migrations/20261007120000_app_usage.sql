-- Coach "Usage" tab: what players are doing across the app.
--   app_events: screens players open (throttled in the app to one row per screen per 30 min).
--   coach_usage_events(since): coach-only list of player actions from the tables the app already
--   writes to, plus app_events. Sources that don't exist in this database are skipped.

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  screen text not null check (char_length(screen) between 1 and 60),
  created_at timestamptz not null default now()
);

create index if not exists app_events_created_idx on public.app_events (created_at desc);
create index if not exists app_events_user_created_idx on public.app_events (user_id, created_at desc);

alter table public.app_events enable row level security;

drop policy if exists "app_events_insert_own" on public.app_events;
create policy "app_events_insert_own"
  on public.app_events for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "app_events_select_coach" on public.app_events;
create policy "app_events_select_coach"
  on public.app_events for select to authenticated
  using (public.is_coach());

grant select, insert on public.app_events to authenticated;

create or replace function public.app_usage_has_column(p_table text, p_column text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_column
  );
$$;

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

  parts := parts || $q$select user_id, 'screen'::text, screen, count(*)::int, 0, max(created_at)
    from public.app_events where created_at >= $1
    group by user_id, screen, date_trunc('hour', created_at)$q$::text;

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
