-- User-recorded personal best per drill (Practice page DrillCard).

CREATE TABLE IF NOT EXISTS public.drill_personal_bests (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  drill_key text NOT NULL,
  achievement text NOT NULL DEFAULT '' CHECK (char_length(achievement) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, drill_key)
);

COMMENT ON TABLE public.drill_personal_bests IS
  'Optional text personal best per user and drill (e.g. score, reps, distance). drill_key matches practice.type / roadmap drill_id.';

ALTER TABLE public.drill_personal_bests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drill_personal_bests_select_own" ON public.drill_personal_bests;
CREATE POLICY "drill_personal_bests_select_own"
  ON public.drill_personal_bests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "drill_personal_bests_insert_own" ON public.drill_personal_bests;
CREATE POLICY "drill_personal_bests_insert_own"
  ON public.drill_personal_bests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drill_personal_bests_update_own" ON public.drill_personal_bests;
CREATE POLICY "drill_personal_bests_update_own"
  ON public.drill_personal_bests
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drill_personal_bests_delete_own" ON public.drill_personal_bests;
CREATE POLICY "drill_personal_bests_delete_own"
  ON public.drill_personal_bests
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drill_personal_bests TO authenticated;
GRANT ALL ON public.drill_personal_bests TO service_role;

NOTIFY pgrst, 'reload schema';
