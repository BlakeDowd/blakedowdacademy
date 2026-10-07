-- Coaches can see a player's login email in their space (e.g. when a player forgets which email they used).
-- Emails live in auth.users, which the app can't read directly; only coaches may call this.

create or replace function public.coach_player_email(p_player uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_coach() then
    raise exception 'not_coach' using errcode = '42501';
  end if;
  return (select u.email::text from auth.users u where u.id = p_player);
end;
$$;

revoke all on function public.coach_player_email(uuid) from public, anon;
grant execute on function public.coach_player_email(uuid) to authenticated;

notify pgrst, 'reload schema';
