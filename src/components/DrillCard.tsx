"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CheckCircle2, Check, PlayCircle, File, RefreshCw, ChevronUp, ChevronDown, Trophy } from "lucide-react";
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
import { resolveDrillScoring } from "@/lib/drillScoring";
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

function parseCoachGoals(goalReps: string): {
  coachGoal: DrillGoalTarget | null;
  goalOptions: { label: string; score: number }[];
  coachGoalText: string;
} {
  const tiered = goalReps ? getTieredGoalItems(goalReps) : null;
  if (tiered) {
    const parsed = tiered
      .map((item) => ({ label: tierBadgeLabel(item.tier), target: parseDrillGoalTarget(tierLineDisplayBody(item.line)) }))
      .filter((o): o is { label: string; target: DrillGoalTarget } => o.target != null);
    if (parsed.length > 0) {
      return {
        coachGoal: parsed[0].target,
        goalOptions: parsed.map((o) => ({ label: o.label, score: o.target.score })),
        coachGoalText: "",
      };
    }
    return { coachGoal: null, goalOptions: [], coachGoalText: goalReps };
  }
  const target = parseDrillGoalTarget(goalReps);
  return { coachGoal: target, goalOptions: [], coachGoalText: target ? "" : goalReps };
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
  const { coachGoal, goalOptions, coachGoalText } = useMemo(() => parseCoachGoals(goalRepsForUi), [goalRepsForUi]);
  const scoreTypeOverride = catalogScoring?.scoreType ?? null;
  const focus = catalogScoring?.focus ?? null;
  const scoring = useMemo(
    () => resolveDrillScoring({ override: scoreTypeOverride, goalText: goalRepsForUi, focus, title: drill.title }),
    [scoreTypeOverride, goalRepsForUi, focus, drill.title],
  );
  const progress = useDrillProgress(userId, drillKey, scoring, !drill.isCombine, coachGoal, goalOptions);
  const combineBest = drill.isCombine ? (combineBestText ?? "").trim() : "";
  const collapsedHint =
    scoring.type === "completion" && progress.logs.length > 0
      ? `Done ${progress.logs.length}×`
      : !isCompleted && progress.target.next != null
        ? `Today ${formatDrillScore(progress.target.next, progress.unit)}`
        : progress.summary
          ? `Best ${formatDrillScore(progress.summary.best, progress.unit)}`
          : combineBest || progress.settings.legacyText
            ? `Best ${combineBest || progress.settings.legacyText}`
            : progress.goal != null
              ? `Goal ${formatDrillScore(progress.goal, progress.unit)}`
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

  return (
    <div className="relative w-full scroll-mt-4" {...keepInViewProps}>
      <div
        onClick={handleExpandToggle}
        className={`w-full rounded-xl transition-colors cursor-pointer px-3 py-2.5 ${
          isExpanded
            ? 'bg-white ring-1 ring-[#014421]/30 shadow-sm'
            : isCompleted
              ? 'bg-green-50 hover:bg-green-100/70'
              : 'bg-gray-50 hover:bg-gray-100'
        } ${justSwapped ? 'ring-2 ring-green-400' : ''}`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
              isCompleted ? 'bg-[#014421] text-white' : 'border-2 border-gray-300'
            }`}
            aria-hidden
          >
            {isCompleted ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {drill.isCombine && (
                <span className="inline-flex items-center rounded-full bg-[#014421] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                  <Trophy className="mr-1 h-3 w-3 text-white" />
                  Combine
                </span>
              )}
              <h4 className={`text-sm font-medium flex-1 min-w-0 ${
                isCompleted ? 'text-gray-400 line-through' : 'text-gray-800'
              }`}>
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

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500 tabular-nums">
              <span>{drill.estimatedMinutes} min</span>
              {/* Always next to duration so XP stays visible when expanded (Goal/Reps is below the fold on desktop) */}
              {catalogXp !== undefined && (
                <span className="font-semibold text-amber-700">· {catalogXp} XP</span>
              )}
              {drill.xpEarned != null && drill.xpEarned > 0 ? (
                <span className="text-[#FFA500] font-semibold">+{drill.xpEarned} XP earned</span>
              ) : null}
              {userId && collapsedHint && !isExpanded && (
                <span className="inline-flex min-w-0 max-w-[12rem] items-center gap-1 font-medium text-[#014421]">
                  <Trophy className="h-3 w-3 shrink-0 text-[#FFA500]" aria-hidden />
                  <span className="truncate">{collapsedHint}</span>
                </span>
              )}
            </div>
          </div>
          
          {/* Expand/Collapse Button */}
          <button
            className="-mr-1 flex-shrink-0 rounded-full p-1 hover:bg-gray-200/60 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleExpandToggle();
            }}
            aria-label={isExpanded ? "Collapse drill" : isCompleted ? "Completed task" : "Start task"}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </button>
        </div>
        
        {/* CORE UPGRADES: Show content only when expanded */}
        {shouldShowContent && (
          <div className={`border-t border-gray-200 ${compact ? "mt-2 pt-2 space-y-2" : "mt-2.5 pt-2.5 space-y-2.5"}`}>
            
            {/* Target/Category Details Moved Inside Expanded */}
            {drill.facility && facilityInfo && (
              <div className="mb-2">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                  {facilityInfo[drill.facility].label}
                </span>
              </div>
            )}

            <div className={`${compact ? "text-xs" : "text-sm"} text-gray-700 leading-relaxed whitespace-pre-wrap`}>
              <span className="font-semibold text-gray-900 block mb-1">Instructions:</span>
              {(drill.description && String(drill.description).trim()) || DESCRIPTION_BY_ID[drill.id] || DESCRIPTION_BY_DRILL_ID[(drill as any).drill_id ?? drill.id] || "No description available."}
            </div>

            <div className="flex gap-2 flex-wrap">
              {(drill.youtube_url || drill.video_url) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onYoutubeOpen(drill.youtube_url || drill.video_url || '');
                  }}
                  className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 flex-1 w-full"
                >
                  <PlayCircle className="w-5 h-5" />
                  Watch Video
                </button>
              ) : (
                <p className="inline-flex items-center gap-1.5 text-xs text-gray-400">
                  <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                  Video coming soon
                </p>
              )}

              {SHOW_PDFS && drill.pdf_url ? (
                <a
                  href={drill.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 transition-colors flex items-center justify-center gap-2 flex-1 w-full"
                >
                  <File className="w-5 h-5" />
                  View PDF
                </a>
              ) : null}
            </div>

            {(() => {
              const levels = drill.levels ?? [];
              if (!(levels.length > 1 || (levels.length === 1 && !goalRepsForUi))) return null;
              return (
                <div className="flex flex-col gap-1">
                  <h5 className="text-sm font-semibold tracking-tight text-gray-900">Levels</h5>
                  {levels.map((level) => (
                    <button
                      key={level.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (actualDrillIndex !== -1) {
                          onLevelToggle(dayIndex, actualDrillIndex, level.id, !level.completed);
                        }
                      }}
                      className="flex items-start gap-2.5 w-full text-left hover:bg-gray-50 px-2.5 py-2 rounded-lg transition-colors"
                    >
                      <div
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                          level.completed
                            ? "border-green-600 bg-green-500"
                            : "border-gray-300 bg-white hover:border-green-500"
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

            {userId && !drill.isCombine ? (
              <DrillProgressTracker progress={progress} coachGoalText={coachGoalText} goalOptions={goalOptions} />
            ) : goalRepsForUi ? (
              <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                <span className="font-semibold text-gray-900">Goal: </span>
                {goalRepsForUi}
              </p>
            ) : null}
            
            {/* BUTTON PLACEMENT: Complete Drill and Swap Drill buttons stay here */}
            {/* Action Buttons - Side by Side */}
            <div className="flex gap-3 w-full">
              {/* Complete Drill Button - Primary */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void handleComplete();
                }}
                disabled={isCompleted || progress.saving}
                className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  isCompleted
                    ? 'bg-green-500 text-white cursor-not-allowed'
                    : 'bg-[#014421] text-white hover:bg-[#014421]/90'
                }`}
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Completed
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Complete Drill
                  </>
                )}
              </button>
              
              {/* Swap Drill Button - Secondary */}
              {!drill.isRound && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (actualDrillIndex !== -1) {
                      onSwap(dayIndex, actualDrillIndex);
                    }
                  }}
                  disabled={isSwapping}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSwapping ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Swapping...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Swap Drill
                    </>
                  )}
                </button>
              )}
            </div>

            {onClear && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (actualDrillIndex !== -1) {
                      onClear(dayIndex, actualDrillIndex);
                    }
                  }}
                  className={`text-red-600 hover:text-red-700 underline underline-offset-2 ${
                    compact ? "text-xs" : "text-sm"
                  }`}
                >
                  Clear Drill
                </button>
              </div>
            )}
          </div>
        )}
        
        {isSwapping && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
            <RefreshCw className="w-6 h-6 animate-spin text-[#014421]" />
          </div>
        )}
      </div>
    </div>
  );
}
