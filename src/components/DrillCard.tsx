"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CheckCircle2, Check, PlayCircle, File, RefreshCw, ChevronUp, ChevronDown, Timer, Trophy } from "lucide-react";
import {
  formatDrillScore,
  parseDrillGoalTarget,
  stableDrillKey,
  type DrillGoalTarget,
} from "@/lib/drillPersonalBests";
import { SHOW_PDFS } from "@/lib/drillResources";
import { DESCRIPTION_BY_DRILL_ID, DESCRIPTION_BY_ID } from "@/data/official_drills";
import { useKeepInViewAfterOwnTap } from "@/hooks/useKeepInView";
import { useDrillProgress } from "@/hooks/useDrillProgress";
import DrillProgressTracker from "@/components/DrillProgressTracker";
import DrillScoringPicker from "@/components/DrillScoringPicker";
import { DrillGuide, DrillHero, DrillSteps } from "@/components/drills/DrillIntro";
import { DrillTimerCard, formatClock, useDrillTimer } from "@/components/drills/DrillTimer";
import { isPerfectScore, resolveDrillScoring } from "@/lib/drillScoring";
import { drillScoringOverride, useDrillScoringOverrides } from "@/lib/drillScoringOverrides";
import {
  effectiveGoalRepsString,
  getTieredGoalItems,
  tierLineDisplayBody,
  type TierLabel,
} from "@/lib/parseTieredGoal";

export type FacilityType = 'Driving' | 'Irons' | 'Wedges' | 'Chipping' | 'Bunkers' | 'Putting' | 'Mental/Strategy' | 'On-Course';

interface DrillLevel {
  id: string;
  name: string;
  completed?: boolean;
}

function tierBadgeLabel(tier: TierLabel): string {
  switch (tier) {
    case "beginner":
      return "Beginner";
    case "intermediate":
      return "Intermediate";
    case "advanced":
      return "Advanced";
    default:
      return "Goal";
  }
}

/** Tiered catalog goals become level milestones; text that isn't a number is shown to the player as-is. */
function parseCoachGoals(goalReps: string): {
  milestones: { label: string; score: number }[];
  coachGoalText: string;
} {
  const tiered = goalReps ? getTieredGoalItems(goalReps) : null;
  if (tiered) {
    const parsed = tiered
      .map((item) => ({ label: tierBadgeLabel(item.tier), target: parseDrillGoalTarget(tierLineDisplayBody(item.line)) }))
      .filter((o): o is { label: string; target: DrillGoalTarget } => o.target != null);
    if (parsed.length > 0) {
      return { milestones: parsed.map((o) => ({ label: o.label, score: o.target.score })), coachGoalText: "" };
    }
    return { milestones: [], coachGoalText: goalReps };
  }
  return { milestones: [], coachGoalText: parseDrillGoalTarget(goalReps) ? "" : goalReps };
}

interface DrillCardProps {
  drill: {
    id: string;
    drill_id?: string;
    title: string;
    category: string;
    estimatedMinutes: number;
    completed?: boolean;
    xpEarned?: number;
    isRound?: boolean;
    description?: string;
    pdf_url?: string;
    youtube_url?: string;
    video_url?: string;
    levels?: DrillLevel[];
    facility?: FacilityType;
    goal?: string;
    /** Preferred tiered Goal/Reps text from DB when set */
    goal_reps?: string;
    /** Catalog XP reward (`drills.xp_value`) — distinct from xpEarned */
    xp_value?: number;
    isCombine?: boolean;
    combineHref?: string;
  };
  dayIndex: number;
  drillIndex: number;
  actualDrillIndex: number;
  isSwapping?: boolean;
  justSwapped?: boolean;
  facilityInfo?: Record<FacilityType, { label: string; icon: any }>;
  onComplete: (dayIndex: number, drillIndex: number) => void;
  onSwap: (dayIndex: number, drillIndex: number) => void;
  onLevelToggle: (dayIndex: number, drillIndex: number, levelId: string, completed: boolean) => void;
  onYoutubeOpen: (url: string) => void;
  onClear?: (dayIndex: number, drillIndex: number) => void;
  onExpandToggle?: (dayIndex: number, drillIndex: number) => void;
  defaultExpanded?: boolean; // FORCE VISIBILITY: Default to expanded
  compact?: boolean; // Smaller layout for Weekly view
  /** When set, card loads/saves a personal best for this drill in Supabase (visible collapsed + expanded). */
  userId?: string | null;
  /** Read-only PB text for combine tasks sourced from saved combine results. */
  combineBestText?: string | null;
  /** Catalog fields that decide how the drill is scored (Score Type override, focus). */
  catalogScoring?: { scoreType?: string | null; focus?: string | null } | null;
}

