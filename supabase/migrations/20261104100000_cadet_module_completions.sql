-- Cadet weekly modules: coach ticks students Done or Needs work per curriculum module.

create table if not exists public.cadet_module_completions (
  id uuid primary key default gen_random_uuid(),
  curriculum_week_id uuid not null references public.cadet_curriculum_weeks (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('done', 'needs_work')),
  notes text check (notes is null or char_length(notes) <= 500),
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (curriculum_week_id, player_id)
);

create index if not exists cadet_module_completions_week_idx
  on public.cadet_module_completions (curriculum_week_id);

create index if not exists cadet_module_completions_player_idx
  on public.cadet_module_completions (player_id);

alter table public.cadet_module_completions enable row level security;

drop policy if exists "cadet_module_completions_select" on public.cadet_module_completions;
create policy "cadet_module_completions_select" on public.cadet_module_completions
  for select to authenticated using (public.is_coach() or player_id = auth.uid());

drop policy if exists "cadet_module_completions_coach_write" on public.cadet_module_completions;
create policy "cadet_module_completions_coach_write" on public.cadet_module_completions
  for all to authenticated using (public.is_coach()) with check (public.is_coach());

grant select, insert, update, delete on public.cadet_module_completions to authenticated;

notify pgrst, 'reload schema';
