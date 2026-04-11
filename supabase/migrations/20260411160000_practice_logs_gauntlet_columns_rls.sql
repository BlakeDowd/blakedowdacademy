-- Gauntlet Precision Protocol: session aggregates + leaderboard reads across users.

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS perfect_putt_count integer,
  ADD COLUMN IF NOT EXISTS triple_failure_rate double precision;

COMMENT ON COLUMN public.practice_logs.perfect_putt_count IS 'Single-session count: Clean Strike + Through Gate + distance error under 10cm (gauntlet_protocol_session).';
COMMENT ON COLUMN public.practice_logs.triple_failure_rate IS 'Fraction of putts with Clip + Hit Gate in that session, stored as 0–100 (gauntlet_protocol_session).';

-- Academy leaderboard needs cross-user reads (same pattern as global practice leaderboards).
DROP POLICY IF EXISTS "practice_logs_select_own" ON public.practice_logs;
CREATE POLICY "practice_logs_select_authenticated"
  ON public.practice_logs
  FOR SELECT
  TO authenticated
  USING (true);
