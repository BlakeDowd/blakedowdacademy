type PracticeLikeRow = {
  user_id?: string | null;
  duration_minutes?: unknown;
  duration?: unknown;
  estimatedMinutes?: unknown;
};

/**
 * Minutes to count for a `practice` row (or similar).
 * When `duration_minutes` is explicitly `0` (common for combine / putting telemetry rows), that must
 * stay zero — using `Number(dm) || duration` treats `0` as missing and can inflate trophy hours.
 */
/**
 * `StatsContext` loads all users' `practice` rows for Academy leaderboards.
 * Trophy progress and personal totals must only sum rows for the signed-in user.
 */
export function practiceSessionsForUser<T extends { user_id?: string | null }>(
  sessions: readonly T[] | null | undefined,
  userId: string | null | undefined,
): T[] {
  if (!userId) return [];
  return (sessions || []).filter((s) => s.user_id === userId);
}

export function practiceSessionMinutesFromRow(session: PracticeLikeRow | null | undefined): number {
  if (session == null) return 0;
  if (session.duration_minutes != null && session.duration_minutes !== "") {
    const n = Number(session.duration_minutes);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  if (session.duration != null && session.duration !== "") {
    const n = Number(session.duration);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  if (session.estimatedMinutes != null && session.estimatedMinutes !== "") {
    const n = Number(session.estimatedMinutes);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
}
