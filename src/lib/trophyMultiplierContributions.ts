import { listUserCombineCompletionEvents } from "@/lib/combineCompletionDetection";

/**
 * Trophy Case multiplier: how many times the user has met a trophy's threshold,
 * plus optional contribution lines (dates / rounds / sessions) for the detail modal.
 * Uses logged `rounds`, `practice_sessions`-style rows, `practice_logs`, local practice history,
 * and optional `round_stats` snapshot dates.
 */

export type AcademyTrophyMultiplierStats = {
  totalXP: number;
  completedLessons: number;
  practiceHours: number;
  rounds: number;
  handicap: number;
  roundsData: any[];
  practiceHistory: any[];
  libraryCategories: Record<string, number>;
  userId?: string;
  practiceSessions: any[];
};

export type TrophyContributionLine = { label: string; dateLabel: string };

export type TrophyMultiplierResult = {
  count: number;
  contributions: TrophyContributionLine[];
};

const MAX_LINES = 50;

function fmt(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return String(iso);
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function roundSortKey(r: any): number {
  if (r?.created_at) {
    const x = new Date(r.created_at).getTime();
    if (Number.isFinite(x)) return x;
  }
  if (r?.date) {
    const x = new Date(r.date).getTime();
    if (Number.isFinite(x)) return x;
  }
  return 0;
}

function sortedRounds(rounds: any[]): any[] {
  return [...(rounds || [])].sort((a, b) => roundSortKey(a) - roundSortKey(b));
}

/**
 * Cumulative practice hours in session order; record each time a new multiple of `thresholdHours` is crossed.
 * Special case: threshold 1h ("First Steps") — only the **first** crossing of 1 cumulative hour counts. Using
 * floor(cumH/1) would add a "milestone" every hour (≈114 badges for 114h), which is not what the trophy means.
 */
function practiceHourMilestoneDates(
  sessions: any[],
  userId: string | undefined,
  thresholdHours: number,
): string[] {
  if (thresholdHours <= 0) return [];
  const rows = [...(sessions || [])]
    .filter((s) => !userId || s?.user_id === userId)
    .sort((a, b) => {
      const ta = new Date(a?.created_at || a?.practice_date || 0).getTime();
      const tb = new Date(b?.created_at || b?.practice_date || 0).getTime();
      return ta - tb;
    });

  if (thresholdHours === 1) {
    let cumH = 0;
    for (const s of rows) {
      const addM =
        Number(s?.duration_minutes) || Number(s?.duration) || Number(s?.estimatedMinutes) || 0;
      const addH = addM / 60;
      if (addH <= 0) continue;
      const before = cumH;
      cumH += addH;
      if (before < 1 && cumH >= 1) {
        return [fmt(s?.created_at || s?.practice_date)];
      }
    }
    return [];
  }

  let cumH = 0;
  let prevM = 0;
  const dates: string[] = [];
  for (const s of rows) {
    const m =
      Number(s?.duration_minutes) || Number(s?.duration) || Number(s?.estimatedMinutes) || 0;
    const addH = m / 60;
    if (addH <= 0) continue;
    cumH += addH;
    const mNow = Math.floor(cumH / thresholdHours);
    if (mNow > prevM) {
      const iso = s?.created_at || s?.practice_date;
      for (let k = prevM; k < mNow; k++) {
        dates.push(fmt(iso));
      }
      prevM = mNow;
    }
  }
  return dates;
}

function xpMilestoneDatesFromHistory(
  history: any[],
  thresholdXp: number,
): string[] {
  if (thresholdXp <= 0 || !history?.length) return [];
  const rows = [...history].sort((a, b) => {
    const ta = new Date(a?.timestamp || a?.date || 0).getTime();
    const tb = new Date(b?.timestamp || b?.date || 0).getTime();
    return ta - tb;
  });
  let cum = 0;
  let prevM = 0;
  const dates: string[] = [];
  for (const e of rows) {
    const add = Number(e?.xp) || 0;
    if (add <= 0) continue;
    cum += add;
    const mNow = Math.floor(cum / thresholdXp);
    if (mNow > prevM) {
      const iso = e?.timestamp || e?.date;
      for (let k = prevM; k < mNow; k++) dates.push(fmt(iso));
      prevM = mNow;
    }
  }
  return dates;
}

function uniquePracticeDays(history: any[]): string[] {
  const d = new Set<string>();
  for (const e of history || []) {
    const raw = e?.timestamp || e?.date;
    if (!raw) continue;
    const day = new Date(raw).toISOString().split("T")[0];
    if (day) d.add(day);
  }
  return [...d].sort();
}

/** Non-overlapping 3-day streak completions (end date of each triple). */
function weekWarriorStreakEndDates(history: any[]): string[] {
  const days = uniquePracticeDays(history);
  if (days.length < 3) return [];
  const ends: string[] = [];
  let i = 0;
  while (i + 2 < days.length) {
    const a = new Date(days[i]);
    const b = new Date(days[i + 1]);
    const c = new Date(days[i + 2]);
    const a1 = new Date(a);
    a1.setDate(a1.getDate() + 1);
    const b1 = new Date(b);
    b1.setDate(b1.getDate() + 1);
    if (a1.toISOString().split("T")[0] === days[i + 1] && b1.toISOString().split("T")[0] === days[i + 2]) {
      ends.push(days[i + 2]);
      i += 3;
    } else {
      i += 1;
    }
  }
  return ends;
}

function monthlyLegendQualifyingMonths(history: any[]): { key: string; hours: number }[] {
  const monthly: Record<string, number> = {};
  for (const e of history || []) {
    const raw = e?.timestamp || e?.date;
    if (!raw) continue;
    const dt = new Date(raw);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const minutes = Number(e?.duration) || Number(e?.estimatedMinutes) || Number(e?.xp) / 10 || 0;
    monthly[key] = (monthly[key] || 0) + minutes / 60;
  }
  return Object.entries(monthly)
    .filter(([, h]) => h >= 20)
    .map(([key, hours]) => ({ key, hours }));
}

function coachPetCompletedCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const recommended = JSON.parse(localStorage.getItem("recommendedDrills") || "[]") as string[];
    const userProgress = JSON.parse(localStorage.getItem("userProgress") || "{}");
    const completed = new Set<string>(userProgress.completedDrills || []);
    const drillCompletions = userProgress.drillCompletions || {};
    return recommended.filter(
      (id: string) => completed.has(id) || (drillCompletions[id] && drillCompletions[id] > 0),
    ).length;
  } catch {
    return 0;
  }
}

