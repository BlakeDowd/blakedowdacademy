-- 8–20 ft Putting Test (category: PuttingTest8to20)
-- Each hole is one row in public.practice:
--   type = 'PuttingTest8to20'
--   notes = JSON with kind 'PuttingTest8to20' (holeIndex, points, shape, outcome, diagnostics, …).
-- Leaderboard: best complete 10-hole session per user (see src/lib/puttingTestLeaderboard.ts).
--
-- Relational alias for reporting / SQL clients:
CREATE OR REPLACE VIEW public."PuttingTest8to20" AS
  SELECT * FROM public.practice p WHERE p.type = 'PuttingTest8to20';
