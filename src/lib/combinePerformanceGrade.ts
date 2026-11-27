/** Shared grade language for Academy combines (aligned with putting skill labels). */

export const COMBINE_GRADE_SCALE_MAX = 150;

export type CombinePerformanceGradeId =
  | "tour_pro"
  | "scratch_elite"
  | "advanced"
  | "developing"
  | "establishing";

export type CombinePerformanceGrade = {
  id: CombinePerformanceGradeId;
  /** Exact label persisted and shown in UI */
  label: string;
};

/** Percent-of-max cutoffs (same ladder as the classic /150 scale). */
export const COMBINE_GRADE_BANDS: readonly {
  id: CombinePerformanceGradeId;
  label: string;
  minPct: number;
  /** Points needed on the 0–150 reference scale */
  minOutOf150: number;
}[] = [
  { id: "tour_pro", label: "Tour Pro", minPct: 90, minOutOf150: 135 },
  { id: "scratch_elite", label: "Scratch", minPct: 76.6667, minOutOf150: 115 },
  { id: "advanced", label: "Single Digit", minPct: 60, minOutOf150: 90 },
  { id: "developing", label: "Mid-Handicap", minPct: 40, minOutOf150: 60 },
  { id: "establishing", label: "Needs Work", minPct: 0, minOutOf150: 0 },
] as const;

function bandForOutOf150(s: number): CombinePerformanceGrade {
  for (const band of COMBINE_GRADE_BANDS) {
    if (s >= band.minOutOf150) return { id: band.id, label: band.label };
  }
  return { id: "establishing", label: "Needs Work" };
}

/**
 * Grade from a score already on the 0–150 scale (Flop / Standard / Low chip session totals).
 */
export function performanceGradeFromOutOf150(
  totalOutOf150: number,
): CombinePerformanceGrade & { equivalentOutOf150: number; pctOfMax: number } {
  const s = Number.isFinite(totalOutOf150) ? totalOutOf150 : 0;
  const { id, label } = bandForOutOf150(s);
  return {
    id,
    label,
    equivalentOutOf150: s,
    pctOfMax: (s / COMBINE_GRADE_SCALE_MAX) * 100,
  };
}

/**
 * Map any combine total and its layout max onto the shared grade ladder.
 */
export function performanceGradeFromSessionTotal(
  sessionTotal: number,
  sessionMaxPoints: number,
): CombinePerformanceGrade & { equivalentOutOf150: number; pctOfMax: number } {
  const max =
    Number.isFinite(sessionMaxPoints) && sessionMaxPoints > 0
      ? sessionMaxPoints
      : COMBINE_GRADE_SCALE_MAX;
  const raw = Number.isFinite(sessionTotal) ? sessionTotal : 0;
  const pctOfMax = Math.max(0, (raw / max) * 100);
  const equivalentOutOf150 = (raw / max) * COMBINE_GRADE_SCALE_MAX;
  const { id, label } = bandForOutOf150(equivalentOutOf150);
  return { id, label, equivalentOutOf150, pctOfMax };
}

/** Next band above the current grade, if any. */
export function nextCombineGradeBand(gradeId: CombinePerformanceGradeId) {
  const idx = COMBINE_GRADE_BANDS.findIndex((b) => b.id === gradeId);
  if (idx <= 0) return null;
  return COMBINE_GRADE_BANDS[idx - 1]!;
}

/**
 * Short “why this grade” line for results screens.
 * @example "Single Digit — 60%+ of max. You scored 64%. Need 77% for Scratch."
 */
export function explainCombineGrade(
  grade: Pick<CombinePerformanceGrade, "id" | "label"> & {
    pctOfMax?: number;
    equivalentOutOf150?: number;
  },
): string {
  const pct =
    typeof grade.pctOfMax === "number" && Number.isFinite(grade.pctOfMax)
      ? grade.pctOfMax
      : typeof grade.equivalentOutOf150 === "number"
        ? (grade.equivalentOutOf150 / COMBINE_GRADE_SCALE_MAX) * 100
        : null;
  const band = COMBINE_GRADE_BANDS.find((b) => b.id === grade.id);
  const floor = band ? Math.round(band.minPct) : 0;
  const pctText = pct != null ? `${Math.round(pct)}%` : "this score";
  const next = nextCombineGradeBand(grade.id);
  if (!next) {
    return `${grade.label} — top band (${floor}%+ of max). You scored ${pctText}.`;
  }
  const need = Math.round(next.minPct);
  return `${grade.label} — ${floor}%+ of max. You scored ${pctText}. Need ${need}% for ${next.label}.`;
}

/** Map legacy ALL-CAPS labels onto the shared language. */
export function normalizeCombineGradeLabel(label: string): string {
  const key = label.trim().toUpperCase().replace(/\s+/g, " ");
  if (key === "TOUR PRO") return "Tour Pro";
  if (key === "SCRATCH / ELITE" || key === "SCRATCH") return "Scratch";
  if (key === "ADVANCED") return "Single Digit";
  if (key === "DEVELOPING") return "Mid-Handicap";
  if (key === "ESTABLISHING") return "Needs Work";
  return label;
}
