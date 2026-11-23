-- Challenge practice_hours was counting coach-logged lessons (practice.type = 'lesson'),
-- so players entered the draw just by having a lesson. Exclude those so only self-logged
-- practice (freestyle, drills, etc.) counts toward the board and the random draw.

create or replace function public.community_challenge_board(p_challenge uuid)
returns table (player_id uuid, value numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  c public.community_challenges%rowtype;
  v_from timestamptz;
  v_to timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into c from public.community_challenges where id = p_challenge;
  if not found then
    return;
  end if;

  if c.mode = 'manual' then
    return query
      select e.user_id, e.score
        from public.community_challenge_entries e
       where e.challenge_id = c.id and e.status = 'approved';
    return;
  end if;

  v_from := c.starts_on::timestamp at time zone 'Australia/Sydney';
  v_to := (c.ends_on + 1)::timestamp at time zone 'Australia/Sydney';

  if c.metric = 'practice_hours' then
    -- Some sessions save to both tables, so take the larger rather than adding them.
    -- Coach lessons (type = 'lesson') do not count — only practice players logged themselves.
    return query
      select coalesce(p.uid, l.uid), round(greatest(coalesce(p.m, 0), coalesce(l.m, 0)) / 60.0, 1)
        from (
          select user_id as uid, sum(duration_minutes)::numeric as m
            from public.practice
           where created_at >= v_from and created_at < v_to
             and lower(trim(coalesce(type, ''))) <> 'lesson'
           group by user_id
        ) p
        full join (
          select user_id as uid, sum(duration_minutes)::numeric as m
            from public.practice_logs
           where created_at >= v_from and created_at < v_to
           group by user_id
        ) l on l.uid = p.uid
       where greatest(coalesce(p.m, 0), coalesce(l.m, 0)) > 0
         and public.community_is_player(coalesce(p.uid, l.uid));
  elsif c.metric = 'rounds' then
    return query
      select r.user_id, count(*)::numeric
        from public.rounds r
       where r.created_at >= v_from and r.created_at < v_to and public.community_is_player(r.user_id)
       group by r.user_id;
  elsif c.metric = 'low_gross' then
    return query
      select r.user_id, min(r.score)::numeric
        from public.rounds r
       where r.created_at >= v_from and r.created_at < v_to
         and coalesce(r.holes, 18) >= 18 and r.score > 0
         and public.community_is_player(r.user_id)
       group by r.user_id;
  elsif c.metric = 'low_nett' then
    return query
      select r.user_id, round(min(r.score - r.handicap)::numeric, 1)
        from public.rounds r
       where r.created_at >= v_from and r.created_at < v_to
         and coalesce(r.holes, 18) >= 18 and r.score > 0 and r.handicap is not null
         and public.community_is_player(r.user_id)
       group by r.user_id;
  elsif c.metric = 'drills' then
    return query
      select u.uid, count(*)::numeric
        from (
          select d.user_id as uid from public.drill_xp_awards d
           where d.day >= c.starts_on and d.day <= c.ends_on
          union all
          select pr.user_id from public.practice pr
           where pr.created_at >= v_from and pr.created_at < v_to and pr.notes::text like '%Completed Drill%'
        ) u
       where public.community_is_player(u.uid)
       group by u.uid;
  elsif c.metric = 'combines' then
    return query
      select cc.user_id, count(*)::numeric
        from public.combine_completions cc
       where cc.completed_at >= v_from and cc.completed_at < v_to and public.community_is_player(cc.user_id)
       group by cc.user_id;
  elsif c.metric = 'lessons' then
    return query
      select lc.user_id, count(*)::numeric
        from public.library_lesson_completions lc
       where lc.completed_at >= v_from and lc.completed_at < v_to and public.community_is_player(lc.user_id)
       group by lc.user_id;
  end if;
end;
$$;

revoke all on function public.community_challenge_board(uuid) from public, anon;
grant execute on function public.community_challenge_board(uuid) to authenticated;

notify pgrst, 'reload schema';
