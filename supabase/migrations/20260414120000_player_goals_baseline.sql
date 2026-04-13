-- Goal baseline: lowest 18-hole score and current handicap index (for accountability copy).

ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS lowest_score integer,
  ADD COLUMN IF NOT EXISTS current_handicap numeric(5, 1);

COMMENT ON COLUMN public.player_goals.lowest_score IS
  'User-reported best 18-hole gross or net score (optional).';

COMMENT ON COLUMN public.player_goals.current_handicap IS
  'User-reported handicap index; may be negative for plus markers (optional).';
