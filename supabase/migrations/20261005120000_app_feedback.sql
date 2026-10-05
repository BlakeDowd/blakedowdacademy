-- Client feedback from the home screen. Written by /api/feedback with the service role and emailed to the coach.
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

-- No policies: only the server (service role) reads or writes feedback.
alter table public.app_feedback enable row level security;
