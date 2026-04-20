/** Shared grade scale for combines that map to a 150-point reference (Flop Shot uses it directly). */

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

/**
 * Grade from a score already on the 0–150 scale (Flop Shot session total).
 */
export function performanceGradeFromOutOf150(totalOutOf150: number): CombinePerformanceGrade {
  const s = Number.isFinite(totalOutOf150) ? totalOutOf150 : 0;
  if (s >= 135) return { id: "tour_pro", label: "TOUR PRO" };
  if (s >= 115) return { id: "scratch_elite", label: "SCRATCH / ELITE" };
  if (s >= 90) return { id: "advanced", label: "ADVANCED" };
  if (s >= 60) return { id: "developing", label: "DEVELOPING" };
  return { id: "establishing", label: "ESTABLISHING" };
}

/**
 * Map any combine total and its max (e.g. Chipping 9-hole / 270) onto the 150-point scale for grading.
 */
export function performanceGradeFromSessionTotal(
  sessionTotal: number,
  sessionMaxPoints: number,
): CombinePerformanceGrade & { equivalentOutOf150: number } {
  const max = Number.isFinite(sessionMaxPoints) && sessionMaxPoints > 0 ? sessionMaxPoints : COMBINE_GRADE_SCALE_MAX;
  const raw = Number.isFinite(sessionTotal) ? sessionTotal : 0;
  const equivalentOutOf150 = (raw / max) * COMBINE_GRADE_SCALE_MAX;
  const { id, label } = performanceGradeFromOutOf150(equivalentOutOf150);
  return { id, label, equivalentOutOf150 };
}
