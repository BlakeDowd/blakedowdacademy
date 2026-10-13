import { localDayKey, type PracticeActivityItem } from "@/lib/practiceActivity";
import { practiceSessionMinutesFromRow } from "@/lib/practiceSessionDuration";
import { LESSON_PRACTICE_TYPE } from "@/lib/coachLessons";
import { ROUND_TROPHY_CHECKS } from "@/lib/trophyRoundChecks";

/**
 * When a trophy's requirement was first met, taken from the entry that crossed the line.
 * Practice rows use `completed_at` (set when a weekly-planner drill is ticked off) before `created_at`
 * (when a session was entered); rounds use the time they were entered.
 */
export type TrophyQualifyInput = {
  /** The player's own activity (any order). */
  activity: readonly PracticeActivityItem[];
  /** The player's own `practice` rows. */
  practiceSessions: readonly unknown[];
  roundsData: readonly unknown[];
};

type Row = Record<string, unknown>;

const timeOf = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

function practiceEnteredAt(row: Row): string | null {
  const at = row.completed_at || row.created_at;
  return typeof at === "string" && Number.isFinite(timeOf(at)) ? at : null;
}

function roundEnteredAt(row: Row): string | null {
  const at = row.created_at || row.date;
  return typeof at === "string" && Number.isFinite(timeOf(at)) ? at : null;
}

function ascending<T>(items: readonly T[], at: (item: T) => string | null): { item: T; at: string }[] {
  return items
    .map((item) => ({ item, at: at(item) }))
    .filter((x): x is { item: T; at: string } => x.at != null)
    .sort((a, b) => timeOf(a.at) - timeOf(b.at));
}

function nthAt(sorted: { at: string }[], n: number): string | null {
  return sorted[n - 1]?.at ?? null;
}

function cumulativeMinutesCrossedAt(rows: readonly unknown[], thresholdMinutes: number): string | null {
  let total = 0;
  for (const { item, at } of ascending(rows as Row[], practiceEnteredAt)) {
    total += practiceSessionMinutesFromRow(item);
    if (total >= thresholdMinutes) return at;
  }
  return null;
}

function nextDayKey(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return localDayKey(d);
}

function streakAt(activity: readonly PracticeActivityItem[], length: number): string | null {
  const firstAtByDay = new Map<string, string>();
  for (const { item, at } of ascending(activity.filter((i) => i.kind !== "video"), (i) => i.at)) {
    const key = localDayKey(item.at);
    if (!firstAtByDay.has(key)) firstAtByDay.set(key, at);
  }
  const days = [...firstAtByDay.keys()];
  let run = days.length > 0 ? 1 : 0;
  for (let i = 0; i < days.length; i++) {
    if (i > 0) run = nextDayKey(days[i - 1]) === days[i] ? run + 1 : 1;
    if (run >= length) return firstAtByDay.get(days[i]) ?? null;
  }
  return null;
}

function monthMinutesCrossedAt(activity: readonly PracticeActivityItem[], thresholdMinutes: number): string | null {
  const byMonth = new Map<string, number>();
  for (const { item, at } of ascending(activity.filter((i) => i.kind !== "video"), (i) => i.at)) {
    const month = localDayKey(item.at).slice(0, 7);
    const total = (byMonth.get(month) ?? 0) + item.minutes;
    byMonth.set(month, total);
    if (total >= thresholdMinutes) return at;
  }
  return null;
}

const PRACTICE_HOUR_TARGETS: Record<string, number> = {
  "first-steps": 1,
  dedicated: 10,
  "practice-master": 50,
  "practice-legend": 100,
  "practice-icon": 250,
};

const LESSON_TARGETS: Record<string, number> = { student: 5, scholar: 20, expert: 50 };

const ROUND_COUNT_TARGETS: Record<string, number> = {
  "first-round": 1,
  consistent: 10,
  tracker: 25,
  "round-machine": 50,
};

const COMBINE_COUNT_TARGETS: Record<string, number> = {
  "combine-finisher": 1,
  "combine-regular": 10,
  "combine-machine": 25,
};

const ROUND_CONDITIONS: Record<string, (r: Row) => boolean> = {
  "birdie-hunter": (r) => Number(r.birdies || 0) >= 1,
  "birdie-machine": (r) => Number(r.birdies || 0) >= 5,
  "eagle-eye": (r) => Number(r.eagles || 0) >= 1,
  "par-train": (r) => Number(r.pars || 0) >= 5,
  "breaking-90": (r) => r.score != null && Number(r.score) < 90,
  "breaking-80": (r) => r.score != null && Number(r.score) < 80,
  "breaking-70": (r) => r.score != null && Number(r.score) < 70,
  "goal-achiever": (r) => r.handicap != null && Number(r.handicap) <= 8.7,
};

/** ISO time the trophy was first qualified for, or null when the data can't date it (XP, leaderboard, etc.). */
export function trophyQualifiedAt(trophyId: string, input: TrophyQualifyInput): string | null {
  const hours = PRACTICE_HOUR_TARGETS[trophyId];
  if (hours != null) return cumulativeMinutesCrossedAt(input.practiceSessions, hours * 60);

  const lessons = LESSON_TARGETS[trophyId];
  if (lessons != null) {
    return nthAt(ascending(input.activity.filter((i) => i.kind === "video"), (i) => i.at), lessons);
  }

  const roundCount = ROUND_COUNT_TARGETS[trophyId];
  if (roundCount != null) return nthAt(ascending(input.roundsData as Row[], roundEnteredAt), roundCount);

  const roundCondition = ROUND_CONDITIONS[trophyId] ?? ROUND_TROPHY_CHECKS[trophyId];
  if (roundCondition) {
    return ascending(input.roundsData as Row[], roundEnteredAt).find((x) => roundCondition(x.item))?.at ?? null;
  }

  const combines = COMBINE_COUNT_TARGETS[trophyId];
  if (combines != null) {
    return nthAt(ascending(input.activity.filter((i) => i.kind === "combine"), (i) => i.at), combines);
  }

  switch (trophyId) {
    case "week-warrior":
      return streakAt(input.activity, 3);
    case "on-a-roll":
      return streakAt(input.activity, 7);
    case "coached-up": {
      const lessons = (input.practiceSessions as Row[]).filter((r) => r.type === LESSON_PRACTICE_TYPE);
      return nthAt(ascending(lessons, practiceEnteredAt), 5);
    }
    case "monthly-legend":
      return monthMinutesCrossedAt(input.activity, 20 * 60);
    case "putting-professor":
    case "wedge-wizard": {
      const area = trophyId === "putting-professor" ? "Putting" : "Wedges";
      const drills = input.activity.filter((i) => i.kind === "drill" && i.area === area);
      return nthAt(ascending(drills, (i) => i.at), 5);
    }
    default:
      return null;
  }
}
