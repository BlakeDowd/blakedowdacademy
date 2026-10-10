-- MiScore summary stats that rounds didn't capture yet, plus which stats each round tracked.
-- double_bogeys keeps meaning "double bogey or worse"; triple_bogeys is the triple-or-worse part of it.
alter table public.rounds
  add column if not exists stableford integer,
  add column if not exists front_nine integer,
  add column if not exists back_nine integer,
  add column if not exists fairways_possible integer,
  add column if not exists putts_per_gir numeric(4, 2),
  add column if not exists triple_bogeys integer,
  add column if not exists tracked_stats jsonb;

comment on column public.rounds.tracked_stats is
  'Stat keys the player tracked for this round. Null = logged before stat tracking (everything counts).';

-- Each player's chosen stat list for the log-round form.
alter table public.profiles
  add column if not exists tracked_round_stats jsonb;

notify pgrst, 'reload schema';
