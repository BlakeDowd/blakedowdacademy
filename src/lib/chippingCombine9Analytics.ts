import { chippingCombine9Config } from "@/lib/chippingCombine9Config";

/** Persisted zone labels; "Outside Zone" kept for legacy rows. */
export type ChipResultLabel =
  | "Holed"
  | "Inside Club Length"
  | "Inside 6ft"
  | "Safety Zone"
  | "Missed Zone"
  | "Outside Zone";

export type ReadErrorLabel = "High" | "Low";

export type ExecutionErrorLabel = "Speed" | "Start Line";

export type ChippingCombineHoleLog = {
  hole: number;
  distance_m: number;
  /** Measured distance from hole (cm); drives chip scoring when set (new sessions always set). */
  proximity_cm?: number;
  chip_result: ChipResultLabel;
  chip_points: number;
  putt_made: boolean;
  putt_points: number;
  read_error?: ReadErrorLabel;
  execution_error?: ExecutionErrorLabel;
  /** e.g. "Low/Start Line" for missed putts with audit */
  miss_category?: string;
};

function roundChipPoints1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Raw linear-decay chip points before rounding (Online Academy chipping scale). */
export function chipProximityPointsRaw(cm: number): number {
  if (!Number.isFinite(cm) || cm < 0) return 0;
  if (cm === 0) return 20;

  if (cm > 0 && cm <= 90) {
    return 15 - (cm / 90) * 4;
  }
  if (cm > 90 && cm < 91) {
    const at90 = 15 - (90 / 90) * 4;
    const at91 = 10 - (((91 - 91) / 92) * 4);
    const t = (cm - 90) / (91 - 90);
    return at90 + (at91 - at90) * t;
  }
  if (cm >= 91 && cm <= 183) {
    return 10 - (((cm - 91) / 92) * 4);
  }
  if (cm > 183 && cm < 184) {
    const at183 = 10 - (((183 - 91) / 92) * 4);
    const at184 = 5 - (((184 - 184) / 116) * 4);
    const t = (cm - 183) / (184 - 183);
    return at183 + (at184 - at183) * t;
  }
  if (cm >= 184 && cm <= 300) {
    return 5 - (((cm - 184) / 116) * 4);
  }
  return 0;
}

/** Chip points from measured proximity (cm), rounded to one decimal. */
export function chipPointsFromProximityCm(cm: number): number {
  return roundChipPoints1(chipProximityPointsRaw(cm));
}

export function chipResultLabelFromProximityCm(cm: number): ChipResultLabel {
  if (!Number.isFinite(cm) || cm < 0) return "Missed Zone";
  if (cm === 0) return "Holed";
  if (cm > 0 && cm <= 90) return "Inside Club Length";
  if (cm > 90 && cm <= 183) return "Inside 6ft";
  if (cm > 183 && cm <= 300) return "Safety Zone";
  return "Missed Zone";
}

export function suggestedChipFromProximityCm(cm: number | null): ChipResultLabel | null {
  if (cm == null || !Number.isFinite(cm) || cm < 0) return null;
  return chipResultLabelFromProximityCm(cm);
}

const MAX_CHIP_PER_HOLE = 20;
export const MAX_CHIP_SESSION = chippingCombine9Config.holeCount * MAX_CHIP_PER_HOLE;

/** Legacy rows without proximity_cm: rough midpoint by zone. Prefer {@link chipPointsFromProximityCm}. */
export function chipPointsForResult(result: ChipResultLabel): number {
  switch (result) {
    case "Holed":
      return 20;
    case "Inside Club Length":
      return 13;
    case "Inside 6ft":
      return 8;
    case "Safety Zone":
      return 3;
    case "Missed Zone":
    case "Outside Zone":
      return 0;
    default:
      return 0;
  }
}

export function totalChipPoints(holes: ChippingCombineHoleLog[]): number {
  return roundChipPoints1(holes.reduce((s, h) => s + h.chip_points, 0));
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
  return roundChipPoints1(holes.reduce((s, h) => s + h.chip_points + h.putt_points, 0));
}

const MAX_PER_HOLE = 30;
export const MAX_SESSION_POINTS = chippingCombine9Config.holeCount * MAX_PER_HOLE;

export function averageProximityCm(holes: ChippingCombineHoleLog[]): number | null {
  const vals = holes
    .map((h) => h.proximity_cm)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c) && c >= 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

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
    average_proximity_cm: averageProximityCm(holes),
    diagnosis: missDiagnosisText(holes),
    miss_categories: counts,
    total_points: sessionTotalPoints(holes),
    max_session_points: MAX_SESSION_POINTS,
  };
}
