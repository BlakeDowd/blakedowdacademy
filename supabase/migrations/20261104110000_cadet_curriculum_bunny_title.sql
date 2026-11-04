-- Store Bunny video title on cadet curriculum modules for display.

alter table public.cadet_curriculum_weeks
  add column if not exists bunny_video_title text
  check (
    bunny_video_title is null
    or char_length(btrim(bunny_video_title)) between 1 and 200
  );

notify pgrst, 'reload schema';
