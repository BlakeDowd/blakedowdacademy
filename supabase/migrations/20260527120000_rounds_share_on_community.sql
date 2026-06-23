-- Per-round opt-out from community leaderboards / home community tab.
-- Coaches (profiles.role = 'coach') can still read all rounds for deep dive.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS share_on_community boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.rounds.share_on_community IS
  'When true, round appears in community leaderboards and the home Community tab. Coaches always see all rounds.';

-- Backfill: existing rows stay private unless you want legacy rounds public:
-- UPDATE public.rounds SET share_on_community = true WHERE share_on_community = false;

ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

-- Replace broad SELECT policies with scoped ones (safe if policies do not exist yet).
DROP POLICY IF EXISTS "Users can view own rounds" ON public.rounds;
DROP POLICY IF EXISTS "rounds_select_own" ON public.rounds;
DROP POLICY IF EXISTS "rounds_select_community_shared" ON public.rounds;
DROP POLICY IF EXISTS "rounds_select_coach_all" ON public.rounds;

CREATE POLICY "rounds_select_own"
  ON public.rounds
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "rounds_select_community_shared"
  ON public.rounds
  FOR SELECT
  TO authenticated
  USING (share_on_community = true);

CREATE POLICY "rounds_select_coach_all"
  ON public.rounds
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(trim(coalesce(p.role, ''))) = 'coach'
    )
  );

DROP POLICY IF EXISTS "Users can insert own rounds" ON public.rounds;
DROP POLICY IF EXISTS "rounds_insert_own" ON public.rounds;
CREATE POLICY "rounds_insert_own"
  ON public.rounds
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own rounds" ON public.rounds;
DROP POLICY IF EXISTS "rounds_update_own" ON public.rounds;
CREATE POLICY "rounds_update_own"
  ON public.rounds
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own rounds" ON public.rounds;
DROP POLICY IF EXISTS "rounds_delete_own" ON public.rounds;
CREATE POLICY "rounds_delete_own"
  ON public.rounds
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rounds TO authenticated;

NOTIFY pgrst, 'reload schema';
