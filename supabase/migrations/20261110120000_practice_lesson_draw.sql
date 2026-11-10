-- Community lesson draw: earn tickets via practice (and later combine / drills / tools).
-- Default live rule: every 60 logged practice minutes = 1 ticket toward 50% off a lesson.

create table if not exists public.practice_draw_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  prize text not null,
  minutes_per_ticket integer not null default 60
    check (minutes_per_ticket > 0),
  -- Which actions earn tickets. 0 / missing = off; set >0 to enable later.
  -- practice_minutes_per_ticket mirrors minutes_per_ticket for UI copy.
  earn_rules jsonb not null default jsonb_build_object(
    'practice_minutes_per_ticket', 60,
    'combine_tickets', 0,
    'drill_tickets', 0,
    'tool_tickets', 0
  ),
  status text not null default 'active'
    check (status in ('active', 'closed', 'drawn')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  winner_id uuid references auth.users (id) on delete set null,
  winner_drawn_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists practice_draw_campaigns_one_active
  on public.practice_draw_campaigns ((status))
  where status = 'active';

comment on table public.practice_draw_campaigns is
  'Community promo draws. Live: practice minutes → tickets. earn_rules can enable combine/drill/tool later.';

create table if not exists public.practice_draw_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.practice_draw_campaigns (id) on delete cascade,
  tickets integer not null default 0 check (tickets >= 0),
  minutes_bank integer not null default 0 check (minutes_bank >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, campaign_id)
);

create index if not exists practice_draw_progress_campaign_tickets_idx
  on public.practice_draw_progress (campaign_id, tickets desc);

