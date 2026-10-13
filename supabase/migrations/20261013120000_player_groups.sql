-- Coach-made player groups (e.g. Scholarship) for talent identification reports.
-- player_groups: the groups. player_group_members: who is in each group and when they started.
-- player_talent_profiles: date of birth and coach notes, coach-only.
-- Players can see the groups they belong to (shown as a badge on their profile) but never the notes.

create table if not exists public.player_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists player_groups_name_key on public.player_groups (lower(btrim(name)));

create table if not exists public.player_group_members (
  group_id uuid not null references public.player_groups (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  started_on date,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, player_id)
);

create index if not exists player_group_members_player_idx on public.player_group_members (player_id);

create table if not exists public.player_talent_profiles (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  date_of_birth date,
  notes text check (notes is null or char_length(notes) <= 4000),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.player_groups enable row level security;
alter table public.player_group_members enable row level security;
alter table public.player_talent_profiles enable row level security;

-- Groups: everyone signed in can read the names (for their own badge); only coaches change them.
drop policy if exists "player_groups_select" on public.player_groups;
create policy "player_groups_select" on public.player_groups
  for select to authenticated using (true);

drop policy if exists "player_groups_coach_write" on public.player_groups;
create policy "player_groups_coach_write" on public.player_groups
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Members: coaches see everyone, players see their own rows.
drop policy if exists "player_group_members_select" on public.player_group_members;
create policy "player_group_members_select" on public.player_group_members
  for select to authenticated using (public.is_coach() or player_id = auth.uid());

drop policy if exists "player_group_members_coach_write" on public.player_group_members;
create policy "player_group_members_coach_write" on public.player_group_members
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Talent profiles: coaches only.
drop policy if exists "player_talent_profiles_coach_all" on public.player_talent_profiles;
create policy "player_talent_profiles_coach_all" on public.player_talent_profiles
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

grant select, insert, update, delete on public.player_groups to authenticated;
grant select, insert, update, delete on public.player_group_members to authenticated;
grant select, insert, update, delete on public.player_talent_profiles to authenticated;

insert into public.player_groups (name) values ('Scholarship') on conflict do nothing;

notify pgrst, 'reload schema';
