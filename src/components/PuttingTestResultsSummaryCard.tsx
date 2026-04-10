"use client";

import {
  getPuttingTestSkillGrade,
  PUTTING_TEST_MAX_POINTS,
  PUTTING_TEST_PGA_TOUR_AVERAGE_POINTS,
  type PuttingTestGradeVariant,
} from "@/lib/puttingTestSkillGrade";

type Props = {
  points: number;
  putts: number;
  variant: PuttingTestGradeVariant;
  /** Shown as muted context under points (18-hole card only). */
  scratchPointsBenchmark?: number;
  /** Shown next to total putts when set. */
  scratchPuttsBenchmark?: number;
};

export function PuttingTestResultsSummaryCard({
  points,
  putts,
  variant,
  scratchPointsBenchmark,
  scratchPuttsBenchmark,
}: Props) {
  const maxPoints = PUTTING_TEST_MAX_POINTS[variant];
  const pgaTourAverage = PUTTING_TEST_PGA_TOUR_AVERAGE_POINTS[variant];
  const tourGap = points - pgaTourAverage;
  const { grade, showTrophy } = getPuttingTestSkillGrade(points, variant);

  const userBarPct = Math.min(100, Math.max(0, (points / maxPoints) * 100));
  const tourBarPct = Math.min(100, Math.max(0, (pgaTourAverage / maxPoints) * 100));

  const gapLabel =
    tourGap > 0 ? `+${tourGap} pts` : tourGap < 0 ? `${tourGap} pts` : "0 pts";

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5 space-y-4">
      <div>
        <p className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
          Total points: {points} / {maxPoints}
        </p>
        {scratchPointsBenchmark != null && (
          <p className="mt-1.5 text-xs text-gray-500">
            Scratch benchmark {scratchPointsBenchmark} pts
          </p>
        )}
        <p className="mt-1.5 text-sm text-gray-700">
          PGA Tour Average: {pgaTourAverage} pts
        </p>
        <p
          className={
            tourGap < 0
              ? "mt-1 text-sm font-semibold text-red-600"
              : tourGap > 0
                ? "mt-1 text-sm font-semibold text-amber-600 flex items-center gap-1"
                : "mt-1 text-sm font-semibold text-gray-600"
          }
        >
          {tourGap > 0 ? (
            <span className="text-base leading-none" aria-hidden>
              ★
            </span>
          ) : null}
          <span>Gap to Tour: {gapLabel}</span>
        </p>
        <div className="mt-3 space-y-3" aria-label="Score vs PGA Tour average">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-600">
              <span className="font-medium text-gray-800">Your score</span>
              <span className="tabular-nums font-semibold text-gray-900">{points}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-[#014421] transition-[width] duration-300"
                style={{ width: `${userBarPct}%` }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-600">
              <span className="font-medium text-gray-800">PGA Tour Average</span>
              <span className="tabular-nums font-semibold text-gray-900">{pgaTourAverage}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
                style={{ width: `${tourBarPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="inline-flex items-center gap-1.5 rounded-full bg-[#014421] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
        role="status"
        aria-label={`Skill grade: ${grade}`}
      >
        {showTrophy ? (
          <span className="text-base leading-none" aria-hidden>
            🏆
          </span>
        ) : null}
        <span>{grade}</span>
      </div>

      <p className="text-sm text-gray-600 pt-0.5">
        Total putts: <span className="font-semibold text-gray-900">{putts}</span>
        {scratchPuttsBenchmark != null ? (
          <span className="text-gray-500"> (scratch benchmark {scratchPuttsBenchmark})</span>
        ) : null}
      </p>
    </div>
  );
}
