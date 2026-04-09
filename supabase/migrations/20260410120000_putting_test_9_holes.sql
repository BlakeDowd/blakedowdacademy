-- Putting Test 9 Holes (category name: PuttingTest9Holes)
-- Each hole is stored as one row in public.practice:
--   type = 'PuttingTest9Holes'
--   notes = JSON string with kind 'PuttingTest9Holes' and per-hole fields (holeIndex, points, shape, ...).
-- Leaderboard aggregates best complete 9-hole session score per user (see src/lib/puttingTestLeaderboard.ts).

SELECT 1;
