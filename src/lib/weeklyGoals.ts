import { createClient } from "@/lib/supabase/client";

export const WEEKLY_GOAL_XP = 1000;

export type WeeklyGoalKey = "hours" | "rounds" | "drills" | "combines" | "lessons";

export type WeeklyGoalCounts = Record<"rounds" | "drills" | "combines" | "lessons", number>;

export type WeeklyGoalTargets = WeeklyGoalCounts & { hours: number };

export type WeeklyGoalStatus = {
  weekStart: string;
  hasGoals: boolean;
  xp: number;
  complete: boolean;
  awarded: boolean;
  awardedNow: boolean;
  targets: WeeklyGoalTargets;
  done: WeeklyGoalCounts & { minutes: number };
};

export type WeeklyGoalItem = {
  key: WeeklyGoalKey;
  label: string;
  done: number;
  target: number;
  /** Text like "2.5/5h" or "1/2". */
  progress: string;
  met: boolean;
};

export const WEEKLY_COUNT_GOALS: { key: keyof WeeklyGoalCounts; label: string; unit: string; max: number }[] = [
  { key: "rounds", label: "Rounds", unit: "round", max: 14 },
  { key: "drills", label: "Drills", unit: "drill", max: 50 },
  { key: "combines", label: "Combines", unit: "combine", max: 20 },
  { key: "lessons", label: "Lessons", unit: "lesson", max: 30 },
];

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function parseStatus(raw: unknown): WeeklyGoalStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t = (r.targets ?? {}) as Record<string, unknown>;
  const d = (r.done ?? {}) as Record<string, unknown>;
  return {
    weekStart: String(r.week_start ?? ""),
    hasGoals: Boolean(r.has_goals),
    xp: num(r.xp) || WEEKLY_GOAL_XP,
    complete: Boolean(r.complete),
    awarded: Boolean(r.awarded),
    awardedNow: Boolean(r.awarded_now),
    targets: {
      hours: num(t.hours),
      rounds: num(t.rounds),
      drills: num(t.drills),
      combines: num(t.combines),
      lessons: num(t.lessons),
    },
    done: {
      minutes: num(d.minutes),
      rounds: num(d.rounds),
      drills: num(d.drills),
      combines: num(d.combines),
      lessons: num(d.lessons),
    },
  };
}

/** This week's progress. Also pays the weekly XP the first time every goal is done. */
export async function fetchWeeklyGoalStatus(): Promise<WeeklyGoalStatus | null> {
  const { data, error } = await createClient().rpc("weekly_goals_status");
  if (error) {
    console.warn("[weeklyGoals] weekly_goals_status:", error.message);
    return null;
  }
  const status = parseStatus(data);
  if (status?.awardedNow && typeof window !== "undefined") {
    window.dispatchEvent(new Event("xpUpdated"));
  }
  return status;
}

const fmtHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));

/** The goals the player has switched on, hours first. */
export function weeklyGoalItems(status: WeeklyGoalStatus): WeeklyGoalItem[] {
  const items: WeeklyGoalItem[] = [];
  const hoursDone = status.done.minutes / 60;
  if (status.targets.hours > 0) {
    items.push({
      key: "hours",
      label: "Practice",
      done: hoursDone,
      target: status.targets.hours,
      progress: `${fmtHours(Math.min(hoursDone, 99))}/${fmtHours(status.targets.hours)}h`,
      met: hoursDone >= status.targets.hours,
    });
  }
  for (const g of WEEKLY_COUNT_GOALS) {
    const target = status.targets[g.key];
    if (target <= 0) continue;
    const done = status.done[g.key];
    items.push({ key: g.key, label: g.label, done, target, progress: `${done}/${target}`, met: done >= target });
  }
  return items;
}

/** Records a finished combine so it counts toward the weekly combines goal. */
export async function recordCombineCompletion(userId: string): Promise<void> {
  const { error } = await createClient().from("combine_completions").insert({ user_id: userId });
  if (error) console.warn("[weeklyGoals] combine_completions:", error.message);
}
