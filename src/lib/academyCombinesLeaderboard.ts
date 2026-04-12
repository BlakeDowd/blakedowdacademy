import { gauntletPrecisionProtocolConfig } from "@/lib/gauntletPrecisionProtocolConfig";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import { totalPointsFromWedgeShotsJson } from "@/lib/wedgeLateral9Analytics";
import { totalIronPointsFromStrikeData } from "@/lib/ironPrecisionScoring";
import { puttingTestConfig } from "@/lib/puttingTestConfig";
import { puttingTest9Config } from "@/lib/puttingTest9Config";
import { puttingTest3To6ftConfig } from "@/lib/puttingTest3To6ftConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";
import {
  type LeaderboardTimeFilter,
  parseLeaderboardEventMs,
  rowInTimeWindow,
} from "@/lib/leaderboardTimeWindow";

export type CombineLeaderboardTestId =
  | "gauntlet"
  | "ironPrecisionProtocol"
  | "aimpoint_6ft_combine"
  | "slope_mid_20ft"
  | "aimpoint_long_40ft"
  | "chipping_combine_9"
  | "wedge_lateral_9"
  | "puttingCombine"
  | "puttingTest9Holes"
  | "puttingTest3To6ft"
  | "puttingTest8To20"
  | "puttingTest20To40"
  | "gauntletBlackLabel";

/** Resolved in Academy via getLeaderboardData — practice table builder skips these. */
const LEADERBOARD_DRIVEN_COMBINE_IDS: CombineLeaderboardTestId[] = [
  "puttingCombine",
  "puttingTest9Holes",
  "puttingTest3To6ft",
  "puttingTest8To20",
  "puttingTest20To40",
  "gauntletBlackLabel",
];

export function isLeaderboardDrivenCombineId(id: CombineLeaderboardTestId): boolean {
  return LEADERBOARD_DRIVEN_COMBINE_IDS.includes(id);
}

export type CombineLeaderboardTestOption = {
  id: CombineLeaderboardTestId;
  /** Title Case label */
  label: string;
  source: "practice" | "practice_logs";
  /** Higher numeric sort value = better rank when higherIsBetter */
  higherIsBetter: boolean;
  /** Column header hint */
  scoreHeader: string;
};

export const COMBINE_LEADERBOARD_OPTIONS: CombineLeaderboardTestOption[] = [
  {
    id: "gauntlet",
    label: `${gauntletPrecisionProtocolConfig.testName} (Session Points)`,
    source: "practice_logs",
    higherIsBetter: false,
    scoreHeader: "Points",
  },
  {
    id: "ironPrecisionProtocol",
    label: ironPrecisionProtocolConfig.testName,
    source: "practice_logs",
    higherIsBetter: true,
    scoreHeader: "Total Pts",
  },
  {
    id: "aimpoint_6ft_combine",
    label: "Aimpoint 6Ft Combine",
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Accuracy %",
  },
  {
    id: "slope_mid_20ft",
    label: "8-20Ft Aimpoint Combine",
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Accuracy %",
  },
  {
    id: "aimpoint_long_40ft",
    label: "Aimpoint Long-Range (20-40Ft)",
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Accuracy %",
  },
  {
    id: "chipping_combine_9",
    label: "9-Hole Chipping Combine",
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Accuracy %",
  },
  {
    id: "wedge_lateral_9",
    label: wedgeLateral9Config.testName,
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Total Pts",
  },
  {
    id: "puttingCombine",
    label: puttingTestConfig.testName,
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Test Pts",
  },
  {
    id: "puttingTest9Holes",
    label: puttingTest9Config.testName,
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Test Pts",
  },
  {
    id: "puttingTest3To6ft",
    label: puttingTest3To6ftConfig.testName,
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Test Pts",
  },
  {
    id: "puttingTest8To20",
    label: puttingTest8To20Config.testName,
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Test Pts",
  },
  {
    id: "puttingTest20To40",
    label: puttingTest20To40Config.testName,
    source: "practice",
    higherIsBetter: true,
    scoreHeader: "Test Pts",
  },
  {
    id: "gauntletBlackLabel",
    label: `${gauntletPrecisionProtocolConfig.blackLabelLeaderboardTitle} — Perfect Putts`,
    source: "practice_logs",
    higherIsBetter: true,
    scoreHeader: "Perfect Putts",
  },
];

export type AcademyCombineLeaderboardRow = {
  userId: string;
  name: string;
  scoreDisplay: string;
  sortValue: number;
  dateMs: number;
  dateLabel: string;
  isCurrentUser: boolean;
};

