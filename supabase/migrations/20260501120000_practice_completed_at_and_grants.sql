-- Roadmap drill completions (`markDrillComplete`) write `completed_at` and `duration_minutes`.
-- Older `public.practice` definitions sometimes omit `completed_at`, which breaks inserts and
-- week filters; grants may also be missing on hand-rolled databases.

ALTER TABLE public.practice
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $m$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'practice'
      AND column_name = 'created_at'
  ) THEN
    UPDATE public.practice p
    SET completed_at = COALESCE(p.completed_at, p.created_at)
    WHERE p.completed_at IS NULL AND p.created_at IS NOT NULL;
  END IF;
END
$m$;

UPDATE public.practice
SET completed_at = now()
WHERE completed_at IS NULL;

ALTER TABLE public.practice
  ALTER COLUMN completed_at SET DEFAULT (now());

GRANT SELECT, INSERT, UPDATE ON public.practice TO authenticated;
GRANT ALL ON public.practice TO service_role;

NOTIFY pgrst, 'reload schema';
