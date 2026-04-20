import { lowChipCombineConfig } from "@/lib/lowChipCombineConfig";

/**
 * Points from miss distance (metres) — Low Chip piecewise curve.
 */

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

export function roundLowChipPointsOneDecimal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export const LOW_CHIP_MAX_TOTAL_POINTS =
  10 * lowChipCombineConfig.distancesMetres.length * lowChipCombineConfig.shotsPerDistance;
