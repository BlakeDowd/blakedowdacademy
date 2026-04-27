-- Full combine-hall fix (practice_logs + practice):
-- 1) practice_logs RPC: union "recent window" with rows that match ANY common combine protocol
--    log_type (Iron, Gauntlet, flop, survival, chipping, strike/speed tests, etc.) so busy DBs
--    do not drop older sessions for non–Iron combines either.
-- 2) practice RPC: same SECURITY DEFINER pattern as practice_logs — leaderboards read the full
--    practice table when direct SELECT is misconfigured (mirrors practice_select_authenticated).

-- ── practice_logs ───────────────────────────────────────────────────────────

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
            'start_line_speed_test'
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

-- ── practice (Aimpoint, wedge lateral, putting combines, iron fallback rows, etc.) ──

create or replace function public.academy_combine_leaderboard_practice(p_limit integer default 80000)
returns setof public.practice
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.practice
  order by created_at desc
  limit least(greatest(coalesce(nullif(p_limit, 0), 80000), 1), 150000);
$$;

comment on function public.academy_combine_leaderboard_practice(integer) is
  'Combine hall / stats: recent practice rows for all users. SECURITY DEFINER.';

revoke all on function public.academy_combine_leaderboard_practice(integer) from public;
grant execute on function public.academy_combine_leaderboard_practice(integer) to authenticated;

notify pgrst, 'reload schema';
