import {
  COMBINE_LEADERBOARD_OPTIONS,
  buildAcademyCombinesLeaderboard,
  isLeaderboardDrivenCombineId,
  type CombineLeaderboardTestId,
} from "@/lib/academyCombinesLeaderboard";
import { computeBestGauntletSessionForUser } from "@/lib/gauntletLeaderboard";
import { puttingTest9Config } from "@/lib/puttingTest9Config";
import { puttingTest3To6ftConfig } from "@/lib/puttingTest3To6ftConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";
import {
  parsePuttingHoleSession,
  bestPuttingCombineScoreForUser,
  parsePutting9HoleSession,
  bestPutting9HolesScoreForUser,
  parsePuttingTest3To6ftSession,
  bestPuttingTest3To6ftScoreForUser,
  parsePuttingTest8To20Session,
  bestPuttingTest8To20ScoreForUser,
  parsePuttingTest20To40Session,
  bestPuttingTest20To40ScoreForUser,
  type ParsedPuttingHole,
} from "@/lib/puttingTestLeaderboard";

export type CoachCombineSnapshotRow = {
  id: CombineLeaderboardTestId;
  label: string;
  /** null when the player has no qualifying session for this combine */
  scoreDisplay: string | null;
};

function formatDrivenScore(id: CombineLeaderboardTestId, value: number): string {
  if (id === "gauntletBlackLabel") {
    const n = Math.round(value);
    return `${n} perfect putt${n === 1 ? "" : "s"}`;
  }
  if (
    id === "puttingCombine" ||
    id === "puttingTest9Holes" ||
    id === "puttingTest3To6ft" ||
    id === "puttingTest8To20" ||
    id === "puttingTest20To40"
  ) {
    return `${Math.round(value)} pts`;
  }
  return String(value);
}

function puttingDrivenBest(id: CombineLeaderboardTestId, sessions: any[]): number | null {
  if (id === "gauntletBlackLabel") return null;
  const collect = (parse: (s: any) => ParsedPuttingHole | null, filter: (s: any) => boolean): ParsedPuttingHole[] => {
    const holes: ParsedPuttingHole[] = [];
    for (const s of sessions) {
      if (!filter(s)) continue;
      const p = parse(s);
      if (p) holes.push(p);
    }
    return holes;
  };

  switch (id) {
    case "puttingCombine": {
      const holes = collect(parsePuttingHoleSession, (s) => String(s.type || "").toLowerCase() === "putting-test");
      const b = bestPuttingCombineScoreForUser(holes);
      return b > 0 ? b : null;
    }
    case "puttingTest9Holes": {
      const holes = collect(
        parsePutting9HoleSession,
        (s) => String(s.type || "") === puttingTest9Config.practiceType,
      );
      const b = bestPutting9HolesScoreForUser(holes);
      return b > 0 ? b : null;
    }
    case "puttingTest3To6ft": {
      const holes = collect(
        parsePuttingTest3To6ftSession,
        (s) => String(s.type || "") === puttingTest3To6ftConfig.practiceType,
      );
      const b = bestPuttingTest3To6ftScoreForUser(holes);
      return b > 0 ? b : null;
    }
    case "puttingTest8To20": {
      const holes = collect(
        parsePuttingTest8To20Session,
        (s) => String(s.type || "") === puttingTest8To20Config.practiceType,
      );
      const b = bestPuttingTest8To20ScoreForUser(holes);
      return b > 0 ? b : null;
    }
    case "puttingTest20To40": {
      const holes = collect(
        parsePuttingTest20To40Session,
        (s) => String(s.type || "") === puttingTest20To40Config.practiceType,
      );
      const b = bestPuttingTest20To40ScoreForUser(holes);
      return b > 0 ? b : null;
    }
    default:
      return null;
  }
}

/**
 * Best logged combine result per Academy test for a single player (all time, in-memory).
 */
export function buildCoachPlayerCombineSnapshot(
  playerId: string,
  playerName: string,
  practiceSessions: any[] | null | undefined,
  practiceLogs: any[] | null | undefined,
): CoachCombineSnapshotRow[] {
  const sessions = (practiceSessions || []).filter((s) => s?.user_id === playerId);
  const logs = (practiceLogs || []).filter((l) => l?.user_id === playerId);
  const profileMap = new Map([[playerId, { full_name: playerName || "Player" }]]);

  const rows: CoachCombineSnapshotRow[] = [];

  for (const opt of COMBINE_LEADERBOARD_OPTIONS) {
    if (opt.id === "gauntletBlackLabel") {
      const st = computeBestGauntletSessionForUser(logs, playerId, "allTime");
      rows.push({
        id: opt.id,
        label: opt.label,
        scoreDisplay:
          st && st.perfect > 0 ? formatDrivenScore("gauntletBlackLabel", st.perfect) : null,
      });
      continue;
    }

    if (isLeaderboardDrivenCombineId(opt.id)) {
      const raw = puttingDrivenBest(opt.id, sessions);
      rows.push({
        id: opt.id,
        label: opt.label,
        scoreDisplay: raw != null && raw > 0 ? formatDrivenScore(opt.id, raw) : null,
      });
      continue;
    }

    const lb = buildAcademyCombinesLeaderboard(
      opt.id,
      sessions,
      logs,
      profileMap,
      "allTime",
      playerId,
    );
    const mine = lb.find((r) => r.userId === playerId);
    rows.push({
      id: opt.id,
      label: opt.label,
      scoreDisplay: mine?.scoreDisplay ?? null,
    });
  }

  return rows;
}
