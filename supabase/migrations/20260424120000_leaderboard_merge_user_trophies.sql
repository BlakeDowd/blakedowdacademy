-- Community leaderboard: score each user by the higher of
--   - rows in public.user_trophies (trophies people actually have), and
--   - rows in public.user_achievements (per-event / multiplier history).
-- So rankings work even when achievements were never backfilled.

create or replace function public.trophy_collection_leaderboard(p_top_n integer default 40)
returns table (
  board_rank bigint,
  user_id uuid,
  display_name text,
  total_collections bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ut as (
    select t.user_id, count(*)::bigint as n
    from public.user_trophies t
    group by t.user_id
  ),
  ua as (
    select a.user_id, count(*)::bigint as n
    from public.user_achievements a
    group by a.user_id
  ),
  merged as (
    select
      coalesce(ut.user_id, ua.user_id) as user_id,
      greatest(coalesce(ut.n, 0), coalesce(ua.n, 0))::bigint as total_collections
    from ut
    full outer join ua on ut.user_id = ua.user_id
  ),
  ranked as (
    select
      m.user_id,
      m.total_collections,
      rank() over (order by m.total_collections desc) as rk
    from merged m
    where m.total_collections > 0
  )
  select
    r.rk as board_rank,
    r.user_id,
    coalesce(nullif(trim(p.full_name), ''), 'Academy Member') as display_name,
    r.total_collections
  from ranked r
  left join public.profiles p on p.id = r.user_id
  order by r.total_collections desc, display_name asc
  limit greatest(1, least(coalesce(p_top_n, 40), 200));
$$;

comment on function public.trophy_collection_leaderboard(integer) is
  'Top players by greatest(count(user_trophies), count(user_achievements)) per user. SECURITY DEFINER.';

revoke all on function public.trophy_collection_leaderboard(integer) from public;
grant execute on function public.trophy_collection_leaderboard(integer) to authenticated;


create or replace function public.trophy_collection_rank_for_user(p_user_id uuid)
returns table (rank_out bigint, total_out bigint)
language sql
stable
security definer
set search_path = public
as $$
  with ut as (
    select t.user_id, count(*)::bigint as n
    from public.user_trophies t
    group by t.user_id
  ),
  ua as (
    select a.user_id, count(*)::bigint as n
    from public.user_achievements a
    group by a.user_id
  ),
  merged as (
    select
      coalesce(ut.user_id, ua.user_id) as user_id,
      greatest(coalesce(ut.n, 0), coalesce(ua.n, 0))::bigint as total_collections
    from ut
    full outer join ua on ut.user_id = ua.user_id
  ),
  ranked as (
    select
      m.user_id,
      m.total_collections,
      rank() over (order by m.total_collections desc) as rk
    from merged m
    where m.total_collections > 0
  )
  select
    (select r.rk from ranked r where r.user_id = p_user_id limit 1) as rank_out,
    greatest(
      (select count(*)::bigint from public.user_trophies t where t.user_id = p_user_id),
      (select count(*)::bigint from public.user_achievements a where a.user_id = p_user_id)
    ) as total_out
  where auth.uid() is not null
    and auth.uid() = p_user_id;
$$;

comment on function public.trophy_collection_rank_for_user(uuid) is
  'Signed-in user only: rank by same merged score as trophy_collection_leaderboard; total_out is max(trophies, achievements).';

revoke all on function public.trophy_collection_rank_for_user(uuid) from public;
grant execute on function public.trophy_collection_rank_for_user(uuid) to authenticated;
