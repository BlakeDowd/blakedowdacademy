/** Iron Face Control Protocol — 10-shot block; Gate / Curve / Solid toggles → practice_logs. */

export const ironFaceControlConfig = {
  testName: "Iron Face Control Protocol",
  practiceLogType: "iron_face_control",
  shotCount: 10,
  ptsGate: 3,
  ptsCurve: 3,
  ptsSolid: 4,
  maxShotPoints: 10,
  maxSessionPoints: 100,
} as const;
