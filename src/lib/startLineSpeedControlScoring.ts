import { distanceWeightForTargetFt } from "@/lib/strikeAndSpeedControlScoring";
import type { StartLineGate } from "@/lib/startLineAndSpeedControlTestConfig";

/** Fixed putt score when the ball hits the gate (fail grade). */
export const HIT_GATE_PRECISION_SCORE = 100;

/**
 * Precision score per putt: |cm| × distance weight, unless Hit Gate → 100.
 */
export function precisionScoreForPutt(
  distanceFromTargetCm: number,
  targetFt: number,
  gate: StartLineGate,
): number {
  if (gate === "hit_gate") return HIT_GATE_PRECISION_SCORE;
  return Math.abs(distanceFromTargetCm) * distanceWeightForTargetFt(targetFt);
}

export function averagePrecisionScore(
  putts: { targetFt: number; cm: number; gate: StartLineGate }[],
): number {
  if (putts.length === 0) return 0;
  const sum = putts.reduce(
    (s, p) => s + precisionScoreForPutt(p.cm, p.targetFt, p.gate),
    0,
  );
  return sum / putts.length;
}

/** Share of putts that cleared the gate (Through Gate), 0–100. */
export function gateSuccessRatePct(putts: { gate: StartLineGate }[]): number {
  if (putts.length === 0) return 0;
  const through = putts.filter((p) => p.gate === "through_gate").length;
  return (through / putts.length) * 100;
}

/** Share of putts that hit the gate, 0–1. */
export function hitGateRate(putts: { gate: StartLineGate }[]): number {
  if (putts.length === 0) return 0;
  return putts.filter((p) => p.gate === "hit_gate").length / putts.length;
}

const HIGH_START_LINE_VARIANCE_HIT_RATE = 0.3;

export function startLineVarianceMessage(putts: { gate: StartLineGate }[]): string | null {
  if (hitGateRate(putts) > HIGH_START_LINE_VARIANCE_HIT_RATE) {
    return "Start Line Variance Is High. Check Face Alignment At Address.";
  }
  return null;
}
