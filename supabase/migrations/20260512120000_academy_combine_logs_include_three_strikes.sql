-- Ensure 3 Strikes Wedge Challenge rows are always included in combine-hall payloads.
-- Without this, older three_strikes sessions can fall outside the global "recent window"
-- in busy projects and disappear from leaderboard aggregations.

create or replace function public.academy_combine_leaderboard_logs(p_limit integer default 60000)
returns setof public.practice_logs
language sql
stable
security definer
set search_path = public
as $$
  select pl.*
  from public.practice_logs pl
  where pl.id in (
    select id from (
      select id from public.practice_logs
      order by created_at desc
      limit least(greatest(coalesce(nullif(p_limit, 0), 60000), 1), 120000)
    ) recent
    union
    select id from (
      select id from public.practice_logs
      where
        log_type = any (
          array[
            'flop_shot',
            'survival_20',
            'iron_face_control',
            'chipping',
            'strike_speed_control',
            'start_line_speed_test',
            'three_strikes'
          ]::text[]
        )
        or log_type ilike '%iron_precision_protocol%'
        or replace(lower(log_type), '_', '') like '%ironprecisionprotocol%'
        or log_type ilike '%gauntlet%'
      order by created_at desc
      limit 40000
    ) combine_rows
  )
  order by pl.created_at desc;
$$;

comment on function public.academy_combine_leaderboard_logs(integer) is
  'Combine hall: recent practice_logs rows union known combine log_types (all combines). SECURITY DEFINER.';

revoke all on function public.academy_combine_leaderboard_logs(integer) from public;
grant execute on function public.academy_combine_leaderboard_logs(integer) to authenticated;

notify pgrst, 'reload schema';
