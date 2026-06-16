-- Decimal handicap index and nett on logged rounds (fixes "invalid input syntax for type integer").
ALTER TABLE public.rounds
  ALTER COLUMN handicap TYPE numeric(5, 1) USING handicap::numeric(5, 1);

ALTER TABLE public.rounds
  ALTER COLUMN nett TYPE numeric(5, 1) USING nett::numeric(5, 1);

COMMENT ON COLUMN public.rounds.handicap IS
  'Handicap index at time of round; supports one decimal (e.g. 12.4).';

COMMENT ON COLUMN public.rounds.nett IS
  'Net score (gross minus handicap); supports one decimal.';

-- Profile / history handicap fields used after round save.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'handicap'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN handicap TYPE numeric(5, 1) USING handicap::numeric(5, 1);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'starting_handicap'
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN starting_handicap TYPE numeric(5, 1) USING starting_handicap::numeric(5, 1);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'handicap_history' AND column_name = 'new_handicap'
  ) THEN
    ALTER TABLE public.handicap_history
      ALTER COLUMN new_handicap TYPE numeric(5, 1) USING new_handicap::numeric(5, 1);
  END IF;
END $$;
