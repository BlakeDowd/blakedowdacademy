/**
 * Flop Shot Combine — proximity in cm at 5 m, 10 m, and 20 m (five shots each).
 * Logged to practice_logs with log_type flop_shot.
 */

export const flopShotCombineConfig = {
  testName: "Flop Shot Combine",
  practiceLogType: "flop_shot",
  distancesMetres: [5, 10, 20] as const,
  shotsPerDistance: 5,
} as const;
