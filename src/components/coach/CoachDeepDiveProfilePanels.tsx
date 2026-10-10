"use client";

import type { GoalAccountabilityState } from "@/types/playerGoals";
import type { PlayerGoalRow } from "@/types/playerGoals";
import {
  SCORING_MILESTONE_LABELS,
  formatWeeklyHoursLabel,
  milestoneToPreset,
  weeklyHoursToPreset,
} from "@/lib/goalPresetConstants";
import {
  DEFAULT_PLAYER_GOAL,
  normalizeFocusArea,
  commitmentHealthBarClass,
  commitmentHealthScore,
} from "@/lib/goalAccountability";
import type { CoachCombineSnapshotRow } from "@/lib/coachPlayerCombineSnapshot";
import type { AcademyTrophyDbRow } from "@/components/AcademyTrophyCasePanel";
import { ReportEmpty, ReportRow, ReportSection, ReportTile } from "@/components/coach/CoachReportParts";

export type CoachDeepDiveProfilePanelsProps = {
  playerName: string;
  playerHandicap: number;
  totalXp: number | null;
  playerGoal: PlayerGoalRow | null;
  /** When true, weekly commitment uses app defaults until the player saves goals */
  goalsNotSaved: boolean;
  accountability: GoalAccountabilityState | null;
  combineRows: CoachCombineSnapshotRow[];
  roundsInRange: number;
  practiceSessionsInRange: number;
  dateRangeLabel: string;
  /** All rows from `user_trophies` for this player (newest first). */
  unlockedTrophies: readonly AcademyTrophyDbRow[];
};

const fmtHandicap = (h: number) => (h >= 0 ? String(Math.round(h)) : `+${Math.abs(Math.round(h))}`);

function goalNumber(v: unknown): string | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

export function CoachDeepDiveProfilePanels({
  playerName,
  playerHandicap,
  totalXp,
  playerGoal,
  goalsNotSaved,
  accountability,
  combineRows,
  roundsInRange,
  practiceSessionsInRange,
  dateRangeLabel,
  unlockedTrophies,
}: CoachDeepDiveProfilePanelsProps) {
  const firstName = playerName.split(" ")[0] || "This player";
  const milestoneLabel = SCORING_MILESTONE_LABELS[milestoneToPreset(playerGoal?.scoring_milestone ?? null)];
  const hoursPreset = weeklyHoursToPreset(
    Number(playerGoal?.weekly_hour_commitment ?? DEFAULT_PLAYER_GOAL.weekly_hour_commitment),
  );
  const focus = normalizeFocusArea(playerGoal?.focus_area ?? "Putting");

  const health = accountability
    ? commitmentHealthScore(accountability.actualHours, accountability.commitmentHours, accountability.focusMismatch)
    : null;
  const eliteHoursShortfall =
    !!accountability &&
    hoursPreset === "15+" &&
    accountability.commitmentHours > 0 &&
    accountability.actualHours < accountability.commitmentHours * 0.5;
  const weekQuiet =
    accountability != null &&
    accountability.actualHours < 0.05 &&
    (accountability.metrics?.logCountThisWeek ?? 0) === 0;

  const trophyCount = new Set(
    unlockedTrophies.map((t) => (t.achievement_id || "").trim().toLowerCase()).filter(Boolean),
  ).size;
  const withScores = combineRows.filter((r) => r.scoreDisplay);
  const withoutScores = combineRows.filter((r) => !r.scoreDisplay);

  return (
    <>
      <ReportSection title="At a glance" subtitle={dateRangeLabel}>
        <div className="grid grid-cols-2 gap-2">
          <ReportTile label="Handicap" value={fmtHandicap(playerHandicap)} />
          <ReportTile label="Rounds" value={String(roundsInRange)} sub="in range" />
          <ReportTile label="Practice entries" value={String(practiceSessionsInRange)} sub="in range" />
          <ReportTile label="XP" value={totalXp != null && totalXp > 0 ? totalXp.toLocaleString() : "0"} sub="all time" />
        </div>
        <p className="mt-3 text-xs text-stone-500">
          <span className="font-semibold text-stone-800">{trophyCount}</span> Academy{" "}
          {trophyCount === 1 ? "trophy" : "trophies"} unlocked
        </p>
      </ReportSection>

      <ReportSection
        title="Goals"
        subtitle={
          playerGoal?.updated_at
            ? `Set by ${firstName} · updated ${new Date(playerGoal.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
            : `Set by ${firstName} on their Home screen`
        }
      >
        {!playerGoal ? (
          <ReportEmpty>{firstName} hasn&apos;t saved any goals yet.</ReportEmpty>
        ) : (
          <div className="divide-y divide-stone-100">
            <ReportRow label="Scoring milestone" value={milestoneLabel} />
            <ReportRow label="Weekly practice" value={formatWeeklyHoursLabel(hoursPreset)} />
            <ReportRow label="Main focus" value={focus} />
            <ReportRow label="Best round target" value={goalNumber(playerGoal.lowest_score) ?? "–"} />
            <ReportRow label="Handicap target" value={goalNumber(playerGoal.current_handicap) ?? "–"} />
          </div>
        )}
      </ReportSection>

      <ReportSection title="This week" subtitle="Practice logged since Monday against their weekly goal">
        {accountability ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-2xl font-bold tabular-nums text-stone-900">
                {accountability.actualHours.toFixed(1)}
                <span className="text-sm font-semibold text-stone-400">h</span>
              </p>
              <p className="text-xs font-medium text-stone-500">of {accountability.commitmentHours.toFixed(1)}h goal</p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className={`h-full rounded-full ${commitmentHealthBarClass(health ?? 0, { eliteHoursShortfall })}`}
                style={{ width: `${Math.min(100, accountability.hourProgressPct)}%` }}
              />
            </div>
            {goalsNotSaved && (
              <p className="mt-2 text-[11px] text-stone-400">Using the default goal until {firstName} saves one.</p>
            )}
            {!weekQuiet && (
              <div className="mt-3 space-y-1 text-xs text-stone-600">
                <p>
                  {accountability.focusMismatch
                    ? `Most time went on ${accountability.metrics?.topCategory ?? "another area"}, but their focus is ${focus}.`
                    : `Time logged matches their focus on ${focus}.`}
                </p>
              </div>
            )}
          </>
        ) : (
          <ReportEmpty>No practice loaded for this week.</ReportEmpty>
        )}
      </ReportSection>

      <ReportSection title="Combine scores" subtitle="Personal best on each combine, all time">
        {withScores.length === 0 ? (
          <ReportEmpty>No combines finished yet.</ReportEmpty>
        ) : (
          <div className="divide-y divide-stone-100">
            {withScores.map((row) => (
              <ReportRow key={row.id} label={row.label} value={<span className="text-[#014421]">{row.scoreDisplay}</span>} />
            ))}
          </div>
        )}
        {withoutScores.length > 0 && withScores.length > 0 && (
          <details className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600">
            <summary className="cursor-pointer font-semibold text-stone-700">
              {withoutScores.length} not played yet
            </summary>
            <p className="mt-1.5 leading-relaxed text-stone-500">{withoutScores.map((r) => r.label).join(" · ")}</p>
          </details>
        )}
      </ReportSection>
    </>
  );
}
