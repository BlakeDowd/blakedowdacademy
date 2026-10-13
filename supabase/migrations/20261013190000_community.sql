-- Community: a feed everyone can post to, knuckle (fist bump) and comment on, plus coach-run challenges.
-- Player posts, comments and challenge entries wait for a coach to approve them before others see them.
-- Achievements (trophies, shared rounds, weekly goals, level ups, combine PBs, challenge results)
-- are added to the feed automatically. Requires is_coach().

-- ---------------------------------------------------------------- posts

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'post'
    check (kind in ('post', 'trophy', 'round', 'combine_pb', 'weekly_goals', 'level_up', 'challenge', 'challenge_result')),
  body text check (body is null or char_length(body) <= 2000),
  meta jsonb not null default '{}'::jsonb,
  source_key text unique,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint community_posts_post_needs_body check (kind <> 'post' or char_length(btrim(coalesce(body, ''))) > 0)
);

create index if not exists community_posts_feed_idx on public.community_posts (status, created_at desc);
create index if not exists community_posts_author_idx on public.community_posts (author_id, created_at desc);

alter table public.community_posts enable row level security;

drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts
  for select to authenticated
  using (status = 'approved' or author_id = auth.uid() or public.is_coach());

-- Players can only write plain posts as themselves; achievements are added by the triggers below.
drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts
  for insert to authenticated
  with check (public.is_coach() or (author_id = auth.uid() and kind = 'post'));

drop policy if exists "community_posts_update" on public.community_posts;
create policy "community_posts_update" on public.community_posts
  for update to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "community_posts_delete" on public.community_posts;
create policy "community_posts_delete" on public.community_posts
  for delete to authenticated using (author_id = auth.uid() or public.is_coach());

grant select, insert, update, delete on public.community_posts to authenticated;
grant all on public.community_posts to service_role;

-- ---------------------------------------------------------------- comments

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at);
create index if not exists community_comments_status_idx on public.community_comments (status, created_at desc);

alter table public.community_comments enable row level security;

drop policy if exists "community_comments_select" on public.community_comments;
create policy "community_comments_select" on public.community_comments
  for select to authenticated
  using (status = 'approved' or author_id = auth.uid() or public.is_coach());

drop policy if exists "community_comments_insert" on public.community_comments;
create policy "community_comments_insert" on public.community_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.community_posts p
      where p.id = post_id and (p.status = 'approved' or public.is_coach())
    )
  );

drop policy if exists "community_comments_update" on public.community_comments;
create policy "community_comments_update" on public.community_comments
  for update to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "community_comments_delete" on public.community_comments;
create policy "community_comments_delete" on public.community_comments
  for delete to authenticated using (author_id = auth.uid() or public.is_coach());

grant select, insert, update, delete on public.community_comments to authenticated;
grant all on public.community_comments to service_role;

-- ---------------------------------------------------------------- knuckles

