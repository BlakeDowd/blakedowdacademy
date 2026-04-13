-- Backfill public.user_achievements from public.user_trophies so community leaderboard has data.
-- Idempotent: skips (user_id, achievement_key) pairs that already exist.
--
-- APPLY: paste in Supabase SQL Editor and Run (same as other migrations). Then API → Reload schema.

create or replace function public.backfill_my_user_achievements_from_trophies()
returns integer
language sql
security definer
set search_path = public
as $$
  with map(trophy_name, achievement_key) as (
    values
      ('First Steps', 'first-steps'),
      ('Dedicated', 'dedicated'),
      ('Practice Master', 'practice-master'),
      ('Practice Legend', 'practice-legend'),
      ('Student', 'student'),
      ('Scholar', 'scholar'),
      ('Expert', 'expert'),
      ('First Round', 'first-round'),
      ('Consistent', 'consistent'),
      ('Tracker', 'tracker'),
      ('Rising Star', 'rising-star'),
      ('Champion', 'champion'),
      ('Elite', 'elite'),
      ('Goal Achiever', 'goal-achiever'),
      ('Birdie Hunter', 'birdie-hunter'),
      ('Breaking 90', 'breaking-90'),
      ('Breaking 80', 'breaking-80'),
      ('Breaking 70', 'breaking-70'),
      ('Eagle Eye', 'eagle-eye'),
      ('Birdie Machine', 'birdie-machine'),
      ('Par Train', 'par-train'),
      ('Week Warrior', 'week-warrior'),
      ('Monthly Legend', 'monthly-legend'),
      ('Putting Professor', 'putting-professor'),
      ('Wedge Wizard', 'wedge-wizard'),
      ('Coach''s Pet', 'coachs-pet'),
      ('Combine Finisher', 'combine-finisher'),
      ('Champion: Putting Test 18 Holes', 'champion-putting-test-18')
  ),
  ins as (
    insert into public.user_achievements (user_id, achievement_key, created_at)
    select distinct on (ut.user_id, m.achievement_key)
      ut.user_id,
      m.achievement_key,
      coalesce(ut.unlocked_at::timestamptz, now())
    from public.user_trophies ut
    inner join map m on lower(btrim(ut.trophy_name)) = lower(btrim(m.trophy_name))
    where auth.uid() is not null
      and ut.user_id = auth.uid()
      and not exists (
        select 1
        from public.user_achievements ua
        where ua.user_id = ut.user_id
          and ua.achievement_key = m.achievement_key
      )
    order by ut.user_id, m.achievement_key, ut.unlocked_at desc nulls last
    returning 1
  )
  select coalesce((select count(*)::int from ins), 0);
$$;

comment on function public.backfill_my_user_achievements_from_trophies() is
  'Inserts missing user_achievements rows for the signed-in user from user_trophies (catalog name match). SECURITY DEFINER.';

revoke all on function public.backfill_my_user_achievements_from_trophies() from public;
grant execute on function public.backfill_my_user_achievements_from_trophies() to authenticated;


-- One-time backfill for all users (safe to re-run).
do $body$
begin
  if to_regclass('public.user_trophies') is null then
    raise notice 'backfill: public.user_trophies missing, skipped';
    return;
  end if;

  insert into public.user_achievements (user_id, achievement_key, created_at)
  select distinct on (ut.user_id, m.achievement_key)
    ut.user_id,
    m.achievement_key,
    coalesce(ut.unlocked_at::timestamptz, now())
  from public.user_trophies ut
  inner join (
    values
      ('First Steps', 'first-steps'),
      ('Dedicated', 'dedicated'),
      ('Practice Master', 'practice-master'),
      ('Practice Legend', 'practice-legend'),
      ('Student', 'student'),
      ('Scholar', 'scholar'),
      ('Expert', 'expert'),
      ('First Round', 'first-round'),
      ('Consistent', 'consistent'),
      ('Tracker', 'tracker'),
      ('Rising Star', 'rising-star'),
      ('Champion', 'champion'),
      ('Elite', 'elite'),
      ('Goal Achiever', 'goal-achiever'),
      ('Birdie Hunter', 'birdie-hunter'),
      ('Breaking 90', 'breaking-90'),
      ('Breaking 80', 'breaking-80'),
      ('Breaking 70', 'breaking-70'),
      ('Eagle Eye', 'eagle-eye'),
      ('Birdie Machine', 'birdie-machine'),
      ('Par Train', 'par-train'),
      ('Week Warrior', 'week-warrior'),
      ('Monthly Legend', 'monthly-legend'),
      ('Putting Professor', 'putting-professor'),
      ('Wedge Wizard', 'wedge-wizard'),
      ('Coach''s Pet', 'coachs-pet'),
      ('Combine Finisher', 'combine-finisher'),
      ('Champion: Putting Test 18 Holes', 'champion-putting-test-18')
  ) as m(trophy_name, achievement_key)
    on lower(btrim(ut.trophy_name)) = lower(btrim(m.trophy_name))
  where not exists (
    select 1
    from public.user_achievements ua
    where ua.user_id = ut.user_id
      and ua.achievement_key = m.achievement_key
  )
  order by ut.user_id, m.achievement_key, ut.unlocked_at desc nulls last;

end;
$body$;
