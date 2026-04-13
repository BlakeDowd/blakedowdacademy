-- Combines and freestyle log to `public.practice`. Leaderboards load all rows for authenticated users.
-- If RLS is enabled on `practice` without policies, inserts fail silently for students.
-- This migration: enable RLS (if not already), allow SELECT for any authenticated user (leaderboard),
-- and allow INSERT/UPDATE only for own rows.

ALTER TABLE public.practice ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practice_select_authenticated" ON public.practice;
CREATE POLICY "practice_select_authenticated"
  ON public.practice
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "practice_insert_own" ON public.practice;
CREATE POLICY "practice_insert_own"
  ON public.practice
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "practice_update_own" ON public.practice;
CREATE POLICY "practice_update_own"
  ON public.practice
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ensure combine protocol inserts are still allowed (some environments only had SELECT policy).
DROP POLICY IF EXISTS "practice_logs_insert_own" ON public.practice_logs;
CREATE POLICY "practice_logs_insert_own"
  ON public.practice_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
