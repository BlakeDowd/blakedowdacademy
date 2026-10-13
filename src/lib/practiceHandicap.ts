import {
  COMBINE_LEADERBOARD_OPTIONS,
  collectCombineAttempts,
  type CombineLeaderboardTestId,
} from "@/lib/academyCombinesLeaderboard";
import {
  clusteredPuttingSessionTotals,
  isCompletePutting9Session,
  isCompletePuttingCombineSession,
  isCompletePuttingTest20To40Session,
  isCompletePuttingTest3To6ftSession,
  isCompletePuttingTest8To20Session,
  parsePutting9HoleSession,
  parsePuttingHoleSession,
  parsePuttingTest20To40Session,
  parsePuttingTest3To6ftSession,
  parsePuttingTest8To20Session,
  type ParsedPuttingHole,
} from "@/lib/puttingTestLeaderboard";
import {
  GAME_AREAS,
  PRACTICE_HANDICAP_BENCHMARKS,
  handicapFromScore,
  type BenchmarkAnchors,
  type GameArea,
} from "@/lib/practiceHandicapBenchmarks";

/** Coach-edited anchors by combine; combines missing from it use the defaults. */
export type BenchmarkOverrides = ReadonlyMap<CombineLeaderboardTestId, BenchmarkAnchors>;

/** Each combine is scored on the average of this many most recent attempts. */
export const PRACTICE_HANDICAP_RECENT_ATTEMPTS = 3;
/** Shots between practice and playing handicap before we call it a gap. */
export const PRACTICE_HANDICAP_GAP = 3;

export type CombineHandicap = {
  id: CombineLeaderboardTestId;
  label: string;
  /** Attempts used for the average (up to PRACTICE_HANDICAP_RECENT_ATTEMPTS). */
  attempts: number;
  averageDisplay: string;
  handicap: number;
};

export type AreaHandicap = {
  area: GameArea;
  label: string;
  /** null when no combine in this area has been done */
  handicap: number | null;
  combines: CombineHandicap[];
};

export type PracticeHandicap = {
  /** Plain average of the tested areas; null when nothing has been tested */
  overall: number | null;
  areas: AreaHandicap[];
  testedAreas: number;
};

type Attempt = { score: number; dateMs: number };
type Row = { user_id?: unknown } & Record<string, unknown>;

const PUTTING_SOURCES: Partial<
  Record<
    CombineLeaderboardTestId,
    { parse: (s: Row) => ParsedPuttingHole | null; complete: (h: ParsedPuttingHole[]) => boolean }
  >
> = {
  puttingCombine: { parse: parsePuttingHoleSession, complete: isCompletePuttingCombineSession },
  puttingTest9Holes: { parse: parsePutting9HoleSession, complete: isCompletePutting9Session },
  puttingTest3To6ft: { parse: parsePuttingTest3To6ftSession, complete: isCompletePuttingTest3To6ftSession },
  puttingTest8To20: { parse: parsePuttingTest8To20Session, complete: isCompletePuttingTest8To20Session },
  puttingTest20To40: { parse: parsePuttingTest20To40Session, complete: isCompletePuttingTest20To40Session },
};

const PERCENT_COMBINES = new Set<CombineLeaderboardTestId>([
  "aimpoint_6ft_combine",
  "slope_mid_20ft",
  "aimpoint_long_40ft",
  "chipping_combine_9",
]);

function playerAttempts(
  id: CombineLeaderboardTestId,
  playerId: string,
  sessions: Row[],
  logs: Row[],
): Attempt[] {
  const putting = PUTTING_SOURCES[id];
  if (putting) {
    const holes: ParsedPuttingHole[] = [];
    for (const s of sessions) {
      if (s?.user_id !== playerId) continue;
      const h = putting.parse(s);
      if (h) holes.push(h);
    }
    return clusteredPuttingSessionTotals(holes, putting.complete)
      .filter((t) => t.score > 0)
      .map((t) => ({ score: t.score, dateMs: t.sessionEndMs }));
  }

  const higherIsBetter = COMBINE_LEADERBOARD_OPTIONS.find((o) => o.id === id)?.higherIsBetter ?? true;
  return collectCombineAttempts(id, sessions, logs, "allTime")
    .filter((a) => a.userId === playerId)
    // Older 9-hole chipping rows saved raw points instead of a percentage.
    .filter((a) => id !== "chipping_combine_9" || a.display.endsWith("%"))
    .map((a) => ({ score: higherIsBetter ? a.sortValue : -a.sortValue, dateMs: a.dateMs }));
}

/** Unit the combine's benchmark scores are in. */
export function benchmarkUnit(id: CombineLeaderboardTestId): string {
  if (PERCENT_COMBINES.has(id)) return "%";
  if (id === "bunker_lies") return "strokes";
  if (id === "survival_20") return "shots";
  if (id === "three_strikes") return "hits";
  return "pts";
}

function formatAverage(id: CombineLeaderboardTestId, avg: number): string {
  const unit = benchmarkUnit(id);
  const value = Math.round(avg * 10) / 10;
  return unit === "%" ? `${value.toFixed(1)}%` : `${value} ${unit}`;
}

