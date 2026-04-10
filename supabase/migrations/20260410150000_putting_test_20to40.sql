-- 20–40 ft Lag Putting Test (category: PuttingTest20to40)
-- Each hole is one row in public.practice:
--   type = 'PuttingTest20to40'
--   notes = JSON with kind 'PuttingTest20to40' (holeIndex, points, shape, outcome, diagnostics, …).
-- Leaderboard: best complete 10-hole session per user (see src/lib/puttingTestLeaderboard.ts).

CREATE OR REPLACE VIEW public."PuttingTest20to40" AS
  SELECT * FROM public.practice p WHERE p.type = 'PuttingTest20to40';
