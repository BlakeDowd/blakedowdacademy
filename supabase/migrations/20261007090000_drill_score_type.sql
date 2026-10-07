-- Optional per-drill scoring override, set from the drill CSV's "Score Type" column.
-- Values: streak | makes/10 | count: <unit> | strokes: <unit> | time: <unit> | completion.
-- Blank means the app guesses from the drill's goal text and focus.

alter table public.drills add column if not exists score_type text;

notify pgrst, 'reload schema';
