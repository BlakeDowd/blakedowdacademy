/** Survival 20 — distance buffer game; streak (shots survived) logged to practice_logs. */

export const survival20Config = {
  testName: "Survival 20",
  practiceLogType: "survival_20",
  initialBufferM: 20,
  targetMinM: 30,
  targetMaxM: 100,
} as const;
