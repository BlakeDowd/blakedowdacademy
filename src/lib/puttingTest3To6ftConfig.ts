/**
 * 3–6 ft Putting Test — 10 putts; stored under practice.type = PuttingTest3To6ft.
 */
export const puttingTest3To6ftConfig = {
  testName: "3-6ft Putting Test",
  practiceType: "PuttingTest3To6ft",
  noteKind: "PuttingTest3To6ft",
  /** Shuffled each run */
  distances: [3, 3, 3, 4, 4, 4, 5, 5, 6, 6] as const,
  holeCount: 10,
  straightCount: 2,
  leftToRightCount: 4,
  rightToLeftCount: 4,
} as const;
