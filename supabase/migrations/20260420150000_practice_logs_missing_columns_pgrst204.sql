-- PGRST204 / Postgres 42703: practice_logs exists but is missing columns (e.g. distance_data, log_type).
-- Your `practice_logs` table exists but was created without columns the app expects (partial DDL
-- or an old hand-written table). This adds any missing columns and reloads PostgREST.

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS log_type text NOT NULL DEFAULT 'strike_speed_control';

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS strike_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS distance_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS start_line_data jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS matrix_score_average double precision;

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS perfect_putt_count integer,
  ADD COLUMN IF NOT EXISTS triple_failure_rate double precision;

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS total_points double precision;

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.practice_logs.strike_data IS 'Per-shot / per-putt payload (combine-specific).';
COMMENT ON COLUMN public.practice_logs.distance_data IS 'Distance / wall / dispersion payload (combine-specific).';
COMMENT ON COLUMN public.practice_logs.start_line_data IS 'Start-line gate outcomes when applicable; else [].';

NOTIFY pgrst, 'reload schema';