function aggregatesFromPractice(row: any): Record<string, unknown> | null {
  const m = row?.metadata;
  if (!m || typeof m !== "object") return null;
  const ag = (m as { aggregates?: unknown }).aggregates;
  if (!ag || typeof ag !== "object") return null;
  return ag as Record<string, unknown>;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type PracticeMetadataCombineId = Exclude<
  CombineLeaderboardTestId,
  | "gauntlet"
  | "ironPrecisionProtocol"
  | "puttingCombine"
  | "puttingTest9Holes"
  | "puttingTest3To6ft"
  | "puttingTest8To20"
  | "puttingTest20To40"
  | "gauntletBlackLabel"
>;

function extractPracticeScore(
  testId: PracticeMetadataCombineId,
  row: any,
): { sortValue: number; display: string } | null {
  const ag = aggregatesFromPractice(row);
  const testType = String(row?.test_type ?? row?.type ?? "");
  if (testType !== testId) return null;

  if (testId === "aimpoint_6ft_combine") {
    const pct = num(ag?.calibration_score_pct);
    if (pct == null) return null;
    return { sortValue: pct, display: `${pct.toFixed(1)}%` };
  }
  if (testId === "slope_mid_20ft" || testId === "aimpoint_long_40ft") {
    const pct = num(ag?.calibration_accuracy_pct);
    if (pct == null) return null;
    return { sortValue: pct, display: `${pct.toFixed(1)}%` };
  }
  if (testId === "chipping_combine_9") {
    const pr = num(ag?.proximity_rating);
    if (pr != null) {
      const pct = pr <= 1 ? pr * 100 : pr;
      return { sortValue: pct, display: `${pct.toFixed(1)}%` };
    }
    const tp = num(ag?.total_points);
    if (tp != null) return { sortValue: tp, display: `${Math.round(tp)} Pts` };
    return null;
  }
  if (testId === "wedge_lateral_9") {
    const meta = row?.metadata as Record<string, unknown> | undefined;
    const recomputed = totalPointsFromWedgeShotsJson(meta?.shots);
    const stored = num(ag?.total_points);
    const tp = recomputed ?? stored;
    if (tp != null) return { sortValue: tp, display: `${Math.round(tp)} Pts` };
    return null;
  }
  return null;
}

function formatDateLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function buildAcademyCombinesLeaderboard(
  testId: CombineLeaderboardTestId,
  practiceSessions: any[] | undefined,
  practiceLogs: any[] | undefined,
  userProfiles: Map<string, { full_name?: string; preferred_icon_id?: string; xp?: number }>,
  timeFilter: LeaderboardTimeFilter,
  currentUserId: string | undefined,
): AcademyCombineLeaderboardRow[] {
  const bestByUser = new Map<
    string,
    { sortValue: number; display: string; dateMs: number }
  >();

  if (isLeaderboardDrivenCombineId(testId)) {
    return [];
  }

  if (testId === "gauntlet") {
    const rows = (practiceLogs || []).filter(
      (r) => String(r?.log_type ?? "") === gauntletPrecisionProtocolConfig.practiceLogType,
    );
    for (const row of rows) {
      if (!rowInTimeWindow({ created_at: row.created_at }, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const pts = num(row.matrix_score_average);
      if (pts == null) continue;
      const dateMs = parseLeaderboardEventMs(row.created_at) ?? 0;
      const prev = bestByUser.get(uid);
      const better =
        !prev ||
        pts < prev.sortValue ||
        (pts === prev.sortValue && dateMs > prev.dateMs);
      if (better) {
        bestByUser.set(uid, {
          sortValue: pts,
          display: `${pts.toFixed(1)} Pts`,
          dateMs,
        });
      }
    }
  } else if (testId === "ironPrecisionProtocol") {
    const rows = (practiceLogs || []).filter(
      (r) => String(r?.log_type ?? "") === ironPrecisionProtocolConfig.practiceLogType,
    );
    for (const row of rows) {
      if (!rowInTimeWindow({ created_at: row.created_at }, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const recomputed = totalIronPointsFromStrikeData(row.strike_data);
      const stored = num(row.total_points);
      const tp = recomputed ?? stored;
      if (tp == null) continue;
      const dateMs = parseLeaderboardEventMs(row.created_at) ?? 0;
      const prev = bestByUser.get(uid);
      const better =
        !prev ||
        tp > prev.sortValue ||
        (tp === prev.sortValue && dateMs > prev.dateMs);
      if (better) {
        bestByUser.set(uid, {
          sortValue: tp,
          display: `${Math.round(tp)} Pts`,
          dateMs,
        });
      }
    }
  } else {
    for (const row of practiceSessions || []) {
      if (!rowInTimeWindow(row, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const extracted = extractPracticeScore(testId as PracticeMetadataCombineId, row);
      if (!extracted) continue;
      const dateMs = parseLeaderboardEventMs(row.completed_at) ?? parseLeaderboardEventMs(row.created_at) ?? 0;
      const prev = bestByUser.get(uid);
      const better =
        !prev ||
        extracted.sortValue > prev.sortValue ||
        (extracted.sortValue === prev.sortValue && dateMs > prev.dateMs);
      if (better) {
        bestByUser.set(uid, {
          sortValue: extracted.sortValue,
          display: extracted.display,
          dateMs,
        });
      }
    }
  }

  const out: AcademyCombineLeaderboardRow[] = [];
  bestByUser.forEach((best, userId) => {
    const profile = userProfiles.get(userId);
    const name = profile?.full_name?.trim() || "Academy Member";
    out.push({
      userId,
      name,
      scoreDisplay: best.display,
      sortValue: best.sortValue,
      dateMs: best.dateMs,
      dateLabel: formatDateLabel(best.dateMs),
      isCurrentUser: currentUserId === userId,
    });
  });

  const higher = testId !== "gauntlet";
  out.sort((a, b) => {
    if (higher) {
      if (b.sortValue !== a.sortValue) return b.sortValue - a.sortValue;
    } else {
      if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
    }
    if (b.dateMs !== a.dateMs) return b.dateMs - a.dateMs;
    return a.name.localeCompare(b.name);
  });

  return out;
}
