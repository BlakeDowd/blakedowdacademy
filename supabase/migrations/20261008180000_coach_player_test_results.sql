-- When a coach runs a combine for a player ("Test <name>"), the session row saves under the player,
-- but players can only update their own profile, so the player's XP and combine summary
-- (combine_profile: iron index, Iron Skills level, strike / start-line indexes) were left unchanged.
-- These coach-only functions apply just those two updates.

create or replace function public.coach_award_player_xp(p_player uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if not public.is_coach() then
    raise exception 'not_coach' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000 then
    raise exception 'bad_xp' using errcode = '22023';
  end if;

  update public.profiles p
     set total_xp = greatest(0, coalesce(p.total_xp, 0) + p_delta),
         current_level = case
           when greatest(0, coalesce(p.total_xp, 0) + p_delta) < 500 then 1
           when greatest(0, coalesce(p.total_xp, 0) + p_delta) < 1500 then 2
           when greatest(0, coalesce(p.total_xp, 0) + p_delta) < 3000 then 3
           else 4 + floor((greatest(0, coalesce(p.total_xp, 0) + p_delta) - 3000) / 2000.0)::integer
         end
   where p.id = p_player
   returning p.total_xp::integer into v_total;

  return v_total;
end;
$$;

revoke all on function public.coach_award_player_xp(uuid, integer) from public, anon;
grant execute on function public.coach_award_player_xp(uuid, integer) to authenticated;

create or replace function public.coach_merge_player_combine_profile(p_player uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_coach() then
    raise exception 'not_coach' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'bad_patch' using errcode = '22023';
  end if;

  update public.profiles
     set combine_profile = coalesce(combine_profile, '{}'::jsonb) || p_patch
   where id = p_player;
end;
$$;

revoke all on function public.coach_merge_player_combine_profile(uuid, jsonb) from public, anon;
grant execute on function public.coach_merge_player_combine_profile(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
