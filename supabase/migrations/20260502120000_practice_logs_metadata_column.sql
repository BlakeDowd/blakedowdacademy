-- JSONB extras for combine sessions (e.g. flop shot CM grid for analytics/graphs).

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.practice_logs.metadata IS
  'Combine-specific payloads not covered by strike_data/distance_data (graph-friendly extras).';

NOTIFY pgrst, 'reload schema';
