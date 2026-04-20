import { standardChippingCombineConfig } from "@/lib/standardChippingCombineConfig";

/**
 * Points from miss distance in metres (ball to hole).
 * ≤1.0 m · (1,2.5] · (2.5,4.5] · >4.5 m per spec.
 */

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

export function roundStandardChippingPointsOneDecimal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export const STANDARD_CHIPPING_MAX_TOTAL_POINTS =
  10 * standardChippingCombineConfig.distancesMetres.length * standardChippingCombineConfig.shotsPerDistance;
