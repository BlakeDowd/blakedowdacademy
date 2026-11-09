-- Coach can merge duplicate player spaces/accounts onto the profile that already has videos.
-- Also hardens link_player_to_pending_space when the player was already added as a separate space.

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

  -- Posts/reads filed under the invite space id move onto the player's account.
  update public.coaching_posts set student_id = p_player_id where student_id = invite.id;

  insert into public.coaching_reads (user_id, student_id, last_read_at)
  select user_id, p_player_id, last_read_at from public.coaching_reads where student_id = invite.id
  on conflict (user_id, student_id)
  do update set last_read_at = greatest(public.coaching_reads.last_read_at, excluded.last_read_at);
  delete from public.coaching_reads where student_id = invite.id;

  update public.coaching_assignments set student_id = p_player_id where student_id = invite.id;

  if existing_id is not null then
    -- Player already has a space (e.g. "Add existing" or a prior join). Keep that row,
    -- move invite metadata if useful, then drop the empty pending invite.
    update public.coaching_spaces keep
    set
      display_name = coalesce(nullif(btrim(keep.display_name), ''), invite.display_name),
      joined_at = coalesce(keep.joined_at, now())
    where keep.id = existing_id;

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

-- Move coaching content from one space key onto another, then clean up the empty duplicate.
-- p_keep / p_drop are either a player user id or a still-pending coaching_spaces.id.
create or replace function public.coach_merge_coaching_threads(p_keep uuid, p_drop uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_pending boolean;
  drop_pending boolean;
  keep_is_player boolean;
  drop_is_player boolean;
begin
  if auth.uid() is null or not public.is_coach() then
    raise exception 'not_coach';
  end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'pick_two_different';
  end if;

  keep_is_player := exists (select 1 from public.profiles where id = p_keep);
  drop_is_player := exists (select 1 from public.profiles where id = p_drop);
  keep_pending := exists (
    select 1 from public.coaching_spaces where id = p_keep and student_id is null
  );
  drop_pending := exists (
    select 1 from public.coaching_spaces where id = p_drop and student_id is null
  );

  if not keep_is_player and not keep_pending then
    raise exception 'keep_not_found';
  end if;
  if not drop_is_player and not drop_pending then
    raise exception 'drop_not_found';
  end if;

  if keep_is_player and exists (
    select 1 from public.profiles where id = p_keep and lower(trim(coalesce(role, ''))) = 'coach'
  ) then
    raise exception 'cannot_merge_coach';
  end if;
  if drop_is_player and exists (
    select 1 from public.profiles where id = p_drop and lower(trim(coalesce(role, ''))) = 'coach'
  ) then
    raise exception 'cannot_merge_coach';
  end if;

  -- Pending invite with videos + real player account → attach player (posts land on their login).
  if keep_pending and drop_is_player then
    perform public.link_player_to_pending_space(p_keep, p_drop);
    return p_drop; -- space key becomes the player's user id
  end if;

  if drop_pending and keep_is_player then
    perform public.link_player_to_pending_space(p_drop, p_keep);
    return p_keep;
  end if;

  -- Move thread content onto the keep key.
  update public.coaching_posts set student_id = p_keep where student_id = p_drop;

  insert into public.coaching_reads (user_id, student_id, last_read_at)
  select user_id, p_keep, last_read_at from public.coaching_reads where student_id = p_drop
  on conflict (user_id, student_id)
  do update set last_read_at = greatest(public.coaching_reads.last_read_at, excluded.last_read_at);
  delete from public.coaching_reads where student_id = p_drop;

  update public.coaching_assignments set student_id = p_keep where student_id = p_drop;

  if drop_pending then
    delete from public.coaching_spaces where id = p_drop and student_id is null;
  elsif drop_is_player then
    if keep_is_player then
      -- Full account merge so the empty login disappears from Spaces / player lists.
      perform public.merge_player_accounts(p_keep, p_drop);
    else
      delete from public.coaching_spaces where student_id = p_drop;
    end if;
  end if;

  -- Ensure the kept player has a coaching space row when keep is a real account.
  if keep_is_player and not exists (select 1 from public.coaching_spaces where student_id = p_keep) then
    insert into public.coaching_spaces (coach_id, student_id, display_name, joined_at)
    select
      auth.uid(),
      p_keep,
      coalesce(nullif(btrim(p.full_name), ''), 'Golfer'),
      now()
    from public.profiles p
    where p.id = p_keep;
  end if;

  return p_keep;
end;
$$;

grant execute on function public.coach_merge_coaching_threads(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
