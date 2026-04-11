import { distanceWeightForTargetFt } from "@/lib/strikeAndSpeedControlScoring";
import type { GauntletGate, GauntletStrike } from "@/lib/gauntletPrecisionProtocolConfig";

/** Distance error (cm) applies only after strike + gate are logged; scoring stacks multipliers. */
export function gauntletPuttScore(
  distanceFromTargetCm: number,
  targetFt: number,
  strike: GauntletStrike,
  gate: GauntletGate,
): number {
  const base = Math.abs(distanceFromTargetCm) * distanceWeightForTargetFt(targetFt);
  let mult = 1;
  if (strike === "clip") mult *= 1.5;
  if (gate === "hit_gate") mult *= 3;
  return base * mult;
}

export function averageGauntletScore(
  putts: {
    targetFt: number;
    cm: number;
    strike: GauntletStrike;
    gate: GauntletGate;
  }[],
): number {
  if (putts.length === 0) return 0;
  return putts.reduce((s, p) => s + gauntletPuttScore(p.cm, p.targetFt, p.strike, p.gate), 0) / putts.length;
}

const PERFECT_DISTANCE_CM = 10;

export function isPerfectPutt(strike: GauntletStrike, gate: GauntletGate, cm: number): boolean {
  return strike === "clean" && gate === "through_gate" && Math.abs(cm) < PERFECT_DISTANCE_CM;
}

export function perfectPuttCount(
  putts: { strike: GauntletStrike; gate: GauntletGate; cm: number }[],
): number {
  return putts.filter((p) => isPerfectPutt(p.strike, p.gate, p.cm)).length;
}

/** Putts where both penalty conditions apply (Clip + Hit Gate). Stored as 0–100. */
export function tripleFailureRatePercent(
  putts: { strike: GauntletStrike; gate: GauntletGate }[],
): number {
  if (putts.length === 0) return 0;
  const n = putts.filter((p) => p.strike === "clip" && p.gate === "hit_gate").length;
  return (n / putts.length) * 100;
}
