"use client";

import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Clock, RefreshCw, Sparkles, Target, X } from "lucide-react";
import type { GoalFocusArea } from "@/types/playerGoals";
import {
  FOCUS_AREA_PRESETS,
  SCORING_MILESTONE_LABELS,
  SCORING_MILESTONE_PRESETS,
  WEEKLY_HOURS_PRESETS,
  formatWeeklyHoursLabel,
  type ScoringMilestonePreset,
  type WeeklyHoursPreset,
} from "@/lib/goalPresetConstants";
import {
  bumpAllocationQuarter,
  computeAllocationDisparityLines,
  sumPracticeAllocation,
  type PracticeHoursMap,
} from "@/lib/practiceAllocation";

const tierLabel = "text-xs font-semibold uppercase tracking-wider text-gray-500";
const tierTitle = "text-xs font-semibold text-gray-800 mb-3";

const chipIdle =
  "border border-gray-200 bg-white text-gray-700 shadow-sm hover:border-gray-300 hover:bg-gray-50";
const chipActive = "border border-[#014421] bg-[#014421]/10 text-[#014421] ring-1 ring-[#014421]/20";

const focusChipBase =
  "min-h-14 min-w-0 w-full max-w-full rounded-xl px-2 py-2 text-center text-[13px] font-semibold leading-tight transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#014421]/35 sm:px-2.5 sm:text-sm flex items-center justify-center whitespace-normal break-words hyphens-none";

const baselineInput =
  "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm tabular-nums text-gray-900 placeholder:text-gray-400 transition-colors focus:border-[#014421]/45 focus:outline-none focus:ring-1 focus:ring-[#014421]/20";

const tierChipGrid = "grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-2";

function focusAreaLabelForDisplay(preset: GoalFocusArea): string {
  return preset.replace("/", "/\u200b").replace("-", "-\u200b");
}

