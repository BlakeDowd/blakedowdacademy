-- Drill favourites (boosted when the planner picks drills) and player-made drill lists (Drill Library).

CREATE TABLE IF NOT EXISTS public.drill_favourites (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  drill_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, drill_key)
);

COMMENT ON TABLE public.drill_favourites IS
  'Drills a player has hearted. drill_key matches stableDrillKey (drill_id code, else id).';

ALTER TABLE public.drill_favourites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drill_favourites_select_own" ON public.drill_favourites;
CREATE POLICY "drill_favourites_select_own" ON public.drill_favourites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "drill_favourites_insert_own" ON public.drill_favourites;
CREATE POLICY "drill_favourites_insert_own" ON public.drill_favourites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drill_favourites_delete_own" ON public.drill_favourites;
CREATE POLICY "drill_favourites_delete_own" ON public.drill_favourites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.drill_favourites TO authenticated;
GRANT ALL ON public.drill_favourites TO service_role;

CREATE TABLE IF NOT EXISTS public.drill_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  drill_keys text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drill_lists_user_idx ON public.drill_lists (user_id, created_at);

COMMENT ON TABLE public.drill_lists IS
  'Named drill lists a player builds in the Drill Library. drill_keys match stableDrillKey.';

ALTER TABLE public.drill_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drill_lists_select_own" ON public.drill_lists;
CREATE POLICY "drill_lists_select_own" ON public.drill_lists
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "drill_lists_insert_own" ON public.drill_lists;
CREATE POLICY "drill_lists_insert_own" ON public.drill_lists
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drill_lists_update_own" ON public.drill_lists;
CREATE POLICY "drill_lists_update_own" ON public.drill_lists
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drill_lists_delete_own" ON public.drill_lists;
CREATE POLICY "drill_lists_delete_own" ON public.drill_lists
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drill_lists TO authenticated;
GRANT ALL ON public.drill_lists TO service_role;

NOTIFY pgrst, 'reload schema';
