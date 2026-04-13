-- PGRST205: "could not find the table public.practice_logs in the schema cache"
-- Use on projects that have `public.practice` but never created `practice_logs`.
-- If the table exists but inserts fail with PGRST204 (missing column), run
-- 20260420150000_practice_logs_missing_columns_pgrst204.sql as well.
-- Safe to re-run: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.practice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  log_type text NOT NULL DEFAULT 'strike_speed_control',
  strike_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  distance_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  matrix_score_average double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS start_line_data jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS perfect_putt_count integer,
  ADD COLUMN IF NOT EXISTS triple_failure_rate double precision;

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS total_points double precision;

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS practice_logs_user_id_created_at_idx
  ON public.practice_logs (user_id, created_at DESC);

ALTER TABLE public.practice_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practice_logs_select_own" ON public.practice_logs;
DROP POLICY IF EXISTS "practice_logs_select_authenticated" ON public.practice_logs;
CREATE POLICY "practice_logs_select_authenticated"
  ON public.practice_logs
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "practice_logs_insert_own" ON public.practice_logs;
CREATE POLICY "practice_logs_insert_own"
  ON public.practice_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS combine_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON TABLE public.practice_logs IS 'Combine protocol sessions (Iron, Gauntlet, Strike & Speed, etc.).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_logs TO authenticated;
GRANT ALL ON public.practice_logs TO service_role;

-- Ask PostgREST to reload the schema cache. If the API still returns PGRST205 after ~1 min,
-- use Supabase Dashboard → Project Settings → API → "Reload schema" (or restart the project).
NOTIFY pgrst, 'reload schema';
