import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";
import type { ChipResultLabel } from "@/lib/chippingCombine9Analytics";
import type { PrimaryMissReason } from "@/lib/puttingTestMissDiagnostics";
import type { PuttingTestMissCategory } from "@/lib/puttingTestMissScoring";

export type BunkerVerticalStrike = "thin" | "solid" | "fat";

export type BunkerHoleLog = {
  hole: number;
  /** Player-entered start distance for this shot (m). */
  distance_m: number;
  proximity_cm: number;
  zone: ChipResultLabel;
  bunker_chip_points: number;
  strike_vertical: BunkerVerticalStrike;
  /** True when the ball was holed from sand (no putt required). */
  holed: boolean;
  /** Only when not holed: whether the scramble putt was made. */
  putt_made?: boolean;
  putt_points: number;
  first_putt_miss_quadrant?: PuttingTestMissCategory;
  putt_miss_primary_reason?: PrimaryMissReason;
  miss_category?: string;
};

function roundPoints1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Proximity scoring (cm):
 * 0 → Holed (20)
 * 1–90 → Inside Club Length, 15 → 11 linear
 * 91–183 → Inside 6ft, 10 → 6 linear
 * 184–300 → Safety Zone, 5 → 1 linear
 * >300 → Missed (0)
 */
export function bunkerProximityPointsRaw(cm: number): number {
  if (!Number.isFinite(cm) || cm < 0) return 0;
  if (cm === 0) return 20;
  if (cm >= 1 && cm <= 90) {
    return 15 - ((cm - 1) / (90 - 1)) * (15 - 11);
  }
  if (cm >= 91 && cm <= 183) {
    return 10 - ((cm - 91) / (183 - 91)) * (10 - 6);
  }
  if (cm >= 184 && cm <= 300) {
    return 5 - ((cm - 184) / (300 - 184)) * (5 - 1);
  }
  return 0;
}

export function bunkerPointsFromProximityCm(cm: number): number {
  return roundPoints1(bunkerProximityPointsRaw(cm));
}

export function bunkerZoneFromProximityCm(cm: number): ChipResultLabel {
  if (!Number.isFinite(cm) || cm < 0) return "Missed Zone";
  if (cm === 0) return "Holed";
  if (cm >= 1 && cm <= 90) return "Inside Club Length";
  if (cm >= 91 && cm <= 183) return "Inside 6ft";
  if (cm >= 184 && cm <= 300) return "Safety Zone";
  return "Missed Zone";
}

const MAX_CHIP_PER_HOLE = 20;
const MAX_PUTT_PER_HOLE = bunker9HoleChallengeConfig.scramblePuttBonus;
export const MAX_BUNKER_SESSION_CHIP = bunker9HoleChallengeConfig.holeCount * MAX_CHIP_PER_HOLE;
export const MAX_SESSION_POINTS =
  bunker9HoleChallengeConfig.holeCount * (MAX_CHIP_PER_HOLE + MAX_PUTT_PER_HOLE);

export function totalBunkerChipPoints(holes: BunkerHoleLog[]): number {
  return roundPoints1(holes.reduce((s, h) => s + h.bunker_chip_points, 0));
}

/** Among holes that required a putt (not holed), fraction where the putt was made. */
export function bunkerScrambleRate(holes: BunkerHoleLog[]): number {
  const needPutt = holes.filter((h) => !h.holed);
  if (needPutt.length === 0) return 0;
  const made = needPutt.filter((h) => h.putt_made === true).length;
  return made / needPutt.length;
}

export function bunkerProximityRating(holes: BunkerHoleLog[]): number {
  if (holes.length === 0) return 0;
  return totalBunkerChipPoints(holes) / MAX_BUNKER_SESSION_CHIP;
}

export function bunkerMissDiagnosisText(holes: BunkerHoleLog[]): string {
  const missedScramblePutts = holes.filter((h) => !h.holed && !h.putt_made);
  const categorized = missedScramblePutts.filter((h) => h.miss_category);
  if (missedScramblePutts.length === 0) {
    return "No missed scramble putts in this session.";
  }
  if (categorized.length === 0) {
    return "Missed scramble putts with no category logged.";
  }
  const counts: Record<string, number> = {};
  for (const h of categorized) {
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
  const pct = Math.round((topN / categorized.length) * 100);
  return `${pct}% of missed scramble putts were ${topKey}`;
}

export function bunkerSessionTotalPoints(holes: BunkerHoleLog[]): number {
  return roundPoints1(holes.reduce((s, h) => s + h.bunker_chip_points + h.putt_points, 0));
}

export function averageBunkerProximityCm(holes: BunkerHoleLog[]): number | null {
  const vals = holes
    .map((h) => h.proximity_cm)
    .filter((c) => typeof c === "number" && Number.isFinite(c) && c >= 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function buildBunkerAggregates(holes: BunkerHoleLog[]): Record<string, unknown> {
  const missRows = holes.filter((h) => !h.holed && !h.putt_made && h.miss_category);
  const counts: Record<string, number> = {};
  for (const h of missRows) {
    const k = h.miss_category!;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const strikeCounts: Record<BunkerVerticalStrike, number> = { thin: 0, solid: 0, fat: 0 };
  for (const h of holes) {
    strikeCounts[h.strike_vertical] = (strikeCounts[h.strike_vertical] ?? 0) + 1;
  }
  return {
    scramble_rate: bunkerScrambleRate(holes),
    one_putts: holes.filter((h) => !h.holed && h.putt_made).length,
    holed_count: holes.filter((h) => h.holed).length,
    proximity_rating: bunkerProximityRating(holes),
    bunker_chip_points: totalBunkerChipPoints(holes),
    bunker_chip_max: MAX_BUNKER_SESSION_CHIP,
    average_proximity_cm: averageBunkerProximityCm(holes),
    diagnosis: bunkerMissDiagnosisText(holes),
    miss_categories: counts,
    strike_vertical: strikeCounts,
    total_points: bunkerSessionTotalPoints(holes),
    max_session_points: MAX_SESSION_POINTS,
  };
}
