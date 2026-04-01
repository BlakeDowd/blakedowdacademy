-- Run once in Supabase SQL Editor (any project using this app).
-- Lets the browser read the drill catalog with the anon key — no service role needed on Vercel for *showing* drills.
-- Writes: still use Admin CSV (service role) or policies on authenticated users.

ALTER TABLE public.drills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drills_select_public" ON public.drills;
CREATE POLICY "drills_select_public"
  ON public.drills
  FOR SELECT
  USING (true);
