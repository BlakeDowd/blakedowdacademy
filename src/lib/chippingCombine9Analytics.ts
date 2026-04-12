import { chippingCombine9Config } from "@/lib/chippingCombine9Config";

export type ChipResultLabel = "Inside 6ft" | "Inside Club Length" | "Outside Zone";

export type ReadErrorLabel = "High" | "Low";

export type ExecutionErrorLabel = "Speed" | "Start Line";

export type ChippingCombineHoleLog = {
  hole: number;
  distance_m: number;
  chip_result: ChipResultLabel;
  chip_points: number;
  putt_made: boolean;
  putt_points: number;
  read_error?: ReadErrorLabel;
  execution_error?: ExecutionErrorLabel;
  /** e.g. "Low/Start Line" for missed putts with audit */
  miss_category?: string;
};

const MAX_CHIP_PER_HOLE = 10;
export const MAX_CHIP_SESSION = chippingCombine9Config.holeCount * MAX_CHIP_PER_HOLE;

export function chipPointsForResult(result: ChipResultLabel): number {
  if (result === "Inside 6ft") return 10;
  if (result === "Inside Club Length") return 5;
  return 0;
}

export function totalChipPoints(holes: ChippingCombineHoleLog[]): number {
  return holes.reduce((s, h) => s + h.chip_points, 0);
}

export function scrambleRate(holes: ChippingCombineHoleLog[]): number {
  if (holes.length === 0) return 0;
  const onePutts = holes.filter((h) => h.putt_made).length;
  return onePutts / holes.length;
}

export function proximityRating(holes: ChippingCombineHoleLog[]): number {
  if (holes.length === 0) return 0;
  return totalChipPoints(holes) / MAX_CHIP_SESSION;
}

export function missDiagnosisText(holes: ChippingCombineHoleLog[]): string {
  const misses = holes.filter((h) => !h.putt_made && h.miss_category);
  if (misses.length === 0) {
    const anyMiss = holes.some((h) => !h.putt_made);
    if (anyMiss) return "Missed putts without a full process audit.";
    return "No missed putts in this session.";
  }
  const counts: Record<string, number> = {};
  for (const h of misses) {
    const k = h.miss_category!;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  let topKey = "";
  let topN = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (n > topN || (n === topN && (topKey === "" || k.localeCompare(topKey) < 0))) {
      topN = n;
      topKey = k;
    }
  }
  const pct = Math.round((topN / misses.length) * 100);
  return `${pct}% of misses were ${topKey}`;
}

export function sessionTotalPoints(holes: ChippingCombineHoleLog[]): number {
  return holes.reduce((s, h) => s + h.chip_points + h.putt_points, 0);
}

const MAX_PER_HOLE = 20;
export const MAX_SESSION_POINTS = chippingCombine9Config.holeCount * MAX_PER_HOLE;

export function buildAggregates(holes: ChippingCombineHoleLog[]): Record<string, unknown> {
  const missRows = holes.filter((h) => !h.putt_made && h.miss_category);
  const counts: Record<string, number> = {};
  for (const h of missRows) {
    const k = h.miss_category!;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return {
    scramble_rate: scrambleRate(holes),
    one_putts: holes.filter((h) => h.putt_made).length,
    proximity_rating: proximityRating(holes),
    proximity_chip_points: totalChipPoints(holes),
    proximity_max_points: MAX_CHIP_SESSION,
    diagnosis: missDiagnosisText(holes),
    miss_categories: counts,
    total_points: sessionTotalPoints(holes),
    max_session_points: MAX_SESSION_POINTS,
  };
}
