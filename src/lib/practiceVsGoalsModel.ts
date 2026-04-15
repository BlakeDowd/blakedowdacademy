import { normalizeFocusArea } from "@/lib/goalAccountability";
import { weeklyHoursPresetToStoredHours, weeklyHoursToPreset } from "@/lib/goalPresetConstants";
import { parsePracticeAllocationFromDb, type PracticeHoursMap } from "@/lib/practiceAllocation";
import type { GoalFocusArea, PlayerGoalRow } from "@/types/playerGoals";

/** Minimal row shape for rolling week / month / all practice buckets (stats Home + coach deep dive). */
export type PracticeVsGoalsRow = {
  type?: string | null;
  duration_minutes?: number | null;
  created_at?: string | null;
  practice_date?: string | null;
};

export function formatPracticeDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0h";
  const h = minutes / 60;
  if (h < 1) return `${Math.round(minutes)}m`;
  return `${h.toFixed(1)}h`;
}

export function formatGoalHours(hours: number): string {
  if (!Number.isFinite(hours)) return "—";
  if (hours <= 0) return "0h";
  return `${hours.toFixed(1)}h`;
}

export type PracticeAllocationBuckets = {
  driving: number;
  irons: number;
  wedges: number;
  chipping: number;
  bunkers: number;
  putting: number;
  mentalStrategy: number;
  onCourse: number;
};

export type PracticeAllocationByRange = {
  week: PracticeAllocationBuckets;
  month: PracticeAllocationBuckets;
  all: PracticeAllocationBuckets;
  monthCommitmentWeeks: number;
  monthWindowDays: number;
};

/** Match `practice.type` labels only (same as Stats personalPractice). */
function minutesStrict(filtered: PracticeVsGoalsRow[], category: string): number {
  return filtered
    .filter((p) => (p.type || "") === category)
    .reduce((sum, p) => sum + (Number(p.duration_minutes) || 0), 0);
}

/** Match coach deep dive drill/practice aliases to canonical Home buckets. */
function minutesCoach(filtered: PracticeVsGoalsRow[], category: string, altTypes: string[] = []): number {
  const types = [category, ...altTypes];
  return filtered
    .filter((p) => types.some((t) => (p.type || "").toLowerCase() === t.toLowerCase()))
    .reduce((sum, p) => sum + (Number(p.duration_minutes) || 0), 0);
}

/**
 * Practice minutes by facility bucket for rolling week / month / all-time (same windows as Stats).
 */
export function buildPracticeAllocationByRange(
  rows: PracticeVsGoalsRow[],
  typeMatch: "strict" | "coach" = "strict",
): PracticeAllocationByRange {
  const build = (mode: "WEEK" | "MONTH" | "ALL"): PracticeAllocationBuckets => {
    const now = new Date();
    let startDate = new Date(0);
    if (mode === "WEEK") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    } else if (mode === "MONTH") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    const filtered = rows.filter((p) => {
      const pDate = new Date(p.created_at || p.practice_date || new Date());
      return pDate >= startDate;
    });

    const m = (category: string, alts?: string[]) =>
      typeMatch === "strict" ? minutesStrict(filtered, category) : minutesCoach(filtered, category, alts ?? []);

    return {
      driving: m("Driving", ["Range Mat", "Tee"]),
      irons: m("Irons", ["Approach", "Range Grass", "Full Swing"]),
      wedges: m("Wedges", ["Wedge Play"]),
      chipping: m("Chipping", ["Short Game", "Chipping Green"]),
      bunkers: m("Bunkers", ["Bunker", "Sand Play"]),
      putting: m("Putting", ["Putting Green"]),
      mentalStrategy: m("Mental/Strategy", ["Mental Game", "Mental", "Strategy"]),
      onCourse: m("On-Course", ["On Course"]),
    };
  };

  const nowForMonth = new Date();
  const monthStart = new Date(nowForMonth.getFullYear(), nowForMonth.getMonth() - 1, nowForMonth.getDate());
  const monthDays = Math.max(1, (nowForMonth.getTime() - monthStart.getTime()) / 86_400_000);
  const monthCommitmentWeeks = monthDays / 7;

  return {
    week: build("WEEK"),
    month: build("MONTH"),
    all: build("ALL"),
    monthCommitmentWeeks,
    monthWindowDays: monthDays,
  };
}

export type GoalPracticePlan = {
  weeklyHours: number;
  hours: PracticeHoursMap;
};

export function buildGoalPracticePlan(playerGoalRow: PlayerGoalRow | null): GoalPracticePlan | null {
  if (!playerGoalRow) return null;
  const stored = Number(playerGoalRow.weekly_hour_commitment);
  if (!Number.isFinite(stored) || stored <= 0) return null;
  const hoursPreset = weeklyHoursToPreset(stored);
  const budget = weeklyHoursPresetToStoredHours(hoursPreset);
  if (budget <= 0) return null;
  const legacyFocus = normalizeFocusArea(playerGoalRow.focus_area);
  const hours = parsePracticeAllocationFromDb(playerGoalRow.practice_allocation, budget, legacyFocus);
  return { weeklyHours: budget, hours };
}
