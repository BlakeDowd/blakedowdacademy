"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PieChart } from "lucide-react";
import {
  buildGoalPracticePlan,
  buildPracticeAllocationByRange,
  formatGoalHours,
  formatPracticeDuration,
  type PracticeVsGoalsRow,
} from "@/lib/practiceVsGoalsModel";
import type { GoalFocusArea, PlayerGoalRow } from "@/types/playerGoals";

type Variant = "self" | "coach";

export function PracticeVsGoalsSection({
  practiceRows,
  playerGoalRow,
  playerGoalsLoaded,
  variant = "self",
  typeMatch = "strict",
  showHeader = true,
}: {
  practiceRows: PracticeVsGoalsRow[];
  playerGoalRow: PlayerGoalRow | null;
  playerGoalsLoaded: boolean;
  variant?: Variant;
  /** `coach` uses the same type aliases as the legacy coach allocation block. */
  typeMatch?: "strict" | "coach";
  showHeader?: boolean;
}) {
  const practiceAllocationByRange = useMemo(
    () => buildPracticeAllocationByRange(practiceRows, typeMatch),
    [practiceRows, typeMatch],
  );

  const goalPracticePlan = useMemo(() => buildGoalPracticePlan(playerGoalRow), [playerGoalRow]);

  type Bucket = (typeof practiceAllocationByRange)["week"];
  const { week: weekBuckets, month: monthBuckets, all: allBuckets, monthCommitmentWeeks } =
    practiceAllocationByRange;

  const sumBuckets = (b: Bucket) =>
    b.driving +
    b.irons +
    b.wedges +
    b.chipping +
    b.bunkers +
    b.putting +
    b.mentalStrategy +
    b.onCourse;

  const rangeTotals = {
    week: sumBuckets(weekBuckets),
    month: sumBuckets(monthBuckets),
    all: sumBuckets(allBuckets),
  };
  const hasAnyPractice = rangeTotals.week > 0 || rangeTotals.month > 0 || rangeTotals.all > 0;

  const activityRows: readonly {
    category: string;
    field: keyof Bucket;
    focus: GoalFocusArea;
  }[] = [
    { category: "Driving", field: "driving", focus: "Driving" },
    { category: "Irons", field: "irons", focus: "Irons" },
    { category: "Wedges", field: "wedges", focus: "Wedges" },
    { category: "Chipping", field: "chipping", focus: "Chipping" },
    { category: "Bunkers", field: "bunkers", focus: "Bunkers" },
    { category: "Putting", field: "putting", focus: "Putting" },
    { category: "On-Course", field: "onCourse", focus: "On-Course" },
    { category: "Mental/Strategy", field: "mentalStrategy", focus: "Mental/Strategy" },
  ];

  const weeklyCommitH = goalPracticePlan?.weeklyHours ?? 0;
  const monthCommitH = goalPracticePlan ? weeklyCommitH * monthCommitmentWeeks : 0;

  return (
    <section className="mb-8 min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
      {showHeader && (
        <div className="mb-4 flex items-center gap-3 border-b border-stone-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
            <PieChart className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg">Practice vs goals</h2>
            <p className="mt-0.5 text-xs text-stone-500">
              {variant === "self" ? (
                <>
                  Logged practice time compared to the weekly plan you save in{" "}
                  <Link href="/" className="font-medium text-[#014421] underline-offset-2 hover:underline">
                    Goal setting on Home
                  </Link>
                  . <span className="font-medium text-stone-600">Actual / committed</span> uses the same area split as
                  your goal card. Month commitments scale your weekly totals across the rolling month window (
                  {Math.round(practiceAllocationByRange.monthWindowDays)} days).
                </>
              ) : (
                <>
                  Logged practice time compared to the weekly plan the player saves in{" "}
                  <Link href="/" className="font-medium text-[#014421] underline-offset-2 hover:underline">
                    Goal setting on Home
                  </Link>
                  . <span className="font-medium text-stone-600">Actual / committed</span> matches their goal split.
                  Month scales weekly totals across the rolling month window (
                  {Math.round(practiceAllocationByRange.monthWindowDays)} days).
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <>
        {!playerGoalsLoaded ? (
          <p className="mb-3 text-sm text-stone-500">
            {variant === "self" ? "Loading your saved goals…" : "Loading saved goals…"}
          </p>
        ) : !goalPracticePlan ? (
          <p className="mb-3 rounded-lg border border-dashed border-stone-200 bg-stone-50/80 px-3 py-2 text-sm text-stone-600">
            {variant === "self" ? (
              <>
                Save your <span className="font-semibold">weekly hours</span> and practice split on{" "}
                <Link href="/" className="font-semibold text-[#014421] underline-offset-2 hover:underline">
                  Home
                </Link>{" "}
                to compare logged time against your plan.
              </>
            ) : (
              <>
                This player has not saved <span className="font-semibold">weekly hours</span> and a practice split on{" "}
                <Link href="/" className="font-semibold text-[#014421] underline-offset-2 hover:underline">
                  Home
                </Link>{" "}
                yet — there is no plan to compare against.
              </>
            )}
          </p>
        ) : (
          <div className="mb-3 rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-3 text-stone-800 sm:px-4">
            <p className="text-sm font-semibold text-stone-900">All practice (every area)</p>
            <p className="mt-2 flex flex-wrap gap-x-6 gap-y-2 tabular-nums">
              <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-xs font-medium text-stone-500">Week</span>
                <span className="text-base font-bold tracking-tight text-[#014421] sm:text-lg">
                  {formatPracticeDuration(rangeTotals.week)}
                </span>
                <span className="text-sm font-medium text-stone-400" aria-hidden>
                  /
                </span>
                <span className="text-base font-semibold tracking-tight text-stone-800 sm:text-lg">
                  {formatGoalHours(weeklyCommitH)}
                </span>
                <span className="text-xs font-normal text-stone-500">committed</span>
              </span>
              <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="text-xs font-medium text-stone-500">Month</span>
                <span className="text-base font-bold tracking-tight text-[#014421] sm:text-lg">
                  {formatPracticeDuration(rangeTotals.month)}
                </span>
                <span className="text-sm font-medium text-stone-400" aria-hidden>
                  /
                </span>
                <span className="text-base font-semibold tracking-tight text-stone-800 sm:text-lg">
                  {formatGoalHours(monthCommitH)}
                </span>
                <span className="text-xs font-normal text-stone-500">committed</span>
              </span>
            </p>
          </div>
        )}

        {!hasAnyPractice && playerGoalsLoaded ? (
          <p className="mb-3 text-sm text-stone-500">No practice logged in week, month, or all-time windows.</p>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {activityRows.map((row) => {
            const wMin = weekBuckets[row.field];
            const mMin = monthBuckets[row.field];
            const aMin = allBuckets[row.field];
            const committedWeekH = goalPracticePlan ? (goalPracticePlan.hours[row.focus] ?? 0) : 0;
            const committedMonthH = goalPracticePlan ? committedWeekH * monthCommitmentWeeks : 0;

            return (
              <div
                key={row.category}
                className="min-w-0 rounded-xl border border-stone-100 bg-stone-50/40 p-2.5 shadow-sm transition-colors hover:border-stone-200 hover:bg-white sm:p-3"
              >
                <div className="mb-2 truncate text-xs font-semibold text-stone-900 sm:text-sm">{row.category}</div>
                <div className="space-y-2 text-xs leading-snug text-stone-800 sm:text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 text-[11px] font-semibold capitalize tracking-wide text-stone-500 sm:text-xs">
                      Week
                    </span>
                    <span className="min-w-0 text-right tabular-nums tracking-tight">
                      <span className="text-sm font-bold text-[#014421] sm:text-base">
                        {formatPracticeDuration(wMin)}
                      </span>
                      {goalPracticePlan ? (
                        <>
                          <span className="mx-1 text-sm font-medium text-stone-300 sm:text-base" aria-hidden>
                            /
                          </span>
                          <span className="text-sm font-semibold text-stone-700 sm:text-base">
                            {formatGoalHours(committedWeekH)}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 text-[11px] font-semibold capitalize tracking-wide text-stone-500 sm:text-xs">
                      Month
                    </span>
                    <span className="min-w-0 text-right tabular-nums tracking-tight">
                      <span className="text-sm font-bold text-[#014421] sm:text-base">
                        {formatPracticeDuration(mMin)}
                      </span>
                      {goalPracticePlan ? (
                        <>
                          <span className="mx-1 text-sm font-medium text-stone-300 sm:text-base" aria-hidden>
                            /
                          </span>
                          <span className="text-sm font-semibold text-stone-700 sm:text-base">
                            {formatGoalHours(committedMonthH)}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 border-t border-stone-200/80 pt-2">
                    <span className="shrink-0 text-[11px] font-semibold capitalize tracking-wide text-stone-500 sm:text-xs">
                      All
                    </span>
                    <span className="text-right tabular-nums tracking-tight">
                      <span className="text-sm font-bold text-stone-900 sm:text-base">
                        {formatPracticeDuration(aMin)}
                      </span>
                      <span className="ml-1 text-[11px] font-normal text-stone-500 sm:text-xs">logged</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </>
    </section>
  );
}
