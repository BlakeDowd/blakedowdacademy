/**
 * Start Line And Speed Control Test — 12 putts (3× each at 5, 10, 20, 30 ft).
 * practice_logs.log_type = start_line_speed_test
 */
export const startLineAndSpeedControlTestConfig = {
  testName: "Start Line And Speed Control Test",
  practiceLogType: "start_line_speed_test",
  targetFeetSequence: [5, 5, 5, 10, 10, 10, 20, 20, 20, 30, 30, 30] as const,
  puttCount: 12,
} as const;

export type StartLineGate = "through_gate" | "hit_gate";
