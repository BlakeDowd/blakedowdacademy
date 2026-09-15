-- Structured coaching notes shown under feedback videos.
alter table public.coach_swing_feedback
  add column if not exists key_issues text,
  add column if not exists contact_info text,
  add column if not exists directional_misses text;
