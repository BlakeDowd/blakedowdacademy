-- Coach deep dive (and any signed-in peer) needs to read other users' academy goals.
-- Without this, only player_goals_select_own applies and coaches get null from
-- .from("player_goals").eq("user_id", <student id>) even when the row exists.
--
-- INSERT/UPDATE remain restricted to auth.uid() = user_id (existing policies).
-- Pattern matches practice_logs_select_authenticated.

ALTER TABLE public.player_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_goals_select_authenticated" ON public.player_goals;

CREATE POLICY "player_goals_select_authenticated"
  ON public.player_goals
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON POLICY "player_goals_select_authenticated" ON public.player_goals IS
  'Any signed-in user may read goal rows (coach deep dive + transparency). Writes stay per-user.';

NOTIFY pgrst, 'reload schema';
