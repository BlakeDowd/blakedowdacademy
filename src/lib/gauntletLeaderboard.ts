import { gauntletPrecisionProtocolConfig } from "@/lib/gauntletPrecisionProtocolConfig";

type TimeFilter = "week" | "month" | "year" | "allTime";

function eventMsMatchesLeaderboardTimeFilter(ms: number, timeFilter: TimeFilter): boolean {
  if (timeFilter === "allTime") return true;
  if (!Number.isFinite(ms)) return false;
  const now = new Date();
  const event = new Date(ms);
  if (timeFilter === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return ms >= start.getTime();
  }
  if (timeFilter === "month") {
    return event.getFullYear() === now.getFullYear() && event.getMonth() === now.getMonth();
  }
  if (timeFilter === "year") {
    return event.getFullYear() === now.getFullYear();
  }
  return true;
}

function practiceLogPassesTimeFilter(log: { created_at?: string }, timeFilter: TimeFilter): boolean {
  if (timeFilter === "allTime") return true;
  const raw = log?.created_at;
  if (!raw) return false;
  const ms = new Date(raw).getTime();
  return eventMsMatchesLeaderboardTimeFilter(ms, timeFilter);
}

export type GauntletLeaderboardEntry = {
  id: string;
  name: string;
  avatar: string;
  value: number;
  isCurrentUser: boolean;
};

export function computeBestGauntletSessionForUser(
  practiceLogs: any[] | undefined,
  userId: string,
  timeFilter: TimeFilter,
): { perfect: number; avgScore: number } | null {
  const rows = (practiceLogs || []).filter(
    (r) =>
      String(r?.log_type || "") === gauntletPrecisionProtocolConfig.practiceLogType &&
      r.user_id === userId &&
      practiceLogPassesTimeFilter(r, timeFilter),
  );
  if (rows.length === 0) return null;
  let bestPerfect = 0;
  let bestAvg = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const perfect =
      typeof row.perfect_putt_count === "number" && Number.isFinite(row.perfect_putt_count)
        ? row.perfect_putt_count
        : 0;
    const avg =
      typeof row.matrix_score_average === "number" && Number.isFinite(row.matrix_score_average)
        ? row.matrix_score_average
        : Number.POSITIVE_INFINITY;
    if (perfect > bestPerfect) {
      bestPerfect = perfect;
      bestAvg = avg;
    } else if (perfect === bestPerfect && avg < bestAvg) {
      bestAvg = avg;
    }
  }
  return { perfect: bestPerfect, avgScore: bestAvg };
}

/**
 * Best single-session perfect-putt count per user in the time window.
 * Tie-break: lower average gauntlet score (matrix_score_average) is better.
 */
export function buildGauntletBlackLabelLeaderboard(
  practiceLogs: any[] | undefined,
  timeFilter: TimeFilter,
  userProfiles: Map<string, { full_name?: string; preferred_icon_id?: string }> | undefined,
  currentUserId: string | undefined,
): { top3: GauntletLeaderboardEntry[]; all: GauntletLeaderboardEntry[]; userRank: number; userValue: number } {
  const rows = (practiceLogs || []).filter(
    (r) => String(r?.log_type || "") === gauntletPrecisionProtocolConfig.practiceLogType,
  );
  const inWindow = rows.filter((r) => practiceLogPassesTimeFilter(r, timeFilter));

  type Best = { perfect: number; avgScore: number };
  const bestByUser = new Map<string, Best>();

  for (const row of inWindow) {
    const uid = row.user_id;
    if (!uid) continue;
    const perfect =
      typeof row.perfect_putt_count === "number" && Number.isFinite(row.perfect_putt_count)
        ? row.perfect_putt_count
        : 0;
    const avg =
      typeof row.matrix_score_average === "number" && Number.isFinite(row.matrix_score_average)
        ? row.matrix_score_average
        : Number.POSITIVE_INFINITY;

    const prev = bestByUser.get(uid);
    if (!prev) {
      bestByUser.set(uid, { perfect, avgScore: avg });
    } else if (perfect > prev.perfect) {
      bestByUser.set(uid, { perfect, avgScore: avg });
    } else if (perfect === prev.perfect && avg < prev.avgScore) {
      bestByUser.set(uid, { perfect, avgScore: avg });
    }
  }

  const allEntries: GauntletLeaderboardEntry[] = [];
  bestByUser.forEach((best, userId) => {
    const profile = userProfiles?.get(userId);
    if (!profile?.full_name) return;
    const displayName = profile.full_name;
    const nameForAvatar =
      displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase() || "U";
    const userIcon = profile.preferred_icon_id || nameForAvatar;
    allEntries.push({
      id: userId,
      name: displayName,
      avatar: userIcon,
      value: best.perfect,
      isCurrentUser: currentUserId === userId,
    });
  });

  allEntries.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    const avA = bestByUser.get(a.id)?.avgScore ?? Infinity;
    const avB = bestByUser.get(b.id)?.avgScore ?? Infinity;
    return avA - avB;
  });

  let userValue = 0;
  let userRank = 0;
  if (currentUserId) {
    const me = bestByUser.get(currentUserId);
    userValue = me?.perfect ?? 0;
    const idx = allEntries.findIndex((e) => e.id === currentUserId);
    userRank = idx >= 0 ? idx + 1 : 0;
  }

  return {
    top3: allEntries.slice(0, 3),
    all: allEntries,
    userRank,
    userValue,
  };
}
