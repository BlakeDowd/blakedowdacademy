-- Squads inside a player group (e.g. Scholarship): Emerging, Development or Elite. Set by coaches;
-- the talent reports can rank players against their own squad. Writes stay coach-only via the existing RLS.

alter table public.player_group_members
  add column if not exists squad text check (squad is null or squad in ('emerging', 'development', 'elite'));

notify pgrst, 'reload schema';
