-- Player Feel Log diary: swing cues, golden anchors, pinned warmup recalls.

create table if not exists public.player_feel_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_at timestamptz not null default now(),
  club text not null
    check (char_length(btrim(club)) between 1 and 40),
  target_feel text not null
    check (char_length(btrim(target_feel)) between 1 and 500),
  focus_area text not null
    check (char_length(btrim(focus_area)) between 1 and 80),
  is_hitting_it_good boolean not null default false,
  ball_flight_result text
    check (
      ball_flight_result is null
      or ball_flight_result in (
        'Draw', 'Fade', 'Straight', 'Push', 'Pull', 'Thin', 'Fat', 'Flush'
      )
    ),
  coach_notes text
    check (coach_notes is null or char_length(coach_notes) <= 1000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_feel_logs_user_logged_idx
  on public.player_feel_logs (user_id, logged_at desc);

create index if not exists player_feel_logs_user_pinned_idx
  on public.player_feel_logs (user_id, is_pinned desc, logged_at desc)
  where is_pinned = true;

create index if not exists player_feel_logs_user_golden_idx
  on public.player_feel_logs (user_id, logged_at desc)
  where is_hitting_it_good = true;

comment on table public.player_feel_logs is
  'Player diary of swing feels / cues. Golden anchors (is_hitting_it_good) and pins for pre-round recall.';

alter table public.player_feel_logs enable row level security;

drop policy if exists "player_feel_logs_select" on public.player_feel_logs;
create policy "player_feel_logs_select" on public.player_feel_logs
  for select to authenticated
  using (user_id = auth.uid() or public.is_coach());

drop policy if exists "player_feel_logs_insert" on public.player_feel_logs;
create policy "player_feel_logs_insert" on public.player_feel_logs
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_coach());

drop policy if exists "player_feel_logs_update" on public.player_feel_logs;
create policy "player_feel_logs_update" on public.player_feel_logs
  for update to authenticated
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());

drop policy if exists "player_feel_logs_delete" on public.player_feel_logs;
create policy "player_feel_logs_delete" on public.player_feel_logs
  for delete to authenticated
  using (user_id = auth.uid() or public.is_coach());

grant select, insert, update, delete on public.player_feel_logs to authenticated;
grant all on public.player_feel_logs to service_role;

-- Players cannot overwrite coach notes; coaches can.
create or replace function public.protect_player_feel_log_coach_notes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.coach_notes is distinct from old.coach_notes
     and not public.is_coach() then
    new.coach_notes := old.coach_notes;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists player_feel_logs_protect_coach_notes on public.player_feel_logs;
create trigger player_feel_logs_protect_coach_notes
  before update on public.player_feel_logs
  for each row
  execute function public.protect_player_feel_log_coach_notes();

notify pgrst, 'reload schema';
