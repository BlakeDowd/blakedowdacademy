-- Postgres 42703: "column practice_logs.log_type does not exist" (and similar).
-- For databases that already ran an older 20260420150000 before log_type/created_at were added.
-- Safe to re-run.

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS log_type text NOT NULL DEFAULT 'strike_speed_control';

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.practice_logs.log_type IS 'Protocol id, e.g. iron_precision_protocol_session, gauntlet_protocol_session.';

NOTIFY pgrst, 'reload schema';
