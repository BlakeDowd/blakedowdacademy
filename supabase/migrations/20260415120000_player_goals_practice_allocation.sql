-- Weekly practice hour split by focus category (must sum to weekly_hour_commitment).
ALTER TABLE public.player_goals
  ADD COLUMN IF NOT EXISTS practice_allocation jsonb;

COMMENT ON COLUMN public.player_goals.practice_allocation IS
  'JSON map of GoalFocusArea label -> hours (e.g. {"Putting":4,"Driving":3}); should sum to weekly_hour_commitment.';
