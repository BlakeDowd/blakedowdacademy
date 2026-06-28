-- Plays Like: per-club carry + optional launch-monitor ball-flight data.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plays_like_bag jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.profiles.plays_like_bag IS
  'JSON array of { id, baseCarryYards, peakHeightFt?, launchAngleDeg?, spinRateRpm? } for Virtual Caddie Plays Like.';

NOTIFY pgrst, 'reload schema';
