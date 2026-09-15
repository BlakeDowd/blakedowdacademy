-- Ensure student_swings exists. Existing DBs may already have this table with
-- `student_id` (not `user_id`); the app reads columns flexibly via select('*').

create table if not exists public.student_swings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles (id) on delete cascade,
  storage_path text,
  angle text default 'face_on',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists student_swings_status_created_at_idx
  on public.student_swings (status, created_at desc);

alter table public.student_swings enable row level security;

drop policy if exists "student_swings_select_authenticated" on public.student_swings;
create policy "student_swings_select_authenticated"
  on public.student_swings
  for select
  to authenticated
  using (true);

drop policy if exists "student_swings_delete_authenticated" on public.student_swings;
create policy "student_swings_delete_authenticated"
  on public.student_swings
  for delete
  to authenticated
  using (true);

grant select, insert, delete on public.student_swings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'swing-submissions',
  'swing-submissions',
  false,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id) do nothing;
