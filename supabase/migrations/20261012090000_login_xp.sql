-- Daily login XP: 10 XP the first time a player opens the app each day (Sydney time), plus a one-off
-- bonus the first time their login streak reaches 7, 30 and 100 days. claim_login_xp() is the only
-- way in, so a day or a streak bonus can't be paid twice. The streak counts consecutive days with a
-- daily row here, ending today.
-- Requires drill_xp_apply (20261008190000).

create table if not exists public.login_xp_awards (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null default 'daily' check (kind in ('daily', 'streak_7', 'streak_30', 'streak_100')),
  xp integer not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, day, kind)
);

create unique index if not exists login_xp_awards_streak_once
  on public.login_xp_awards (user_id, kind) where kind <> 'daily';

create index if not exists login_xp_awards_earned_idx on public.login_xp_awards (earned_at desc);

alter table public.login_xp_awards enable row level security;

-- Readable by everyone signed in so the leaderboards can count it.
drop policy if exists "login_xp_awards_select" on public.login_xp_awards;
create policy "login_xp_awards_select" on public.login_xp_awards
  for select to authenticated using (true);

grant select on public.login_xp_awards to authenticated;
grant all on public.login_xp_awards to service_role;

create or replace function public.claim_login_xp()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'Australia/Sydney')::date;
  v_daily integer := 0;
  v_bonus integer := 0;
  v_bonus_streak integer;
  v_streak integer;
  v_added integer;
  m record;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  insert into public.login_xp_awards (user_id, day, kind, xp)
  values (v_user, v_today, 'daily', 10)
  on conflict do nothing;
  get diagnostics v_added = row_count;
  if v_added > 0 then
    v_daily := 10;
  end if;

  with d as (
    select day, row_number() over (order by day desc) as rn
      from public.login_xp_awards
     where user_id = v_user and kind = 'daily'
  )
  select count(*) into v_streak from d where day = v_today - (rn - 1)::integer;

  for m in select * from (values (7, 100), (30, 500), (100, 1000)) as t(days, xp) loop
    if v_streak >= m.days then
      insert into public.login_xp_awards (user_id, day, kind, xp)
      values (v_user, v_today, 'streak_' || m.days, m.xp)
      on conflict do nothing;
      get diagnostics v_added = row_count;
      if v_added > 0 then
        v_bonus := v_bonus + m.xp;
        v_bonus_streak := m.days;
      end if;
    end if;
  end loop;

  if v_daily + v_bonus > 0 then
    perform public.drill_xp_apply(v_user, v_daily + v_bonus);
  end if;

  return jsonb_build_object(
    'daily_xp', v_daily,
    'bonus_xp', v_bonus,
    'bonus_streak', v_bonus_streak,
    'streak', v_streak
  );
end;
$$;

revoke all on function public.claim_login_xp() from public, anon;
grant execute on function public.claim_login_xp() to authenticated;

notify pgrst, 'reload schema';
