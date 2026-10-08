-- Families: one login on a shared device for a parent and their kids. Every member is still a
-- separate player (their own profile, scores and coaching space); the app switches the signed-in
-- player when someone taps their face on "Who's practising?".
--
-- Coaches set families up. Children created for a family have no email of their own (`managed`);
-- the guardian is the person who signs in on the family device.

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'player' check (role in ('guardian', 'player')),
  managed boolean not null default false,
  added_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create index if not exists family_members_user_idx on public.family_members (user_id);

create or replace function public.is_family_member(p_family uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.family_members where family_id = p_family and user_id = auth.uid());
$$;

grant execute on function public.is_family_member(uuid) to authenticated;

alter table public.families enable row level security;
alter table public.family_members enable row level security;

drop policy if exists "families_select" on public.families;
create policy "families_select" on public.families
  for select to authenticated using (public.is_coach() or public.is_family_member(id));

drop policy if exists "families_write_coach" on public.families;
create policy "families_write_coach" on public.families
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "family_members_select" on public.family_members;
create policy "family_members_select" on public.family_members
  for select to authenticated using (public.is_coach() or public.is_family_member(family_id));

drop policy if exists "family_members_write_coach" on public.family_members;
create policy "family_members_write_coach" on public.family_members
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

grant select, insert, update, delete on public.families to authenticated;
grant select, insert, update, delete on public.family_members to authenticated;
grant all on public.families to service_role;
grant all on public.family_members to service_role;

-- Everyone the signed-in player can switch to (themselves included), for "Who's practising?".
create or replace function public.family_players()
returns table (user_id uuid, full_name text, preferred_icon_id text, role text, family_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (m.user_id)
    m.user_id,
    coalesce(nullif(trim(p.full_name), ''), 'Player'),
    p.preferred_icon_id::text,
    m.role,
    f.name
  from public.family_members mine
  join public.family_members m on m.family_id = mine.family_id
  join public.families f on f.id = m.family_id
  join public.profiles p on p.id = m.user_id
  where mine.user_id = auth.uid()
  order by m.user_id, (m.role = 'guardian') desc;
$$;

grant execute on function public.family_players() to authenticated;

notify pgrst, 'reload schema';
