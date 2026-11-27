import { applyStartDistanceDifficulty } from "@/lib/combineDistanceDifficulty";
import { standardChippingCombineConfig } from "@/lib/standardChippingCombineConfig";

/**
 * Points from miss distance in metres (ball to hole).
 * ≤1.0 m · (1,2.5] · (2.5,4.5] · >4.5 m per spec.
 */

const STATION_RANGE = {
  minM: Math.min(...standardChippingCombineConfig.distancesMetres),
  maxM: Math.max(...standardChippingCombineConfig.distancesMetres),
} as const;

export function standardChippingPointsFromMetres(m: number): number {
  if (!Number.isFinite(m) || m < 0) return 0;
  if (m > 4.5) return 0;
  if (m <= 1.0) {
    return 10 - m * 2;
  }
  if (m <= 2.5) {
    return 8 - (m - 1) * 2.1;
  }
  return 5 - (m - 2.5) * 2;
}

/** Proximity points scaled by station distance (longer chips score more). */
export function standardChippingPointsFromMetresAtStation(missM: number, stationM: number): number {
  return applyStartDistanceDifficulty(standardChippingPointsFromMetres(missM), stationM, STATION_RANGE);
}

export function roundStandardChippingPointsOneDecimal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export const STANDARD_CHIPPING_MAX_TOTAL_POINTS = roundStandardChippingPointsOneDecimal(
  standardChippingCombineConfig.distancesMetres.reduce(
    (sum, d) =>
      sum + applyStartDistanceDifficulty(10, d, STATION_RANGE) * standardChippingCombineConfig.shotsPerDistance,
    0,
  ),
);
