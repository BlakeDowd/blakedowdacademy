-- Per-event rows in public.user_achievements for Trophy Case multiplier badges (count rows per achievement_key).

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_achievements_user_id_idx on public.user_achievements (user_id);
create index if not exists user_achievements_user_achievement_idx
  on public.user_achievements (user_id, achievement_key);

alter table public.user_achievements enable row level security;

create policy "user_achievements_select_own"
  on public.user_achievements for select
  using (auth.uid() = user_id);

create policy "user_achievements_insert_own"
  on public.user_achievements for insert
  with check (auth.uid() = user_id);

comment on table public.user_achievements is 'Append-only achievement events; badge multiplier = count rows per achievement_key for a user.';
