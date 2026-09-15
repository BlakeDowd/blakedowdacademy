-- Coach-uploaded swing feedback videos shown on the student Profile → Swings tab.
create table if not exists public.coach_swing_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid references public.profiles (id) on delete set null,
  storage_path text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists coach_swing_feedback_student_created_idx
  on public.coach_swing_feedback (student_id, created_at desc);

alter table public.coach_swing_feedback enable row level security;

drop policy if exists "coach_swing_feedback_select_own_or_authenticated" on public.coach_swing_feedback;
create policy "coach_swing_feedback_select_own_or_authenticated"
  on public.coach_swing_feedback
  for select
  to authenticated
  using (true);

drop policy if exists "coach_swing_feedback_insert_authenticated" on public.coach_swing_feedback;
create policy "coach_swing_feedback_insert_authenticated"
  on public.coach_swing_feedback
  for insert
  to authenticated
  with check (true);

drop policy if exists "coach_swing_feedback_delete_authenticated" on public.coach_swing_feedback;
create policy "coach_swing_feedback_delete_authenticated"
  on public.coach_swing_feedback
  for delete
  to authenticated
  using (true);

grant select, insert, delete on public.coach_swing_feedback to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coach-feedback',
  'coach-feedback',
  false,
  209715200,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id) do nothing;

drop policy if exists "coach_feedback_select_authenticated" on storage.objects;
create policy "coach_feedback_select_authenticated"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'coach-feedback');

drop policy if exists "coach_feedback_insert_authenticated" on storage.objects;
create policy "coach_feedback_insert_authenticated"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'coach-feedback');

drop policy if exists "coach_feedback_delete_authenticated" on storage.objects;
create policy "coach_feedback_delete_authenticated"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'coach-feedback');
