-- Academy combine leaderboards (Iron Precision, Gauntlet, etc.) read from `practice_logs`.
-- If SELECT policies only allow `auth.uid() = user_id`, each browser only loads that user's rows
-- and community combine tables look empty for everyone else.
--
-- This RPC mirrors the intent of `practice_logs_select_authenticated` (USING (true)): any signed-in
-- user can read recent rows for ranking. Implemented as SECURITY DEFINER so leaderboards work even
-- when RLS was left on "select own" by mistake.
--
-- APPLY: `supabase db push` or paste in SQL Editor → API → Reload schema.

create or replace function public.academy_combine_leaderboard_logs(p_limit integer default 25000)
returns setof public.practice_logs
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.practice_logs
  order by created_at desc
  limit least(greatest(coalesce(nullif(p_limit, 0), 25000), 1), 50000);
$$;

comment on function public.academy_combine_leaderboard_logs(integer) is
  'Combine hall: recent practice_logs rows for all users (leaderboard aggregation). Callable by authenticated users.';

revoke all on function public.academy_combine_leaderboard_logs(integer) from public;
grant execute on function public.academy_combine_leaderboard_logs(integer) to authenticated;

notify pgrst, 'reload schema';
