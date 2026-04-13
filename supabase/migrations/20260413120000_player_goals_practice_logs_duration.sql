-- Goal Accountability: player goals + optional session duration on combine logs.

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.practice_logs.duration_minutes IS
  'Optional session length in minutes for accountability totals; defaults to 0 until clients send values.';

CREATE TABLE IF NOT EXISTS public.player_goals (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  scoring_milestone text NOT NULL DEFAULT '',
  focus_area text NOT NULL DEFAULT 'Putting',
  weekly_hour_commitment numeric(6, 2) NOT NULL DEFAULT 4 CHECK (weekly_hour_commitment >= 0 AND weekly_hour_commitment <= 80),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.player_goals IS
  'Per-user training goals for dashboard accountability (milestone, weekly focus, hour target).';

ALTER TABLE public.player_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_goals_select_own" ON public.player_goals;
CREATE POLICY "player_goals_select_own"
  ON public.player_goals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "player_goals_insert_own" ON public.player_goals;
CREATE POLICY "player_goals_insert_own"
  ON public.player_goals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "player_goals_update_own" ON public.player_goals;
CREATE POLICY "player_goals_update_own"
  ON public.player_goals
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
