-- Per-user golf bag for Plays Like (carry + optional launch-monitor fields).
CREATE TABLE IF NOT EXISTS public.user_clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  club_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Repair partial installs (table created without full column set).
ALTER TABLE public.user_clubs ADD COLUMN IF NOT EXISTS short_label text;
ALTER TABLE public.user_clubs ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_clubs ADD COLUMN IF NOT EXISTS base_carry_metres numeric(6, 1);
ALTER TABLE public.user_clubs ADD COLUMN IF NOT EXISTS peak_height_metres numeric(5, 1);
ALTER TABLE public.user_clubs ADD COLUMN IF NOT EXISTS launch_angle_deg numeric(4, 1);
ALTER TABLE public.user_clubs ADD COLUMN IF NOT EXISTS spin_rate_rpm integer;
ALTER TABLE public.user_clubs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_user_clubs_user_id ON public.user_clubs (user_id);
CREATE INDEX IF NOT EXISTS idx_user_clubs_user_sort ON public.user_clubs (user_id, sort_order);

COMMENT ON TABLE public.user_clubs IS
  'User bag clubs for Virtual Caddie Plays Like — carry stored canonically in metres.';

ALTER TABLE public.user_clubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_clubs_select_own" ON public.user_clubs;
DROP POLICY IF EXISTS "user_clubs_insert_own" ON public.user_clubs;
DROP POLICY IF EXISTS "user_clubs_update_own" ON public.user_clubs;
DROP POLICY IF EXISTS "user_clubs_delete_own" ON public.user_clubs;

CREATE POLICY "user_clubs_select_own"
  ON public.user_clubs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_clubs_insert_own"
  ON public.user_clubs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_clubs_update_own"
  ON public.user_clubs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_clubs_delete_own"
  ON public.user_clubs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_clubs TO authenticated;

-- Repair legacy parallel columns from early installs (safe to re-run).
UPDATE public.user_clubs
SET base_carry_metres = base_carry
WHERE base_carry_metres IS NULL AND base_carry IS NOT NULL;

UPDATE public.user_clubs
SET peak_height_metres = peak_height
WHERE peak_height_metres IS NULL AND peak_height IS NOT NULL;

UPDATE public.user_clubs
SET launch_angle_deg = launch_angle
WHERE launch_angle_deg IS NULL AND launch_angle IS NOT NULL;

UPDATE public.user_clubs
SET spin_rate_rpm = spin_rate
WHERE spin_rate_rpm IS NULL AND spin_rate IS NOT NULL;

ALTER TABLE public.user_clubs DROP COLUMN IF EXISTS base_carry;
ALTER TABLE public.user_clubs DROP COLUMN IF EXISTS peak_height;
ALTER TABLE public.user_clubs DROP COLUMN IF EXISTS launch_angle;
ALTER TABLE public.user_clubs DROP COLUMN IF EXISTS spin_rate;

NOTIFY pgrst, 'reload schema';
