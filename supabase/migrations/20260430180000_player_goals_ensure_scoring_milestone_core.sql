-- Postgres: column "player_goals.scoring_milestone" does not exist.
-- Some projects never ran 20260429120000 or have a hand-built `player_goals` table.
-- This file is idempotent (IF NOT EXISTS) and safe to re-run.

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

COMMENT ON COLUMN public.player_goals.scoring_milestone IS
  'Milestone preset label (e.g. Break 90, Scratch); matches app GoalSetting presets.';

COMMENT ON COLUMN public.player_goals.focus_area IS
  'Primary focus label; aligns with practice_allocation keys.';

NOTIFY pgrst, 'reload schema';
