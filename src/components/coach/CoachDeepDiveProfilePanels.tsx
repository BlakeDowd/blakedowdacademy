"use client";

import { Crosshair, Target } from "lucide-react";
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
import { CoachDeepDiveProfileHero } from "@/components/coach/CoachDeepDiveProfileHero";

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
  const milestonePreset = milestoneToPreset(playerGoal?.scoring_milestone ?? null);
  const milestoneLabel = SCORING_MILESTONE_LABELS[milestonePreset];
  const hoursPreset = weeklyHoursToPreset(
    Number(playerGoal?.weekly_hour_commitment ?? DEFAULT_PLAYER_GOAL.weekly_hour_commitment),
  );
  const weeklyHoursLabel = formatWeeklyHoursLabel(hoursPreset);
  const focus = normalizeFocusArea(playerGoal?.focus_area ?? "Putting");
  const isHighVolumeCommitment = hoursPreset === "15+";

  const health = accountability
    ? commitmentHealthScore(
        accountability.actualHours,
        accountability.commitmentHours,
        accountability.focusMismatch,
      )
    : null;

  const eliteHoursShortfall =
    !!accountability &&
    isHighVolumeCommitment &&
    accountability.commitmentHours > 0 &&
    accountability.actualHours < accountability.commitmentHours * 0.5;

  const withScores = combineRows.filter((r) => r.scoreDisplay);
  const withoutScores = combineRows.filter((r) => !r.scoreDisplay);

  const noSavedGoals = !playerGoal;
  const noCombineScores = withScores.length === 0;
  const noRangeActivity = roundsInRange === 0 && practiceSessionsInRange === 0;
  const noXp = totalXp == null || totalXp <= 0;
  /** Hero has little to show besides name + handicap */
  const heroCompact = noRangeActivity && noXp;
  /** This week card has no logged combine time */
  const weekQuiet =
    accountability != null &&
    accountability.actualHours < 0.05 &&
    (accountability.metrics?.logCountThisWeek ?? 0) === 0;

  return (
    <div
      className={`print:space-y-5 ${noSavedGoals && noCombineScores && noRangeActivity ? "space-y-3" : "space-y-6"}`}
    >
      <CoachDeepDiveProfileHero
        playerName={playerName}
        playerHandicap={playerHandicap}
        totalXp={totalXp}
        roundsInRange={roundsInRange}
        practiceSessionsInRange={practiceSessionsInRange}
        dateRangeLabel={dateRangeLabel}
        unlockedTrophies={unlockedTrophies}
        heroCompact={heroCompact}
      />

      {/* Goals */}
      <section
        className={`rounded-3xl border border-stone-200 bg-white shadow-md ${noSavedGoals ? "p-4 sm:p-4" : "p-6 sm:p-8"}`}
      >
        <div className={`flex items-center gap-3 ${noSavedGoals ? "mb-3" : "mb-6"}`}>
          <div
            className={
              noSavedGoals
                ? "flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-[#014421]"
                : "flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#014421]"
            }
          >
            <Target className={noSavedGoals ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
          </div>
          <div>
            <h3 className={`font-bold text-stone-900 ${noSavedGoals ? "text-base" : "text-lg"}`}>Goal setting</h3>
            <p className={noSavedGoals ? "text-[10px] text-stone-500" : "text-xs text-stone-500"}>
              {noSavedGoals
                ? "Targets saved in the app for this player"
                : "Synced from their Home · Goal setting card"}
            </p>
          </div>
        </div>

        <div className={`grid lg:grid-cols-2 ${noSavedGoals ? "gap-3" : "gap-6"}`}>
          <div className={`rounded-2xl border border-stone-100 bg-stone-50/50 ${noSavedGoals ? "space-y-2 p-3" : "space-y-4 p-5"}`}>
            {!playerGoal ? (
              <p
                className={
                  noSavedGoals
                    ? "rounded-lg border border-dashed border-stone-200 bg-white/80 px-3 py-2.5 text-center text-[11px] leading-snug text-stone-600"
                    : "rounded-xl border border-dashed border-stone-200 bg-white/80 px-4 py-6 text-center text-sm text-stone-600"
                }
              >
                This player has not saved academy goals yet. They can set milestones, weekly hours, and focus from
                their dashboard.
              </p>
            ) : (
              <>
                <div>
                  <p className="text-[10px] font-bold capitalize tracking-wider text-stone-500">Scoring milestone</p>
                  <p className="mt-1 text-xl font-semibold text-stone-900">{milestoneLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold capitalize tracking-wider text-stone-500">Weekly commitment</p>
                  <p className="mt-1 text-xl font-semibold text-stone-900">{weeklyHoursLabel}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold capitalize tracking-wider text-stone-500">Primary focus</p>
                  <p className="mt-1 text-xl font-semibold text-stone-900">{focus}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
                    <p className="text-[10px] font-bold capitalize text-stone-500">Score goal</p>
                    <p className="mt-1 text-lg font-bold text-stone-900">
                      {playerGoal.lowest_score != null && Number.isFinite(Number(playerGoal.lowest_score))
                        ? String(playerGoal.lowest_score)
                        : "—"}
                    </p>
                    <p className="text-[10px] text-stone-400">Best round target</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
                    <p className="text-[10px] font-bold capitalize text-stone-500">Handicap goal</p>
                    <p className="mt-1 text-lg font-bold text-stone-900">
                      {playerGoal.current_handicap != null &&
                      String(playerGoal.current_handicap).trim() !== "" &&
                      Number.isFinite(Number(playerGoal.current_handicap))
                        ? String(playerGoal.current_handicap)
                        : "—"}
                    </p>
                    <p className="text-[10px] text-stone-400">Index target</p>
                  </div>
                </div>
                {playerGoal.updated_at ? (
                  <p className="text-[10px] text-stone-400">
                    Last updated{" "}
                    {new Date(playerGoal.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div
            className={`flex flex-col justify-between rounded-2xl border border-emerald-100/80 bg-gradient-to-b from-emerald-50/40 to-white shadow-inner ${weekQuiet || goalsNotSaved ? "p-3" : "p-5"}`}
          >
            <div>
              <p className="text-[10px] font-bold capitalize tracking-wider text-emerald-800">This week</p>
              <p className={weekQuiet ? "mt-0.5 text-[11px] text-stone-600" : "mt-1 text-sm text-stone-600"}>
                Practice time vs weekly goal (includes combine protocol logs when timed).
              </p>
            </div>
            {goalsNotSaved ? (
              <p className="mt-2 rounded-md bg-amber-50/90 px-2 py-1.5 text-[10px] font-medium leading-snug text-amber-900 ring-1 ring-amber-100">
                Weekly hour target uses app defaults until this player saves goals in their dashboard.
              </p>
            ) : null}
            {accountability ? (
              <>
                <div className={weekQuiet ? "mt-2" : "mt-5"}>
                  <div
                    className={`mb-2 flex justify-between font-semibold text-stone-700 ${weekQuiet ? "text-[10px]" : "text-xs"}`}
                  >
                    <span>{accountability.actualHours.toFixed(1)}h logged</span>
                    <span>{accountability.commitmentHours.toFixed(1)}h goal</span>
                  </div>
                  <div className={weekQuiet ? "h-2 w-full overflow-hidden rounded-full bg-stone-200" : "h-3 w-full overflow-hidden rounded-full bg-stone-200"}>
                    <div
                        className={`h-full rounded-full transition-all ${commitmentHealthBarClass(health ?? 0, {
                          eliteHoursShortfall: eliteHoursShortfall,
                        })}`}
                      style={{ width: `${Math.min(100, accountability.hourProgressPct)}%` }}
                    />
                  </div>
                </div>
                {weekQuiet ? (
                  <p className="mt-2 text-[10px] text-stone-500">No timed combine logs yet this week.</p>
                ) : (
                  <div className="mt-4 space-y-2 text-xs text-stone-600">
                    <p>
                      <span className="font-semibold text-stone-800">Focus alignment: </span>
                      {accountability.focusMismatch
                        ? `Most combine time this week was in "${accountability.metrics?.topCategory ?? "another"}" while their stated priority is ${focus}.`
                        : "Logged combine work matches their stated priority."}
                    </p>
                    {accountability.metrics?.topCategory ? (
                      <p>
                        <span className="font-semibold text-stone-800">Top combine category (sessions): </span>
                        {accountability.metrics.topCategory}
                      </p>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-stone-500">Load practice logs to show weekly accountability.</p>
            )}
          </div>
        </div>
      </section>

      {/* Combines */}
      <section
        className={`rounded-3xl border border-stone-200 bg-white shadow-md ${noCombineScores ? "p-4 sm:p-4" : "p-6 sm:p-8"}`}
      >
        <div className={`flex items-center gap-3 ${noCombineScores ? "mb-3" : "mb-6"}`}>
          <div
            className={
              noCombineScores
                ? "flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-800"
                : "flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-800"
            }
          >
            <Crosshair className={noCombineScores ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
          </div>
          <div>
            <h3 className={`font-bold text-stone-900 ${noCombineScores ? "text-base" : "text-lg"}`}>Combine scores</h3>
            <p className={noCombineScores ? "text-[10px] text-stone-500" : "text-xs text-stone-500"}>
              Best logged result per combine (all time)
            </p>
          </div>
        </div>

        {withScores.length === 0 ? (
          <p
            className={
              noCombineScores
                ? "rounded-lg border border-dashed border-stone-200 bg-stone-50/80 px-3 py-2.5 text-center text-[11px] leading-snug text-stone-600"
                : "rounded-2xl border border-dashed border-stone-200 bg-stone-50/80 px-4 py-6 text-center text-sm text-stone-600"
            }
          >
            No combine sessions on file yet. Completes appear here after the player finishes a listed Academy combine.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {withScores.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-stone-100 bg-gradient-to-r from-white to-stone-50/80 px-4 py-3 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-900">{row.label}</p>
                  <p className="text-[10px] font-medium capitalize tracking-wide text-stone-400">Personal best</p>
                </div>
                <span className="shrink-0 rounded-lg bg-[#014421]/10 px-3 py-1.5 text-sm font-bold text-[#014421]">
                  {row.scoreDisplay}
                </span>
              </div>
            ))}
          </div>
        )}

        {withoutScores.length > 0 && withScores.length > 0 ? (
          <details className="mt-4 rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-2 text-sm text-stone-600 sm:px-4 sm:py-3">
            <summary className="cursor-pointer text-sm font-medium text-stone-700">Combines not yet logged</summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-stone-500">
              {withoutScores.map((r) => (
                <li key={r.id}>{r.label}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
