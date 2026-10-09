/**
 * Iron Safe Side Test — each shot has a side of the flag you must not miss on. Get as close to the
 * flag line as you can without crossing it; finger method from the flag line. Logged to practice_logs.
 */
export const ironSafeSideConfig = {
  testName: "Iron Safe Side Test",
  practiceLogType: "iron_safe_side",
  maxShotPoints: 10,
  /** Safe-side miss: 10 minus this per finger off the flag line. */
  safePointsPerFinger: 2,
  /** Crossing the flag: −5 up to 1 finger, −8 up to 2 fingers, −10 beyond. */
  crossPenalties: [
    { upTo: 1, points: -5 },
    { upTo: 2, points: -8 },
  ],
  crossPenaltyMax: -10,
} as const;

export type SafeSideAvoid = "left" | "right";
export type SafeSideResult = "safe" | "line" | "crossed";
export type SafeSideFingers = number | "outside";

export const SAFE_SIDE_FINGER_OPTIONS: SafeSideFingers[] = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, "outside"];

export function safeSideShotPoints(result: SafeSideResult, fingers: SafeSideFingers): number {
  if (result === "line") return ironSafeSideConfig.maxShotPoints;
  if (result === "safe") {
    if (fingers === "outside") return 0;
    return Math.max(0, ironSafeSideConfig.maxShotPoints - fingers * ironSafeSideConfig.safePointsPerFinger);
  }
  if (fingers !== "outside") {
    for (const band of ironSafeSideConfig.crossPenalties) {
      if (fingers <= band.upTo) return band.points;
    }
  }
  return ironSafeSideConfig.crossPenaltyMax;
}

/** Roughly half left, half right, in random order. */
export function buildSafeSideSequence(count: number, random = Math.random): SafeSideAvoid[] {
  const sides: SafeSideAvoid[] = Array.from({ length: count }, (_, i) => (i % 2 === 0 ? "left" : "right"));
  if (random() < 0.5) sides.reverse();
  for (let i = sides.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [sides[i], sides[j]] = [sides[j]!, sides[i]!];
  }
  return sides;
}
