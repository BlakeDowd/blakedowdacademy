-- Clears the joke Rick Roll video (YouTube dQw4w9WgXcQ) left on some drills, e.g. the 3 foot putts drill.
-- The drills table's video columns vary between environments, so only the ones that exist are cleared.

do $$
declare
  col text;
begin
  foreach col in array array['video_url', 'youtube_url', 'youtube_link', 'source'] loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'drills' and column_name = col
    ) then
      execute format('update public.drills set %I = null where %I::text like %L', col, col, '%dQw4w9WgXcQ%');
    end if;
  end loop;
end $$;
