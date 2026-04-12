export type LeaderboardTimeFilter = "week" | "month" | "year" | "allTime";

export function eventMsMatchesLeaderboardTimeFilter(
  ms: number,
  timeFilter: LeaderboardTimeFilter,
): boolean {
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

export function parseLeaderboardEventMs(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export function rowTimestampMs(row: { created_at?: string; completed_at?: string }): number {
  const ms =
    parseLeaderboardEventMs(row?.completed_at) ??
    parseLeaderboardEventMs(row?.created_at) ??
    null;
  return ms ?? 0;
}

export function rowInTimeWindow(
  row: { created_at?: string; completed_at?: string },
  timeFilter: LeaderboardTimeFilter,
): boolean {
  if (timeFilter === "allTime") return true;
  const ms =
    parseLeaderboardEventMs(row?.completed_at) ??
    parseLeaderboardEventMs(row?.created_at) ??
    null;
  if (ms == null) return false;
  return eventMsMatchesLeaderboardTimeFilter(ms, timeFilter);
}
