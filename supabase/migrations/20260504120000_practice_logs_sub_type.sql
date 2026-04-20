-- Variant discriminator for shared log_type values (e.g. chipping + low_chip vs standard).

ALTER TABLE public.practice_logs
  ADD COLUMN IF NOT EXISTS sub_type text;

COMMENT ON COLUMN public.practice_logs.sub_type IS
  'Optional subtype when log_type groups variants (e.g. chipping → low_chip, standard).';

CREATE INDEX IF NOT EXISTS practice_logs_log_type_sub_type_idx
  ON public.practice_logs (log_type, sub_type)
  WHERE sub_type IS NOT NULL;

NOTIFY pgrst, 'reload schema';
