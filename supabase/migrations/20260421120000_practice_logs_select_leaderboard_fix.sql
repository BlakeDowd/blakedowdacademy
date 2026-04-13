-- Academy combine leaderboards (Iron, Gauntlet, etc.) need every authenticated user to SELECT
-- all practice_logs rows. If only "practice_logs_select_own" (auth.uid() = user_id) is present,
-- students see themselves but coaches see an empty combine table for other users.
--
-- Safe to re-run: drops known policy names, then creates the cross-user read policy.

ALTER TABLE public.practice_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practice_logs_select_own" ON public.practice_logs;
-- Supabase UI / older setups often use this human-readable name instead of practice_logs_select_own
DROP POLICY IF EXISTS "Users can view own practice logs" ON public.practice_logs;
DROP POLICY IF EXISTS "practice_logs_select_authenticated" ON public.practice_logs;

CREATE POLICY "practice_logs_select_authenticated"
  ON public.practice_logs
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON POLICY "practice_logs_select_authenticated" ON public.practice_logs IS
  'Leaderboards: any signed-in user may read all combine protocol rows (same pattern as public.practice).';

NOTIFY pgrst, 'reload schema';
