/**
 * AimPoint Test: Long-Range (20–40 ft) — 10 putts, 33% / 50% / 66% reads per putt.
 * practice.test_type = aimpoint_long_40ft, metadata JSONB.
 */
export const aimpointLongRange2040Config = {
  testName: "AimPoint Test: Long-Range (20-40ft)",
  testType: "aimpoint_long_40ft",
  noteKind: "AimPointLongRange2040",
  puttCount: 10,
  distances: [20, 22, 25, 27, 30, 32, 35, 36, 38, 40] as const,
} as const;
