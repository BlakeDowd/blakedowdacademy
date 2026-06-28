-- Per-putt detail from live round entry (distance, break, miss line / speed).
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS putting_logs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.rounds.putting_logs IS
  'JSON array of { hole, puttNumber, made, distanceFeet, break, missLine, missLength } from live putting entry.';

NOTIFY pgrst, 'reload schema';
