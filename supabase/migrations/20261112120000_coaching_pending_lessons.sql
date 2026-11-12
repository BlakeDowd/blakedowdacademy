-- Lessons logged for invite spaces (player not signed up yet).
-- Claimed onto their profile when they join / are linked — swings + XP stay intact.

create table if not exists public.coaching_pending_lessons (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.coaching_spaces (id) on delete cascade,
  coach_id uuid not null references auth.users (id) on delete cascade,
  xp integer not null default 60 check (xp > 0),
  minutes integer not null default 60 check (minutes > 0),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_practice_id uuid
);

create index if not exists coaching_pending_lessons_space_created_idx
  on public.coaching_pending_lessons (space_id, created_at desc);

create index if not exists coaching_pending_lessons_unclaimed_idx
  on public.coaching_pending_lessons (space_id)
  where claimed_at is null;

comment on table public.coaching_pending_lessons is
  'Coach lesson XP/hours for a pending invite space. Applied to the player when they join.';

alter table public.coaching_pending_lessons enable row level security;

drop policy if exists "coaching_pending_lessons_select" on public.coaching_pending_lessons;
create policy "coaching_pending_lessons_select" on public.coaching_pending_lessons
  for select to authenticated
  using (
    coach_id = auth.uid()
    or public.is_coach()
    or exists (
      select 1 from public.coaching_spaces s
      where s.id = space_id and s.student_id = auth.uid()
    )
  );

drop policy if exists "coaching_pending_lessons_insert" on public.coaching_pending_lessons;
create policy "coaching_pending_lessons_insert" on public.coaching_pending_lessons
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and public.is_coach()
    and exists (
      select 1 from public.coaching_spaces s
      where s.id = space_id and s.student_id is null
    )
  );

grant select, insert on public.coaching_pending_lessons to authenticated;
grant all on public.coaching_pending_lessons to service_role;

-- Move pending-space practice/activity/annotations onto the player and claim lesson XP.
create or replace function public.coaching_claim_pending_space_side_effects(
  p_space_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_practice_id uuid;
  v_xp integer := 0;
  v_current_xp integer;
  v_new_xp integer;
  v_level integer;
begin
  if p_space_id is null or p_player_id is null then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_player_id) then
    return;
  end if;

  -- Remap anything filed under the invite space id onto the real player.
  update public.practice
     set user_id = p_player_id
   where user_id = p_space_id;

  update public.activity_logs
     set user_id = p_player_id
   where user_id = p_space_id;

  if to_regclass('public.coaching_video_annotations') is not null then
    execute
      'update public.coaching_video_annotations set student_id = $1 where student_id = $2'
      using p_player_id, p_space_id;
  end if;

  for rec in
    select id, xp, minutes
      from public.coaching_pending_lessons
     where space_id = p_space_id
       and claimed_at is null
     order by created_at asc
     for update
  loop
    insert into public.practice (user_id, type, duration_minutes, notes)
    values (
      p_player_id,
      'lesson',
      rec.minutes,
      format('Coaching lesson - %s minutes (from invite)', rec.minutes)
    )
    returning id into v_practice_id;

    insert into public.activity_logs (user_id, activity_type, activity_title)
    values (p_player_id, 'practice', 'Had a 1 hour lesson');

    v_xp := v_xp + coalesce(rec.xp, 60);

    update public.coaching_pending_lessons
       set claimed_at = now(),
           claimed_practice_id = v_practice_id
     where id = rec.id;
  end loop;

  if v_xp > 0 then
    select coalesce(total_xp, 0) into v_current_xp from public.profiles where id = p_player_id for update;
    v_new_xp := v_current_xp + v_xp;
    if v_new_xp < 500 then
      v_level := 1;
    elsif v_new_xp < 1500 then
      v_level := 2;
    elsif v_new_xp < 3000 then
      v_level := 3;
    else
      v_level := 4 + floor((v_new_xp - 3000) / 2000)::integer;
    end if;
    update public.profiles
       set total_xp = v_new_xp,
           current_level = v_level
     where id = p_player_id;
  end if;
end;
$$;

revoke all on function public.coaching_claim_pending_space_side_effects(uuid, uuid) from public, anon;
grant execute on function public.coaching_claim_pending_space_side_effects(uuid, uuid) to authenticated;

-- Patch join / link to claim pending lessons and remap side effects.
create or replace function public.accept_coaching_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  invite public.coaching_spaces%rowtype;
  meta_name text;
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
    select nullif(trim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'fullName', '')), '')
      into meta_name
      from auth.users where id = uid;
    insert into public.profiles (id, full_name, starting_handicap, created_at)
    values (
      uid,
      coalesce(meta_name, nullif(trim(invite.display_name), ''), 'Golfer'),
      54,
      now()
    )
    on conflict (id) do nothing;
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

  update public.coaching_assignments set student_id = uid where student_id = invite.id;

  update public.coaching_spaces set student_id = uid, joined_at = now() where id = invite.id;

  perform public.coaching_claim_pending_space_side_effects(invite.id, uid);

  return invite.id;
end;
$$;

grant execute on function public.accept_coaching_invite(text) to authenticated;

create or replace function public.link_player_to_pending_space(p_space_id uuid, p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.coaching_spaces%rowtype;
  existing_id uuid;
begin
  if auth.uid() is null or not public.is_coach() then
    raise exception 'not_coach';
  end if;

  select * into invite from public.coaching_spaces where id = p_space_id for update;
  if not found then
    raise exception 'space_not_found';
  end if;
  if invite.student_id is not null then
    raise exception 'space_not_pending';
  end if;
  if not exists (select 1 from public.profiles where id = p_player_id) then
    raise exception 'player_missing';
  end if;

  select id into existing_id
    from public.coaching_spaces
   where student_id = p_player_id and id <> p_space_id
   limit 1;

  update public.coaching_posts set student_id = p_player_id where student_id = invite.id;

  insert into public.coaching_reads (user_id, student_id, last_read_at)
  select user_id, p_player_id, last_read_at from public.coaching_reads where student_id = invite.id
  on conflict (user_id, student_id)
  do update set last_read_at = greatest(public.coaching_reads.last_read_at, excluded.last_read_at);
  delete from public.coaching_reads where student_id = invite.id;

  update public.coaching_assignments set student_id = p_player_id where student_id = invite.id;

  perform public.coaching_claim_pending_space_side_effects(invite.id, p_player_id);

  if existing_id is not null then
    update public.coaching_spaces keep
    set
      display_name = coalesce(nullif(btrim(keep.display_name), ''), invite.display_name),
      joined_at = coalesce(keep.joined_at, now())
    where keep.id = existing_id;

    -- Pending lessons already claimed onto the player; drop empty invite space.
    delete from public.coaching_spaces where id = invite.id;
    return existing_id;
  end if;

  update public.coaching_spaces
  set student_id = p_player_id, joined_at = now()
  where id = invite.id;

  return invite.id;
end;
$$;

grant execute on function public.link_player_to_pending_space(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
