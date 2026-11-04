-- Attach one or more Drill Library drills to each cadet curriculum module.

alter table public.cadet_curriculum_weeks
  add column if not exists drill_refs jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
