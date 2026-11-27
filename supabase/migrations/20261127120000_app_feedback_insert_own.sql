-- Feedback table (may be missing if the Oct migration never ran on this project)
-- plus insert policy so signed-in users can submit when the service role isn't available.

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  name text,
  email text,
  message text not null,
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists app_feedback_created_at_idx
  on public.app_feedback (created_at desc);

alter table public.app_feedback enable row level security;

drop policy if exists "app_feedback_insert_own" on public.app_feedback;

create policy "app_feedback_insert_own"
  on public.app_feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);
