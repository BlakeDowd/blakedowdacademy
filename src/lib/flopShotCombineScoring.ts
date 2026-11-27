import { applyStartDistanceDifficulty } from "@/lib/combineDistanceDifficulty";
import { flopShotCombineConfig } from "@/lib/flopShotCombineConfig";

/** Pro-scale linear segments (continuous cm → points). */

const STATION_RANGE = {
  minM: Math.min(...flopShotCombineConfig.distancesMetres),
  maxM: Math.max(...flopShotCombineConfig.distancesMetres),
} as const;

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

/** Proximity points scaled by station distance (longer flops score more). */
export function flopShotPointsFromCmAtStation(cm: number, stationM: number): number {
  return applyStartDistanceDifficulty(flopShotPointsFromCm(cm), stationM, STATION_RANGE);
}

export function roundFlopPointsOneDecimal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export const FLOP_SHOT_MAX_TOTAL_POINTS = roundFlopPointsOneDecimal(
  flopShotCombineConfig.distancesMetres.reduce(
    (sum, d) =>
      sum + applyStartDistanceDifficulty(10, d, STATION_RANGE) * flopShotCombineConfig.shotsPerDistance,
    0,
  ),
);
