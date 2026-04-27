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
import { survival20Config } from "@/lib/survival20Config";
import { ironFaceControlConfig } from "@/lib/ironFaceControlConfig";
import { threeStrikesWedgeConfig } from "@/lib/threeStrikesWedgeConfig";
import { bunkerProximityProtocolConfig } from "@/lib/bunkerProximityProtocolConfig";

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
  | "gauntletBlackLabel"
  | "flop_shot"
  | "chipping"
  | "survival_20"
  | "iron_face_control"
  | "three_strikes"
  | "bunker_protocol";

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
  {
    id: "flop_shot",
    label: "Flop Shot Combine",
    source: "practice_logs",
    higherIsBetter: true,
    scoreHeader: "Total Pts",
  },
  {
    id: "chipping",
    label: "Standard Chipping",
    source: "practice_logs",
    higherIsBetter: true,
    scoreHeader: "Total Pts",
  },
  {
    id: "survival_20",
    label: survival20Config.testName,
    source: "practice_logs",
    higherIsBetter: true,
    scoreHeader: "Shots survived",
  },
  {
    id: "iron_face_control",
    label: ironFaceControlConfig.testName,
    source: "practice_logs",
    higherIsBetter: true,
    scoreHeader: "Score (/100)",
  },
  {
    id: "three_strikes",
    label: threeStrikesWedgeConfig.testName,
    source: "practice_logs",
    higherIsBetter: true,
    scoreHeader: "Hits",
  },
  {
    id: "bunker_protocol",
    label: bunkerProximityProtocolConfig.testName,
    source: "practice_logs",
    higherIsBetter: true,
    scoreHeader: "Score",
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
  const m = metadataFromPractice(row);
  if (!m || typeof m !== "object") return null;
  const ag = (m as { aggregates?: unknown }).aggregates;
  if (!ag || typeof ag !== "object") return null;
  return ag as Record<string, unknown>;
}

