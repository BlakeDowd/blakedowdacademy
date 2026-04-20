"use client";

/**
 * Dashboard goal accountability — `player_goals`, `practice_logs`, and optional `practice` minutes.
 * Goal setting via `GoalSetting`; Accountability Card shows Target vs Actual for the current week.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import { GoalSetting } from "@/components/GoalSetting";
import {
  commitmentHealthBarClass,
  commitmentHealthScore,
  computeGoalAccountabilityState,
  endOfWeekSundayLocal,
  handicapToMilestoneStrokesGap,
  minutesFromPracticeRows,
  normalizeFocusArea,
  startOfWeekMondayLocal,
} from "@/lib/goalAccountability";
import {
  DEFAULT_SCORING_PRESET,
  DEFAULT_WEEKLY_HOURS,
  FOCUS_AREA_PRESETS,
  SCORING_MILESTONE_LABELS,
  formatWeeklyHoursLabel,
  milestoneToPreset,
  weeklyHoursPresetToStoredHours,
  weeklyHoursToPreset,
  type ScoringMilestonePreset,
  type WeeklyHoursPreset,
} from "@/lib/goalPresetConstants";
import type { GoalAccountabilityState, GoalFocusArea, PlayerGoalRow, PracticeLogAccountabilityRow } from "@/types/playerGoals";
import {
  computeGoalSystemMessages,
  defaultHandicapFromStats,
  hasStatsRoundContext,
  type RoundStatRow,
} from "@/lib/roundStatsGoalInsight";
import {
  allocationMatchesBudget,
  buildSuggestedPracticeAllocation,
  isCollapsedSingleCategoryAllocation,
  parsePracticeAllocationFromDb,
  primaryFocusFromAllocation,
  scalePracticeAllocationToBudget,
  sumPracticeAllocation,
  type PracticeHoursMap,
} from "@/lib/practiceAllocation";
import { resolveAuthUserId } from "@/lib/resolveAuthUserId";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clock, Target } from "lucide-react";

/** Home dashboard brand — `globals.css` / HomeDashboard cards. */
const BRAND_GREEN = "#014421";

function parseBaselineLowestForSave(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n < 55 || n > 130) return null;
  return n;
}

function parseBaselineHandicapForSave(raw: string): number | null {
  const t = raw.replace(",", ".").trim();
  if (!t) return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < -12 || n > 54) return null;
  return Math.round(n * 10) / 10;
}

/** Plain JSON object for `player_goals.practice_allocation` (jsonb). */
function practiceAllocationForDb(m: PracticeHoursMap): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of FOCUS_AREA_PRESETS) {
    const v = Number(m[k]);
    out[k] = Number.isFinite(v) ? Math.round(Math.max(0, v) * 1000) / 1000 : 0;
  }
  return out;
}

