-- PGRST204: focus_area (and other core columns) missing when `player_goals` existed
-- before the full migration set. CREATE TABLE IF NOT EXISTS does not add columns
-- to an existing table — use ALTER ... ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS scoring_milestone text NOT NULL DEFAULT '';

ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS focus_area text NOT NULL DEFAULT 'Putting';

ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS weekly_hour_commitment numeric(6, 2) NOT NULL DEFAULT 4;

ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS lowest_score integer,
  ADD COLUMN IF NOT EXISTS current_handicap numeric(5, 1);

ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS practice_allocation jsonb;

COMMENT ON COLUMN public.player_goals.focus_area IS
  'Primary focus label; aligns with practice allocation / player_goals.practice_allocation.';

COMMENT ON COLUMN public.player_goals.practice_allocation IS
  'JSON map of GoalFocusArea label -> hours; should sum to weekly_hour_commitment.';

NOTIFY pgrst, 'reload schema';
