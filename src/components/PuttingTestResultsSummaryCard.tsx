"use client";

import {
  getPuttingTestSkillGrade,
  PUTTING_TEST_MAX_POINTS,
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
  const { grade, showTrophy } = getPuttingTestSkillGrade(points, variant);

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
