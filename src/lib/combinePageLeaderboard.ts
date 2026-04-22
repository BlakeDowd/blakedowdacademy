import { totalPointsFromWedgeShotsJson } from "@/lib/wedgeLateral9Analytics";
import { totalIronPointsFromStrikeData } from "@/lib/ironPrecisionScoring";

export type CombineHighlightDefinition =
  | {
      kind: "practice_by_test_type";
      testType: string;
      higherIsBetter: boolean;
      /** Copy for improvement line */
      improvementUnit: "points" | "percent" | "index";
    }
  | {
      kind: "putting_practice";
      practiceType: string;
      lastHoleIndex: number;
      higherIsBetter: boolean;
      improvementUnit: "points";
    }
  | {
      kind: "practice_logs";
      logType: string;
      higherIsBetter: boolean;
      scoreMode: "matrix_average" | "total_points";
      improvementUnit: "points" | "index";
    };

export function stonecuttersDisplayName(fullName: string | null | undefined): string {
  const t = fullName?.trim();
  if (!t) return "Member";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  const initial = last[0]?.toUpperCase() ?? "";
  return initial ? `${first} ${initial}.` : first;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function aggregatesFromPractice(row: { metadata?: unknown }): Record<string, unknown> | null {
  const m = metadataFromPractice(row);
  if (!m || typeof m !== "object") return null;
  const ag = (m as { aggregates?: unknown }).aggregates;
  if (!ag || typeof ag !== "object") return null;
  return ag as Record<string, unknown>;
}

function metadataFromPractice(row: { metadata?: unknown; notes?: unknown }): Record<string, unknown> | null {
  const m = row?.metadata;
  if (m && typeof m === "object" && !Array.isArray(m)) return m as Record<string, unknown>;
  const n = parseNotes(row);
  const payload = n?.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

function parseNotes(row: { notes?: unknown }): Record<string, unknown> | null {
  const n = row?.notes;
  if (!n) return null;
  if (typeof n === "object" && !Array.isArray(n)) return n as Record<string, unknown>;
  if (typeof n === "string") {
    try {
      const o = JSON.parse(n) as unknown;
      return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function rowMatchesPracticeTestType(row: { test_type?: unknown; type?: unknown }, testType: string): boolean {
  return String(row?.test_type ?? "") === testType || String(row?.type ?? "") === testType;
}

function rowMatchesPuttingType(row: { type?: unknown }, practiceType: string): boolean {
  return String(row?.type ?? "") === practiceType;
}

/** Single numeric score + display for leaderboard / improvement math. */
export function extractPracticeScoreForHighlight(
  testType: string,
  row: { metadata?: unknown; notes?: unknown; test_type?: unknown; type?: unknown },
): { sortValue: number; display: string } | null {
  if (!rowMatchesPracticeTestType(row, testType)) return null;
  const ag = aggregatesFromPractice(row);
  const notes = parseNotes(row);
  const meta = metadataFromPractice(row) ?? undefined;

  if (testType === "aimpoint_6ft_combine") {
    const pct = num(ag?.calibration_score_pct);
    if (pct == null) return null;
    return { sortValue: pct, display: `${pct.toFixed(1)}%` };
  }
  if (testType === "slope_mid_20ft" || testType === "aimpoint_long_40ft") {
    const pct = num(ag?.calibration_accuracy_pct);
    if (pct == null) return null;
    return { sortValue: pct, display: `${pct.toFixed(1)}%` };
  }
  if (testType === "chipping_combine_9") {
    const pr = num(ag?.proximity_rating);
    if (pr != null) {
      const pct = pr <= 1 ? pr * 100 : pr;
      return { sortValue: pct, display: `${pct.toFixed(1)}%` };
    }
    const tp = num(ag?.total_points);
    if (tp != null) return { sortValue: tp, display: `${Math.round(tp)} pts` };
    return null;
  }
  if (testType === "wedge_lateral_9") {
    const recomputed = totalPointsFromWedgeShotsJson(meta?.shots);
    const stored = num(ag?.total_points);
    const tp = recomputed ?? stored;
    if (tp == null) return null;
    return { sortValue: tp, display: `${Math.round(tp)} pts` };
  }
  if (testType === "tee_shot_dispersion_combine") {
    const ts =
      num(meta?.total_score) ??
      num((ag as { total_score?: unknown } | null)?.total_score) ??
      num((ag as { total_points?: unknown } | null)?.total_points) ??
      num(notes?.total_score) ??
      num(notes?.total_points);
    if (ts == null) return null;
    return { sortValue: ts, display: `${Math.round(ts)} pts` };
  }
  if (testType === "bunker_9_hole_challenge") {
    const tp = num(ag?.total_points) ?? num(notes?.total_points);
    if (tp == null) return null;
    return { sortValue: tp, display: `${Math.round(tp)} pts` };
  }
  return null;
}

export type ParsedPuttingHole = {
  user_id: string;
  created_at: string;
  holeIndex: number;
  points: number;
};

export function parsePuttingHoleRow(row: {
  user_id?: unknown;
  created_at?: unknown;
  notes?: unknown;
}): ParsedPuttingHole | null {
  const uid = typeof row.user_id === "string" ? row.user_id : null;
  const created_at = typeof row.created_at === "string" ? row.created_at : null;
  if (!uid || !created_at) return null;
  const notes = parseNotes(row);
  if (!notes) return null;
  const hi = num(notes.holeIndex);
  const pts = num(notes.points);
  if (hi == null || pts == null) return null;
  return { user_id: uid, created_at, holeIndex: hi, points: pts };
}

/**
 * Group per-hole practice rows into completed rounds using hole index + time gap heuristics.
 */
export function clusterPuttingSessions(
  rows: ParsedPuttingHole[],
  lastHoleIndex: number,
): { user_id: string; created_at: string; totalPoints: number }[] {
  const GAP_MS = 3 * 60 * 60 * 1000;
  const byUser = new Map<string, ParsedPuttingHole[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }
  const sessions: { user_id: string; created_at: string; totalPoints: number }[] = [];
  for (const [, list] of byUser) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let cur: ParsedPuttingHole[] = [];
    const flush = () => {
      if (cur.length === 0) return;
      const totalPoints = cur.reduce((s, h) => s + h.points, 0);
      const created_at = cur[cur.length - 1].created_at;
      const user_id = cur[0].user_id;
      sessions.push({ user_id, created_at, totalPoints });
      cur = [];
    };
    for (const r of list) {
      const prev = cur[cur.length - 1];
      if (prev) {
        const dt = new Date(r.created_at).getTime() - new Date(prev.created_at).getTime();
        const newRoundStart = r.holeIndex === 0 && prev.holeIndex === lastHoleIndex;
        const longGap = dt > GAP_MS;
        if (newRoundStart || longGap) flush();
      }
      cur.push(r);
    }
    flush();
  }
  return sessions;
}

export function extractPracticeLogsScore(
  row: {
    log_type?: unknown;
    matrix_score_average?: unknown;
    score?: unknown;
    total_points?: unknown;
    strike_data?: unknown;
  },
  logType: string,
  scoreMode: "matrix_average" | "total_points",
): { sortValue: number; display: string } | null {
  const rowLogType = String(row?.log_type ?? "").trim().toLowerCase();
  const wantLogType = String(logType ?? "").trim().toLowerCase();
  const isIronWanted =
    wantLogType === "iron_precision_protocol" || wantLogType === "iron_precision_protocol_session";
  const logTypeMatches = isIronWanted
    ? rowLogType.includes("iron_precision_protocol") || rowLogType.includes("ironprecisionprotocol")
    : rowLogType === wantLogType;
  if (!logTypeMatches) return null;
  if (scoreMode === "matrix_average") {
    const m = num(row.matrix_score_average);
    if (m == null) return null;
    return { sortValue: m, display: `${m.toFixed(1)}` };
  }
  const recomputed = totalIronPointsFromStrikeData(row.strike_data);
  const stored = num(row.total_points);
  const tp = recomputed ?? stored ?? num(row.score);
  if (tp == null) return null;
  return { sortValue: tp, display: `${Math.round(tp)} pts` };
}

export type LeaderboardEntry = {
  userId: string;
  sortValue: number;
  display: string;
};

export function bestSessionPerUser(entries: LeaderboardEntry[], higherIsBetter: boolean): LeaderboardEntry[] {
  const best = new Map<string, LeaderboardEntry>();
  for (const e of entries) {
    const prev = best.get(e.userId);
    if (!prev) {
      best.set(e.userId, e);
      continue;
    }
    const better = higherIsBetter
      ? e.sortValue > prev.sortValue
      : e.sortValue < prev.sortValue;
    if (better) best.set(e.userId, e);
  }
  return Array.from(best.values());
}

export function sortLeaderboardEntries(entries: LeaderboardEntry[], higherIsBetter: boolean): LeaderboardEntry[] {
  return [...entries].sort((a, b) =>
    higherIsBetter ? b.sortValue - a.sortValue : a.sortValue - b.sortValue,
  );
}

export type ImprovementWinner = {
  userId: string;
  delta: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Latest session in the last 7 days vs average of up to 3 immediately prior sessions (chronological).
 */
export function computeMostImproved(
  sessions: { userId: string; created_at: string; sortValue: number }[],
  higherIsBetter: boolean,
  nowMs: number = Date.now(),
): ImprovementWinner | null {
  const windowStart = nowMs - WEEK_MS;
  const byUser = new Map<string, { userId: string; created_at: string; sortValue: number }[]>();
  for (const s of sessions) {
    const list = byUser.get(s.userId) ?? [];
    list.push(s);
    byUser.set(s.userId, list);
  }
  let best: ImprovementWinner | null = null;
  for (const [, list] of byUser) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (list.length < 2) continue;
    const latest = list[list.length - 1];
    const latestMs = new Date(latest.created_at).getTime();
    if (latestMs < windowStart) continue;
    const prev = list.slice(-4, -1);
    if (prev.length === 0) continue;
    const avgPrev = prev.reduce((s, x) => s + x.sortValue, 0) / prev.length;
    const delta = higherIsBetter ? latest.sortValue - avgPrev : avgPrev - latest.sortValue;
    if (!Number.isFinite(delta) || delta <= 0) continue;
    if (!best || delta > best.delta) {
      best = { userId: latest.userId, delta };
    }
  }
  return best;
}

export function formatImprovementLine(
  name: string,
  delta: number,
  unit: CombineHighlightDefinition["improvementUnit"],
): string {
  if (unit === "percent") {
    return `🔥 ${name} improved by ${delta.toFixed(1)}% this week!`;
  }
  if (unit === "index") {
    return `🔥 ${name} improved by ${delta.toFixed(1)} index pts this week!`;
  }
  return `🔥 ${name} improved by ${Math.round(delta)} points this week!`;
}
