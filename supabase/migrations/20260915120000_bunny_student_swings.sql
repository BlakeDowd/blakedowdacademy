-- Tracks Bunny videos uploaded as student swings (Send to Blake).
-- Library drills (e.g. Hell Drill) are never listed here and cannot be deleted via the app.
create table if not exists public.bunny_student_swings (
  id uuid primary key default gen_random_uuid(),
  bunny_video_id text not null unique,
  title text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bunny_student_swings_created_at_idx
  on public.bunny_student_swings (created_at desc);

alter table public.bunny_student_swings enable row level security;

drop policy if exists "bunny_student_swings_select_authenticated" on public.bunny_student_swings;
create policy "bunny_student_swings_select_authenticated"
  on public.bunny_student_swings
  for select
  to authenticated
  using (true);

drop policy if exists "bunny_student_swings_insert_authenticated" on public.bunny_student_swings;
create policy "bunny_student_swings_insert_authenticated"
  on public.bunny_student_swings
  for insert
  to authenticated
  with check (true);

drop policy if exists "bunny_student_swings_update_authenticated" on public.bunny_student_swings;
create policy "bunny_student_swings_update_authenticated"
  on public.bunny_student_swings
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "bunny_student_swings_delete_authenticated" on public.bunny_student_swings;
create policy "bunny_student_swings_delete_authenticated"
  on public.bunny_student_swings
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.bunny_student_swings to authenticated;