const average = (values: number[]) => values.reduce((a, v) => a + v, 0) / values.length;

export type CombineAverage = Omit<CombineHandicap, "handicap"> & {
  /** Average of the recent attempts, in the benchmark's units */
  average: number;
};

/** A player's recent average on every combine that feeds the practice handicap. */
export function recentCombineAverages(
  playerId: string,
  practiceSessions: Row[] | null | undefined,
  practiceLogs: Row[] | null | undefined,
): CombineAverage[] {
  const sessions = practiceSessions ?? [];
  const logs = practiceLogs ?? [];
  const out: CombineAverage[] = [];
  for (const opt of COMBINE_LEADERBOARD_OPTIONS) {
    if (!PRACTICE_HANDICAP_BENCHMARKS[opt.id]) continue;
    const recent = playerAttempts(opt.id, playerId, sessions, logs)
      .sort((a, b) => b.dateMs - a.dateMs)
      .slice(0, PRACTICE_HANDICAP_RECENT_ATTEMPTS);
    if (recent.length === 0) continue;
    const avg = average(recent.map((a) => a.score));
    out.push({
      id: opt.id,
      label: opt.label,
      attempts: recent.length,
      average: avg,
      averageDisplay: formatAverage(opt.id, avg),
    });
  }
  return out;
}

export function benchmarkAnchorsFor(
  id: CombineLeaderboardTestId,
  overrides?: BenchmarkOverrides,
): BenchmarkAnchors | null {
  return overrides?.get(id) ?? PRACTICE_HANDICAP_BENCHMARKS[id]?.anchors ?? null;
}

/** Area handicaps and the overall practice handicap, using coach overrides where set. */
export function scorePracticeHandicap(averages: CombineAverage[], overrides?: BenchmarkOverrides): PracticeHandicap {
  const byArea = new Map<GameArea, CombineHandicap[]>();
  for (const { average: avg, ...c } of averages) {
    const bench = PRACTICE_HANDICAP_BENCHMARKS[c.id];
    const anchors = benchmarkAnchorsFor(c.id, overrides);
    if (!bench || !anchors) continue;
    const list = byArea.get(bench.area) ?? [];
    list.push({ ...c, handicap: handicapFromScore(anchors, avg) });
    byArea.set(bench.area, list);
  }

  const areas: AreaHandicap[] = GAME_AREAS.map(({ id, label }) => {
    const combines = byArea.get(id) ?? [];
    return {
      area: id,
      label,
      handicap: combines.length ? average(combines.map((c) => c.handicap)) : null,
      combines,
    };
  });
  const tested = areas.flatMap((a) => (a.handicap == null ? [] : [a.handicap]));
  return {
    overall: tested.length ? average(tested) : null,
    areas,
    testedAreas: tested.length,
  };
}

export function formatHandicap(h: number): string {
  const r = Math.round(h * 10) / 10;
  return r < 0 ? `+${Math.abs(r).toFixed(1)}` : r.toFixed(1);
}

/** The tested area with the highest handicap. */
export function weakestArea(practice: PracticeHandicap): AreaHandicap | null {
  return practice.areas.filter((a) => a.handicap != null).sort((a, b) => b.handicap! - a.handicap!)[0] ?? null;
}

export type HandicapVerdict = {
  kind: "mental" | "skill" | "overachiever";
  title: string;
  detail: string;
};

/**
 * Compares practice and playing handicaps. `name` is the player's first name, or null when the
 * player is reading about themself.
 */
export function practiceHandicapVerdict(
  practice: PracticeHandicap,
  playing: number | null,
  name: string | null,
): HandicapVerdict | null {
  if (practice.overall == null || playing == null) return null;
  const gap = playing - practice.overall;
  const shots = Math.round(Math.abs(gap));
  const weakest = weakestArea(practice);
  const weakestText = weakest ? `${weakest.label} (${formatHandicap(weakest.handicap!)})` : "the weakest area";
  const you = name ?? "you";
  const your = name ? `${name}'s` : "your";
  const Your = name ? `${name}'s` : "Your";

  if (gap >= PRACTICE_HANDICAP_GAP) {
    return {
      kind: "mental",
      title: "Skills are ahead of scores",
      detail: `${Your} practice game plays to ${formatHandicap(practice.overall)}, but ${you} ${name ? "plays" : "play"} off ${formatHandicap(playing)}. About ${shots} shots a round are being lost on the course, so look at the mental game, strategy and course management.`,
    };
  }
  if (gap <= -PRACTICE_HANDICAP_GAP) {
    return {
      kind: "overachiever",
      title: "Scoring better than the tests",
      detail: `${name ? `${name} plays` : "You play"} off ${formatHandicap(playing)} but ${your} practice tests come out at ${formatHandicap(practice.overall)}, so ${you} ${name ? "is" : "are"} scoring well on the course. Building skill is where the next shots come from, starting with ${weakestText}.`,
    };
  }
  return {
    kind: "skill",
    title: "Skill is the limiter",
    detail: `${Your} practice and playing handicaps line up, so the next level comes from building skill. Biggest gain: ${weakestText}.`,
  };
}
