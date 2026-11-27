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
  /** No straight putts — everything is over 8 ft. */
  straightCount: 0,
  leftToRightCount: 5,
  rightToLeftCount: 5,
} as const;
