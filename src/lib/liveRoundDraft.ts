/** Live round in-progress data (saved locally while playing). */

export type LiveFirResult = "left" | "hit" | "right" | "na";

export type LiveHoleEntry = {
  hole: number;
  strokes: number | null;
  putts: number;
  fir: LiveFirResult | null;
  gir: boolean | null;
  penalties: number;
};

export type LiveRoundSetup = {
  date: string;
  course: string;
  handicap: number | null;
  holes: 9 | 18;
};

export type LiveRoundDraft = {
  setup: LiveRoundSetup;
  holes: LiveHoleEntry[];
  currentHole: number;
  updatedAt: string;
};

export type LiveRoundAggregated = {
  date: string;
  course: string;
  handicap: number | null;
  holes: number;
  score: number | null;
  totalPutts: number;
  threePutts: number;
  firLeft: number;
  firHit: number;
  firRight: number;
  totalGir: number;
  totalPenalties: number;
};

const STORAGE_PREFIX = "liveRoundDraft";

export function liveRoundDraftKey(userId: string) {
  return `${STORAGE_PREFIX}_${userId}`;
}

export function emptyLiveHole(hole: number): LiveHoleEntry {
  return {
    hole,
    strokes: null,
    putts: 0,
    fir: null,
    gir: null,
    penalties: 0,
  };
}

export function createLiveRoundDraft(setup: LiveRoundSetup): LiveRoundDraft {
  return {
    setup,
    holes: Array.from({ length: setup.holes }, (_, i) => emptyLiveHole(i + 1)),
    currentHole: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function loadLiveRoundDraft(userId: string): LiveRoundDraft | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(liveRoundDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveRoundDraft;
    if (!parsed?.setup?.course || !parsed.holes?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLiveRoundDraft(userId: string, draft: LiveRoundDraft) {
  if (typeof window === "undefined" || !userId) return;
  localStorage.setItem(
    liveRoundDraftKey(userId),
    JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
  );
}

export function clearLiveRoundDraft(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  localStorage.removeItem(liveRoundDraftKey(userId));
}

export function aggregateLiveRound(draft: LiveRoundDraft): LiveRoundAggregated {
  const played = draft.holes.filter((h) => h.strokes != null && h.strokes > 0);
  const score =
    played.length > 0
      ? played.reduce((sum, h) => sum + (h.strokes ?? 0), 0)
      : null;

  let totalPutts = 0;
  let threePutts = 0;
  let firLeft = 0;
  let firHit = 0;
  let firRight = 0;
  let totalGir = 0;
  let totalPenalties = 0;

  for (const h of draft.holes) {
    if (h.strokes == null || h.strokes <= 0) continue;
    totalPutts += h.putts;
    if (h.putts >= 3) threePutts += 1;
    if (h.fir === "left") firLeft += 1;
    if (h.fir === "hit") firHit += 1;
    if (h.fir === "right") firRight += 1;
    if (h.gir === true) totalGir += 1;
    totalPenalties += h.penalties;
  }

  return {
    date: draft.setup.date,
    course: draft.setup.course,
    handicap: draft.setup.handicap,
    holes: draft.setup.holes,
    score,
    totalPutts,
    threePutts,
    firLeft,
    firHit,
    firRight,
    totalGir,
    totalPenalties,
  };
}

/** Key used when handing off live totals to post-round entry. */
export const LIVE_ROUND_HANDOFF_KEY = "liveRoundHandoff";

export function saveLiveRoundHandoff(userId: string, aggregated: LiveRoundAggregated) {
  if (typeof window === "undefined" || !userId) return;
  localStorage.setItem(
    `${LIVE_ROUND_HANDOFF_KEY}_${userId}`,
    JSON.stringify(aggregated),
  );
}

export function loadLiveRoundHandoff(userId: string): LiveRoundAggregated | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(`${LIVE_ROUND_HANDOFF_KEY}_${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as LiveRoundAggregated;
  } catch {
    return null;
  }
}

export function clearLiveRoundHandoff(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  localStorage.removeItem(`${LIVE_ROUND_HANDOFF_KEY}_${userId}`);
}

export function holesLoggedCount(draft: LiveRoundDraft): number {
  return draft.holes.filter((h) => h.strokes != null && h.strokes > 0).length;
}

export function liveRoundInProgressSummary(draft: LiveRoundDraft): string {
  const n = holesLoggedCount(draft);
  return `${draft.setup.course} — ${n} of ${draft.setup.holes} holes logged`;
}