function parseHandicapForWarning(raw: string): number | null {
  const t = raw.replace(",", ".").trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function CommitmentHealthBar({
  actualHours,
  goalHours,
  focusMismatch,
  isHighVolumeCommitment,
}: {
  actualHours: number;
  goalHours: number;
  focusMismatch: boolean;
  isHighVolumeCommitment: boolean;
}) {
  const score = commitmentHealthScore(actualHours, goalHours, focusMismatch);
  const pct = Math.min(100, Math.round(score * 100));
  const eliteHoursShortfall =
    isHighVolumeCommitment && goalHours > 0 && actualHours < goalHours * 0.5;
  const fillClass = commitmentHealthBarClass(score, { eliteHoursShortfall });
  return (
    <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 text-xs text-gray-500 mb-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-semibold capitalize tracking-wide text-gray-500 shrink-0">Commitment health</span>
          {isHighVolumeCommitment && (
            <span
              className="shrink-0 rounded-full border border-[#014421]/35 bg-[#014421]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#014421]"
            >
              High Performance
            </span>
          )}
        </div>
        <span className="tabular-nums font-bold text-gray-900 shrink-0">{pct}%</span>
      </div>
      <p className="text-[11px] text-gray-600 mb-2">
        Time vs weekly target (70%) and focus alignment (30%). 15h+ under half your target shows as critical.
      </p>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full rounded-full transition-all duration-500 ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AccountabilityCard({
  targets,
  state,
}: {
  targets: { milestone: ScoringMilestonePreset; focus: GoalFocusArea; hours: WeeklyHoursPreset };
  state: GoalAccountabilityState;
}) {
  const s = state;
  const barPct = Math.min(100, Math.round(s.hourProgressPct));
  const actualFocusLabel = s.metrics?.topCategory ?? "No combine sessions yet";
  const sessionCount = s.metrics?.logCountThisWeek ?? 0;
  const focusBadge = s.focusMismatch ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300/60 shrink-0">
      <AlertCircle className="w-3 h-3 shrink-0" aria-hidden />
      Mismatch
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#014421]/10 px-2 py-0.5 text-[11px] font-semibold text-[#014421] ring-1 ring-[#014421]/25 shrink-0">
      <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden />
      Aligned
    </span>
  );

  return (
    <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-5 h-5 shrink-0 text-[#014421]" aria-hidden />
        <div>
          <p className="text-xs font-semibold capitalize tracking-wider text-gray-500">Accountability</p>
          <h3 className="text-base font-bold text-gray-900">Target vs actual</h3>
          <p className="text-[11px] text-gray-500">This week</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            Hours toward {formatWeeklyHoursLabel(targets.hours)}
          </span>
          <span className="tabular-nums text-xs font-semibold text-gray-800">
            {s.actualHours.toFixed(1)}h / {s.commitmentHours}h
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#014421] to-emerald-600 transition-all duration-500"
            style={{ width: `${barPct}%` }}
          />
        </div>
        {s.metrics && s.metrics.totalMinutesFromLogs === 0 && s.metrics.supplementalPracticeMinutes > 0 && (
          <p className="text-[11px] text-gray-600 mt-1.5">
            Hours include general practice from the <code className="rounded bg-gray-100 px-1 text-gray-700">practice</code> table when
            combine logs have no <code className="rounded bg-gray-100 px-1 text-gray-700">duration_minutes</code>.
          </p>
        )}
      </div>

      <div className="divide-y divide-gray-100 border-t border-gray-100">
        <div className="flex items-center justify-between gap-3 py-2.5 first:pt-3">
          <span className="text-xs text-gray-500 shrink-0">Milestone</span>
          <span className="min-w-0 text-right text-sm font-semibold text-gray-900">
            {SCORING_MILESTONE_LABELS[targets.milestone]}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-gray-500">Focus</span>
              {focusBadge}
            </div>
            <p className="mt-0.5 text-sm text-gray-900">
              <span className="font-semibold text-[#014421]">{targets.focus}</span>
              <span className="mx-1.5 text-gray-400" aria-hidden>
                →
              </span>
              <span className="font-medium text-gray-600">{actualFocusLabel}</span>
            </p>
            {sessionCount > 0 && (
              <p className="mt-1 text-[11px] text-gray-500">
                {sessionCount === 1 ? "1 combine session this week" : `${sessionCount} combine sessions this week`}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GoalAccountabilityModule() {
  const { user } = useAuth();
  const { practiceSessions, rounds } = useStats();
  const [logs, setLogs] = useState<PracticeLogAccountabilityRow[]>([]);
  const [roundStatRows, setRoundStatRows] = useState<RoundStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [isGoalSettingOpen, setIsGoalSettingOpen] = useState(false);
  /** Set when `player_goals` SELECT fails — do not overwrite local drafts (avoids "save then reset"). */
  const [goalsLoadError, setGoalsLoadError] = useState<string | null>(null);

  const [draftScoring, setDraftScoring] = useState<ScoringMilestonePreset>(DEFAULT_SCORING_PRESET);
  const [draftHours, setDraftHours] = useState<WeeklyHoursPreset>(DEFAULT_WEEKLY_HOURS);
  const [draftAllocation, setDraftAllocation] = useState<PracticeHoursMap>(() =>
    buildSuggestedPracticeAllocation([], [], weeklyHoursPresetToStoredHours(DEFAULT_WEEKLY_HOURS), null).hours,
  );
  const prevBudgetRef = useRef(weeklyHoursPresetToStoredHours(DEFAULT_WEEKLY_HOURS));
  const [baselineLowest, setBaselineLowest] = useState("");
  const [baselineHandicap, setBaselineHandicap] = useState("");
  /** Handicap computed from round_stats / recent rounds when goal row has no saved value. */
  const [handicapStatsDefault, setHandicapStatsDefault] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setSaveMsg(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const uid = await resolveAuthUserId(supabase);
      if (!uid) {
        console.warn("[GoalAccountability] No Supabase auth user — cannot load player_goals (RLS needs JWT).");
        setLogs([]);
        setRoundStatRows([]);
        setHandicapStatsDefault(null);
        setLoading(false);
        return;
      }

      const weekStart = startOfWeekMondayLocal();
      const weekEnd = endOfWeekSundayLocal(weekStart);

      const [goalRes, logsRes, rsRes, recentRoundsRes] = await Promise.all([
        supabase
          .from("player_goals")
          .select(
            "user_id,scoring_milestone,focus_area,weekly_hour_commitment,practice_allocation,lowest_score,current_handicap,updated_at",
          )
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("practice_logs")
          .select("id,user_id,log_type,created_at,duration_minutes")
          .eq("user_id", uid)
          .gte("created_at", weekStart.toISOString())
          .lt("created_at", weekEnd.toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("round_stats")
          .select("loss_off_tee,loss_approach,loss_short_game,loss_putting,handicap_index,played_at")
          .eq("user_id", uid)
          .order("played_at", { ascending: false })
          .limit(5),
        supabase
          .from("rounds")
          .select("handicap,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      let rsRows: RoundStatRow[] = [];
      if (rsRes.error) {
        const m = (rsRes.error.message || "").toLowerCase();
        if (!m.includes("does not exist") && !m.includes("schema cache")) {
          console.warn("[GoalAccountability] round_stats:", rsRes.error.message);
        }
        setRoundStatRows([]);
      } else {
        const raw = rsRes.data;
        rsRows = (Array.isArray(raw) ? raw : []) as RoundStatRow[];
        setRoundStatRows(rsRows);
      }

      const recentRoundRows = (recentRoundsRes.error ? [] : recentRoundsRes.data || []) as {
        handicap?: number | null;
        created_at?: string | null;
      }[];
      if (recentRoundsRes.error) {
        const m = (recentRoundsRes.error.message || "").toLowerCase();
        if (!m.includes("does not exist") && !m.includes("schema cache")) {
          console.warn("[GoalAccountability] rounds (handicap sync):", recentRoundsRes.error.message);
        }
      }

      const syncedHandicap = defaultHandicapFromStats(rsRows, recentRoundRows);
      setHandicapStatsDefault(syncedHandicap);

      let logRows: PracticeLogAccountabilityRow[] = [];
      if (logsRes.error) {
        const msg = (logsRes.error.message || "").toLowerCase();
        if (msg.includes("duration_minutes") || msg.includes("column")) {
          const fallback = await supabase
            .from("practice_logs")
            .select("id,user_id,log_type,created_at")
            .eq("user_id", uid)
            .gte("created_at", weekStart.toISOString())
            .lt("created_at", weekEnd.toISOString())
            .order("created_at", { ascending: false });
          if (!fallback.error && fallback.data) {
            logRows = fallback.data.map((r) => ({
              ...r,
              duration_minutes: null,
            })) as PracticeLogAccountabilityRow[];
          } else {
            console.warn("[GoalAccountability] practice_logs:", logsRes.error.message);
          }
        } else {
          console.warn("[GoalAccountability] practice_logs:", logsRes.error.message);
        }
      } else {
        logRows = (logsRes.data || []) as PracticeLogAccountabilityRow[];
      }

      let g = goalRes.data as PlayerGoalRow | null;
      const goalErr = goalRes.error;

      if (goalErr && !g) {
        const em = (goalErr.message || "").toLowerCase();
        if (em.includes("multiple") || String((goalErr as { details?: string }).details || "").toLowerCase().includes("multiple")) {
          const pick = await supabase
            .from("player_goals")
            .select(
              "user_id,scoring_milestone,focus_area,weekly_hour_commitment,practice_allocation,lowest_score,current_handicap,updated_at",
            )
            .eq("user_id", uid)
            .order("updated_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          if (!pick.error && pick.data) g = pick.data as PlayerGoalRow;
        }
      }

      const goalFetchFailed = Boolean(goalErr && !g);
      const emLow = (goalErr?.message || "").toLowerCase();
      const schemaOrCacheIssue =
        goalFetchFailed &&
        ((goalErr as { code?: string }).code === "PGRST204" ||
          emLow.includes("schema cache") ||
          emLow.includes("could not find") ||
          emLow.includes("does not exist"));

      if (goalErr && goalErr.code !== "PGRST116") {
        console.warn("[GoalAccountability] player_goals:", goalErr.message, (goalErr as { code?: string }).code ?? "");
      }

      const hasRoundContext = hasStatsRoundContext(rsRows, recentRoundRows);
      if (g) {
        setGoalsLoadError(null);
        setDraftScoring(milestoneToPreset(g.scoring_milestone));
        const hoursPreset = weeklyHoursToPreset(Number(g.weekly_hour_commitment));
        const budget = weeklyHoursPresetToStoredHours(hoursPreset);
        const legacyFocus = normalizeFocusArea(g.focus_area);
        setDraftHours(hoursPreset);
        let alloc = parsePracticeAllocationFromDb(g.practice_allocation, budget, legacyFocus);
        const rawAlloc = g.practice_allocation;
        const hadSavedAllocation =
          rawAlloc != null &&
          typeof rawAlloc === "object" &&
          !Array.isArray(rawAlloc) &&
          Object.keys(rawAlloc as Record<string, unknown>).length > 0;
        // Only expand "all hours in one bucket" when there was no stored JSON split (legacy rows).
        // Otherwise a deliberate single-category plan would look like it did not save after reload.
        if (isCollapsedSingleCategoryAllocation(alloc, budget) && !hadSavedAllocation) {
          const savedHcpRaw = g.current_handicap;
          const hasSavedHcp =
            savedHcpRaw != null && savedHcpRaw !== undefined && String(savedHcpRaw).trim() !== "";
          const gapN = hasSavedHcp ? parseFloat(String(savedHcpRaw)) : syncedHandicap;
          const gapVal =
            gapN != null && Number.isFinite(gapN)
              ? handicapToMilestoneStrokesGap(gapN, milestoneToPreset(g.scoring_milestone))
              : null;
          alloc = buildSuggestedPracticeAllocation(rsRows, [], budget, gapVal).hours;
        }
        setDraftAllocation(alloc);
        prevBudgetRef.current = budget;
        setBaselineLowest(g.lowest_score != null && g.lowest_score !== undefined ? String(g.lowest_score) : "");
        const savedHcp = g.current_handicap;
        const hasSavedHcp = savedHcp != null && savedHcp !== undefined && String(savedHcp).trim() !== "";
        if (hasSavedHcp) {
          setBaselineHandicap(String(savedHcp));
        } else if (syncedHandicap != null && hasRoundContext) {
          setBaselineHandicap(String(syncedHandicap));
        } else {
          setBaselineHandicap("");
        }
      } else if (!goalFetchFailed) {
        setGoalsLoadError(null);
        setDraftScoring(DEFAULT_SCORING_PRESET);
        setDraftHours(DEFAULT_WEEKLY_HOURS);
        const budget = weeklyHoursPresetToStoredHours(DEFAULT_WEEKLY_HOURS);
        setDraftAllocation(buildSuggestedPracticeAllocation(rsRows, [], budget, null).hours);
        prevBudgetRef.current = budget;
        setBaselineLowest("");
        if (syncedHandicap != null && hasRoundContext) {
          setBaselineHandicap(String(syncedHandicap));
        } else {
          setBaselineHandicap("");
        }
      } else {
        const hint = schemaOrCacheIssue
          ? "The live `player_goals` table is missing columns the app expects. In Supabase: SQL editor → run migration `20260430180000_player_goals_ensure_scoring_milestone_core.sql` (or `supabase db push`), then Settings → API restart or wait for schema reload."
          : "Could not load saved goals from the database. Your edits stay on screen until this is fixed.";
        setGoalsLoadError(
          goalErr?.message ? `${goalErr.message}${goalErr.message.endsWith(".") ? "" : "."} ${hint}` : hint,
        );
      }

      setLogs(logRows);
    } catch (e) {
      console.warn("[GoalAccountability] load failed", e);
      setLogs([]);
      setRoundStatRows([]);
      setHandicapStatsDefault(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const onPractice = () => void loadData();
    if (typeof window !== "undefined") {
      window.addEventListener("practiceSessionsUpdated", onPractice);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("practiceSessionsUpdated", onPractice);
      }
    };
  }, [loadData]);

  useEffect(() => {
    const onRounds = () => void loadData();
    if (typeof window !== "undefined") {
      window.addEventListener("roundsUpdated", onRounds);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("roundsUpdated", onRounds);
      }
    };
  }, [loadData]);

  /** Re-load goals once Supabase session is ready (avoids empty reads before JWT is attached). */
  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        if (cancelled) return;
        const supabase = createClient();
        const {
          data: { subscription: sub },
        } = supabase.auth.onAuthStateChange((event, session) => {
          if (
            (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
            session?.user
          ) {
            void loadData();
          }
        });
        subscription = sub;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [loadData]);

  const supplementalPracticeMinutes = useMemo(() => {
    if (!user?.id) return 0;
    const weekStart = startOfWeekMondayLocal();
    const weekEnd = endOfWeekSundayLocal(weekStart);
    return minutesFromPracticeRows(practiceSessions, user.id, weekStart, weekEnd);
  }, [practiceSessions, user?.id]);

  const budgetHoursNum = useMemo(() => weeklyHoursPresetToStoredHours(draftHours), [draftHours]);

  const draftPrimaryFocus = useMemo(() => primaryFocusFromAllocation(draftAllocation), [draftAllocation]);

  const handleWeeklyHoursChange = useCallback(
    (next: WeeklyHoursPreset) => {
      const oldB = prevBudgetRef.current;
      const newB = weeklyHoursPresetToStoredHours(next);
      prevBudgetRef.current = newB;
      setDraftHours(next);
      setDraftAllocation((alloc) => {
        if (allocationMatchesBudget(alloc, oldB) && isCollapsedSingleCategoryAllocation(alloc, oldB)) {
          const gapN = parseHandicapForWarning(baselineHandicap);
          const gapVal = gapN != null ? handicapToMilestoneStrokesGap(gapN, draftScoring) : null;
          return buildSuggestedPracticeAllocation(roundStatRows, rounds.slice(0, 8), newB, gapVal).hours;
        }
        if (allocationMatchesBudget(alloc, oldB)) {
          return scalePracticeAllocationToBudget(alloc, newB);
        }
        return alloc;
      });
    },
    [baselineHandicap, draftScoring, roundStatRows, rounds],
  );

  const suggestedPack = useMemo(() => {
    const gapN = parseHandicapForWarning(baselineHandicap);
    const gapVal = gapN != null ? handicapToMilestoneStrokesGap(gapN, draftScoring) : null;
    return buildSuggestedPracticeAllocation(roundStatRows, rounds.slice(0, 8), budgetHoursNum, gapVal);
  }, [roundStatRows, rounds, budgetHoursNum, baselineHandicap, draftScoring]);

  const handicapMilestoneGapDisplay = useMemo(() => {
    const n = parseHandicapForWarning(baselineHandicap);
    return n != null ? handicapToMilestoneStrokesGap(n, draftScoring) : null;
  }, [baselineHandicap, draftScoring]);

  /** Always reflect the live preset picks so the Accountability card updates before Save. */
  const effectiveGoal: PlayerGoalRow | null = useMemo(() => {
    if (!user?.id) return null;
    return {
      user_id: user.id,
      scoring_milestone: draftScoring,
      focus_area: draftPrimaryFocus,
      weekly_hour_commitment: weeklyHoursPresetToStoredHours(draftHours),
      practice_allocation: draftAllocation,
    };
  }, [user?.id, draftScoring, draftPrimaryFocus, draftHours, draftAllocation]);

  const displayState = useMemo(() => {
    if (!user?.id || !effectiveGoal) return null;
    return computeGoalAccountabilityState(effectiveGoal, logs, supplementalPracticeMinutes, user.id);
  }, [user?.id, effectiveGoal, logs, supplementalPracticeMinutes]);

  const volumeEffortWarning = useMemo(() => {
    if (draftHours !== 2) return false;
    const h = parseHandicapForWarning(baselineHandicap);
    if (h === null) return false;
    return handicapToMilestoneStrokesGap(h, draftScoring) > 10;
  }, [draftHours, baselineHandicap, draftScoring]);

  const { dataInsightMessage, suggestedHoursLine, coachAmbitiousBadge, accountabilityLeakAlert } = useMemo(
    () =>
      computeGoalSystemMessages({
        focus: draftPrimaryFocus,
        weeklyHours: draftHours,
        baselineHandicapRaw: baselineHandicap,
        scoringMilestone: draftScoring,
        roundStatRows,
        fallbackRounds: rounds.slice(0, 5),
      }),
    [draftPrimaryFocus, draftHours, baselineHandicap, draftScoring, roundStatRows, rounds],
  );

  const handicapHasStatsSync = handicapStatsDefault !== null;
  const handicapMatchesSyncedDefault = useMemo(() => {
    if (handicapStatsDefault === null) return false;
    const p = parseHandicapForWarning(baselineHandicap);
    if (p === null) return false;
    return Math.abs(p - handicapStatsDefault) < 0.051;
  }, [baselineHandicap, handicapStatsDefault]);

  const saveGoals = async () => {
    if (!user?.id) return;
    const commitment = weeklyHoursPresetToStoredHours(draftHours);
    let allocationToSave: PracticeHoursMap = draftAllocation;
    if (!allocationMatchesBudget(allocationToSave, commitment)) {
      const drift = Math.abs(sumPracticeAllocation(allocationToSave) - commitment);
      if (drift < 0.2) {
        allocationToSave = scalePracticeAllocationToBudget(allocationToSave, commitment);
        setDraftAllocation(allocationToSave);
      } else {
        setSaveMsg("Balance your practice hours to match your weekly target before saving.");
        return;
      }
    }
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const uid = await resolveAuthUserId(supabase);
      if (!uid) {
        setSaveMsg("Still signing in — wait a moment, refresh the page, then try Save again.");
        return;
      }
      if (uid !== user.id) {
        console.warn("[GoalAccountability] saveGoals: Supabase uid !== AuthContext user.id", { uid, ctx: user.id });
      }
      const lowestSave = parseBaselineLowestForSave(baselineLowest);
      const handicapSave = parseBaselineHandicapForSave(baselineHandicap);

      const { error } = await supabase.from("player_goals").upsert(
        {
          user_id: uid,
          scoring_milestone: draftScoring,
          focus_area: primaryFocusFromAllocation(allocationToSave),
          weekly_hour_commitment: weeklyHoursPresetToStoredHours(draftHours),
          practice_allocation: practiceAllocationForDb(allocationToSave),
          lowest_score: lowestSave,
          current_handicap: handicapSave,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      if (error) {
        const code = "code" in error ? String((error as { code?: string }).code) : "";
        const details = "details" in error ? String((error as { details?: string }).details || "") : "";
        const hint = "hint" in error ? String((error as { hint?: string }).hint || "") : "";
        const extra = [code, details, hint].filter(Boolean).join(" · ");
        const msgLower = error.message.toLowerCase();
        setSaveMsg(
          error.message.includes("relation")
            ? "Run the latest Supabase migration (player_goals)."
            : msgLower.includes("duplicate key") || msgLower.includes("unique")
              ? `${error.message} Run the Supabase migration \`20260430140000_player_goals_dedupe_unique_user_id.sql\` (dedupe rows + UNIQUE on user_id).${extra ? ` ${extra}` : ""}`
              : extra
                ? `${error.message} (${extra})`
                : error.message,
        );
      } else {
        const { data: row, error: readErr } = await supabase
          .from("player_goals")
          .select("scoring_milestone,weekly_hour_commitment,focus_area,updated_at")
          .eq("user_id", uid)
          .maybeSingle();

        if (readErr) {
          setSaveMsg(`Database write returned OK, but reading your goals back failed: ${readErr.message}`);
        } else if (!row) {
          setSaveMsg(
            "Database did not return a goals row for your account after save. Check RLS policies on player_goals (SELECT) and that GRANT SELECT exists for role authenticated.",
          );
        } else {
          const ms = String(row.scoring_milestone ?? "").trim();
          if (ms !== String(draftScoring).trim()) {
            setSaveMsg(`Saved, but the server stored milestone "${row.scoring_milestone ?? ""}" instead of "${draftScoring}".`);
          } else {
            setSaveMsg("Saved.");
          }
        }
        await loadData();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("playerGoalsUpdated"));
        }
      }
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  };

  if (!user?.id) {
    return null;
  }

  if (loading) {
    return (
      <div className="px-4 mb-8 w-full">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Loading goals…</p>
        </div>
      </div>
    );
  }

  const s = displayState;
  if (!s) return null;

  const targets = {
    milestone: draftScoring,
    focus: draftPrimaryFocus,
    hours: draftHours,
  };

  return (
    <div className="px-4 mb-10 w-full">
      <div
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
        style={{ boxShadow: "0 8px 24px rgba(0, 0, 0, 0.06)" }}
      >
        <div className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#014421]">Goal setting</h2>
              <p className="text-xs text-gray-600 mt-1.5">
                Set your milestone and weekly budget, split hours across practice categories, then review accountability. Save
                only works when your allocation matches your weekly hours.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsGoalSettingOpen((prev) => !prev)}
              className="flex items-center justify-center rounded-lg border border-stone-200 bg-white/90 px-2.5 py-2 text-[11px] font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50/90"
              aria-expanded={isGoalSettingOpen}
              aria-controls="goal-setting-content"
              aria-label={isGoalSettingOpen ? "Collapse goal setting" : "Expand goal setting"}
              title={isGoalSettingOpen ? "Collapse goal setting" : "Expand goal setting"}
            >
              {isGoalSettingOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-stone-500" aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-stone-500" aria-hidden />
              )}
            </button>
          </div>
          {goalsLoadError && (
            <div
              className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-snug text-amber-950"
              role="alert"
            >
              <span className="font-semibold">Could not load saved goals. </span>
              {goalsLoadError}
            </div>
          )}
        </div>

        {isGoalSettingOpen && (
          <div id="goal-setting-content">
            <GoalSetting
              scoringMilestone={draftScoring}
              weeklyHours={draftHours}
              budgetHours={budgetHoursNum}
              allocation={draftAllocation}
              onAllocationChange={setDraftAllocation}
              lowestScore={baselineLowest}
              currentHandicap={baselineHandicap}
              onScoringMilestone={setDraftScoring}
              onWeeklyHours={handleWeeklyHoursChange}
              onLowestScoreChange={setBaselineLowest}
              onCurrentHandicapChange={setBaselineHandicap}
              dataInsightMessage={dataInsightMessage}
              suggestedHoursLine={suggestedHoursLine}
              coachAmbitiousBadge={coachAmbitiousBadge}
              accountabilityLeakAlert={accountabilityLeakAlert}
              handicapHasStatsSync={handicapHasStatsSync}
              handicapMatchesSyncedDefault={handicapMatchesSyncedDefault}
              suggestedAllocation={suggestedPack.hours}
              suggestedSource={suggestedPack.source}
              handicapMilestoneGap={handicapMilestoneGapDisplay}
            />

            <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-gray-100">
              <button
                type="button"
                disabled={saveBusy || !allocationMatchesBudget(draftAllocation, budgetHoursNum)}
                onClick={() => void saveGoals()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                {saveBusy ? "Saving…" : "Save goals"}
              </button>
              {saveMsg && <span className="text-xs text-gray-500">{saveMsg}</span>}
            </div>
          </div>
        )}

        {isGoalSettingOpen && (
          <>
            <AccountabilityCard targets={targets} state={s} />

            <CommitmentHealthBar
              actualHours={s.actualHours}
              goalHours={s.commitmentHours}
              focusMismatch={s.focusMismatch}
              isHighVolumeCommitment={draftHours === "15+"}
            />
            {volumeEffortWarning && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-snug text-amber-900">
                Your goal requires a higher volume of effort based on your current handicap.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