create table if not exists public.community_knuckles (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_knuckles_user_idx on public.community_knuckles (user_id);

alter table public.community_knuckles enable row level security;

drop policy if exists "community_knuckles_select" on public.community_knuckles;
create policy "community_knuckles_select" on public.community_knuckles
  for select to authenticated using (true);

drop policy if exists "community_knuckles_insert" on public.community_knuckles;
create policy "community_knuckles_insert" on public.community_knuckles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "community_knuckles_delete" on public.community_knuckles;
create policy "community_knuckles_delete" on public.community_knuckles
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.community_knuckles to authenticated;
grant all on public.community_knuckles to service_role;

-- ---------------------------------------------------------------- approval

create or replace function public.community_moderate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.reviewed_by := null;
    new.reviewed_at := null;
    if public.is_coach() then
      new.status := 'approved';
    elsif tg_table_name = 'community_comments' then
      new.status := 'pending';
    elsif to_jsonb(new) ->> 'kind' = 'post' then
      new.status := 'pending';
    end if;
  elsif new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_moderate on public.community_posts;
create trigger community_posts_moderate
  before insert or update on public.community_posts
  for each row execute function public.community_moderate();

drop trigger if exists community_comments_moderate on public.community_comments;
create trigger community_comments_moderate
  before insert or update on public.community_comments
  for each row execute function public.community_moderate();

-- ---------------------------------------------------------------- achievements into the feed
-- Each trigger swallows its own errors so the round / trophy / XP save never fails because of the feed.

create or replace function public.community_feed_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := to_jsonb(new);
begin
  begin
    if tg_op = 'DELETE' then
      delete from public.community_posts where source_key = 'round:' || (to_jsonb(old) ->> 'id');
      return old;
    end if;
    if coalesce((r ->> 'share_on_community')::boolean, true)
      and coalesce((r ->> 'holes')::numeric, 18) >= 18
      and (r ->> 'score') is not null
      and (r ->> 'user_id') is not null then
      insert into public.community_posts (author_id, kind, meta, source_key)
      values (
        (r ->> 'user_id')::uuid,
        'round',
        jsonb_build_object(
          'round_id', r ->> 'id',
          'course', left(coalesce(r ->> 'course_name', r ->> 'course', ''), 80),
          'score', (r ->> 'score')::numeric,
          'handicap', (r ->> 'handicap')::numeric,
          'tier', r ->> 'event_tier'
        ),
        'round:' || (r ->> 'id')
      )
      on conflict (source_key) do nothing;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

drop trigger if exists community_feed_round_insert on public.rounds;
create trigger community_feed_round_insert
  after insert on public.rounds
  for each row execute function public.community_feed_round();

drop trigger if exists community_feed_round_delete on public.rounds;
create trigger community_feed_round_delete
  after delete on public.rounds
  for each row execute function public.community_feed_round();

-- Start the feed with the last two weeks of shared rounds.
insert into public.community_posts (author_id, kind, meta, source_key, created_at)
select r.user_id,
       'round',
       jsonb_build_object('round_id', r.id::text, 'course', left(coalesce(r.course_name, ''), 80),
                          'score', r.score, 'handicap', r.handicap),
       'round:' || r.id::text,
       r.created_at
  from public.rounds r
 where r.created_at > now() - interval '14 days'
   and coalesce(r.share_on_community, true)
   and coalesce(r.holes, 18) >= 18
   and r.score is not null
   and r.user_id is not null
on conflict (source_key) do nothing;

-- Trophies unlocked close together go into one post. The app back-dates trophies that were really
-- earned earlier; those come back out of the feed so a first visit doesn't flood it.
create or replace function public.community_feed_trophy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t jsonb := to_jsonb(new);
  v_user uuid;
  v_id text;
  v_at timestamptz;
  v_post uuid;
begin
  begin
    v_user := (t ->> 'user_id')::uuid;
    v_id := coalesce(nullif(t ->> 'achievement_id', ''), nullif(t ->> 'achievement_key', ''), nullif(t ->> 'trophy_name', ''));
    v_at := coalesce((t ->> 'earned_at')::timestamptz, (t ->> 'unlocked_at')::timestamptz, now());
    if v_user is null or v_id is null then
      return new;
    end if;

    if v_at < now() - interval '3 days' then
      update public.community_posts p
         set meta = jsonb_set(
               p.meta,
               '{trophies}',
               coalesce(
                 (select jsonb_agg(e) from jsonb_array_elements(p.meta -> 'trophies') e where e <> to_jsonb(v_id)),
                 '[]'::jsonb
               )
             )
       where p.author_id = v_user and p.kind = 'trophy' and p.created_at > now() - interval '30 days'
         and coalesce(p.meta -> 'trophies', '[]'::jsonb) ? v_id;
      delete from public.community_posts
       where author_id = v_user and kind = 'trophy'
         and jsonb_array_length(coalesce(meta -> 'trophies', '[]'::jsonb)) = 0;
      return new;
    end if;

    if tg_op = 'UPDATE' then
      return new;
    end if;

    select id into v_post
      from public.community_posts
     where author_id = v_user and kind = 'trophy' and created_at > now() - interval '30 minutes'
     order by created_at desc
     limit 1;

    if v_post is not null then
      update public.community_posts
         set meta = jsonb_set(meta, '{trophies}', coalesce(meta -> 'trophies', '[]'::jsonb) || to_jsonb(v_id))
       where id = v_post and not (coalesce(meta -> 'trophies', '[]'::jsonb) ? v_id);
    else
      insert into public.community_posts (author_id, kind, meta)
      values (v_user, 'trophy', jsonb_build_object('trophies', jsonb_build_array(v_id)));
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.user_trophies') is not null then
    execute 'drop trigger if exists community_feed_trophy on public.user_trophies';
    execute 'create trigger community_feed_trophy after insert or update on public.user_trophies
             for each row execute function public.community_feed_trophy()';
  end if;
end $$;

create or replace function public.community_feed_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.current_level is not null and old.current_level is not null
      and new.current_level > old.current_level and new.current_level > 1 then
      insert into public.community_posts (author_id, kind, meta, source_key)
      values (new.id, 'level_up', jsonb_build_object('level', new.current_level),
              'level:' || new.id || ':' || new.current_level)
      on conflict (source_key) do nothing;
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

drop trigger if exists community_feed_level on public.profiles;
create trigger community_feed_level
  after update of current_level on public.profiles
  for each row execute function public.community_feed_level();

create or replace function public.community_feed_weekly_goals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.community_posts (author_id, kind, meta, source_key)
    values (new.user_id, 'weekly_goals', jsonb_build_object('week_start', new.week_start),
            'weekly:' || new.user_id || ':' || new.week_start)
    on conflict (source_key) do nothing;
  exception when others then null;
  end;
  return new;
end;
$$;

drop trigger if exists community_feed_weekly_goals on public.weekly_goal_xp_awards;
create trigger community_feed_weekly_goals
  after insert on public.weekly_goal_xp_awards
  for each row execute function public.community_feed_weekly_goals();

-- Combine results are spread over several tables, so the app spots a new personal best and shares it here.
create or replace function public.community_share_combine_pb(p_combine text, p_display text, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_combine !~ '^[A-Za-z0-9_]{1,40}$'
    or p_display !~ '^[-+0-9A-Za-z .,/()%]{1,30}$'
    or p_at < now() - interval '14 days'
    or p_at > now() + interval '1 day' then
    raise exception 'invalid_personal_best';
  end if;
  insert into public.community_posts (author_id, kind, meta, source_key, created_at)
  values (
    auth.uid(),
    'combine_pb',
    jsonb_build_object('combine', p_combine, 'display', p_display),
    'pb:' || auth.uid() || ':' || p_combine || ':' || floor(extract(epoch from p_at))::bigint,
    p_at
  )
  on conflict (source_key) do nothing;
end;
$$;

revoke all on function public.community_share_combine_pb(text, text, timestamptz) from public, anon;
grant execute on function public.community_share_combine_pb(text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------- challenges

create table if not exists public.community_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text check (description is null or char_length(description) <= 600),
  mode text not null check (mode in ('auto', 'manual')),
  metric text check (
    metric is null or metric in ('practice_hours', 'rounds', 'low_gross', 'low_nett', 'drills', 'combines', 'lessons')
  ),
  unit text check (unit is null or char_length(unit) <= 30),
  lower_is_better boolean not null default false,
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  results_posted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint community_challenges_dates check (ends_on >= starts_on),
  constraint community_challenges_metric check (mode = 'manual' or metric is not null)
);

create index if not exists community_challenges_dates_idx on public.community_challenges (ends_on desc);

alter table public.community_challenges enable row level security;

drop policy if exists "community_challenges_select" on public.community_challenges;
create policy "community_challenges_select" on public.community_challenges
  for select to authenticated using (true);

drop policy if exists "community_challenges_write" on public.community_challenges;
create policy "community_challenges_write" on public.community_challenges
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

grant select, insert, update, delete on public.community_challenges to authenticated;
grant all on public.community_challenges to service_role;

create table if not exists public.community_challenge_entries (
  challenge_id uuid not null references public.community_challenges (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score numeric,
  done boolean not null default false,
  note text check (note is null or char_length(note) <= 280),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists community_challenge_entries_status_idx on public.community_challenge_entries (status);

alter table public.community_challenge_entries enable row level security;

drop policy if exists "community_entries_select" on public.community_challenge_entries;
create policy "community_entries_select" on public.community_challenge_entries
  for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_coach());

drop policy if exists "community_entries_insert" on public.community_challenge_entries;
create policy "community_entries_insert" on public.community_challenge_entries
  for insert to authenticated with check (user_id = auth.uid() or public.is_coach());

drop policy if exists "community_entries_update" on public.community_challenge_entries;
create policy "community_entries_update" on public.community_challenge_entries
  for update to authenticated
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());

drop policy if exists "community_entries_delete" on public.community_challenge_entries;
create policy "community_entries_delete" on public.community_challenge_entries
  for delete to authenticated using (user_id = auth.uid() or public.is_coach());

grant select, insert, update, delete on public.community_challenge_entries to authenticated;
grant all on public.community_challenge_entries to service_role;

-- A player changing their entry sends it back for a coach to check.
create or replace function public.community_entry_moderate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if public.is_coach() then
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
      if tg_op = 'INSERT' then
        new.status := 'approved';
      end if;
    end if;
  else
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists community_entry_moderate on public.community_challenge_entries;
create trigger community_entry_moderate
  before insert or update on public.community_challenge_entries
  for each row execute function public.community_entry_moderate();

-- New challenges are announced in the feed; deleting one removes its posts.
create or replace function public.community_feed_challenge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.community_posts
     where kind in ('challenge', 'challenge_result') and meta ->> 'challenge_id' = old.id::text;
    return old;
  end if;
  insert into public.community_posts (author_id, kind, meta, source_key)
  values (new.created_by, 'challenge', jsonb_build_object('challenge_id', new.id), 'challenge:' || new.id)
  on conflict (source_key) do nothing;
  return new;
end;
$$;

drop trigger if exists community_feed_challenge_insert on public.community_challenges;
create trigger community_feed_challenge_insert
  after insert on public.community_challenges
  for each row execute function public.community_feed_challenge();

drop trigger if exists community_feed_challenge_delete on public.community_challenges;
create trigger community_feed_challenge_delete
  after delete on public.community_challenges
  for each row execute function public.community_feed_challenge();

-- Leaderboard for a challenge. Auto challenges are worked out from logged practice, rounds, drills,
-- combines and lessons between the start and end dates (Sydney time). Coaches are left out.
create or replace function public.community_is_player(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where id = p_user and role = 'coach');
$$;

create or replace function public.community_challenge_board(p_challenge uuid)
returns table (player_id uuid, value numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  c public.community_challenges%rowtype;
  v_from timestamptz;
  v_to timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into c from public.community_challenges where id = p_challenge;
  if not found then
    return;
  end if;

  if c.mode = 'manual' then
    return query
      select e.user_id, e.score
        from public.community_challenge_entries e
       where e.challenge_id = c.id and e.status = 'approved';
    return;
  end if;

  v_from := c.starts_on::timestamp at time zone 'Australia/Sydney';
  v_to := (c.ends_on + 1)::timestamp at time zone 'Australia/Sydney';

  if c.metric = 'practice_hours' then
    -- Some sessions save to both tables, so take the larger rather than adding them.
    return query
      select coalesce(p.uid, l.uid), round(greatest(coalesce(p.m, 0), coalesce(l.m, 0)) / 60.0, 1)
        from (select user_id as uid, sum(duration_minutes)::numeric as m from public.practice
               where created_at >= v_from and created_at < v_to group by user_id) p
        full join (select user_id as uid, sum(duration_minutes)::numeric as m from public.practice_logs
               where created_at >= v_from and created_at < v_to group by user_id) l on l.uid = p.uid
       where greatest(coalesce(p.m, 0), coalesce(l.m, 0)) > 0
         and public.community_is_player(coalesce(p.uid, l.uid));
  elsif c.metric = 'rounds' then
    return query
      select r.user_id, count(*)::numeric
        from public.rounds r
       where r.created_at >= v_from and r.created_at < v_to and public.community_is_player(r.user_id)
       group by r.user_id;
  elsif c.metric = 'low_gross' then
    return query
      select r.user_id, min(r.score)::numeric
        from public.rounds r
       where r.created_at >= v_from and r.created_at < v_to
         and coalesce(r.holes, 18) >= 18 and r.score > 0
         and public.community_is_player(r.user_id)
       group by r.user_id;
  elsif c.metric = 'low_nett' then
    return query
      select r.user_id, round(min(r.score - r.handicap)::numeric, 1)
        from public.rounds r
       where r.created_at >= v_from and r.created_at < v_to
         and coalesce(r.holes, 18) >= 18 and r.score > 0 and r.handicap is not null
         and public.community_is_player(r.user_id)
       group by r.user_id;
  elsif c.metric = 'drills' then
    return query
      select u.uid, count(*)::numeric
        from (
          select d.user_id as uid from public.drill_xp_awards d
           where d.day >= c.starts_on and d.day <= c.ends_on
          union all
          select pr.user_id from public.practice pr
           where pr.created_at >= v_from and pr.created_at < v_to and pr.notes::text like '%Completed Drill%'
        ) u
       where public.community_is_player(u.uid)
       group by u.uid;
  elsif c.metric = 'combines' then
    return query
      select cc.user_id, count(*)::numeric
        from public.combine_completions cc
       where cc.completed_at >= v_from and cc.completed_at < v_to and public.community_is_player(cc.user_id)
       group by cc.user_id;
  elsif c.metric = 'lessons' then
    return query
      select lc.user_id, count(*)::numeric
        from public.library_lesson_completions lc
       where lc.completed_at >= v_from and lc.completed_at < v_to and public.community_is_player(lc.user_id)
       group by lc.user_id;
  end if;
end;
$$;

revoke all on function public.community_challenge_board(uuid) from public, anon;
grant execute on function public.community_challenge_board(uuid) to authenticated;

notify pgrst, 'reload schema';