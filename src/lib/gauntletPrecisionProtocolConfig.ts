/**
 * The Gauntlet Precision Protocol — 12-putt triple filter (strike + gate + distance).
 * Logged to practice_logs as gauntlet_protocol_session.
 */
export const gauntletPrecisionProtocolConfig = {
  testName: "The Gauntlet Precision Protocol",
  /** Black-Label leaderboard label in Academy */
  blackLabelLeaderboardTitle: "Black-Label Leaderboard",
  practiceLogType: "gauntlet_protocol_session",
  targetFeetSequence: [5, 5, 5, 10, 10, 10, 20, 20, 20, 30, 30, 30] as const,
  puttCount: 12,
} as const;

export type GauntletStrike = "clean" | "clip";
export type GauntletGate = "through_gate" | "hit_gate";
