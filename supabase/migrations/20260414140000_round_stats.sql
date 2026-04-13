-- Per-round strokes-lost style buckets for goal insights (last N rounds aggregated in the app).
-- Optional: populate from your SG pipeline; until then the app falls back to heuristics from `rounds`.

CREATE TABLE IF NOT EXISTS public.round_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  round_id uuid,
  played_at timestamptz NOT NULL DEFAULT now(),
  loss_off_tee numeric(6, 2),
  loss_approach numeric(6, 2),
  loss_short_game numeric(6, 2),
  loss_putting numeric(6, 2)
);

CREATE INDEX IF NOT EXISTS idx_round_stats_user_played ON public.round_stats (user_id, played_at DESC);

COMMENT ON TABLE public.round_stats IS
  'Optional per-round stroke-loss buckets (positive = losing vs baseline). Used with last 5 rows for goal focus suggestions.';

ALTER TABLE public.round_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "round_stats_select_own" ON public.round_stats;
CREATE POLICY "round_stats_select_own"
  ON public.round_stats
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "round_stats_insert_own" ON public.round_stats;
CREATE POLICY "round_stats_insert_own"
  ON public.round_stats
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "round_stats_update_own" ON public.round_stats;
CREATE POLICY "round_stats_update_own"
  ON public.round_stats
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "round_stats_delete_own" ON public.round_stats;
CREATE POLICY "round_stats_delete_own"
  ON public.round_stats
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