create table if not exists public.practice_draw_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.practice_draw_campaigns (id) on delete cascade,
  source text not null default 'practice'
    check (source in ('practice', 'combine', 'drill', 'tool')),
  source_id uuid,
  -- Legacy alias for practice source_id (kept for older clients).
  practice_id uuid,
  minutes_added integer not null default 0 check (minutes_added >= 0),
  tickets_awarded integer not null default 0 check (tickets_awarded >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists practice_draw_events_campaign_source_uidx
  on public.practice_draw_events (campaign_id, source, source_id)
  where source_id is not null;

create unique index if not exists practice_draw_events_campaign_practice_uidx
  on public.practice_draw_events (campaign_id, practice_id)
  where practice_id is not null;

alter table public.practice_draw_campaigns enable row level security;
alter table public.practice_draw_progress enable row level security;
alter table public.practice_draw_events enable row level security;

drop policy if exists "practice_draw_campaigns_select" on public.practice_draw_campaigns;
create policy "practice_draw_campaigns_select" on public.practice_draw_campaigns
  for select to authenticated
  using (true);

drop policy if exists "practice_draw_progress_select" on public.practice_draw_progress;
create policy "practice_draw_progress_select" on public.practice_draw_progress
  for select to authenticated
  using (true);

drop policy if exists "practice_draw_events_select" on public.practice_draw_events;
create policy "practice_draw_events_select" on public.practice_draw_events
  for select to authenticated
  using (user_id = auth.uid() or public.is_coach());

grant select on public.practice_draw_campaigns to authenticated;
grant select on public.practice_draw_progress to authenticated;
grant select on public.practice_draw_events to authenticated;
grant all on public.practice_draw_campaigns to service_role;
grant all on public.practice_draw_progress to service_role;
grant all on public.practice_draw_events to service_role;

-- Flat ticket award (combine / drill / tool). Respects earn_rules; dedupes on source+source_id.
create or replace function public.award_draw_tickets(
  p_source text,
  p_tickets integer default 1,
  p_source_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign public.practice_draw_campaigns%rowtype;
  v_bank integer;
  v_tickets integer;
  v_awarded integer := 0;
  v_rule_key text;
  v_rule_val integer;
  v_allowed integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('combine', 'drill', 'tool') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_source');
  end if;
  if p_tickets is null or p_tickets < 1 then
    return jsonb_build_object('ok', true, 'tickets_awarded', 0, 'reason', 'no_tickets');
  end if;

  select * into v_campaign
    from public.practice_draw_campaigns
   where status = 'active'
     and (ends_at is null or ends_at > now())
   order by starts_at desc
   limit 1
   for update;

  if not found then
    return jsonb_build_object('ok', true, 'tickets_awarded', 0, 'reason', 'no_active_campaign');
  end if;

  v_rule_key := p_source || '_tickets';
  v_rule_val := coalesce((v_campaign.earn_rules ->> v_rule_key)::integer, 0);
  if v_rule_val < 1 then
    return jsonb_build_object(
      'ok', true,
      'tickets_awarded', 0,
      'campaign_id', v_campaign.id,
      'reason', 'source_disabled'
    );
  end if;
  v_allowed := least(p_tickets, v_rule_val);

  if p_source_id is not null
     and exists (
       select 1 from public.practice_draw_events e
        where e.campaign_id = v_campaign.id
          and e.source = p_source
          and e.source_id = p_source_id
     ) then
    select tickets, minutes_bank into v_tickets, v_bank
      from public.practice_draw_progress
     where user_id = v_uid and campaign_id = v_campaign.id;
    return jsonb_build_object(
      'ok', true,
      'tickets_awarded', 0,
      'tickets_total', coalesce(v_tickets, 0),
      'minutes_bank', coalesce(v_bank, 0),
      'minutes_to_next', greatest(0, v_campaign.minutes_per_ticket - coalesce(v_bank, 0)),
      'campaign_id', v_campaign.id,
      'reason', 'already_counted'
    );
  end if;

  insert into public.practice_draw_progress (user_id, campaign_id, tickets, minutes_bank, updated_at)
  values (v_uid, v_campaign.id, 0, 0, now())
  on conflict (user_id, campaign_id) do nothing;

  select tickets, minutes_bank into v_tickets, v_bank
    from public.practice_draw_progress
   where user_id = v_uid and campaign_id = v_campaign.id
   for update;

  v_tickets := coalesce(v_tickets, 0) + v_allowed;
  v_awarded := v_allowed;
  v_bank := coalesce(v_bank, 0);

  update public.practice_draw_progress
     set tickets = v_tickets,
         updated_at = now()
   where user_id = v_uid and campaign_id = v_campaign.id;

  insert into public.practice_draw_events (
    user_id, campaign_id, source, source_id, minutes_added, tickets_awarded
  ) values (
    v_uid, v_campaign.id, p_source, p_source_id, 0, v_awarded
  );

  return jsonb_build_object(
    'ok', true,
    'tickets_awarded', v_awarded,
    'tickets_total', v_tickets,
    'minutes_bank', v_bank,
    'minutes_to_next', greatest(0, v_campaign.minutes_per_ticket - v_bank),
    'minutes_per_ticket', v_campaign.minutes_per_ticket,
    'campaign_id', v_campaign.id,
    'prize', v_campaign.prize,
    'title', v_campaign.title,
    'source', p_source
  );
end;
$$;

revoke all on function public.award_draw_tickets(text, integer, uuid) from public, anon;
grant execute on function public.award_draw_tickets(text, integer, uuid) to authenticated;

create or replace function public.award_practice_draw_minutes(
  p_minutes integer,
  p_practice_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign public.practice_draw_campaigns%rowtype;
  v_bank integer;
  v_tickets integer;
  v_awarded integer := 0;
  v_needed integer;
  v_rule integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_minutes is null or p_minutes < 1 then
    return jsonb_build_object(
      'ok', true,
      'tickets_awarded', 0,
      'tickets_total', 0,
      'minutes_bank', 0,
      'minutes_to_next', 60,
      'campaign_id', null
    );
  end if;

  select * into v_campaign
    from public.practice_draw_campaigns
   where status = 'active'
     and (ends_at is null or ends_at > now())
   order by starts_at desc
   limit 1
   for update;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'tickets_awarded', 0,
      'tickets_total', 0,
      'minutes_bank', 0,
      'minutes_to_next', 60,
      'campaign_id', null,
      'reason', 'no_active_campaign'
    );
  end if;

  v_rule := coalesce(
    (v_campaign.earn_rules ->> 'practice_minutes_per_ticket')::integer,
    v_campaign.minutes_per_ticket
  );
  if v_rule < 1 then
    return jsonb_build_object(
      'ok', true,
      'tickets_awarded', 0,
      'campaign_id', v_campaign.id,
      'reason', 'source_disabled'
    );
  end if;

  if p_practice_id is not null
     and exists (
       select 1 from public.practice_draw_events e
        where e.campaign_id = v_campaign.id
          and (
            e.practice_id = p_practice_id
            or (e.source = 'practice' and e.source_id = p_practice_id)
          )
     ) then
    select tickets, minutes_bank into v_tickets, v_bank
      from public.practice_draw_progress
     where user_id = v_uid and campaign_id = v_campaign.id;
    return jsonb_build_object(
      'ok', true,
      'tickets_awarded', 0,
      'tickets_total', coalesce(v_tickets, 0),
      'minutes_bank', coalesce(v_bank, 0),
      'minutes_to_next', greatest(0, v_rule - coalesce(v_bank, 0)),
      'campaign_id', v_campaign.id,
      'reason', 'already_counted'
    );
  end if;

  insert into public.practice_draw_progress (user_id, campaign_id, tickets, minutes_bank, updated_at)
  values (v_uid, v_campaign.id, 0, 0, now())
  on conflict (user_id, campaign_id) do nothing;

  select tickets, minutes_bank into v_tickets, v_bank
    from public.practice_draw_progress
   where user_id = v_uid and campaign_id = v_campaign.id
   for update;

  v_bank := coalesce(v_bank, 0) + p_minutes;
  v_tickets := coalesce(v_tickets, 0);
  while v_bank >= v_rule loop
    v_bank := v_bank - v_rule;
    v_tickets := v_tickets + 1;
    v_awarded := v_awarded + 1;
  end loop;

  update public.practice_draw_progress
     set tickets = v_tickets,
         minutes_bank = v_bank,
         updated_at = now()
   where user_id = v_uid and campaign_id = v_campaign.id;

  insert into public.practice_draw_events (
    user_id, campaign_id, source, source_id, practice_id, minutes_added, tickets_awarded
  ) values (
    v_uid, v_campaign.id, 'practice', p_practice_id, p_practice_id, p_minutes, v_awarded
  );

  v_needed := greatest(0, v_rule - v_bank);

  return jsonb_build_object(
    'ok', true,
    'tickets_awarded', v_awarded,
    'tickets_total', v_tickets,
    'minutes_bank', v_bank,
    'minutes_to_next', v_needed,
    'minutes_per_ticket', v_rule,
    'campaign_id', v_campaign.id,
    'prize', v_campaign.prize,
    'title', v_campaign.title,
    'source', 'practice'
  );
end;
$$;

revoke all on function public.award_practice_draw_minutes(integer, uuid) from public, anon;
grant execute on function public.award_practice_draw_minutes(integer, uuid) to authenticated;

create or replace function public.practice_draw_pick_winner(p_campaign uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.practice_draw_campaigns%rowtype;
  v_winner uuid;
  v_total integer;
begin
  if not public.is_coach() then
    raise exception 'coach_only' using errcode = '42501';
  end if;

  select * into c from public.practice_draw_campaigns where id = p_campaign for update;
  if not found then
    raise exception 'campaign_not_found';
  end if;
  if c.winner_id is not null or c.status = 'drawn' then
    raise exception 'already_drawn';
  end if;

  select coalesce(sum(tickets), 0) into v_total
    from public.practice_draw_progress
   where campaign_id = p_campaign and tickets > 0;
  if v_total < 1 then
    raise exception 'no_tickets';
  end if;

  with expanded as (
    select p.user_id, generate_series(1, p.tickets) as n
      from public.practice_draw_progress p
     where p.campaign_id = p_campaign and p.tickets > 0
  ),
  picked as (
    select user_id from expanded order by random() limit 1
  )
  select user_id into v_winner from picked;

  update public.practice_draw_campaigns
     set winner_id = v_winner,
         winner_drawn_at = now(),
         status = 'drawn'
   where id = p_campaign;

  return v_winner;
end;
$$;

revoke all on function public.practice_draw_pick_winner(uuid) from public, anon;
grant execute on function public.practice_draw_pick_winner(uuid) to authenticated;

insert into public.practice_draw_campaigns (
  title, prize, minutes_per_ticket, earn_rules, status
)
select
  '50% off a lesson',
  '50% off a lesson',
  60,
  jsonb_build_object(
    'practice_minutes_per_ticket', 60,
    'combine_tickets', 0,
    'drill_tickets', 0,
    'tool_tickets', 0
  ),
  'active'
where not exists (
  select 1 from public.practice_draw_campaigns where status = 'active'
);

notify pgrst, 'reload schema';
