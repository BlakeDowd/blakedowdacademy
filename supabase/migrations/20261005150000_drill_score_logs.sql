-- One row per logged attempt at a drill, so players can see progression and a target to beat.
-- Per-drill settings (unit label, whether lower is better, player's goal) live on drill_personal_bests.

create table if not exists public.drill_score_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  drill_key text not null,
  score numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists drill_score_logs_user_drill_created_idx
  on public.drill_score_logs (user_id, drill_key, created_at desc);

alter table public.drill_score_logs enable row level security;

drop policy if exists "drill_score_logs_select_own" on public.drill_score_logs;
create policy "drill_score_logs_select_own"
  on public.drill_score_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "drill_score_logs_insert_own" on public.drill_score_logs;
create policy "drill_score_logs_insert_own"
  on public.drill_score_logs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "drill_score_logs_delete_own" on public.drill_score_logs;
create policy "drill_score_logs_delete_own"
  on public.drill_score_logs
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.drill_score_logs to authenticated;
grant all on public.drill_score_logs to service_role;

alter table public.drill_personal_bests
  add column if not exists score_unit text check (score_unit is null or char_length(score_unit) <= 40),
  add column if not exists lower_is_better boolean not null default false,
  add column if not exists goal_score numeric;

notify pgrst, 'reload schema';
