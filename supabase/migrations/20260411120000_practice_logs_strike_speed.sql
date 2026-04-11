-- Strike & Speed Control Test: session storage and combine profile index.
-- Run in Supabase SQL editor or via CLI migrate.

CREATE TABLE IF NOT EXISTS public.practice_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  log_type text NOT NULL DEFAULT 'strike_speed_control',
  strike_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  distance_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  matrix_score_average double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_logs_user_id_created_at_idx
  ON public.practice_logs (user_id, created_at DESC);

ALTER TABLE public.practice_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practice_logs_select_own" ON public.practice_logs;
CREATE POLICY "practice_logs_select_own"
  ON public.practice_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "practice_logs_insert_own" ON public.practice_logs;
CREATE POLICY "practice_logs_insert_own"
  ON public.practice_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS combine_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.combine_profile IS 'Aggregated combine metrics, e.g. strike_speed_index from Strike And Speed Control Test.';
