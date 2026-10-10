"use client";

import { Lightbulb } from "lucide-react";
import {
  FOCUS_AREA_PRESETS,
  SCORING_MILESTONE_LABELS,
  SCORING_MILESTONE_PRESETS,
  WEEKLY_HOURS_PRESETS,
  formatWeeklyHoursLabel,
  type ScoringMilestonePreset,
  type WeeklyHoursPreset,
} from "@/lib/goalPresetConstants";
import { bumpAllocationQuarter, sumPracticeAllocation, type PracticeHoursMap } from "@/lib/practiceAllocation";
import { WEEKLY_COUNT_GOALS, WEEKLY_GOAL_XP, type WeeklyGoalCounts } from "@/lib/weeklyGoals";

const label = "mb-2 text-xs font-semibold text-gray-700";
const chip = "rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors";
const chipIdle = "bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-gray-300";
const chipActive = "bg-[#014421] text-white";
const input =
  "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm tabular-nums text-gray-900 placeholder:text-gray-400 focus:border-[#014421]/45 focus:outline-none focus:ring-1 focus:ring-[#014421]/20";
const stepBtn =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-base font-bold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-30";

export type GoalSettingProps = {
  scoringMilestone: ScoringMilestonePreset;
  weeklyHours: WeeklyHoursPreset;
  /** Total weekly hours (numeric); allocation must sum to this. */
  budgetHours: number;
  allocation: PracticeHoursMap;
  onAllocationChange: (next: PracticeHoursMap) => void;
  lowestScore: string;
  currentHandicap: string;
  onScoringMilestone: (v: ScoringMilestonePreset) => void;
  onWeeklyHours: (v: WeeklyHoursPreset) => void;
  onLowestScoreChange: (v: string) => void;
  onCurrentHandicapChange: (v: string) => void;
  suggestedAllocation: PracticeHoursMap;
  tip: string | null;
  weeklyCounts: WeeklyGoalCounts;
  onWeeklyCountsChange: (next: WeeklyGoalCounts) => void;
};

export function GoalSetting({
  scoringMilestone,
  weeklyHours,
  budgetHours,
  allocation,
  onAllocationChange,
  lowestScore,
  currentHandicap,
  onScoringMilestone,
  onWeeklyHours,
  onLowestScoreChange,
  onCurrentHandicapChange,
  suggestedAllocation,
  tip,
  weeklyCounts,
  onWeeklyCountsChange,
}: GoalSettingProps) {
  const allocatedSum = sumPracticeAllocation(allocation);
  const remaining = Math.round((budgetHours - allocatedSum) * 100) / 100;
  const balanced = Math.abs(remaining) < 0.051;
  const atMax = allocatedSum >= budgetHours - 0.001;

  return (
    <div className="space-y-5">
      <div>
        <p className={label}>1. Your target</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SCORING_MILESTONE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onScoringMilestone(preset)}
              aria-pressed={scoringMilestone === preset}
              className={`${chip} ${scoringMilestone === preset ? chipActive : chipIdle}`}
            >
              {SCORING_MILESTONE_LABELS[preset]}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-gray-500">Lowest score</span>
            <input
              type="number"
              inputMode="numeric"
              min={55}
              max={130}
              placeholder="—"
              value={lowestScore}
              onChange={(e) => onLowestScoreChange(e.target.value)}
              className={input}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-gray-500">Handicap</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 12.4"
              value={currentHandicap}
              onChange={(e) => onCurrentHandicapChange(e.target.value)}
              className={input}
            />
          </label>
        </div>
      </div>

      <div>
        <p className={label}>2. Hours a week</p>
        <div className="grid grid-cols-5 gap-1.5">
          {WEEKLY_HOURS_PRESETS.map((h) => (
            <button
              key={String(h)}
              type="button"
              onClick={() => onWeeklyHours(h)}
              aria-pressed={weeklyHours === h}
              className={`${chip} ${weeklyHours === h ? chipActive : chipIdle}`}
            >
              {formatWeeklyHoursLabel(h)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-gray-700">3. Split your hours</p>
          <button
            type="button"
            onClick={() => onAllocationChange(suggestedAllocation)}
            className="text-[11px] font-semibold text-[#014421] hover:underline"
          >
            Use suggested split
          </button>
        </div>
        <div className="divide-y divide-gray-100 rounded-xl bg-white ring-1 ring-gray-200">
          {FOCUS_AREA_PRESETS.map((preset) => {
            const h = allocation[preset];
            const frac = budgetHours > 0 ? h / budgetHours : 0;
            return (
              <div key={preset} className="flex items-center gap-2 px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-900">{preset}</p>
                  <div className="mt-1 h-1 rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-[#014421]" style={{ width: `${Math.min(100, frac * 100)}%` }} />
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Less ${preset}`}
                  disabled={h < 0.25}
                  onClick={() => onAllocationChange(bumpAllocationQuarter(allocation, preset, -1, budgetHours))}
                  className={`${stepBtn} bg-gray-100 text-gray-700 hover:bg-gray-200`}
                >
                  −
                </button>
                <span className="w-10 text-center text-xs font-bold tabular-nums text-[#014421]">{h.toFixed(2)}h</span>
                <button
                  type="button"
                  aria-label={`More ${preset}`}
                  disabled={atMax}
                  onClick={() => onAllocationChange(bumpAllocationQuarter(allocation, preset, 1, budgetHours))}
                  className={`${stepBtn} bg-[#014421]/10 text-[#014421] hover:bg-[#014421]/20`}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
        <p className={`mt-1.5 text-[11px] font-medium ${balanced ? "text-[#014421]" : "text-amber-700"}`}>
          {balanced
            ? `All ${formatWeeklyHoursLabel(weeklyHours)} allocated`
            : remaining > 0
              ? `${remaining.toFixed(2)}h left to allocate`
              : `${Math.abs(remaining).toFixed(2)}h over your weekly hours`}
        </p>
      </div>

      <div>
        <p className={label}>4. Other weekly goals</p>
        <div className="divide-y divide-gray-100 rounded-xl bg-white ring-1 ring-gray-200">
          {WEEKLY_COUNT_GOALS.map((g) => {
            const v = weeklyCounts[g.key];
            const set = (next: number) =>
              onWeeklyCountsChange({ ...weeklyCounts, [g.key]: Math.max(0, Math.min(g.max, next)) });
            return (
              <div key={g.key} className="flex items-center gap-2 px-2.5 py-1.5">
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">{g.label}</p>
                <button
                  type="button"
                  aria-label={`Fewer ${g.label.toLowerCase()}`}
                  disabled={v <= 0}
                  onClick={() => set(v - 1)}
                  className={`${stepBtn} bg-gray-100 text-gray-700 hover:bg-gray-200`}
                >
                  −
                </button>
                <span className={`w-10 text-center text-xs font-bold tabular-nums ${v > 0 ? "text-[#014421]" : "text-gray-400"}`}>
                  {v > 0 ? v : "Off"}
                </span>
                <button
                  type="button"
                  aria-label={`More ${g.label.toLowerCase()}`}
                  disabled={v >= g.max}
                  onClick={() => set(v + 1)}
                  className={`${stepBtn} bg-[#014421]/10 text-[#014421] hover:bg-[#014421]/20`}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-500">
          Finish your hours and every goal here in a week to earn {WEEKLY_GOAL_XP.toLocaleString()} XP.
        </p>
      </div>

      {tip && (
        <p className="flex gap-2 rounded-xl bg-[#014421]/5 px-3 py-2.5 text-[11px] leading-snug text-gray-700">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FFA500]" aria-hidden />
          {tip}
        </p>
      )}
    </div>
  );
}
