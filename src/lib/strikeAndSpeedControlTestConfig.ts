/**
 * Strike And Speed Control Test — 12 putts (3× each at 5, 10, 20, 30 ft).
 * Persisted to practice_logs; index stored on profiles.combine_profile.
 */
export const strikeAndSpeedControlTestConfig = {
  testName: "Strike And Speed Control Test",
  practiceLogType: "strike_speed_control",
  /** Three putts per distance, short to long */
  targetFeetSequence: [5, 5, 5, 10, 10, 10, 20, 20, 20, 30, 30, 30] as const,
  puttCount: 12,
} as const;

export type StrikeQuality = "clean" | "hit_gate";
