-- Challenge winners are drawn at random from everyone who took part (anyone on the leaderboard).
-- The draw runs in the database so it is recorded once and can't be re-rolled.

alter table public.community_challenges
  add column if not exists winner_id uuid references auth.users (id) on delete set null,
  add column if not exists winner_drawn_at timestamptz,
  add column if not exists entrant_count integer;

create or replace function public.community_draw_winner(p_challenge uuid, p_podium jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.community_challenges%rowtype;
  v_pool uuid[];
  v_winner uuid;
  v_entrants integer;
begin
  if not public.is_coach() then
    raise exception 'coach_only' using errcode = '42501';
  end if;

  select * into c from public.community_challenges where id = p_challenge for update;
  if not found then
    raise exception 'challenge_not_found';
  end if;
  if c.winner_id is not null then
    raise exception 'already_drawn';
  end if;
  if (now() at time zone 'Australia/Sydney')::date <= c.ends_on then
    raise exception 'not_finished';
  end if;

  select array_agg(distinct b.player_id) into v_pool
    from public.community_challenge_board(p_challenge) b
   where b.player_id is not null;

  v_entrants := coalesce(cardinality(v_pool), 0);
  if v_entrants = 0 then
    raise exception 'no_entrants';
  end if;
  v_winner := v_pool[1 + floor(random() * v_entrants)::int];

  update public.community_challenges
     set winner_id = v_winner,
         winner_drawn_at = now(),
         entrant_count = v_entrants,
         results_posted_at = now()
   where id = c.id;

  insert into public.community_posts (author_id, kind, meta)
  values (
    auth.uid(),
    'challenge_result',
    jsonb_build_object(
      'challenge_id', c.id,
      'title', c.title,
      'winner', v_winner,
      'entrants', v_entrants,
      'podium', case when jsonb_typeof(p_podium) = 'array' then p_podium else '[]'::jsonb end
    )
  );

  return v_winner;
end;
$$;

revoke all on function public.community_draw_winner(uuid, jsonb) from public, anon;
grant execute on function public.community_draw_winner(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