export function getTrophyMultiplierContributions(
  trophyId: string,
  stats: AcademyTrophyMultiplierStats,
  practiceLogs: { created_at?: string | null; log_type?: string | null }[],
  roundStatsPlayedAt: string[],
): TrophyMultiplierResult {
  const rounds = sortedRounds(stats.roundsData || []);
  const uid = stats.userId;

  const linesFromRoundDates = (subset: any[], label: string): TrophyContributionLine[] =>
    subset.slice(0, MAX_LINES).map((r) => ({
      label,
      dateLabel: fmt(r.created_at || r.date),
    }));

  const appendRoundStats = (out: TrophyContributionLine[]) => {
    for (const iso of roundStatsPlayedAt.slice(0, 12)) {
      out.push({ label: "Strokes-gained snapshot (round_stats)", dateLabel: fmt(iso) });
      if (out.length >= MAX_LINES) break;
    }
  };

  switch (trophyId) {
    case "first-steps": {
      const T = 1;
      const dates = practiceHourMilestoneDates(stats.practiceSessions, uid, T);
      const c = dates.length;
      const contrib = dates.slice(0, MAX_LINES).map((d) => ({
        label: "First cumulative practice hour",
        dateLabel: d,
      }));
      return { count: c, contributions: contrib };
    }
    case "dedicated": {
      const T = 10;
      const c = Math.max(0, Math.floor(stats.practiceHours / T));
      const dates = practiceHourMilestoneDates(stats.practiceSessions, uid, T);
      return {
        count: c,
        contributions: dates.slice(0, MAX_LINES).map((d) => ({ label: `≥${T}h cumulative`, dateLabel: d })),
      };
    }
    case "practice-master": {
      const T = 50;
      const c = Math.max(0, Math.floor(stats.practiceHours / T));
      const dates = practiceHourMilestoneDates(stats.practiceSessions, uid, T);
      return {
        count: c,
        contributions: dates.slice(0, MAX_LINES).map((d) => ({ label: `≥${T}h cumulative`, dateLabel: d })),
      };
    }
    case "practice-legend": {
      const T = 100;
      const c = Math.max(0, Math.floor(stats.practiceHours / T));
      const dates = practiceHourMilestoneDates(stats.practiceSessions, uid, T);
      return {
        count: c,
        contributions: dates.slice(0, MAX_LINES).map((d) => ({ label: `≥${T}h cumulative`, dateLabel: d })),
      };
    }
    case "student": {
      const T = 5;
      const c = Math.max(0, Math.floor(stats.completedLessons / T));
      return {
        count: c,
        contributions:
          c > 1
            ? [{ label: `${stats.completedLessons} drills completed (library)`, dateLabel: "—" }]
            : [],
      };
    }
    case "scholar": {
      const T = 20;
      const c = Math.max(0, Math.floor(stats.completedLessons / T));
      return {
        count: c,
        contributions:
          c > 1 ? [{ label: `${stats.completedLessons} drills completed`, dateLabel: "—" }] : [],
      };
    }
    case "expert": {
      const T = 50;
      const c = Math.max(0, Math.floor(stats.completedLessons / T));
      return {
        count: c,
        contributions:
          c > 1 ? [{ label: `${stats.completedLessons} drills completed`, dateLabel: "—" }] : [],
      };
    }
    case "first-round": {
      const c = rounds.length;
      return { count: c, contributions: linesFromRoundDates(rounds, "Round logged") };
    }
    case "consistent": {
      const T = 10;
      const c = Math.max(0, Math.floor(rounds.length / T));
      const milestones = rounds.filter((_, i) => (i + 1) % T === 0);
      return { count: c, contributions: linesFromRoundDates(milestones, `Every ${T} rounds`) };
    }
    case "tracker": {
      const T = 25;
      const c = Math.max(0, Math.floor(rounds.length / T));
      const milestones = rounds.filter((_, i) => (i + 1) % T === 0);
      const contrib = linesFromRoundDates(milestones, `Every ${T} rounds`);
      appendRoundStats(contrib);
      return { count: c, contributions: contrib.slice(0, MAX_LINES) };
    }
    case "rising-star": {
      const T = 1000;
      const c = Math.max(0, Math.floor(stats.totalXP / T));
      const dates = xpMilestoneDatesFromHistory(stats.practiceHistory, T);
      return {
        count: c,
        contributions: dates.slice(0, MAX_LINES).map((d) => ({ label: `+${T} XP milestone`, dateLabel: d })),
      };
    }
    case "champion": {
      const T = 5000;
      const c = Math.max(0, Math.floor(stats.totalXP / T));
      const dates = xpMilestoneDatesFromHistory(stats.practiceHistory, T);
      return {
        count: c,
        contributions: dates.slice(0, MAX_LINES).map((d) => ({ label: `+${T} XP milestone`, dateLabel: d })),
      };
    }
    case "elite": {
      const T = 10000;
      const c = Math.max(0, Math.floor(stats.totalXP / T));
      const dates = xpMilestoneDatesFromHistory(stats.practiceHistory, T);
      return {
        count: c,
        contributions: dates.slice(0, MAX_LINES).map((d) => ({ label: `+${T} XP milestone`, dateLabel: d })),
      };
    }
    case "goal-achiever": {
      const ok = stats.handicap <= 8.7;
      return {
        count: ok ? 1 : 0,
        contributions: ok
          ? [{ label: "Handicap at or below 8.7", dateLabel: `Index ${stats.handicap}` }]
          : [],
      };
    }
    case "birdie-hunter": {
      const hit = rounds.filter((r: any) => (r.birdies || 0) >= 1);
      return { count: hit.length, contributions: linesFromRoundDates(hit, "Round with a birdie") };
    }
    case "breaking-90": {
      const hit = rounds.filter((r: any) => r.score != null && r.score < 90);
      return { count: hit.length, contributions: linesFromRoundDates(hit, "Round under 90") };
    }
    case "breaking-80": {
      const hit = rounds.filter((r: any) => r.score != null && r.score < 80);
      return { count: hit.length, contributions: linesFromRoundDates(hit, "Round under 80") };
    }
    case "breaking-70": {
      const hit = rounds.filter((r: any) => r.score != null && r.score < 70);
      return { count: hit.length, contributions: linesFromRoundDates(hit, "Round under 70") };
    }
    case "eagle-eye": {
      const hit = rounds.filter((r: any) => (r.eagles || 0) >= 1);
      return { count: hit.length, contributions: linesFromRoundDates(hit, "Round with an eagle") };
    }
    case "birdie-machine": {
      const hit = rounds.filter((r: any) => (r.birdies || 0) >= 5);
      return { count: hit.length, contributions: linesFromRoundDates(hit, "Round with 5+ birdies") };
    }
    case "par-train": {
      const hit = rounds.filter((r: any) => (r.pars || 0) >= 5);
      return { count: hit.length, contributions: linesFromRoundDates(hit, "Round with 5+ pars") };
    }
    case "week-warrior": {
      const ends = weekWarriorStreakEndDates(stats.practiceHistory);
      return {
        count: ends.length,
        contributions: ends.map((d) => ({ label: "Completed 3-day practice streak", dateLabel: d })),
      };
    }
    case "monthly-legend": {
      const months = monthlyLegendQualifyingMonths(stats.practiceHistory);
      return {
        count: months.length,
        contributions: months.map((m) => ({
          label: "Month with ≥20 practice hours",
          dateLabel: `${m.key} (${m.hours.toFixed(1)}h)`,
        })),
      };
    }
    case "putting-professor": {
      const n = stats.libraryCategories?.["Putting"] || 0;
      const c = Math.max(0, Math.floor(n / 5));
      return {
        count: c,
        contributions:
          c > 1 ? [{ label: `${n} Putting category completions`, dateLabel: "—" }] : [],
      };
    }
    case "wedge-wizard": {
      const n = stats.libraryCategories?.["Wedge Play"] || 0;
      const c = Math.max(0, Math.floor(n / 5));
      return {
        count: c,
        contributions:
          c > 1 ? [{ label: `${n} Wedge Play completions`, dateLabel: "—" }] : [],
      };
    }
    case "coachs-pet": {
      const c = coachPetCompletedCount();
      return {
        count: c,
        contributions:
          c > 0
            ? [{ label: "Recommended drill completed", dateLabel: `${c} total` }]
            : [],
      };
    }
    case "champion-putting-test-18": {
      const puttingLogs = (practiceLogs || []).filter((l) => {
        const t = (l.log_type || "").toLowerCase();
        return t.includes("putting") && (t.includes("18") || t.includes("test"));
      });
      const c = puttingLogs.length;
      const contrib = puttingLogs.slice(0, MAX_LINES).map((l) => ({
        label: "Putting test session (practice_logs)",
        dateLabel: fmt(l.created_at ?? null),
      }));
      return { count: Math.max(c, 0), contributions: contrib };
    }
    case "combine-finisher": {
      const events = listUserCombineCompletionEvents({
        userId: uid,
        practiceSessions: stats.practiceSessions,
        practiceLogs,
      });
      const contrib = events.slice(0, MAX_LINES).map((e) => ({
        label: e.label,
        dateLabel: fmt(e.at),
      }));
      return { count: Math.max(events.length, 0), contributions: contrib };
    }
    default:
      return { count: 0, contributions: [] };
  }
}
