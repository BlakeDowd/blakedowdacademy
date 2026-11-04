-- Attach a Bunny Stream video to each cadet curriculum module (optional).

alter table public.cadet_curriculum_weeks
  add column if not exists bunny_video_id text
  check (
    bunny_video_id is null
    or bunny_video_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

notify pgrst, 'reload schema';
