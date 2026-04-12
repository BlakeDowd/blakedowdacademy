-- Iron Precision Protocol (and other combines): persisted session point total.

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS total_points double precision;

COMMENT ON COLUMN public.practice_logs.total_points IS 'Session sum of scoring points when applicable (e.g. iron_precision_protocol_session; max finger scale 90 for nine 10-point shots plus quality bonuses).';
