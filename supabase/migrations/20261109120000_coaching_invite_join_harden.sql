-- Harden invite join: create a minimal profile if missing, and let coaches
-- attach a player who already signed up without the invite link.

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

  -- Profile may be missing if signup insert failed; create a minimal one so join still works.
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

  update public.coaching_spaces set student_id = uid, joined_at = now() where id = invite.id;
  return invite.id;
end;
$$;

grant execute on function public.accept_coaching_invite(text) to authenticated;

-- Coach links an already-signed-up player into a still-waiting invite space (videos/posts transfer).
create or replace function public.link_player_to_pending_space(p_space_id uuid, p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.coaching_spaces%rowtype;
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
  if exists (
    select 1 from public.coaching_spaces
    where student_id = p_player_id and id <> p_space_id
  ) then
    raise exception 'already_linked';
  end if;

  update public.coaching_posts set student_id = p_player_id where student_id = invite.id;

  insert into public.coaching_reads (user_id, student_id, last_read_at)
  select user_id, p_player_id, last_read_at from public.coaching_reads where student_id = invite.id
  on conflict (user_id, student_id)
  do update set last_read_at = greatest(public.coaching_reads.last_read_at, excluded.last_read_at);
  delete from public.coaching_reads where student_id = invite.id;

  update public.coaching_spaces
  set student_id = p_player_id, joined_at = now()
  where id = invite.id;

  return invite.id;
end;
$$;

grant execute on function public.link_player_to_pending_space(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
