import type {
  GoalAccountabilityMetrics,
  GoalAccountabilityState,
  GoalFocusArea,
  PlayerGoalRow,
  PracticeLogAccountabilityRow,
} from "@/types/playerGoals";
import {
  DEFAULT_SCORING_PRESET,
  DEFAULT_WEEKLY_HOURS,
  weeklyHoursPresetToStoredHours,
  type ScoringMilestonePreset,
} from "@/lib/goalPresetConstants";

/** Default goal when no `player_goals` row exists yet. */
export const DEFAULT_PLAYER_GOAL: Omit<PlayerGoalRow, "user_id" | "updated_at"> = {
  scoring_milestone: DEFAULT_SCORING_PRESET,
  focus_area: "Putting",
  weekly_hour_commitment: weeklyHoursPresetToStoredHours(DEFAULT_WEEKLY_HOURS),
};

/**
 * Map `practice_logs.log_type` to a practice-allocation focus bucket
 * (same labels as `player_goals.focus_area`).
 */
export function logTypeToFocusArea(logType: string | null | undefined): GoalFocusArea {
  const key = (logType || "").toLowerCase().trim();
  if (!key) return "Putting";

  if (key.includes("bunker")) return "Bunkers";
  if (key.includes("chipping") || key.includes("chip")) return "Chipping";
  if (key.includes("wedge") || key.includes("lateral")) return "Wedges";
  if (key.includes("iron")) return "Irons";
  if (key.includes("tee") || key.includes("dispersion") || key.includes("driver")) return "Driving";
  if (
    key.includes("strike") ||
    key.includes("speed") ||
    key.includes("gauntlet") ||
    key.includes("start_line") ||
    key.includes("putting") ||
    key.includes("aimpoint") ||
    key.includes("slope")
  ) {
    return "Putting";
  }

  return "Putting";
}

/** Normalize saved `focus_area` (including legacy four-bucket values) to a preset. */
export function normalizeFocusArea(raw: string | null | undefined): GoalFocusArea {
  const lower = (raw || "").toLowerCase().trim();
  if (!lower) return "Putting";

  const direct: Record<string, GoalFocusArea> = {
    driving: "Driving",
    irons: "Irons",
    wedges: "Wedges",
    chipping: "Chipping",
    bunkers: "Bunkers",
    putting: "Putting",
    "on-course": "On-Course",
    "mental/strategy": "Mental/Strategy",
  };
  const hit = direct[lower];
  if (hit) return hit;

  if (lower.includes("mental") || lower.includes("strategy")) return "Mental/Strategy";
  if (lower.includes("on course") || lower.includes("on-course") || lower.includes("oncourse")) return "On-Course";
  if (lower.includes("bunker") || lower.includes("sand play")) return "Bunkers";
  if (lower.includes("short game") || lower.includes("chipping") || lower.includes("chip")) return "Chipping";
  if (lower.includes("wedge") || lower.includes("lateral")) return "Wedges";
  if (lower.includes("approach play") || lower.includes("iron")) return "Irons";
  if (lower.includes("off the tee") || lower.includes("tee shot") || lower.includes("dispersion")) return "Driving";
  if (lower.includes("putting")) return "Putting";

  return "Putting";
}

