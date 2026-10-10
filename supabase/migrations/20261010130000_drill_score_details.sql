-- Optional per-session detail for drills with their own score screen
-- (e.g. where each strike landed on the face for "Hitting all parts of the face").

alter table public.drill_score_logs
  add column if not exists details jsonb;

notify pgrst, 'reload schema';
