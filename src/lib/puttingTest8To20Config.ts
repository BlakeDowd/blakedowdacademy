/**
 * 8–20 ft Putting Test — 10 putts; stored under practice.type = PuttingTest8to20.
 */
export const puttingTest8To20Config = {
  testName: "8-20ft Putting Test",
  practiceType: "PuttingTest8to20",
  noteKind: "PuttingTest8to20",
  /** Shuffled each run */
  distances: [8, 10, 12, 14, 15, 16, 17, 18, 19, 20] as const,
  holeCount: 10,
  straightCount: 2,
  leftToRightCount: 4,
  rightToLeftCount: 4,
} as const;