export function startOfWeekMondayLocal(from: Date = new Date()): Date {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeekSundayLocal(weekStart: Date): Date {
  const e = new Date(weekStart);
  e.setDate(e.getDate() + 7);
  return e;
}

function tallyCategories(rows: PracticeLogAccountabilityRow[]): Map<GoalFocusArea, number> {
  const m = new Map<GoalFocusArea, number>();
  for (const r of rows) {
    const cat = logTypeToFocusArea(r.log_type);
    m.set(cat, (m.get(cat) ?? 0) + 1);
  }
  return m;
}

export function topCategoryFromLogs(rows: PracticeLogAccountabilityRow[]): GoalFocusArea | null {
  if (rows.length === 0) return null;
  const tally = tallyCategories(rows);
  let best: GoalFocusArea | null = null;
  let bestN = 0;
  for (const [k, n] of tally) {
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return best;
}

/**
 * Commitment health 0–1: 70% time ratio vs goal (capped at 1), 30% focus alignment (1 = match).
 */
export function commitmentHealthScore(
  actualHours: number,
  goalHours: number,
  focusMismatch: boolean,
): number {
  const timeHealth = goalHours <= 0 ? 0 : Math.min(1, actualHours / goalHours);
  const focusHealth = focusMismatch ? 0 : 1;
  return Math.min(1, timeHealth * 0.7 + focusHealth * 0.3);
}

export type CommitmentHealthBarOpts = {
  /** 15h+ tier with actual hours under half the numeric target → force critical rose bar. */
  eliteHoursShortfall?: boolean;
};

export function commitmentHealthBarClass(score: number, opts?: CommitmentHealthBarOpts): string {
  if (opts?.eliteHoursShortfall) return "bg-rose-600";
  if (score < 0.5) return "bg-red-500";
  if (score <= 0.8) return "bg-amber-400";
  return "bg-[#10b981]";
}

export function minutesFromPracticeRows(
  rows: { duration_minutes?: number | null; created_at?: string | null; user_id?: string }[],
  userId: string,
  weekStart: Date,
  weekEnd: Date,
): number {
  let sum = 0;
  const ws = weekStart.getTime();
  const we = weekEnd.getTime();
  for (const r of rows) {
    if (r.user_id !== userId) continue;
    const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
    if (!Number.isFinite(t) || t < ws || t >= we) continue;
    const dm = Number(r.duration_minutes);
    if (Number.isFinite(dm) && dm > 0) sum += dm;
  }
  return sum;
}

export function computeGoalAccountabilityState(
  goal: PlayerGoalRow | null,
  logs: PracticeLogAccountabilityRow[],
  supplementalPracticeMinutes: number,
  userId: string,
): GoalAccountabilityState {
  const weekStart = startOfWeekMondayLocal();
  const weekEnd = endOfWeekSundayLocal(weekStart);
  const ws = weekStart.getTime();
  const we = weekEnd.getTime();

  const logsThisWeek = logs.filter((r) => {
    if (r.user_id !== userId) return false;
    const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
    return Number.isFinite(t) && t >= ws && t < we;
  });

  let totalMinutesFromLogs = 0;
  for (const r of logsThisWeek) {
    const dm = Number(r.duration_minutes ?? 0);
    if (Number.isFinite(dm) && dm > 0) totalMinutesFromLogs += dm;
  }

  const useSupplement = totalMinutesFromLogs === 0 && supplementalPracticeMinutes > 0;
  const totalMinutes = totalMinutesFromLogs + (useSupplement ? supplementalPracticeMinutes : 0);
  const topCategory = topCategoryFromLogs(logsThisWeek);
  const focusArea = normalizeFocusArea(goal?.focus_area ?? DEFAULT_PLAYER_GOAL.focus_area);
  const focusMismatch =
    topCategory !== null && focusArea.toLowerCase() !== topCategory.toLowerCase();

  const commitmentHours = Math.max(
    0.25,
    Number(goal?.weekly_hour_commitment ?? DEFAULT_PLAYER_GOAL.weekly_hour_commitment) ||
      weeklyHoursPresetToStoredHours(DEFAULT_WEEKLY_HOURS),
  );
  const actualHours = totalMinutes / 60;
  const hourProgressPct = Math.min(100, (actualHours / commitmentHours) * 100);
  const hoursBelowThreshold = hourProgressPct < 50;

  const metrics: GoalAccountabilityMetrics = {
    weekStartIso: weekStart.toISOString(),
    weekEndIso: weekEnd.toISOString(),
    totalMinutesFromLogs,
    supplementalPracticeMinutes: useSupplement ? supplementalPracticeMinutes : 0,
    totalMinutes,
    topCategory,
    logCountThisWeek: logsThisWeek.length,
  };

  return {
    goal,
    metrics,
    focusMismatch,
    commitmentHours,
    actualHours,
    hourProgressPct,
    hoursBelowThreshold,
  };
}

/**
 * Approximate handicap index aligned with each milestone (coarse heuristic for gap messaging).
 */
export function milestoneBenchmarkHandicap(milestone: ScoringMilestonePreset): number {
  const m: Record<ScoringMilestonePreset, number> = {
    "Break 100": 28,
    "Break 90": 18,
    "Break 80": 10,
    Scratch: 0,
    Plus: 4,
    Pro: -5,
  };
  return m[milestone];
}

/** Positive = current handicap is higher (worse) than the benchmark for that milestone. */
export function handicapToMilestoneStrokesGap(
  currentHandicap: number,
  milestone: ScoringMilestonePreset,
): number {
  return currentHandicap - milestoneBenchmarkHandicap(milestone);
}
