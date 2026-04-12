/**
 * 8–20 ft Aimpoint combine — 10 putts, 33% / 66% reads per putt.
 * practice.test_type = slope_mid_20ft, metadata JSONB.
 */
export const midRangeSlopeSensingConfig = {
  testName: "8-20ft Aimpoint Combine",
  testType: "slope_mid_20ft",
  noteKind: "SlopeMidRangeSensing820",
  puttCount: 10,
  /** Shuffled each run — one per putt */
  distances: [8, 10, 12, 14, 15, 16, 17, 18, 19, 20] as const,
} as const;
