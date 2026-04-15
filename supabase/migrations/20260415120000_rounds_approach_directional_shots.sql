-- Optional per-round log of approach shots: club + miss direction / GIR (JSON array).
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS approach_directional_shots jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.rounds.approach_directional_shots IS
  'JSON array of { id, hole, club, result } per logged approach. result includes matrix directions, gir, tee-no-gir, distance-no-gir; empty when unused.';