function AllocationRing({ fraction }: { fraction: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const dash = Math.min(1, Math.max(0, fraction)) * c;
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0 text-gray-300" aria-hidden>
      <circle cx="11" cy="11" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-90" />
      <circle
        cx="11"
        cy="11"
        r={r}
        fill="none"
        className="text-[#014421]"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

const stepBtn =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-lg font-bold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#014421]/35 disabled:cursor-not-allowed disabled:opacity-35";

const sectionCard = "rounded-2xl border border-gray-100 bg-gray-50/80 p-4 shadow-sm sm:p-5";

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
  dataInsightMessage: string | null;
  suggestedHoursLine: string | null;
  handicapHasStatsSync: boolean;
  handicapMatchesSyncedDefault: boolean;
  coachAmbitiousBadge: string | null;
  accountabilityLeakAlert: string | null;
  suggestedAllocation: PracticeHoursMap;
  suggestedSource: "stats" | "uniform";
  /** Handicap index gap vs milestone benchmark (strokes); null if unknown. */
  handicapMilestoneGap: number | null;
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
  dataInsightMessage,
  suggestedHoursLine,
  handicapHasStatsSync,
  handicapMatchesSyncedDefault,
  coachAmbitiousBadge,
  accountabilityLeakAlert,
  suggestedAllocation,
  suggestedSource,
  handicapMilestoneGap,
}: GoalSettingProps) {
  const [suggestOpen, setSuggestOpen] = useState(false);
  const allocatedSum = sumPracticeAllocation(allocation);
  const balanced = Math.abs(allocatedSum - budgetHours) < 0.051;
  const disparityLines = useMemo(
    () => computeAllocationDisparityLines(allocation, suggestedAllocation, budgetHours, 20),
    [allocation, suggestedAllocation, budgetHours],
  );

  return (
    <div className="space-y-8">
      <section className={sectionCard}>
        <p className={tierLabel}>Long-term</p>
        <p className={`${tierTitle} flex items-center gap-2`}>
          <Target className="h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
          Scoring milestone
        </p>
        <p className="text-[11px] text-gray-600 mb-3">
          Season targets from breaking 100 through scratch, plus handicap, and Pro (+5).
        </p>
        <div className={tierChipGrid}>
          {SCORING_MILESTONE_PRESETS.map((preset) => {
            const active = scoringMilestone === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onScoringMilestone(preset)}
                className={`${focusChipBase} ${active ? chipActive : chipIdle}`}
              >
                {SCORING_MILESTONE_LABELS[preset]}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className={tierLabel}>Current baseline</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label htmlFor="goal-lowest-score" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Lowest score
              </label>
              <input
                id="goal-lowest-score"
                type="number"
                inputMode="numeric"
                min={55}
                max={130}
                placeholder="—"
                value={lowestScore}
                onChange={(e) => onLowestScoreChange(e.target.value)}
                className={baselineInput}
              />
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="goal-current-handicap"
                  className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500"
                >
                  Current handicap
                </label>
                {handicapHasStatsSync && (
                  <span
                    className="inline-flex shrink-0 items-center justify-center rounded-md border border-[#014421]/25 bg-[#014421]/5 p-0.5"
                    title="Handicap pulls from your logged rounds and round_stats when available."
                    aria-label="Synced from round statistics"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${handicapMatchesSyncedDefault ? "text-[#014421]" : "text-gray-400"}`}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  </span>
                )}
              </div>
              <input
                id="goal-current-handicap"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 12.4"
                value={currentHandicap}
                onChange={(e) => onCurrentHandicapChange(e.target.value)}
                className={baselineInput}
              />
            </div>
          </div>

          {coachAmbitiousBadge && (
            <div
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
              role="status"
              aria-label="Coach suggestion"
            >
              <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-800">Coach Suggestion</p>
              <p className="text-[12px] leading-snug text-amber-900">{coachAmbitiousBadge}</p>
            </div>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <p className={tierLabel}>Short-term</p>
        <p className={`${tierTitle} flex items-center gap-2`}>
          <Clock className="h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
          Weekly hours (budget)
        </p>
        <p className="text-[11px] text-gray-600 mb-3">Pick your weekly target first, then split it across practice categories below.</p>
        <div className="grid min-w-0 grid-cols-5 gap-1 sm:gap-2">
          {WEEKLY_HOURS_PRESETS.map((h) => {
            const active = weeklyHours === h;
            return (
              <button
                key={String(h)}
                type="button"
                onClick={() => onWeeklyHours(h)}
                className={`min-w-0 w-full whitespace-nowrap rounded-lg px-1 py-2 text-[11px] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#014421]/35 sm:rounded-xl sm:px-2.5 sm:text-sm ${
                  active ? chipActive : chipIdle
                }`}
              >
                {formatWeeklyHoursLabel(h)}
              </button>
            );
          })}
        </div>
      </section>

      <section className={sectionCard}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className={tierLabel}>Medium-term</p>
            <p className={tierTitle}>Practice allocation</p>
            <p className="text-[11px] text-gray-600 max-w-xl">
              Allocate your {formatWeeklyHoursLabel(weeklyHours)} budget in 0.25h steps. Totals must match before you can save.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSuggestOpen(true)}
            className="shrink-0 rounded-lg border border-[#014421]/35 bg-[#014421]/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#014421] transition-colors hover:bg-[#014421]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#014421]/30"
          >
            Suggested allocation
          </button>
        </div>

        <div
          className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
            balanced ? "border-[#014421]/25 bg-[#014421]/5" : "border-amber-200 bg-amber-50"
          }`}
        >
          <span className="text-xs font-medium text-gray-600">Budget use</span>
          <span className={`tabular-nums text-sm font-bold ${balanced ? "text-[#014421]" : "text-amber-900"}`}>
            {allocatedSum.toFixed(2)}h / {budgetHours.toFixed(2)}h
            {!balanced && <span className="ml-2 text-[11px] font-semibold text-amber-800">— balance to save</span>}
          </span>
        </div>

        <div className="space-y-2">
          {FOCUS_AREA_PRESETS.map((preset) => {
            const h = allocation[preset];
            const frac = budgetHours > 0 ? h / budgetHours : 0;
            const atMax = budgetHours > 0 && sumPracticeAllocation(allocation) >= budgetHours - 0.001;
            return (
              <div
                key={preset}
                className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-2 shadow-sm sm:gap-3 sm:px-3"
              >
                <AllocationRing fraction={frac} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900">{focusAreaLabelForDisplay(preset)}</p>
                  <p className="text-[11px] tabular-nums text-gray-500">{Math.round(frac * 100)}% of budget</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Decrease ${preset} hours`}
                    disabled={h < 0.25}
                    onClick={() => onAllocationChange(bumpAllocationQuarter(allocation, preset, -1, budgetHours))}
                    className={`${stepBtn} border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50`}
                  >
                    −
                  </button>
                  <span className="w-12 text-center text-sm font-bold tabular-nums text-[#014421]">{h.toFixed(2)}</span>
                  <button
                    type="button"
                    aria-label={`Increase ${preset} hours`}
                    disabled={atMax}
                    onClick={() => onAllocationChange(bumpAllocationQuarter(allocation, preset, 1, budgetHours))}
                    className={`${stepBtn} border-[#014421]/35 bg-[#014421]/10 text-[#014421] hover:bg-[#014421]/18`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {disparityLines.length > 0 && (
          <div
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 ring-1 ring-amber-100"
            role="status"
          >
            <p className="mb-2 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-900">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              Disparity alert
            </p>
            <p className="mb-2 text-[11px] text-amber-900/90">
              Your balanced plan differs from the data-driven split by more than 20% in these areas:
            </p>
            <ul className="list-inside list-disc space-y-1 text-[12px] text-amber-950">
              {disparityLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {accountabilityLeakAlert && (
          <div
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 shadow-sm ring-1 ring-rose-100"
            role="alert"
            aria-label="Accountability check"
          >
            <div className="flex gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-rose-800">High priority</p>
                <p className="text-[12px] font-medium leading-snug text-rose-950">{accountabilityLeakAlert}</p>
              </div>
            </div>
          </div>
        )}

        {(dataInsightMessage || suggestedHoursLine) && (
          <div
            className="mt-4 rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50/90 via-white to-gray-50/80 px-3 py-3 shadow-sm ring-1 ring-emerald-100"
            role="region"
            aria-label="System recommendation"
          >
            <div className="flex gap-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
              <div className="min-w-0 space-y-2">
                <p className={tierLabel}>System recommendation</p>
                {dataInsightMessage && (
                  <p className="text-[12px] leading-snug text-gray-800">{dataInsightMessage}</p>
                )}
                {suggestedHoursLine && (
                  <p className="text-[12px] font-semibold tabular-nums text-[#014421]">{suggestedHoursLine}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {suggestOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="suggest-allocation-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl ring-1 ring-gray-100">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 id="suggest-allocation-title" className="text-sm font-bold text-gray-900">
                  Suggested allocation
                </h2>
                <p className="mt-1 text-[11px] text-gray-600">
                  Based on Strokes Gained-style losses in <span className="text-gray-700 font-medium">round_stats</span>
                  {suggestedSource === "stats" ? " and your recent rounds when stats are thin" : ""}. Handicap vs milestone
                  gap
                  {handicapMilestoneGap == null
                    ? " is unknown — weights use your stats only."
                    : ` ≈ ${handicapMilestoneGap > 0 ? "+" : ""}${handicapMilestoneGap.toFixed(1)} index pts (larger gaps slightly emphasize leaks).`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSuggestOpen(false)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#014421]/30"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 space-y-1.5 rounded-xl border border-gray-100 bg-gray-50 p-3">
              {FOCUS_AREA_PRESETS.map((preset) => (
                <div key={preset} className="flex justify-between gap-2 text-[12px]">
                  <span className="text-gray-600">{focusAreaLabelForDisplay(preset)}</span>
                  <span className="tabular-nums font-semibold text-[#014421]">{suggestedAllocation[preset].toFixed(2)}h</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onAllocationChange(suggestedAllocation);
                  setSuggestOpen(false);
                }}
                className="flex-1 rounded-lg border border-[#014421]/40 bg-[#014421]/12 px-3 py-2 text-sm font-bold text-[#014421] hover:bg-[#014421]/18 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#014421]/35"
              >
                Apply suggestion
              </button>
              <button
                type="button"
                onClick={() => setSuggestOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
