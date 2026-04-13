-- Optional handicap index snapshot per round_stats row (for goal card sync when populated).

ALTER TABLE public.round_stats
  ADD COLUMN IF NOT EXISTS handicap_index numeric(5, 1);

COMMENT ON COLUMN public.round_stats.handicap_index IS
  'User handicap index at this round when row was written; used to default goal baseline.';
