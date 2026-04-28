"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Award, CheckCircle2, Check, PlayCircle, File, RefreshCw, ChevronUp, ChevronDown, Trophy } from "lucide-react";
import {
  fetchDrillPersonalBest,
  stableDrillKey,
  upsertDrillPersonalBest,
  userFacingDrillPersonalBestsError,
} from "@/lib/drillPersonalBests";
import { DESCRIPTION_BY_DRILL_ID, DESCRIPTION_BY_ID } from "@/data/official_drills";
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

function tierBadgeClasses(tier: TierLabel): string {
  switch (tier) {
    case "beginner":
      return "bg-gray-100 text-gray-800 ring-gray-300";
    case "intermediate":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200/80";
    case "advanced":
      return "bg-amber-100 text-amber-950 ring-amber-400/90";
    default:
      return "bg-slate-100 text-slate-800 ring-slate-200/80";
  }
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
}: DrillCardProps) {
  // FIX THE TOGGLE: Default to collapsed
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const isCompleted = drill.completed || false;
  const drillKey = useMemo(() => stableDrillKey(drill), [drill]);
  const goalRepsForUi = useMemo(
    () => effectiveGoalRepsString(drill.goal, drill.goal_reps),
    [drill.goal, drill.goal_reps]
  );
  const catalogXp =
    typeof drill.xp_value === "number" && Number.isFinite(drill.xp_value) ? drill.xp_value : undefined;
  /** Last value persisted in Supabase (drives “to beat” on collapsed card). */
  const [pbSavedAchievement, setPbSavedAchievement] = useState("");
  /** New entry only — not a copy of the saved record (cleared when you open this section). */
  const [pbDraft, setPbDraft] = useState("");
  const [pbLoading, setPbLoading] = useState(false);
  const [pbSaving, setPbSaving] = useState(false);
  const [pbMsg, setPbMsg] = useState<string | null>(null);
  const prevExpandedRef = useRef<boolean | null>(null);

  const shouldShowContent = isExpanded || justSwapped;

  /** Always warn when empty so you can see missing DB/plan data in the console. */
  useEffect(() => {
    const hasGoal = goalRepsForUi !== "";
    const hasLevels = Array.isArray(drill.levels) && drill.levels.length > 0;
    if (!hasGoal && !hasLevels) {
      console.warn("[DrillCard] Goal/Reps empty — nothing from DB/plan row:", {
        id: drill.id,
        drill_id: drill.drill_id ?? null,
        title: drill.title,
        goal: drill.goal ?? null,
        goal_reps: drill.goal_reps ?? null,
        levels: drill.levels ?? null,
      });
    }
  }, [drill.id, drill.drill_id, drill.goal, drill.goal_reps, drill.levels, drill.title, goalRepsForUi]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !shouldShowContent) return;
    console.log("[DrillCard] Goal/Reps raw payload (expanded Daily Plan):", {
      id: drill.id,
      drill_id: drill.drill_id ?? null,
      title: drill.title,
      goal: drill.goal ?? null,
      goal_reps: drill.goal_reps ?? null,
      goalRepsForUi: goalRepsForUi || null,
      levels: drill.levels ?? null,
    });
  }, [shouldShowContent, drill.id, drill.drill_id, drill.title, drill.goal, drill.goal_reps, drill.levels, goalRepsForUi]);

  // Load whenever the signed-in user opens this drill identity (not only when expanded) so
  // returning to the drill still shows what they saved to beat.
  useEffect(() => {
    if (drill.isCombine) {
      setPbLoading(false);
      setPbMsg(null);
      setPbDraft("");
      setPbSavedAchievement((combineBestText ?? "").trim());
      return;
    }
    if (!userId) {
      setPbSavedAchievement("");
      setPbDraft("");
      return;
    }
    let cancelled = false;
    setPbDraft("");
    void (async () => {
      setPbLoading(true);
      setPbMsg(null);
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const row = await fetchDrillPersonalBest(supabase, userId, drillKey);
        const text = row?.achievement ?? "";
        if (!cancelled) {
          setPbSavedAchievement(text);
          // Intentionally do not copy server text into pbDraft — draft is for logging a new result.
        }
      } finally {
        if (!cancelled) setPbLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, drillKey, drill.isCombine, combineBestText]);

  // Fresh input each time they expand the card (record to beat stays in pbSavedAchievement / “To beat”).
  useEffect(() => {
    const prev = prevExpandedRef.current;
    prevExpandedRef.current = isExpanded;
    if (isExpanded && prev === false) {
      setPbDraft("");
      setPbMsg(null);
    }
  }, [isExpanded]);

  const savePersonalBest = useCallback(async () => {
    if (!userId) return;
    const trimmed = pbDraft.trim().slice(0, 500);
    if (!trimmed) return;
    setPbSaving(true);
    setPbMsg(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await upsertDrillPersonalBest(supabase, userId, drillKey, trimmed);
      if (error) setPbMsg(userFacingDrillPersonalBestsError(error.message));
      else {
        setPbSavedAchievement(trimmed);
        setPbDraft("");
        setPbMsg("Saved.");
      }
    } catch (e) {
      setPbMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setPbSaving(false);
    }
  }, [userId, drillKey, pbDraft]);

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
    <div className="relative w-full">
      <div
        onClick={handleExpandToggle}
        className={`w-full rounded-2xl border-2 shadow-xl transition-all cursor-pointer ${
          compact ? "p-2.5" : "p-3"
        } ${
          isCompleted
            ? 'bg-green-50 border-green-300'
            : 'bg-white border-gray-200 hover:border-[#014421]/40'
        } ${justSwapped ? 'ring-2 ring-green-400' : ''} ${isExpanded ? 'border-[#014421]' : ''}`}
      >
        <div className={`flex items-start justify-between ${compact ? "gap-2" : "gap-3"}`}>
          <div className="flex-1 min-w-0">
            <div className={`flex items-center gap-2 flex-wrap ${compact ? "mb-0" : "mb-1"}`}>
              {drill.isCombine && (
                <span className="inline-flex items-center rounded-full bg-[#014421] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                  <Trophy className="mr-1 h-3 w-3 text-white" />
                  Combine
                </span>
              )}
              <h4 className={`${compact ? "text-sm" : "text-base"} font-bold flex-1 ${
                isCompleted ? 'text-green-700 line-through' : 'text-slate-800'
              }`}>
                {isCompleted && (
                  <span className="inline-flex items-center mr-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </span>
                )}
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

            {userId && pbSavedAchievement.trim() && !isExpanded && (
              <div
                className={`mt-1.5 inline-flex max-w-[72%] items-center gap-1.5 rounded-md border border-amber-200/70 border-l-4 border-l-amber-500 bg-amber-50/90 px-2 py-1 text-amber-950 ring-1 ring-amber-200/80 shadow-inner ${
                  compact ? "text-[10px]" : "text-[11px]"
                }`}
              >
                <Award className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
                <span className="shrink-0 font-semibold text-amber-900">To beat:</span>
                <span className="min-w-0 flex-1 truncate text-amber-950">{pbSavedAchievement}</span>
              </div>
            )}
            
            <div className={`mt-1.5 flex flex-wrap items-center gap-2.5 ${compact ? "text-xs" : "text-sm"} text-gray-600`}>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-700 ring-1 ring-gray-200">
                <span>{drill.estimatedMinutes} min</span>
              </span>
              {catalogXp !== undefined && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 font-semibold tabular-nums text-amber-900 ring-1 ring-amber-200/80">
                  {catalogXp} XP
                </span>
              )}
              {drill.xpEarned && drill.xpEarned > 0 && (
                <span className="text-[#FFA500] font-semibold">+{drill.xpEarned} XP earned</span>
              )}
            </div>
            {!compact && !isExpanded && (() => {
              const g = goalRepsForUi;
              const tiered = g ? getTieredGoalItems(g) : null;
              const lv = drill.levels && drill.levels.length > 0
                ? drill.levels.map((l) => l.name).join(" · ")
                : "";
              if (tiered && tiered.length > 0) {
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-2" aria-label="Goal tiers">
                    {tiered.slice(0, 6).map((item, i) => (
                      <span
                        key={i}
                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide ring-1 ${tierBadgeClasses(item.tier)}`}
                      >
                        {tierBadgeLabel(item.tier)}
                      </span>
                    ))}
                    {tiered.length > 6 ? (
                      <span className="text-[10px] text-slate-500">+{tiered.length - 6}</span>
                    ) : null}
                  </div>
                );
              }
              const line = g || lv;
              if (!line) return null;
              return (
                <p
                  className="mt-2 line-clamp-2 text-left text-xs leading-normal text-slate-600 capitalize [text-wrap:balance]"
                  title={g || lv}
                >
                  <span className="font-semibold text-slate-700 normal-case">Goal: </span>
                  <span className="whitespace-pre-wrap">{line}</span>
                </p>
              );
            })()}
          </div>
          
          {/* Expand/Collapse Button */}
          <button
            className="flex-shrink-0 rounded-full p-2 hover:bg-gray-100 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleExpandToggle();
            }}
            aria-label={isCompleted ? "Completed task" : "Start task"}
          >
            {isCompleted ? (
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            ) : isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-600" />
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
            
            {/* CORE UPGRADE: Watch Video Button (YouTube icon) */}
            <div className="flex gap-2 flex-wrap">
              {(drill.youtube_url || drill.video_url) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onYoutubeOpen(drill.youtube_url || drill.video_url || '');
                  }}
                  className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-colors flex items-center gap-2 flex-1 w-full"
                >
                  <PlayCircle className="w-5 h-5" />
                  Watch Video
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2.5 rounded-lg bg-gray-300 text-gray-500 text-sm font-semibold cursor-not-allowed flex items-center gap-2 flex-1 w-full opacity-50"
                >
                  <PlayCircle className="w-5 h-5" />
                  No Video Link
                </button>
              )}
              
              {/* CORE UPGRADE: View PDF Button (File icon) */}
              {drill.pdf_url ? (
                <a
                  href={drill.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 transition-colors flex items-center gap-2 flex-1 w-full"
                >
                  <File className="w-5 h-5" />
                  View PDF
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2.5 rounded-lg bg-gray-300 text-gray-500 text-sm font-semibold cursor-not-allowed flex items-center gap-2 flex-1 w-full opacity-50"
                >
                  <File className="w-5 h-5" />
                  No PDF Link
                </button>
              )}
            </div>
            
            {/* Goal/Reps: tier badges when Beginner/Intermediate/Advanced + split; else plain text or checklist */}
            {(() => {
              const goalText = goalRepsForUi;
              const tieredItems = goalText ? getTieredGoalItems(goalText) : null;
              const levels = drill.levels ?? [];
              const showTierBadges = !!(tieredItems && tieredItems.length > 0);
              const showChecklist =
                !showTierBadges &&
                (levels.length > 1 || (levels.length === 1 && !goalText));
              const showEmpty = !goalText && !showTierBadges && !showChecklist;

              return (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-sm font-semibold tracking-tight text-gray-900">
                      Goal / Reps
                    </h5>
                    {catalogXp !== undefined && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold tabular-nums text-amber-950 ring-1 ring-amber-300/80">
                        {catalogXp} XP
                      </span>
                    )}
                  </div>
                  {showTierBadges && tieredItems ? (
                    <div className="flex flex-col gap-3">
                      {tieredItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex w-full min-w-0 flex-col gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3.5 py-3 sm:flex-row sm:items-start sm:gap-3"
                        >
                          <span
                            className={`inline-flex w-fit shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold leading-none tracking-wide ring-1 ${tierBadgeClasses(
                              item.tier
                            )} normal-case`}
                          >
                            {tierBadgeLabel(item.tier)}
                          </span>
                          <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap [text-wrap:pretty] sm:text-right">
                            {tierLineDisplayBody(item.line)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : goalText ? (
                    <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap [text-wrap:pretty]">
                      {goalText}
                    </p>
                  ) : null}
                  {showChecklist ? (
                    <div className="flex flex-col gap-2">
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
                  ) : showEmpty ? (
                    <p className="text-sm text-gray-500 italic">
                      No goals or reps set for this drill
                    </p>
                  ) : null}
                </div>
              );
            })()}

            {userId && !drill.isCombine && (
              <div
                className={`rounded-lg border border-amber-200/90 bg-amber-50/60 ${compact ? "p-2 space-y-1.5" : "p-3 space-y-2"}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`flex items-center gap-2 font-semibold text-amber-950 ${compact ? "text-xs" : "text-sm"}`}>
                  <Award className={compact ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"} />
                  Personal best
                </div>
                <p className={`text-gray-600 ${compact ? "text-[11px] leading-snug" : "text-xs"}`}>
                  Type a new result below when you beat your record; it replaces your bar to beat.
                </p>
                {pbSavedAchievement.trim() && (
                  <p
                    className={`rounded-md bg-white/80 px-2 py-1.5 text-amber-950 ring-1 ring-amber-200/60 ${compact ? "text-[11px]" : "text-xs"}`}
                  >
                    <span className="font-semibold">Record to beat: </span>
                    <span className="whitespace-pre-wrap break-words">{pbSavedAchievement}</span>
                  </p>
                )}
                {pbLoading ? (
                  <p className="text-xs text-gray-500">Loading…</p>
                ) : (
                  <textarea
                    value={pbDraft}
                    onChange={(e) => {
                      setPbDraft(e.target.value);
                      setPbMsg(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    maxLength={500}
                    rows={compact ? 2 : 3}
                    placeholder={
                      pbSavedAchievement.trim()
                        ? `New best to save — current bar: ${
                            pbSavedAchievement.length > 50
                              ? `${pbSavedAchievement.slice(0, 50)}…`
                              : pbSavedAchievement
                          }`
                        : "e.g. 12 in a row, 85% makes, 45 ft longest make"
                    }
                    className={`w-full resize-y rounded-md border border-amber-200/80 bg-white text-gray-900 placeholder:text-gray-400 focus:border-[#014421] focus:outline-none focus:ring-1 focus:ring-[#014421]/30 ${
                      compact ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"
                    }`}
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pbSaving || pbLoading || !userId || !pbDraft.trim()}
                    onClick={(e) => {
                      e.stopPropagation();
                      void savePersonalBest();
                    }}
                    className={`rounded-md bg-[#014421] font-semibold text-white transition-colors hover:bg-[#014421]/90 disabled:cursor-not-allowed disabled:opacity-50 ${
                      compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
                    }`}
                  >
                    {pbSaving ? "Saving…" : "Save"}
                  </button>
                  {pbMsg && (
                    <span
                      className={`text-xs ${
                        pbMsg === "Saved."
                          ? "text-green-700"
                          : "max-w-full text-left leading-snug text-red-600"
                      }`}
                    >
                      {pbMsg}
                    </span>
                  )}
                  {!pbLoading && (
                    <span className="ml-auto text-xs text-gray-400 tabular-nums">{pbDraft.length}/500</span>
                  )}
                </div>
              </div>
            )}
            
            {/* BUTTON PLACEMENT: Complete Drill and Swap Drill buttons stay here */}
            {/* Action Buttons - Side by Side */}
            <div className="flex gap-3 w-full">
              {/* Complete Drill Button - Primary */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (actualDrillIndex !== -1) {
                    onComplete(dayIndex, actualDrillIndex);
                  }
                }}
                disabled={isCompleted}
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
