-- PostgREST PGRST204: "Could not find column in schema cache" when the remote DB
-- was created or migrated without baseline / allocation columns. Safe to re-run.

ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS lowest_score integer,
  ADD COLUMN IF NOT EXISTS current_handicap numeric(5, 1);

ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS practice_allocation jsonb;

COMMENT ON COLUMN public.player_goals.lowest_score IS
  'User-reported best 18-hole gross or net score (optional).';

COMMENT ON COLUMN public.player_goals.current_handicap IS
  'User-reported handicap index; may be negative for plus markers (optional).';

COMMENT ON COLUMN public.player_goals.practice_allocation IS
  'JSON map of GoalFocusArea label -> hours; should sum to weekly_hour_commitment.';

NOTIFY pgrst, 'reload schema';
