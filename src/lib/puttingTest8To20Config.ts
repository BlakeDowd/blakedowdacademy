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
  /** Only the 8 ft putt can be straight (hard to find flat lines longer than that). */
  straightCount: 1,
  leftToRightCount: 5,
  rightToLeftCount: 4,
} as const;
