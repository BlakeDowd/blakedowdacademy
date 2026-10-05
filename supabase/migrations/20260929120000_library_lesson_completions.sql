-- One row per user per completed Library lesson; feeds the Hall of Fame "Library Lessons" leaderboard.
-- A row is only written after the video is watched to the end and the player taps Complete.
create table if not exists public.library_lesson_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null,
  lesson_title text,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists library_lesson_completions_completed_at_idx
  on public.library_lesson_completions (completed_at desc);

alter table public.library_lesson_completions enable row level security;

drop policy if exists "library_lesson_completions_select_authenticated" on public.library_lesson_completions;
create policy "library_lesson_completions_select_authenticated"
  on public.library_lesson_completions
  for select
  to authenticated
  using (true);

drop policy if exists "library_lesson_completions_insert_own" on public.library_lesson_completions;
create policy "library_lesson_completions_insert_own"
  on public.library_lesson_completions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert on public.library_lesson_completions to authenticated;
