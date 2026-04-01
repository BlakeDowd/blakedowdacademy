-- Run once in Supabase SQL Editor if Admin CSV upload or drill writes fail with RLS.
-- Lets any logged-in user insert/update/delete drills (fine for small/private apps).
-- Tighten later with a proper admin role check if needed.

ALTER TABLE public.drills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drills_select_public" ON public.drills;
CREATE POLICY "drills_select_public"
  ON public.drills FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "drills_insert_authenticated" ON public.drills;
CREATE POLICY "drills_insert_authenticated"
  ON public.drills FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "drills_update_authenticated" ON public.drills;
CREATE POLICY "drills_update_authenticated"
  ON public.drills FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "drills_delete_authenticated" ON public.drills;
CREATE POLICY "drills_delete_authenticated"
  ON public.drills FOR DELETE
  TO authenticated
  USING (true);
