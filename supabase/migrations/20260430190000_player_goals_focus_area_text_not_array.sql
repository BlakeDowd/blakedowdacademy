-- 22P02: malformed array literal "Driving" — `focus_area` must be scalar text (app sends one label).
-- Some databases created `focus_area` as text[] by mistake. Convert to plain text.

DO $$
DECLARE
  is_array boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND c.relname = 'player_goals'
      AND a.attname = 'focus_area'
      AND NOT a.attisdropped
      AND t.typcategory = 'A'
  )
  INTO is_array;

  IF is_array THEN
    ALTER TABLE public.player_goals RENAME COLUMN focus_area TO focus_area_legacy_arr;
    ALTER TABLE public.player_goals
      ADD COLUMN focus_area text NOT NULL DEFAULT 'Putting';

    UPDATE public.player_goals
    SET focus_area = COALESCE(
      NULLIF(trim(focus_area_legacy_arr[1]::text), ''),
      'Putting'
    );

    ALTER TABLE public.player_goals DROP COLUMN focus_area_legacy_arr;
  END IF;
END $$;

COMMENT ON COLUMN public.player_goals.focus_area IS
  'Single primary focus label (e.g. Driving, Putting); NOT a Postgres text[] array.';

NOTIFY pgrst, 'reload schema';
