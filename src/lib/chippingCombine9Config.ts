/**
 * 9-Hole Chipping Combine — scramble test, random 10–30 m per hole.
 * Saved as one practice row: test_type chipping_combine_9, metadata JSONB.
 */
export const chippingCombine9Config = {
  testName: "9-Hole Chipping Combine",
  testType: "chipping_combine_9" as const,
  noteKind: "ChippingCombine9",
  holeCount: 9,
  distanceMinM: 10,
  distanceMaxM: 30,
} as const;
