-- Prevent PGRST204 when new combines start using richer practice_logs payloads.
-- Adds commonly optional columns with IF NOT EXISTS so older deployments stay compatible.

alter table public.practice_logs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.practice_logs
  add column if not exists strike_data jsonb not null default '[]'::jsonb;

alter table public.practice_logs
  add column if not exists distance_data jsonb not null default '[]'::jsonb;

alter table public.practice_logs
  add column if not exists start_line_data jsonb not null default '[]'::jsonb;

alter table public.practice_logs
  add column if not exists notes text;

alter table public.practice_logs
  add column if not exists score numeric;

alter table public.practice_logs
  add column if not exists total_points numeric;

alter table public.practice_logs
  add column if not exists sub_type text;

comment on column public.practice_logs.metadata is
  'Optional protocol metadata payload; used by newer combine sessions.';

notify pgrst, 'reload schema';
