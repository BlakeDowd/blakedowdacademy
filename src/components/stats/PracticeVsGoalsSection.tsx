"use client";

import { useMemo } from "react";
import {
  buildGoalPracticePlan,
  buildPracticeAllocationByRange,
  formatGoalHours,
  formatPracticeDuration,
  type PracticeVsGoalsRow,
} from "@/lib/practiceVsGoalsModel";
import type { GoalFocusArea, PlayerGoalRow } from "@/types/playerGoals";
import { ReportEmpty, ReportSection, ReportTile } from "@/components/coach/CoachReportParts";

type Variant = "self" | "coach";

const AREAS: readonly { label: string; field: "driving" | "irons" | "wedges" | "chipping" | "bunkers" | "putting" | "onCourse" | "mentalStrategy"; focus: GoalFocusArea }[] = [
  { label: "Driving", field: "driving", focus: "Driving" },
  { label: "Irons", field: "irons", focus: "Irons" },
  { label: "Wedges", field: "wedges", focus: "Wedges" },
  { label: "Chipping", field: "chipping", focus: "Chipping" },
  { label: "Bunkers", field: "bunkers", focus: "Bunkers" },
  { label: "Putting", field: "putting", focus: "Putting" },
  { label: "On-course", field: "onCourse", focus: "On-Course" },
  { label: "Mental", field: "mentalStrategy", focus: "Mental/Strategy" },
];

const duration = (min: number) => (min > 0 ? formatPracticeDuration(min) : "–");

export function PracticeVsGoalsSection({
  practiceRows,
  playerGoalRow,
  playerGoalsLoaded,
  variant = "self",
  typeMatch = "strict",
}: {
  practiceRows: PracticeVsGoalsRow[];
  playerGoalRow: PlayerGoalRow | null;
  playerGoalsLoaded: boolean;
  variant?: Variant;
  /** `coach` uses the same type aliases as the legacy coach allocation block. */
  typeMatch?: "strict" | "coach";
}) {
  const byRange = useMemo(() => buildPracticeAllocationByRange(practiceRows, typeMatch), [practiceRows, typeMatch]);
  const plan = useMemo(() => buildGoalPracticePlan(playerGoalRow), [playerGoalRow]);

  const { week, month, all, monthCommitmentWeeks } = byRange;
  const total = (b: typeof week) => AREAS.reduce((s, a) => s + b[a.field], 0);
  const weekTotal = total(week);
  const monthTotal = total(month);
  const hasAnyPractice = weekTotal > 0 || monthTotal > 0 || total(all) > 0;
  const weeklyGoalH = plan?.weeklyHours ?? 0;
  const who = variant === "self" ? "your" : "their";

  return (
    <ReportSection
      title="Practice vs goals"
      subtitle={`Practice logged against ${who} weekly plan. Month covers the last ${Math.round(byRange.monthWindowDays)} days.`}
    >
      {!playerGoalsLoaded ? (
        <p className="text-sm text-stone-500">Loading goals…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ReportTile
              label="This week"
              value={formatPracticeDuration(weekTotal)}
              sub={plan ? `of ${formatGoalHours(weeklyGoalH)} planned` : undefined}
            />
            <ReportTile
              label="This month"
              value={formatPracticeDuration(monthTotal)}
              sub={plan ? `of ${formatGoalHours(weeklyGoalH * monthCommitmentWeeks)} planned` : undefined}
            />
          </div>
          {!plan && (
            <p className="mt-2 text-[11px] text-stone-400">
              No weekly plan saved yet, so there&apos;s nothing to compare against.
            </p>
          )}

          {hasAnyPractice ? (
            <div className="mt-4">
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] gap-2 border-b border-stone-100 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                <span>Area</span>
                <span className="text-right">Week</span>
                <span className="text-right">Month</span>
                <span className="text-right">All time</span>
              </div>
              <div className="divide-y divide-stone-100">
                {AREAS.map((a) => {
                  const goalWeek = plan ? (plan.hours[a.focus] ?? 0) : 0;
                  return (
                    <div
                      key={a.field}
                      className="grid grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] items-center gap-2 py-2 text-xs tabular-nums"
                    >
                      <span className="truncate text-sm font-medium text-stone-800">{a.label}</span>
                      <span className="text-right">
                        <span className="block font-semibold text-stone-900">{duration(week[a.field])}</span>
                        {goalWeek > 0 && <span className="block text-[10px] text-stone-400">of {formatGoalHours(goalWeek)}</span>}
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold text-stone-900">{duration(month[a.field])}</span>
                        {goalWeek > 0 && (
                          <span className="block text-[10px] text-stone-400">
                            of {formatGoalHours(goalWeek * monthCommitmentWeeks)}
                          </span>
                        )}
                      </span>
                      <span className="text-right font-semibold text-stone-600">{duration(all[a.field])}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <ReportEmpty>No practice logged yet.</ReportEmpty>
            </div>
          )}
        </>
      )}
    </ReportSection>
  );
}
