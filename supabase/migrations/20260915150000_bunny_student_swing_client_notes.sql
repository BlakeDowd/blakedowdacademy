-- Client notes attached when a student sends a swing to Blake.
alter table public.bunny_student_swings
  add column if not exists key_issues text,
  add column if not exists contact_info text,
  add column if not exists directional_misses text;