function parseNotesObject(row: any): Record<string, unknown> | null {
  const n = row?.notes;
  if (!n) return null;
  if (typeof n === "object" && !Array.isArray(n)) return n as Record<string, unknown>;
  if (typeof n === "string") {
    try {
      const p = JSON.parse(n) as unknown;
      return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function metadataFromPractice(row: any): Record<string, unknown> | null {
  const direct = row?.metadata;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  const notes = parseNotesObject(row);
  const payload = notes?.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
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
  | "flop_shot"
  | "chipping"
  | "survival_20"
  | "iron_face_control"
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
    const meta = metadataFromPractice(row) ?? undefined;
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
    const accepted = new Set(
      [
        ironPrecisionProtocolConfig.practiceLogType,
        "iron_precision_protocol",
        "ironPrecisionProtocol",
      ].map((v) => v.toLowerCase()),
    );
    const rows = (practiceLogs || []).filter(
      (r) => {
        const lt = String(r?.log_type ?? "").trim().toLowerCase();
        // Different product: "Iron Skills" combine logs `iron_skills`, not The Iron Precision Protocol.
        if (lt === "iron_skills") return false;
        if (accepted.has(lt)) return true;
        // Backward/forward compatible matcher for suffixed variants.
        return lt.includes("iron_precision_protocol") || lt.includes("ironprecisionprotocol");
      },
    );
    for (const row of rows) {
      if (!rowInTimeWindow({ created_at: row.created_at }, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const recomputed = totalIronPointsFromStrikeData(row.strike_data);
      const stored = num(row.total_points);
      const scoreOnly = num(row.score);
      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null;
      const metaPts = meta ? num(meta.total_points) : null;
      let tp = recomputed ?? stored ?? scoreOnly ?? metaPts;
      if (tp == null) {
        const avg = num(row.matrix_score_average);
        if (avg != null) tp = avg * ironPrecisionProtocolConfig.clubSequence.length;
      }
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
          display: `${tp.toFixed(1)} Pts`,
          dateMs,
        });
      }
    }
    // Backward-compatible fallback: some older deployments stored iron protocol sessions in `practice`.
    const practiceRows = (practiceSessions || []).filter((r) => {
      const tt = String(r?.test_type ?? r?.type ?? "").trim().toLowerCase();
      return tt.includes("iron_precision_protocol") || tt.includes("ironprecisionprotocol");
    });
    for (const row of practiceRows) {
      if (!rowInTimeWindow(row, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const ag = aggregatesFromPractice(row);
      const notes = parseNotesObject(row);
      let tp =
        num(ag?.total_points) ??
        num((row as { total_points?: unknown }).total_points) ??
        num(notes?.total_points);
      if (tp == null) {
        const avg =
          num(ag?.matrix_score_average) ??
          num(notes?.matrix_score_average) ??
          num((row as { matrix_score_average?: unknown }).matrix_score_average);
        if (avg != null) tp = avg * ironPrecisionProtocolConfig.clubSequence.length;
      }
      if (tp == null) continue;
      const dateMs =
        parseLeaderboardEventMs((row as { completed_at?: string }).completed_at) ??
        parseLeaderboardEventMs(row.created_at) ??
        0;
      const prev = bestByUser.get(uid);
      const better = !prev || tp > prev.sortValue || (tp === prev.sortValue && dateMs > prev.dateMs);
      if (better) {
        bestByUser.set(uid, {
          sortValue: tp,
          display: `${tp.toFixed(1)} Pts`,
          dateMs,
        });
      }
    }
  } else if (testId === "flop_shot") {
    const rows = (practiceLogs || []).filter(
      (r) => String(r?.log_type ?? "").trim().toLowerCase() === "flop_shot",
    );
    for (const row of rows) {
      if (!rowInTimeWindow({ created_at: row.created_at }, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const tp = num(row.score) ?? num(row.total_points);
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
          display: `${tp.toFixed(1)} Pts`,
          dateMs,
        });
      }
    }
  } else if (testId === "chipping") {
    const rows = (practiceLogs || []).filter((r) => {
      if (String(r?.log_type ?? "").trim().toLowerCase() !== "chipping") return false;
      const st =
        r.sub_type != null && String(r.sub_type).trim() !== ""
          ? String(r.sub_type).trim().toLowerCase()
          : null;
      return st === "standard" || st === null;
    });
    for (const row of rows) {
      if (!rowInTimeWindow({ created_at: row.created_at }, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const tp = num(row.score) ?? num(row.total_points);
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
          display: `${tp.toFixed(1)} Pts`,
          dateMs,
        });
      }
    }
  } else if (testId === "survival_20") {
    const want = survival20Config.practiceLogType.toLowerCase();
    const rows = (practiceLogs || []).filter(
      (r) => String(r?.log_type ?? "").trim().toLowerCase() === want,
    );
    for (const row of rows) {
      if (!rowInTimeWindow({ created_at: row.created_at }, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const tp = num(row.score) ?? num(row.total_points);
      if (tp == null || tp < 0) continue;
      const dateMs = parseLeaderboardEventMs(row.created_at) ?? 0;
      const prev = bestByUser.get(uid);
      const better =
        !prev ||
        tp > prev.sortValue ||
        (tp === prev.sortValue && dateMs > prev.dateMs);
      if (better) {
        bestByUser.set(uid, {
          sortValue: tp,
          display: `${Math.round(tp)} shots`,
          dateMs,
        });
      }
    }
  } else if (testId === "iron_face_control") {
    const want = ironFaceControlConfig.practiceLogType.toLowerCase();
    const rows = (practiceLogs || []).filter(
      (r) => String(r?.log_type ?? "").trim().toLowerCase() === want,
    );
    for (const row of rows) {
      if (!rowInTimeWindow({ created_at: row.created_at }, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const tp = num(row.score) ?? num(row.total_points);
      if (tp == null || tp < 0 || tp > ironFaceControlConfig.maxSessionPoints) continue;
      const dateMs = parseLeaderboardEventMs(row.created_at) ?? 0;
      const prev = bestByUser.get(uid);
      const better =
        !prev ||
        tp > prev.sortValue ||
        (tp === prev.sortValue && dateMs > prev.dateMs);
      if (better) {
        bestByUser.set(uid, {
          sortValue: tp,
          display: `${Math.round(tp)} / 100`,
          dateMs,
        });
      }
    }
  } else if (testId === "three_strikes") {
    const want = threeStrikesWedgeConfig.practiceLogType.toLowerCase();
    const rows = (practiceLogs || []).filter(
      (r) => String(r?.log_type ?? "").trim().toLowerCase() === want,
    );
    for (const row of rows) {
      if (!rowInTimeWindow({ created_at: row.created_at }, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const tp = num(row.score) ?? num(row.total_points);
      if (tp == null || tp < 0) continue;
      const dateMs = parseLeaderboardEventMs(row.created_at) ?? 0;
      const prev = bestByUser.get(uid);
      const better =
        !prev ||
        tp > prev.sortValue ||
        (tp === prev.sortValue && dateMs > prev.dateMs);
      if (better) {
        bestByUser.set(uid, {
          sortValue: tp,
          display: `${Math.round(tp)} Hits`,
          dateMs,
        });
      }
    }
  } else if (testId === "bunker_protocol") {
    const want = bunkerProximityProtocolConfig.practiceLogType.toLowerCase();
    const rows = (practiceLogs || []).filter(
      (r) => String(r?.log_type ?? "").trim().toLowerCase() === want,
    );
    for (const row of rows) {
      if (!rowInTimeWindow({ created_at: row.created_at }, timeFilter)) continue;
      const uid = row.user_id;
      if (!uid) continue;
      const tp = num(row.score) ?? num(row.total_points);
      if (tp == null) continue;
      const dateMs = parseLeaderboardEventMs(row.created_at) ?? 0;
      const prev = bestByUser.get(uid);
      const better = !prev || tp > prev.sortValue || (tp === prev.sortValue && dateMs > prev.dateMs);
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
