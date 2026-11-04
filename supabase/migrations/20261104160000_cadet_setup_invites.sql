-- Cadet-only setup invites: coach creates a named link; junior joins once and is enrolled.
-- Codes are "C" + 8 chars so /join/<code> can tell them apart from coaching / family links.

create table if not exists public.cadet_invites (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  hole_group smallint not null default 3 check (hole_group in (3, 5, 7, 10)),
  invite_code text not null unique,
  player_id uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_id is null or claimed_at is not null)
);

create index if not exists cadet_invites_coach_idx on public.cadet_invites (coach_id, created_at desc);
create index if not exists cadet_invites_player_idx on public.cadet_invites (player_id)
  where player_id is not null;

create or replace function public.cadet_new_invite_code()
returns text
language sql
volatile
as $$
  select 'C' || string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + get_byte(r.b, i) % 31, 1),
    '' order by i
  )
  from (select uuid_send(gen_random_uuid()) as b) r, unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i;
$$;

alter table public.cadet_invites
  alter column invite_code set default public.cadet_new_invite_code();

alter table public.cadet_invites enable row level security;

drop policy if exists "cadet_invites_coach_all" on public.cadet_invites;
create policy "cadet_invites_coach_all" on public.cadet_invites
  for all to authenticated
  using (public.is_coach())
  with check (public.is_coach() and coach_id = auth.uid());

drop policy if exists "cadet_invites_player_select" on public.cadet_invites;
create policy "cadet_invites_player_select" on public.cadet_invites
  for select to authenticated
  using (player_id = auth.uid());

grant select, insert, update, delete on public.cadet_invites to authenticated;

create or replace function public.cadet_invite_preview(p_code text)
returns table (
  display_name text,
  hole_group smallint,
  claimed boolean,
  is_self boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := upper(trim(p_code));
begin
  return query
  select
    i.display_name,
    i.hole_group,
    (i.player_id is not null) as claimed,
    (i.player_id is not null and i.player_id = auth.uid()) as is_self
  from public.cadet_invites i
  where i.invite_code = code;
end;
$$;

grant execute on function public.cadet_invite_preview(text) to anon, authenticated;

create or replace function public.accept_cadet_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := upper(trim(p_code));
  invite public.cadet_invites%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into invite
  from public.cadet_invites
  where invite_code = code
  for update;

  if not found then
    raise exception 'invite_not_found';
  end if;

  if invite.player_id is not null then
    if invite.player_id = uid then
      return uid;
    end if;
    raise exception 'invite_already_claimed';
  end if;

  -- Enrol into Cadet program at the invite's hole group.
  insert into public.cadet_enrollments (player_id, hole_group, status, updated_at)
  values (uid, invite.hole_group, 'active', now())
  on conflict (player_id) do update
    set hole_group = excluded.hole_group,
        status = 'active',
        updated_at = now();

  -- Fill blank profile names from the invite label so coach search matches.
  update public.profiles
  set full_name = invite.display_name
  where id = uid
    and (full_name is null or btrim(full_name) = '');

  update public.cadet_invites
  set player_id = uid,
      claimed_at = now(),
      updated_at = now()
  where id = invite.id;

  return uid;
end;
$$;

grant execute on function public.accept_cadet_invite(text) to authenticated;

notify pgrst, 'reload schema';