export default function DrillCard({
  drill,
  dayIndex,
  drillIndex,
  actualDrillIndex,
  isSwapping = false,
  justSwapped = false,
  facilityInfo,
  onComplete,
  onSwap,
  onLevelToggle,
  onYoutubeOpen,
  onClear,
  onExpandToggle,
  defaultExpanded = false, // FORCE VISIBILITY: Default to false
  compact = false,
  userId = null,
  combineBestText = null,
  catalogScoring = null,
}: DrillCardProps) {
  // FIX THE TOGGLE: Default to collapsed
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const keepInViewProps = useKeepInViewAfterOwnTap<HTMLDivElement>(isExpanded);
  const isCompleted = drill.completed || false;
  const drillKey = useMemo(() => stableDrillKey(drill), [drill]);
  const goalRepsForUi = useMemo(
    () => effectiveGoalRepsString(drill.goal, drill.goal_reps),
    [drill.goal, drill.goal_reps]
  );
  const catalogXp =
    typeof drill.xp_value === "number" && Number.isFinite(drill.xp_value) ? drill.xp_value : undefined;
  const { milestones, coachGoalText } = useMemo(() => parseCoachGoals(goalRepsForUi), [goalRepsForUi]);
  const coachScoreType = drillScoringOverride(useDrillScoringOverrides(), drillKey);
  const scoreTypeOverride = coachScoreType ?? catalogScoring?.scoreType ?? null;
  const focus = catalogScoring?.focus ?? null;
  const scoring = useMemo(
    () => resolveDrillScoring({ override: scoreTypeOverride, goalText: goalRepsForUi, focus, title: drill.title }),
    [scoreTypeOverride, goalRepsForUi, focus, drill.title],
  );
  const progress = useDrillProgress(userId, drillKey, scoring, !drill.isCombine, milestones);
  const timer = useDrillTimer(drill.estimatedMinutes, scoring.type === "time" ? "stopwatch" : "countdown");
  const timerActive = timer.running || (timer.started && !timer.finished);
  const { setDraft } = progress;
  const applyTimeAsScore = useCallback(
    (seconds: number) => {
      setDraft(scoring.unit === "min" ? String(Math.round((seconds / 60) * 100) / 100) : String(Math.round(seconds * 10) / 10));
    },
    [setDraft, scoring.unit],
  );
  const combineBest = drill.isCombine ? (combineBestText ?? "").trim() : "";
  const collapsedHint =
    scoring.type === "completion" && progress.logs.length > 0
      ? `Done ${progress.logs.length}×`
      : progress.summary
        ? `${isCompleted || isPerfectScore(progress.summary.best, scoring) ? "Best" : "Beat"} ${formatDrillScore(progress.summary.best, progress.unit)}`
        : combineBest || progress.settings.legacyText
          ? `Best ${combineBest || progress.settings.legacyText}`
          : "";
  const prevExpandedRef = useRef<boolean | null>(null);

  const shouldShowContent = isExpanded || justSwapped;

  const { clearFeedback } = progress;
  useEffect(() => {
    const prev = prevExpandedRef.current;
    prevExpandedRef.current = isExpanded;
    if (isExpanded && prev === false) clearFeedback();
  }, [isExpanded, clearFeedback]);

  const handleComplete = useCallback(async () => {
    if (actualDrillIndex === -1) return;
    const logged = await progress.logDraft();
    if (logged) onComplete(dayIndex, actualDrillIndex);
  }, [actualDrillIndex, dayIndex, onComplete, progress]);

  // Sync with parent's expand state - but allow user to toggle
  useEffect(() => {
    // Only sync if defaultExpanded changes, but don't override user's manual toggle
    if (defaultExpanded === true) {
      setIsExpanded(true);
    } else if (defaultExpanded === false) {
      setIsExpanded(false);
    }
  }, [defaultExpanded]);

  // FIX THE TOGGLE: Correctly toggle the isExpanded state
  const handleExpandToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    // Notify parent component of the toggle
    if (onExpandToggle && actualDrillIndex !== -1) {
      onExpandToggle(dayIndex, actualDrillIndex);
    }
  };

  const description =
    (drill.description && String(drill.description).trim()) ||
    DESCRIPTION_BY_ID[drill.id] ||
    DESCRIPTION_BY_DRILL_ID[drill.drill_id ?? drill.id] ||
    "";
  const heroChips = [
    `${drill.estimatedMinutes} min`,
    ...(catalogXp !== undefined ? [`${catalogXp} XP`] : []),
    ...(drill.xpEarned != null && drill.xpEarned > 0 ? [`+${drill.xpEarned} XP earned`] : []),
    ...(drill.facility && facilityInfo ? [facilityInfo[drill.facility].label] : []),
    ...(userId && collapsedHint ? [collapsedHint] : []),
    ...(isCompleted ? ["Completed"] : []),
  ];
  const titleNode = drill.combineHref ? (
    <a
      href={drill.combineHref}
      onClick={(e) => e.stopPropagation()}
      className="underline decoration-white/40 underline-offset-4 hover:decoration-white"
    >
      {drill.title}
    </a>
  ) : (
    drill.title
  );

  return (
    <div className="relative w-full scroll-mt-4" {...keepInViewProps}>
      {!shouldShowContent ? (
        <div
          onClick={handleExpandToggle}
          className={`w-full cursor-pointer rounded-xl px-3 py-2.5 transition-colors ${
            isCompleted ? "bg-green-50 hover:bg-green-100/70" : "bg-gray-50 hover:bg-gray-100"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                isCompleted ? "bg-[#014421] text-white" : "border-2 border-gray-300"
              }`}
              aria-hidden
            >
              {isCompleted ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {drill.isCombine && (
                  <span className="inline-flex items-center rounded-full bg-[#014421] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                    <Trophy className="mr-1 h-3 w-3 text-white" />
                    Combine
                  </span>
                )}
                <h4
                  className={`min-w-0 flex-1 text-sm font-medium ${
                    isCompleted ? "text-gray-400 line-through" : "text-gray-800"
                  }`}
                >
                  {drill.combineHref ? (
                    <a
                      href={drill.combineHref}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[#014421] underline underline-offset-2 hover:text-[#0b5e34]"
                    >
                      {drill.title}
                    </a>
                  ) : (
                    drill.title
                  )}
                </h4>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-gray-500">
                <span>{drill.estimatedMinutes} min</span>
                {catalogXp !== undefined && <span className="font-semibold text-amber-700">· {catalogXp} XP</span>}
                {drill.xpEarned != null && drill.xpEarned > 0 ? (
                  <span className="font-semibold text-[#FFA500]">+{drill.xpEarned} XP earned</span>
                ) : null}
                {userId && collapsedHint && (
                  <span className="inline-flex min-w-0 max-w-[12rem] items-center gap-1 font-medium text-[#014421]">
                    <Trophy className="h-3 w-3 shrink-0 text-[#FFA500]" aria-hidden />
                    <span className="truncate">{collapsedHint}</span>
                  </span>
                )}
                {(timerActive || timer.finished) && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                      timer.finished ? "bg-orange-100 text-orange-800" : "bg-[#014421] text-white"
                    }`}
                  >
                    <Timer className="h-3 w-3" aria-hidden />
                    {timer.finished ? "Time!" : formatClock(timer.displaySec)}
                    {!timer.running && !timer.finished && " paused"}
                  </span>
                )}
              </div>
            </div>

            <button
              className="-mr-1 flex-shrink-0 rounded-full p-1 transition-colors hover:bg-gray-200/60"
              onClick={(e) => {
                e.stopPropagation();
                handleExpandToggle();
              }}
              aria-label={isCompleted ? "Completed task" : "Start task"}
            >
              <ChevronDown className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`w-full rounded-3xl bg-white shadow-sm ring-1 ${
            justSwapped ? "ring-2 ring-green-400" : "ring-gray-100"
          } ${compact ? "space-y-2.5 p-2.5" : "space-y-3 p-3"}`}
        >
          <DrillHero
            title={titleNode}
            kicker={drill.isCombine ? "Combine" : `${drill.category} drill`}
            chips={heroChips}
            category={drill.category}
            compact={compact}
            action={
              <button
                type="button"
                onClick={handleExpandToggle}
                className="rounded-full bg-white/15 p-1.5 text-white transition-colors hover:bg-white/25"
                aria-label="Collapse drill"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            }
          />

          {description ? (
            <DrillSteps description={description} compact={compact} />
          ) : (
            <p className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-500">No description available.</p>
          )}

          {!drill.isCombine && scoring.timer && (
            <DrillTimerCard
              timer={timer}
              onUseTime={scoring.type === "time" && userId ? applyTimeAsScore : undefined}
            />
          )}

          {(drill.youtube_url || drill.video_url) || (SHOW_PDFS && drill.pdf_url) ? (
            <div className="flex flex-wrap gap-2">
              {(drill.youtube_url || drill.video_url) && (
                <button
                  type="button"
                  onClick={() => onYoutubeOpen(drill.youtube_url || drill.video_url || "")}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                >
                  <PlayCircle className="h-5 w-5 text-red-600" />
                  Watch video
                </button>
              )}
              {SHOW_PDFS && drill.pdf_url ? (
                <a
                  href={drill.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                >
                  <File className="h-5 w-5" />
                  View PDF
                </a>
              ) : null}
            </div>
          ) : (
            <p className="inline-flex items-center gap-1.5 px-1 text-xs text-gray-400">
              <PlayCircle className="h-3.5 w-3.5" aria-hidden />
              Video coming soon
            </p>
          )}

          {(() => {
            const levels = drill.levels ?? [];
            if (!(levels.length > 1 || (levels.length === 1 && !goalRepsForUi))) return null;
            return (
              <div className="rounded-2xl border border-gray-100 p-2">
                <h5 className="px-2 pb-1 pt-1 text-sm font-semibold text-gray-900">Levels</h5>
                {levels.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => {
                      if (actualDrillIndex !== -1) {
                        onLevelToggle(dayIndex, actualDrillIndex, level.id, !level.completed);
                      }
                    }}
                    className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                        level.completed ? "border-green-600 bg-green-500" : "border-gray-300 bg-white hover:border-green-500"
                      }`}
                    >
                      {level.completed && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <span
                      className={`min-w-0 flex-1 text-sm capitalize leading-relaxed ${
                        level.completed ? "text-gray-500 line-through" : "text-gray-700"
                      }`}
                    >
                      {level.name}
                    </span>
                  </button>
                ))}
              </div>
            );
          })()}

          {!drill.isCombine && (
            <DrillScoringPicker drillKey={drillKey} scoring={scoring} hasOverride={coachScoreType != null} />
          )}
          {userId && !drill.isCombine ? (
            <DrillProgressTracker progress={progress} coachGoalText={coachGoalText} />
          ) : goalRepsForUi ? (
            <DrillGuide title="Goal" defaultOpen>
              {goalRepsForUi}
            </DrillGuide>
          ) : null}

          <button
            type="button"
            onClick={() => void handleComplete()}
            disabled={isCompleted || progress.saving}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold text-white shadow-md transition-transform active:scale-[0.99] disabled:cursor-not-allowed ${
              isCompleted ? "bg-green-500" : "bg-[#014421] hover:bg-[#013320] disabled:opacity-50"
            }`}
          >
            {isCompleted ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                Completed
              </>
            ) : (
              <>
                <Check className="h-5 w-5" />
                Complete drill
              </>
            )}
          </button>

          {(!drill.isRound || onClear) && (
            <div className="flex items-center justify-between gap-3 px-1">
              {!drill.isRound ? (
                <button
                  type="button"
                  onClick={() => {
                    if (actualDrillIndex !== -1) onSwap(dayIndex, actualDrillIndex);
                  }}
                  disabled={isSwapping}
                  className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-[#014421] transition-colors hover:bg-gray-100 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isSwapping ? "animate-spin" : ""}`} />
                  {isSwapping ? "Swapping..." : "Swap drill"}
                </button>
              ) : (
                <span />
              )}
              {onClear && (
                <button
                  type="button"
                  onClick={() => {
                    if (actualDrillIndex !== -1) onClear(dayIndex, actualDrillIndex);
                  }}
                  className={`text-red-600 underline underline-offset-2 hover:text-red-700 ${compact ? "text-xs" : "text-sm"}`}
                >
                  Clear drill
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isSwapping && (
        <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-white/80">
          <RefreshCw className="h-6 w-6 animate-spin text-[#014421]" />
        </div>
      )}
    </div>
  );
}

