-- Logging a drill score (drill_score_logs) earns XP and counts on the leaderboards.
-- One award per player, per drill, per day (Sydney time), so logging several attempts at the same
-- drill in a day earns it once. Undoing the last log of that drill for the day takes the XP back.
-- drill_xp_awards is readable by everyone signed in so the leaderboards can count drill days; it
-- holds no scores. Rows are only written by the triggers below.

create table if not exists public.drill_xp_awards (
  user_id uuid not null references auth.users (id) on delete cascade,
  drill_key text not null,
  day date not null,
  first_logged_at timestamptz not null default now(),
  xp integer not null default 100,
  primary key (user_id, drill_key, day)
);

create index if not exists drill_xp_awards_first_logged_idx on public.drill_xp_awards (first_logged_at desc);

alter table public.drill_xp_awards enable row level security;

drop policy if exists "drill_xp_awards_select" on public.drill_xp_awards;
create policy "drill_xp_awards_select" on public.drill_xp_awards
  for select to authenticated using (true);

grant select on public.drill_xp_awards to authenticated;
grant all on public.drill_xp_awards to service_role;

create or replace function public.xp_level(p_xp integer)
returns integer
language sql
immutable
as $$
  select case
    when coalesce(p_xp, 0) < 500 then 1
    when p_xp < 1500 then 2
    when p_xp < 3000 then 3
    else 4 + ((p_xp - 3000) / 2000)
  end;
$$;

create or replace function public.drill_xp_apply(p_user uuid, p_delta integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set total_xp = greatest(0, coalesce(total_xp, 0) + p_delta),
         current_level = public.xp_level(greatest(0, coalesce(total_xp, 0) + p_delta)::integer)
   where id = p_user;
end;
$$;

revoke all on function public.drill_xp_apply(uuid, integer) from public, anon, authenticated;

create or replace function public.drill_score_logs_award_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_added integer;
begin
  insert into public.drill_xp_awards (user_id, drill_key, day, first_logged_at, xp)
  values (new.user_id, new.drill_key, (new.created_at at time zone 'Australia/Sydney')::date, new.created_at, 100)
  on conflict do nothing;
  get diagnostics v_added = row_count;
  if v_added > 0 then
    perform public.drill_xp_apply(new.user_id, 100);
  end if;
  return new;
end;
$$;

drop trigger if exists drill_score_logs_award_xp on public.drill_score_logs;
create trigger drill_score_logs_award_xp
  after insert on public.drill_score_logs
  for each row execute function public.drill_score_logs_award_xp();

create or replace function public.drill_score_logs_revoke_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (old.created_at at time zone 'Australia/Sydney')::date;
  v_xp integer;
begin
  if exists (
    select 1 from public.drill_score_logs l
     where l.user_id = old.user_id
       and l.drill_key = old.drill_key
       and (l.created_at at time zone 'Australia/Sydney')::date = v_day
  ) then
    return old;
  end if;

  delete from public.drill_xp_awards a
   where a.user_id = old.user_id and a.drill_key = old.drill_key and a.day = v_day
  returning a.xp into v_xp;
  if v_xp is not null then
    perform public.drill_xp_apply(old.user_id, -v_xp);
  end if;
  return old;
end;
$$;

drop trigger if exists drill_score_logs_revoke_xp on public.drill_score_logs;
create trigger drill_score_logs_revoke_xp
  after delete on public.drill_score_logs
  for each row execute function public.drill_score_logs_revoke_xp();

-- Count drills already logged. Safe to re-run: only days without an award yet add XP.
with added as (
  insert into public.drill_xp_awards (user_id, drill_key, day, first_logged_at, xp)
  select l.user_id, l.drill_key, (l.created_at at time zone 'Australia/Sydney')::date, min(l.created_at), 100
    from public.drill_score_logs l
   group by l.user_id, l.drill_key, (l.created_at at time zone 'Australia/Sydney')::date
  on conflict do nothing
  returning user_id, xp
), totals as (
  select user_id, sum(xp)::integer as xp from added group by user_id
)
update public.profiles p
   set total_xp = greatest(0, coalesce(p.total_xp, 0) + t.xp),
       current_level = public.xp_level(greatest(0, coalesce(p.total_xp, 0) + t.xp)::integer)
  from totals t
 where p.id = t.user_id;

notify pgrst, 'reload schema';
