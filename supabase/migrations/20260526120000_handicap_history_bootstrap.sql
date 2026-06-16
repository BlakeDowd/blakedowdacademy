-- Bootstrap handicap_history for round / profile handicap updates (fixes silent insert failures).
CREATE TABLE IF NOT EXISTS public.handicap_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  score numeric(5, 1),
  new_handicap numeric(5, 1) NOT NULL,
  date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.handicap_history
  ADD COLUMN IF NOT EXISTS score numeric(5, 1);

ALTER TABLE public.handicap_history
  ADD COLUMN IF NOT EXISTS new_handicap numeric(5, 1);

ALTER TABLE public.handicap_history
  ADD COLUMN IF NOT EXISTS date date;

ALTER TABLE public.handicap_history
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.handicap_history
  ALTER COLUMN new_handicap TYPE numeric(5, 1) USING new_handicap::numeric(5, 1);

ALTER TABLE public.handicap_history
  ALTER COLUMN score TYPE numeric(5, 1) USING score::numeric(5, 1);

CREATE INDEX IF NOT EXISTS handicap_history_user_id_created_at_idx
  ON public.handicap_history (user_id, created_at DESC);

ALTER TABLE public.handicap_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "handicap_history_select_own" ON public.handicap_history;
CREATE POLICY "handicap_history_select_own"
  ON public.handicap_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "handicap_history_insert_own" ON public.handicap_history;
CREATE POLICY "handicap_history_insert_own"
  ON public.handicap_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.handicap_history TO authenticated;
GRANT ALL ON public.handicap_history TO service_role;

COMMENT ON TABLE public.handicap_history IS
  'Handicap index snapshots when users log rounds or update profile handicap.';

NOTIFY pgrst, 'reload schema';
