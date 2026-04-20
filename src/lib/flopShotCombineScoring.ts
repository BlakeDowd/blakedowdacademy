import { flopShotCombineConfig } from "@/lib/flopShotCombineConfig";

/** Pro-scale linear segments (continuous cm → points). */

export function flopShotPointsFromCm(cm: number): number {
  if (!Number.isFinite(cm) || cm < 0) return 0;
  if (cm > 300) return 0;
  if (cm <= 90) {
    return 10 - cm / 30;
  }
  if (cm <= 180) {
    return 7 - (cm - 90) / 30;
  }
  return 4 - (cm - 180) / 40;
}

export function roundFlopPointsOneDecimal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export const FLOP_SHOT_MAX_TOTAL_POINTS =
  10 * flopShotCombineConfig.distancesMetres.length * flopShotCombineConfig.shotsPerDistance;
