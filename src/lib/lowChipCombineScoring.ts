import { applyStartDistanceDifficulty } from "@/lib/combineDistanceDifficulty";
import { lowChipCombineConfig } from "@/lib/lowChipCombineConfig";

/**
 * Points from miss distance (metres) — Low Chip piecewise curve.
 */

const STATION_RANGE = {
  minM: Math.min(...lowChipCombineConfig.distancesMetres),
  maxM: Math.max(...lowChipCombineConfig.distancesMetres),
} as const;

export function lowChipPointsFromMetres(m: number): number {
  if (!Number.isFinite(m) || m < 0) return 0;
  if (m > 4.0) return 0;
  if (m <= 0.8) {
    return 10 - m * 1.875;
  }
  if (m <= 2.0) {
    return 8.5 - (m - 0.8) * 2.08;
  }
  return 6 - (m - 2.0) * 2.5;
}

/** Proximity points scaled by station distance (longer chips score more). */
export function lowChipPointsFromMetresAtStation(missM: number, stationM: number): number {
  return applyStartDistanceDifficulty(lowChipPointsFromMetres(missM), stationM, STATION_RANGE);
}

export function roundLowChipPointsOneDecimal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export const LOW_CHIP_MAX_TOTAL_POINTS = roundLowChipPointsOneDecimal(
  lowChipCombineConfig.distancesMetres.reduce(
    (sum, d) =>
      sum + applyStartDistanceDifficulty(10, d, STATION_RANGE) * lowChipCombineConfig.shotsPerDistance,
    0,
  ),
);
