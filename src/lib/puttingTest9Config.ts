/**
 * Putting Test 9 Holes — fixed distances; stored under practice.type = PuttingTest9Holes.
 */
export const puttingTest9Config = {
  testName: "Putting Test 9 Holes",
  /** DB category on public.practice.type */
  practiceType: "PuttingTest9Holes",
  /** JSON notes.kind — distinguishes from 18-hole putting_test_hole */
  noteKind: "PuttingTest9Holes",
  distances: [3, 4, 6, 8, 10, 15, 20, 30, 40] as const,
  holeCount: 9,
} as const;
