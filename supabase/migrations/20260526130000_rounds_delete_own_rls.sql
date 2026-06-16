-- Allow users to delete their own logged rounds (My Rounds delete flow).
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can delete own rounds" ON public.rounds;
CREATE POLICY "Users can delete own rounds"
  ON public.rounds
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT DELETE ON public.rounds TO authenticated;

NOTIFY pgrst, 'reload schema';
