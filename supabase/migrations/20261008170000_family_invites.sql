-- Family invite links: the coach sets up a family and its kids at the lesson, then texts the parent a
-- link. Whoever signs up or signs in through it becomes a family login (two parents can both join).
-- Family codes start with "F" so /join/<code> can tell them apart from coaching space invites.

alter table public.families add column if not exists invite_code text;
update public.families set invite_code = 'F' || public.coaching_new_invite_code() where invite_code is null;
alter table public.families alter column invite_code set default ('F' || public.coaching_new_invite_code());
alter table public.families alter column invite_code set not null;
create unique index if not exists families_invite_code_key on public.families (invite_code);

-- What the invite page shows. Only a count of players, so the link doesn't reveal the kids' names.
create or replace function public.family_invite_preview(p_code text)
returns table (family_name text, coach_name text, player_count integer, is_member boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.name,
    coalesce(nullif(trim(c.full_name), ''), 'Your coach'),
    (select count(*)::integer from public.family_members m where m.family_id = f.id and m.role = 'player'),
    exists (select 1 from public.family_members m where m.family_id = f.id and m.user_id = auth.uid())
  from public.families f
  left join public.profiles c on c.id = f.created_by
  where f.invite_code = upper(trim(p_code));
$$;

grant execute on function public.family_invite_preview(text) to anon, authenticated;

create or replace function public.accept_family_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  fam uuid;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;
  select id into fam from public.families where invite_code = upper(trim(p_code));
  if fam is null then
    raise exception 'invite_not_found';
  end if;
  if public.is_coach() then
    raise exception 'coach_cannot_join';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_missing';
  end if;
  insert into public.family_members (family_id, user_id, role)
  values (fam, uid, 'guardian')
  on conflict (family_id, user_id) do nothing;
  return fam;
end;
$$;

grant execute on function public.accept_family_invite(text) to authenticated;

-- Coach makes a new link, so an old one that was shared too widely stops working.
create or replace function public.reset_family_invite(p_family uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if not public.is_coach() then
    raise exception 'not_coach';
  end if;
  update public.families
  set invite_code = 'F' || public.coaching_new_invite_code()
  where id = p_family
  returning invite_code into code;
  return code;
end;
$$;

grant execute on function public.reset_family_invite(uuid) to authenticated;

notify pgrst, 'reload schema';
