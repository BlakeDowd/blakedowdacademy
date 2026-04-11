-- Start Line And Speed Control Test: per-putt gate outcomes on practice_logs.

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS start_line_data jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.practice_logs.start_line_data IS 'Per-putt start line (through_gate | hit_gate) for start_line_speed_test sessions; empty for other log types.';

COMMENT ON COLUMN public.profiles.combine_profile IS 'Aggregated combine metrics (e.g. strike_speed_index, start_line_speed_index, start_line_gate_success_rate).';
