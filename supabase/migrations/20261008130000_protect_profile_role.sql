-- profiles.role decides who is a coach (public.is_coach()), and coaches can save results for any
-- player. Players can update their own profile row, so stop anyone but a coach (or the dashboard /
-- service role) from setting or changing a role.

create or replace function public.profiles_protect_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if lower(trim(coalesce(new.role, ''))) = 'coach' and not public.is_coach() then
      raise exception 'Only a coach can make someone a coach';
    end if;
  elsif new.role is distinct from old.role and not public.is_coach() then
    raise exception 'Only a coach can change a role';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_role();
