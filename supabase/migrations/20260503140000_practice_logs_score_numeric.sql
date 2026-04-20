-- Decimal combine totals (e.g. Flop Shot Combine pro-scale).

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS score numeric;

COMMENT ON COLUMN public.practice_logs.score IS
  'Session score as decimal where applicable (e.g. flop_shot); complements total_points.';

NOTIFY pgrst, 'reload schema';
