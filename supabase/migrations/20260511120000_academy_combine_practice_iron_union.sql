-- Iron Precision often falls back to `public.practice` when `practice_logs` insert fails (CHECK / columns).
-- The leaderboard RPC `academy_combine_leaderboard_practice` only returned the newest N practice rows,
-- so busy academies could drop older iron_fallback rows entirely. Union with iron-related rows (same
-- pattern as practice_logs RPC).

create or replace function public.academy_combine_leaderboard_practice(p_limit integer default 100000)
returns setof public.practice
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.practice p
  where p.id in (
    select id from (
      select id from public.practice
      order by created_at desc
      limit least(greatest(coalesce(nullif(p_limit, 0), 100000), 1), 200000)
    ) recent
    union
    select id from (
      select id from public.practice
      where
        coalesce(test_type, '') ilike '%iron_precision_protocol%'
        or coalesce(type, '') ilike '%iron_precision_protocol%'
        or replace(lower(coalesce(test_type, '') || coalesce(type, '')), '_', '') like '%ironprecisionprotocol%'
        or coalesce(notes::text, '') ilike '%iron_precision_protocol_fallback%'
      order by created_at desc
      limit 25000
    ) iron_fallback
  )
  order by p.created_at desc;
$$;

comment on function public.academy_combine_leaderboard_practice(integer) is
  'Combine hall: recent practice rows union Iron Precision fallback rows (union by id). SECURITY DEFINER.';

revoke all on function public.academy_combine_leaderboard_practice(integer) from public;
grant execute on function public.academy_combine_leaderboard_practice(integer) to authenticated;

notify pgrst, 'reload schema';
