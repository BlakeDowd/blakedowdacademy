"use client";

/**
 * Dashboard goal accountability — `player_goals`, `practice_logs`, and optional `practice` minutes.
 * Goal presets via `GoalSetting`; Accountability Card shows Target vs Actual for the current week.
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
  defaultAllocationSingleFocus,
  parsePracticeAllocationFromDb,
  primaryFocusFromAllocation,
  scalePracticeAllocationToBudget,
  type PracticeHoursMap,
} from "@/lib/practiceAllocation";
import { AlertCircle, CheckCircle2, Clock, Target } from "lucide-react";

const PANEL_NAVY = "#0f172a";
const EMERALD = "#10b981";

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
    <div
      className="mt-5 rounded-xl border border-slate-800/80 p-4"
      style={{ backgroundColor: "#0b1220" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 text-xs text-slate-400 mb-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="font-semibold uppercase tracking-wide text-slate-500 shrink-0">Commitment health</span>
          {isHighVolumeCommitment && (
            <span
              className="shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300"
              style={{ borderColor: EMERALD, backgroundColor: `${EMERALD}18` }}
            >
              High Performance
            </span>
          )}
        </div>
        <span className="tabular-nums font-bold text-slate-200 shrink-0">{pct}%</span>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">
        Time vs weekly target (70%) and focus alignment (30%). 15h+ under half your target shows as critical.
      </p>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800/90">
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
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/40 shrink-0">
      <AlertCircle className="w-3 h-3 shrink-0" aria-hidden />
      Mismatch
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30 shrink-0">
      <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden />
      Aligned
    </span>
  );

  return (
    <div
      className="mt-6 rounded-2xl border border-slate-800/90 p-4 ring-1 ring-slate-800/60 sm:p-5"
      style={{ backgroundColor: "#0b1220" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Accountability</p>
          <h3 className="text-base font-bold text-slate-50">Target vs actual</h3>
          <p className="text-[11px] text-slate-500">This week</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
            Hours toward {formatWeeklyHoursLabel(targets.hours)}
          </span>
          <span className="tabular-nums text-xs font-semibold text-slate-200">
            {s.actualHours.toFixed(1)}h / {s.commitmentHours}h
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
            style={{ width: `${barPct}%` }}
          />
        </div>
        {s.metrics && s.metrics.totalMinutesFromLogs === 0 && s.metrics.supplementalPracticeMinutes > 0 && (
          <p className="text-[11px] text-slate-500 mt-1.5">
            Hours include general practice from the <code className="text-slate-400">practice</code> table when
            combine logs have no <code className="text-slate-400">duration_minutes</code>.
          </p>
        )}
      </div>

      <div className="divide-y divide-slate-800/80 border-t border-slate-800/80">
        <div className="flex items-center justify-between gap-3 py-2.5 first:pt-3">
          <span className="text-xs text-slate-500 shrink-0">Milestone</span>
          <span className="min-w-0 text-right text-sm font-semibold text-slate-100">
            {SCORING_MILESTONE_LABELS[targets.milestone]}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-slate-500">Focus</span>
              {focusBadge}
            </div>
            <p className="mt-0.5 text-sm text-slate-100">
              <span className="font-semibold text-emerald-100/95">{targets.focus}</span>
              <span className="mx-1.5 text-slate-600" aria-hidden>
                →
              </span>
              <span className="font-medium text-slate-300">{actualFocusLabel}</span>
            </p>
            {sessionCount > 0 && (
              <p className="mt-1 text-[11px] text-slate-500">
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

  const [draftScoring, setDraftScoring] = useState<ScoringMilestonePreset>(DEFAULT_SCORING_PRESET);
  const [draftHours, setDraftHours] = useState<WeeklyHoursPreset>(DEFAULT_WEEKLY_HOURS);
  const [draftAllocation, setDraftAllocation] = useState<PracticeHoursMap>(() =>
    defaultAllocationSingleFocus("Putting", weeklyHoursPresetToStoredHours(DEFAULT_WEEKLY_HOURS)),
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
      const weekStart = startOfWeekMondayLocal();
      const weekEnd = endOfWeekSundayLocal(weekStart);

      const [goalRes, logsRes, rsRes, recentRoundsRes] = await Promise.all([
        supabase
          .from("player_goals")
          .select(
            "user_id,scoring_milestone,focus_area,weekly_hour_commitment,practice_allocation,lowest_score,current_handicap,updated_at",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("practice_logs")
          .select("id,user_id,log_type,created_at,duration_minutes")
          .eq("user_id", user.id)
          .gte("created_at", weekStart.toISOString())
          .lt("created_at", weekEnd.toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("round_stats")
          .select("loss_off_tee,loss_approach,loss_short_game,loss_putting,handicap_index,played_at")
          .eq("user_id", user.id)
          .order("played_at", { ascending: false })
          .limit(5),
        supabase
          .from("rounds")
          .select("handicap,created_at")
          .eq("user_id", user.id)
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
            .eq("user_id", user.id)
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

      if (goalRes.error && goalRes.error.code !== "PGRST116") {
        console.warn("[GoalAccountability] player_goals:", goalRes.error.message);
      }
      const g = goalRes.data as PlayerGoalRow | null;
      const hasRoundContext = hasStatsRoundContext(rsRows, recentRoundRows);
      if (g) {
        setDraftScoring(milestoneToPreset(g.scoring_milestone));
        const hoursPreset = weeklyHoursToPreset(Number(g.weekly_hour_commitment));
        const budget = weeklyHoursPresetToStoredHours(hoursPreset);
        const legacyFocus = normalizeFocusArea(g.focus_area);
        setDraftHours(hoursPreset);
        setDraftAllocation(parsePracticeAllocationFromDb(g.practice_allocation, budget, legacyFocus));
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
      } else {
        setDraftScoring(DEFAULT_SCORING_PRESET);
        setDraftHours(DEFAULT_WEEKLY_HOURS);
        const budget = weeklyHoursPresetToStoredHours(DEFAULT_WEEKLY_HOURS);
        setDraftAllocation(defaultAllocationSingleFocus("Putting", budget));
        prevBudgetRef.current = budget;
        setBaselineLowest("");
        if (syncedHandicap != null && hasRoundContext) {
          setBaselineHandicap(String(syncedHandicap));
        } else {
          setBaselineHandicap("");
        }
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

  const supplementalPracticeMinutes = useMemo(() => {
    if (!user?.id) return 0;
    const weekStart = startOfWeekMondayLocal();
    const weekEnd = endOfWeekSundayLocal(weekStart);
    return minutesFromPracticeRows(practiceSessions, user.id, weekStart, weekEnd);
  }, [practiceSessions, user?.id]);

  const budgetHoursNum = useMemo(() => weeklyHoursPresetToStoredHours(draftHours), [draftHours]);

  const draftPrimaryFocus = useMemo(() => primaryFocusFromAllocation(draftAllocation), [draftAllocation]);

  const handleWeeklyHoursChange = useCallback((next: WeeklyHoursPreset) => {
    const oldB = prevBudgetRef.current;
    const newB = weeklyHoursPresetToStoredHours(next);
    prevBudgetRef.current = newB;
    setDraftHours(next);
    setDraftAllocation((alloc) =>
      allocationMatchesBudget(alloc, oldB) ? scalePracticeAllocationToBudget(alloc, newB) : alloc,
    );
  }, []);

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
    if (!allocationMatchesBudget(draftAllocation, commitment)) {
      setSaveMsg("Balance your practice hours to match your weekly target before saving.");
      return;
    }
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const lowestSave = parseBaselineLowestForSave(baselineLowest);
      const handicapSave = parseBaselineHandicapForSave(baselineHandicap);

      const { error } = await supabase.from("player_goals").upsert(
        {
          user_id: user.id,
          scoring_milestone: draftScoring,
          focus_area: draftPrimaryFocus,
          weekly_hour_commitment: weeklyHoursPresetToStoredHours(draftHours),
          practice_allocation: draftAllocation,
          lowest_score: lowestSave,
          current_handicap: handicapSave,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) {
        setSaveMsg(error.message.includes("relation") ? "Run the latest Supabase migration (player_goals)." : error.message);
      } else {
        setSaveMsg("Saved.");
        await loadData();
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
        <div
          className="rounded-2xl border border-slate-800 p-5 shadow-lg"
          style={{ backgroundColor: PANEL_NAVY }}
        >
          <p className="text-sm text-slate-400">Loading goals…</p>
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
        className="rounded-2xl border border-slate-800 p-5 shadow-xl ring-1 ring-slate-800/70"
        style={{ backgroundColor: PANEL_NAVY }}
      >
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Goal setting</p>
          <h2 className="text-lg font-bold text-slate-50 mt-1">Presets</h2>
          <p className="text-xs text-slate-400 mt-1">
            Set your milestone and weekly budget, split hours across practice categories, then review accountability. Save
            only works when your allocation matches your weekly hours.
          </p>
        </div>

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

        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-800/80">
          <button
            type="button"
            disabled={saveBusy || !allocationMatchesBudget(draftAllocation, budgetHoursNum)}
            onClick={() => void saveGoals()}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: EMERALD }}
          >
            {saveBusy ? "Saving…" : "Save goals"}
          </button>
          {saveMsg && <span className="text-xs text-slate-400">{saveMsg}</span>}
        </div>

        <AccountabilityCard targets={targets} state={s} />

        <CommitmentHealthBar
          actualHours={s.actualHours}
          goalHours={s.commitmentHours}
          focusMismatch={s.focusMismatch}
          isHighVolumeCommitment={draftHours === "15+"}
        />
        {volumeEffortWarning && (
          <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-xs leading-snug text-amber-100/90">
            Your goal requires a higher volume of effort based on your current handicap.
          </p>
        )}
      </div>
    </div>
  );
}
