-- Widen leaderboard payload: the previous RPC only returned the newest `p_limit` rows globally.
-- Busy projects can drop older Iron Precision sessions so some users never appear.
-- This version UNIONs (a) recent rows globally with (b) recent rows whose log_type matches Iron variants.

create or replace function public.academy_combine_leaderboard_logs(p_limit integer default 40000)
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
      limit least(greatest(coalesce(nullif(p_limit, 0), 40000), 1), 100000)
    ) recent
    union
    select id from (
      select id from public.practice_logs
      where
        log_type ilike '%iron_precision_protocol%'
        or replace(lower(log_type), '_', '') like '%ironprecisionprotocol%'
      order by created_at desc
      limit 25000
    ) iron_rows
  )
  order by pl.created_at desc;
$$;

comment on function public.academy_combine_leaderboard_logs(integer) is
  'Combine hall: recent practice_logs plus guaranteed Iron-protocol rows (union by id). Callable by authenticated users.';

notify pgrst, 'reload schema';
