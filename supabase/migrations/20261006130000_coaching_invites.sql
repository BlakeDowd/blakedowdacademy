-- Coach-created spaces with invite links (CoachNow style). A coach creates a space for a player,
-- can post swings into it straight away, and shares an invite link. When the player opens the link
-- and joins, everything already in the space moves onto their account.
--
-- Space key: coaching_posts.student_id and coaching_reads.student_id hold the player's user id once
-- they have joined, or the coaching_spaces.id while the invite is still waiting.
--
-- `plan` is recorded for future paid tiers and invite-only sign-up. Nothing checks it yet.

create or replace function public.coaching_new_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + get_byte(r.b, i) % 31, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) r, unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i;
$$;

create table if not exists public.coaching_spaces (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles (id) on delete cascade,
  coach_id uuid references public.profiles (id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  invite_code text not null unique default public.coaching_new_invite_code(),
  plan text not null default 'free' check (plan in ('free', 'paid')),
  created_at timestamptz not null default now(),
  joined_at timestamptz
);

create index if not exists coaching_spaces_student_idx on public.coaching_spaces (student_id);
create index if not exists coaching_spaces_coach_idx on public.coaching_spaces (coach_id);

alter table public.coaching_spaces enable row level security;

drop policy if exists "coaching_spaces_select" on public.coaching_spaces;
create policy "coaching_spaces_select"
  on public.coaching_spaces for select to authenticated
  using (student_id = auth.uid() or public.is_coach());

drop policy if exists "coaching_spaces_insert_coach" on public.coaching_spaces;
create policy "coaching_spaces_insert_coach"
  on public.coaching_spaces for insert to authenticated
  with check (public.is_coach() and coach_id = auth.uid());

drop policy if exists "coaching_spaces_update_coach" on public.coaching_spaces;
create policy "coaching_spaces_update_coach"
  on public.coaching_spaces for update to authenticated
  using (public.is_coach())
  with check (public.is_coach());

drop policy if exists "coaching_spaces_delete_coach" on public.coaching_spaces;
create policy "coaching_spaces_delete_coach"
  on public.coaching_spaces for delete to authenticated
  using (public.is_coach());

grant select, insert, update, delete on public.coaching_spaces to authenticated;

-- Players who already have posts get a space record so they stay on the coach's Spaces screen.
insert into public.coaching_spaces (student_id, display_name, created_at, joined_at)
select p.id, coalesce(nullif(trim(p.full_name), ''), 'Golfer'), min(c.created_at), min(c.created_at)
from public.coaching_posts c
join public.profiles p on p.id = c.student_id
where lower(trim(coalesce(p.role, ''))) <> 'coach'
  and not exists (select 1 from public.coaching_spaces s where s.student_id = p.id)
group by p.id, p.full_name;

-- Posts and read markers can now point at a waiting space instead of a profile.
do $$
declare
  fk record;
begin
  for fk in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.conrelid in ('public.coaching_posts'::regclass, 'public.coaching_reads'::regclass)
      and a.attname = 'student_id'
  loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
  end loop;
end $$;

-- Photos keep the folder they were uploaded to, which is the waiting space's id for early posts.
alter table public.coaching_posts drop constraint if exists coaching_posts_image_in_space;

create or replace function public.coaching_space_key_exists(key uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = key)
      or exists (select 1 from public.coaching_spaces where id = key and student_id is null);
$$;

grant execute on function public.coaching_space_key_exists(uuid) to authenticated;

drop policy if exists "coaching_posts_insert" on public.coaching_posts;
create policy "coaching_posts_insert"
  on public.coaching_posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      student_id = auth.uid()
      or (public.is_coach() and public.coaching_space_key_exists(student_id))
    )
    and (image_path is null or split_part(image_path, '/', 1) = student_id::text)
    and (
      coaching_posts.parent_id is null
      or exists (
        select 1 from public.coaching_posts parent
        where parent.id = coaching_posts.parent_id
          and parent.student_id = coaching_posts.student_id
          and parent.parent_id is null
      )
    )
  );

drop policy if exists "coaching_photos_select_joined_space" on storage.objects;
create policy "coaching_photos_select_joined_space"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'coaching-photos'
    and exists (
      select 1 from public.coaching_spaces s
      where s.id::text = (storage.foldername(name))[1] and s.student_id = auth.uid()
    )
  );

-- Without the foreign keys, clean up by hand when a player or a waiting space is deleted.
create or replace function public.coaching_cleanup_space_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'coaching_spaces' then
    if old.student_id is not null then
      return old;
    end if;
  end if;
  delete from public.coaching_posts where student_id = old.id;
  delete from public.coaching_reads where student_id = old.id;
  return old;
end;
$$;

drop trigger if exists coaching_profiles_cleanup on public.profiles;
create trigger coaching_profiles_cleanup
  after delete on public.profiles
  for each row execute function public.coaching_cleanup_space_key();

drop trigger if exists coaching_spaces_cleanup on public.coaching_spaces;
create trigger coaching_spaces_cleanup
  after delete on public.coaching_spaces
  for each row execute function public.coaching_cleanup_space_key();

-- What the invite page shows before someone signs in.
create or replace function public.coaching_invite_preview(p_code text)
returns table (display_name text, coach_name text, joined boolean, joined_by_you boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.display_name,
    coalesce(nullif(trim(c.full_name), ''), 'Your coach'),
    s.student_id is not null,
    coalesce(s.student_id = auth.uid(), false)
  from public.coaching_spaces s
  left join public.profiles c on c.id = s.coach_id
  where s.invite_code = upper(trim(p_code));
$$;

grant execute on function public.coaching_invite_preview(text) to anon, authenticated;

create or replace function public.accept_coaching_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  invite public.coaching_spaces%rowtype;
begin
  if uid is null then
    raise exception 'not_signed_in';
  end if;

  select * into invite from public.coaching_spaces where invite_code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'invite_not_found';
  end if;
  if invite.student_id = uid then
    return invite.id;
  end if;
  if invite.student_id is not null then
    raise exception 'invite_used';
  end if;
  if public.is_coach() then
    raise exception 'coach_cannot_join';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_missing';
  end if;

  update public.coaching_posts set student_id = uid where student_id = invite.id;

  insert into public.coaching_reads (user_id, student_id, last_read_at)
  select user_id, uid, last_read_at from public.coaching_reads where student_id = invite.id
  on conflict (user_id, student_id)
  do update set last_read_at = greatest(public.coaching_reads.last_read_at, excluded.last_read_at);
  delete from public.coaching_reads where student_id = invite.id;

  update public.coaching_spaces set student_id = uid, joined_at = now() where id = invite.id;
  return invite.id;
end;
$$;

grant execute on function public.accept_coaching_invite(text) to authenticated;

notify pgrst, 'reload schema';
