-- AimPoint combine and other structured sessions: explicit test type + JSONB charting payload.

ALTER TABLE public.practice
  ADD COLUMN IF NOT EXISTS test_type text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.practice.test_type IS 'Machine-friendly test id, e.g. aimpoint_6ft_combine.';
COMMENT ON COLUMN public.practice.metadata IS 'Structured session payload for analytics and charting.';
