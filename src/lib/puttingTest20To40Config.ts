/**
 * 20–40 ft Lag Putting Test — 10 putts; stored under practice.type = PuttingTest20to40.
 */
export const puttingTest20To40Config = {
  testName: "20-40ft Lag Putting Test",
  practiceType: "PuttingTest20to40",
  noteKind: "PuttingTest20to40",
  /** Shuffled each run */
  distances: [20, 22, 25, 27, 30, 32, 35, 36, 38, 40] as const,
  holeCount: 10,
  straightCount: 2,
  leftToRightCount: 4,
  rightToLeftCount: 4,
} as const;
