-- Logging a round earns 500 XP (added to profiles.total_xp by the app on save). Round scores can be
-- private (share_on_community = false), so the XP leaderboards read this table instead: one row per
-- round with who earned it and when, no scores. Readable by everyone signed in; only the triggers
-- below write to it. Deleting a round removes its row, matching how the leaderboards treated rounds.

create table if not exists public.round_xp_awards (
  round_id text primary key,
  user_id uuid not null,
  earned_at timestamptz not null default now(),
  xp integer not null default 500
);

create index if not exists round_xp_awards_earned_idx on public.round_xp_awards (earned_at desc);

alter table public.round_xp_awards enable row level security;

drop policy if exists "round_xp_awards_select" on public.round_xp_awards;
create policy "round_xp_awards_select" on public.round_xp_awards
  for select to authenticated using (true);

grant select on public.round_xp_awards to authenticated;
grant all on public.round_xp_awards to service_role;

create or replace function public.rounds_record_xp_award()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    begin
      insert into public.round_xp_awards (round_id, user_id, earned_at, xp)
      values (new.id::text, new.user_id, coalesce(new.created_at, now()), 500)
      on conflict do nothing;
    exception when others then
      -- Never block saving a round over the leaderboard record.
      raise warning 'round_xp_awards insert failed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists rounds_record_xp_award on public.rounds;
create trigger rounds_record_xp_award
  after insert on public.rounds
  for each row execute function public.rounds_record_xp_award();

create or replace function public.rounds_remove_xp_award()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.round_xp_awards where round_id = old.id::text;
  return null;
end;
$$;

drop trigger if exists rounds_remove_xp_award on public.rounds;
create trigger rounds_remove_xp_award
  after delete on public.rounds
  for each row execute function public.rounds_remove_xp_award();

-- Rounds logged before this existed. Safe to re-run.
insert into public.round_xp_awards (round_id, user_id, earned_at, xp)
select r.id::text, r.user_id, r.created_at, 500
  from public.rounds r
 where r.user_id is not null and r.created_at is not null
on conflict do nothing;

notify pgrst, 'reload schema';
