-- Community trophy collection leaderboard (cross-user) via SECURITY DEFINER RPCs.
-- RLS on public.user_achievements only allows each user to read their own rows.
--
-- APPLY (remote): Supabase Dashboard → SQL Editor → paste this entire file → Run.
-- Then Project Settings → API → Reload schema (fixes "function ... not in schema cache").
-- Or from repo: `supabase link` then `supabase db push`.

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
  with counts as (
    select ua.user_id, count(*)::bigint as total_collections
    from public.user_achievements ua
    group by ua.user_id
  ),
  ranked as (
    select
      c.user_id,
      c.total_collections,
      rank() over (order by c.total_collections desc) as rk
    from counts c
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
  'Top players by total rows in public.user_achievements (trophy collection events). Callable by authenticated users.';

revoke all on function public.trophy_collection_leaderboard(integer) from public;
grant execute on function public.trophy_collection_leaderboard(integer) to authenticated;


create or replace function public.trophy_collection_rank_for_user(p_user_id uuid)
returns table (rank_out bigint, total_out bigint)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select ua.user_id, count(*)::bigint as c
    from public.user_achievements ua
    group by ua.user_id
  ),
  ranked as (
    select user_id, c, rank() over (order by c desc) as rk
    from counts
  )
  select
    (select r.rk from ranked r where r.user_id = p_user_id limit 1) as rank_out,
    (select count(*)::bigint from public.user_achievements ua where ua.user_id = p_user_id) as total_out
  where auth.uid() is not null
    and auth.uid() = p_user_id;
$$;

comment on function public.trophy_collection_rank_for_user(uuid) is
  'Signed-in user only: rank() among all users by user_achievements count, plus that user''s row count.';

revoke all on function public.trophy_collection_rank_for_user(uuid) from public;
grant execute on function public.trophy_collection_rank_for_user(uuid) to authenticated;
