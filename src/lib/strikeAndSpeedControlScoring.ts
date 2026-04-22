import type { StrikeQuality } from "@/lib/strikeAndSpeedControlTestConfig";

/** Distance weights by target length (feet): 5→1.5, 10→1.0, 20/30→0.8. */
export function distanceWeightForTargetFt(targetFt: number): number {
  switch (targetFt) {
    case 5:
      return 1.5;
    case 10:
      return 1.0;
    case 20:
    case 30:
      return 0.8;
    default:
      return 1.0;
  }
}

function isGateHitStrike(strike: StrikeQuality): boolean {
  return strike === "hit_gate" || strike === "hit_gate_left" || strike === "hit_gate_right";
}

export function matrixScoreForPutt(
  distanceFromTargetCm: number,
  targetFt: number,
  strike: StrikeQuality,
): number {
  const w = distanceWeightForTargetFt(targetFt);
  const strikeMult = isGateHitStrike(strike) ? 2.0 : 1.0;
  return Math.abs(distanceFromTargetCm) * w * strikeMult;
}

export function averageMatrixScore(
  putts: { targetFt: number; cm: number; strike: StrikeQuality }[],
): number {
  if (putts.length === 0) return 0;
  const sum = putts.reduce(
    (s, p) => s + matrixScoreForPutt(p.cm, p.targetFt, p.strike),
    0,
  );
  return sum / putts.length;
}

/** Mean absolute cm from target (center of ball). */
export function meanAbsDistanceCm(putts: { cm: number }[]): number {
  if (putts.length === 0) return 0;
  return putts.reduce((s, p) => s + Math.abs(p.cm), 0) / putts.length;
}

export function cleanStrikeRate(putts: { strike: StrikeQuality }[]): number {
  if (putts.length === 0) return 0;
  const clean = putts.filter((p) => p.strike === "clean").length;
  return clean / putts.length;
}

export function gateSideCounts(putts: { strike: StrikeQuality }[]): {
  left: number;
  right: number;
  legacy: number;
  totalGateHits: number;
} {
  let left = 0;
  let right = 0;
  let legacy = 0;
  for (const p of putts) {
    if (p.strike === "hit_gate_left") left++;
    else if (p.strike === "hit_gate_right") right++;
    else if (p.strike === "hit_gate") legacy++;
  }
  return { left, right, legacy, totalGateHits: left + right + legacy };
}

export function gateSideImprovementMessage(putts: { strike: StrikeQuality }[]): string | null {
  const { left, right, legacy, totalGateHits } = gateSideCounts(putts);
  if (totalGateHits === 0) return "No gate contacts logged - centered strike looks stable.";
  if (legacy > 0 && left === 0 && right === 0) {
    return "Gate contacts were logged without side detail; track left vs right to isolate face-angle bias.";
  }
  if (left > right) {
    return `Improvement focus: left-side gate contacts (${left} vs ${right}) - face likely closing through impact.`;
  }
  if (right > left) {
    return `Improvement focus: right-side gate contacts (${right} vs ${left}) - face likely staying open through impact.`;
  }
  return `Gate contacts are balanced (${left}-${right}); focus on reducing total contacts while keeping speed calibration.`;
}

/** Heuristic threshold (cm): above this, distance control is considered "high error" for diagnosis. */
const HIGH_DISTANCE_ERROR_MEAN_CM = 20;

export function performanceDiagnosis(putts: { strike: StrikeQuality; cm: number }[]): string {
  const cleanRate = cleanStrikeRate(putts);
  const meanCm = meanAbsDistanceCm(putts);

  if (cleanRate < 0.7) {
    return "Inconsistent Energy Transfer, Prioritize Centeredness.";
  }
  if (cleanRate > 0.9 && meanCm >= HIGH_DISTANCE_ERROR_MEAN_CM) {
    return "Technique Is Sound, Focus On Calibration.";
  }
  return "Solid blend of strike and distance — repeat the test to measure progress.";
}
