/** Live round in-progress data (saved locally while playing). */

import type {
  LiveApproachShotDirection,
  LiveGreenHitResult,
  LiveNotPossibleReason,
} from "@/lib/liveApproachShotConfig";
import type { LivePuttBreak, LivePuttEntry } from "@/lib/livePuttingConfig";
import { normalizePuttLogs, puttingCompleteFromLogs } from "@/lib/livePuttingConfig";

export type { LiveApproachShotDirection, LiveGreenHitResult, LiveNotPossibleReason };
export type { LivePuttEntry };

export type LiveFirResult = "left" | "hit" | "right" | "na";
export type LiveTeeDirection = "left" | "hit" | "right";
export type LiveTeeMissLie = "rough" | "recovery" | "hazard";
export type LiveTeeFaceRow = "high" | "middle" | "low";
export type LiveTeeFaceCol = "toe" | "middle" | "heel";
export type LiveTeeFaceContact =
  | `${LiveTeeFaceRow}_${LiveTeeFaceCol}`
  | "not_sure";
export type LiveNineSide = "front" | "back";

export type LiveTeeBox =
  | "black"
  | "blue"
  | "white"
  | "yellow"
  | "red"
  | "pink"
  | "green";

export const LIVE_TEE_BOX_OPTIONS: { id: LiveTeeBox; label: string }[] = [
  { id: "black", label: "Black" },
  { id: "blue", label: "Blue" },
  { id: "white", label: "White" },
  { id: "yellow", label: "Yellow" },
  { id: "red", label: "Red" },
  { id: "pink", label: "Pink" },
  { id: "green", label: "Green" },
];

export function formatLiveTeeBox(tee: LiveTeeBox | null | undefined): string {
  if (!tee) return "";
  return LIVE_TEE_BOX_OPTIONS.find((o) => o.id === tee)?.label ?? tee;
}

export type LiveRoundType = "practice" | "competition" | "tournament";

export const LIVE_ROUND_TYPE_OPTIONS: { id: LiveRoundType; label: string }[] = [
  { id: "practice", label: "Practice round" },
  { id: "competition", label: "Competition" },
  { id: "tournament", label: "Tournament" },
];

export function formatLiveRoundType(type: LiveRoundType | null | undefined): string {
  if (!type) return "";
  return LIVE_ROUND_TYPE_OPTIONS.find((o) => o.id === type)?.label ?? type;
}

/** One-tap tee clubs on Live Entry. */
export const LIVE_TEE_QUICK_CLUBS = [
  "Driver",
  "3W",
  "5W",
  "Hybrid",
  "3I",
] as const;

/** Full bag (no putters) — shown when "Other" is selected. */
export const LIVE_TEE_OTHER_CLUBS = [
  "2W",
  "4W",
  "7W",
  "9W",
  "2H",
  "3H",
  "4H",
  "5H",
  "6H",
  "7H",
  "8H",
  "2I",
  "4I",
  "5I",
  "6I",
  "7I",
  "8I",
  "9I",
  "Driving Iron",
  "PW",
  "GW",
  "AW",
  "SW",
  "LW",
  "48°",
  "50°",
  "52°",
  "54°",
  "56°",
  "58°",
  "60°",
] as const;

export function isLiveTeeOtherClub(club: string | null | undefined): boolean {
  if (!club) return false;
  return !(LIVE_TEE_QUICK_CLUBS as readonly string[]).includes(club);
}

export const LIVE_TEE_FACE_ROWS: LiveTeeFaceRow[] = ["high", "middle", "low"];
export const LIVE_TEE_FACE_COLS: LiveTeeFaceCol[] = ["toe", "middle", "heel"];

const LIVE_TEE_FACE_ROW_LABEL: Record<LiveTeeFaceRow, string> = {
  high: "High",
  middle: "Middle",
  low: "Low",
};

const LIVE_TEE_FACE_COL_LABEL: Record<LiveTeeFaceCol, string> = {
  toe: "Toe",
  middle: "Middle",
  heel: "Heel",
};

export function liveTeeFaceContactId(
  row: LiveTeeFaceRow,
  col: LiveTeeFaceCol,
): `${LiveTeeFaceRow}_${LiveTeeFaceCol}` {
  return `${row}_${col}`;
}

export function liveTeeFaceContactLabel(contact: LiveTeeFaceContact): string {
  if (contact === "not_sure") return "Not sure";
  const [row, col] = contact.split("_") as [LiveTeeFaceRow, LiveTeeFaceCol];
  if (row === "middle" && col === "middle") return "Middle";
  if (row === "middle") {
    return col === "toe" ? "Mid Toe" : "Mid Heel";
  }
  if (col === "middle") {
    return row === "high" ? "High Mid" : "Low Mid";
  }
  return `${LIVE_TEE_FACE_ROW_LABEL[row]} ${LIVE_TEE_FACE_COL_LABEL[col]}`;
}

export type LiveHolePhase = "tee" | "approach" | "putting";

export type LiveApproachShot = {
  shotNumber: number;
  distanceMeters: number | null;
  greenHit: LiveGreenHitResult;
  club?: string | null;
  shotDirection?: LiveApproachShotDirection | null;
  /** Set when greenHit is not_possible. */
  notPossibleReason?: LiveNotPossibleReason | null;
  /** Penalty stroke(s) on this approach shot. */
  penalties?: number;
  /** @deprecated legacy field — migrated to distanceMeters on load */
  distanceYards?: number | null;
};

export type LiveHoleEntry = {
  hole: number;
  /** Actual course hole number (e.g. 10–18 on back nine). */
  courseHoleNumber?: number;
  par: number | null;
  strokes: number | null;
  /** When true, strokes were entered manually and should not be overwritten by shot logging. */
  strokesManual?: boolean;
  putts: number;
  /** Hole logging workflow phase. */
  holePhase?: LiveHolePhase;
  /** Tee section complete — unlock approach shots. */
  teeRecorded?: boolean;
  /** Completed approach shots (shot 2+). */
  approachShots?: LiveApproachShot[];
  /** Active approach shot number while logging (2+). */
  currentApproachShot?: number;
  firstPuttDistanceFeet?: number | null;
  /** Green break for the current putting sequence on this hole. */
  puttGreenBreak?: LivePuttBreak | null;
  /** Logged putts until holing out. */
  puttLogs?: LivePuttEntry[];
  /** Active putt number while logging (1+). */
  currentPuttNumber?: number;
  /** Any approach marked not possible (for GIR-when-possible stats). */
  girNotPossibleAttempt?: boolean;
  /** Opening tee shot — not used on par 3s. */
  teeClub?: string | null;
  teeDirection?: LiveTeeDirection | null;
  /** Where a left/right tee shot ended — only when teeDirection is left or right. */
  teeMissLie?: LiveTeeMissLie | null;
  teeSolidStrike?: boolean | null;
  /** Driver face contact — only when teeSolidStrike is false. */
  teeFaceContact?: LiveTeeFaceContact | null;
  teeCorrectFlight?: boolean | null;
  /** Only when teeCorrectFlight is false. */
  teeDoubleCross?: boolean | null;
  fir: LiveFirResult | null;
  gir: boolean | null;
  penalties: number;
};

export function defaultLiveHoleWorkflow(par: number | null): Pick<
  LiveHoleEntry,
  | "holePhase"
  | "teeRecorded"
  | "approachShots"
  | "currentApproachShot"
  | "firstPuttDistanceFeet"
  | "puttLogs"
  | "currentPuttNumber"
  | "girNotPossibleAttempt"
> {
  return {
    holePhase: "approach",
    teeRecorded: true,
    approachShots: [],
    currentApproachShot: 2,
    firstPuttDistanceFeet: null,
    puttLogs: [],
    currentPuttNumber: 1,
    girNotPossibleAttempt: false,
  };
}

export function normalizeApproachShots(
  shots: LiveApproachShot[] | undefined,
): LiveApproachShot[] {
  if (!shots?.length) return [];
  return shots.map((s) => ({
    shotNumber: s.shotNumber,
    greenHit: s.greenHit,
    club: s.club ?? null,
    shotDirection: s.shotDirection ?? null,
    notPossibleReason: s.notPossibleReason ?? null,
    penalties: s.penalties ?? 0,
    distanceMeters:
      s.distanceMeters ??
      (typeof s.distanceYards === "number"
        ? Math.round(s.distanceYards * 0.9144)
        : null),
  }));
}

export function totalApproachPenalties(shots: LiveApproachShot[] | undefined): number {
  return normalizeApproachShots(shots).reduce((sum, s) => sum + (s.penalties ?? 0), 0);
}

/** Next approach shot label after logging — penalty strokes skip unplayed shot numbers. */
export function nextApproachShotNumber(
  completedShotNumber: number,
  penaltiesOnShot: number,
): number {
  if (penaltiesOnShot <= 0) return completedShotNumber + 1;
  return completedShotNumber + Math.max(1, penaltiesOnShot);
}

/** Stroke count from logged tee, approach, penalty, and putt data. */
export function deriveLiveHoleStrokes(entry: LiveHoleEntry): number | null {
  if (entry.par == null) return null;

  const approaches = normalizeApproachShots(entry.approachShots);
  const putts = normalizePuttLogs(entry.puttLogs);
  let strokes = 0;
  let any = false;

  if (entry.par !== 3 && entry.teeDirection) {
    strokes += 1;
    any = true;
  }

  for (const shot of approaches) {
    strokes += 1 + Math.max(0, shot.penalties ?? 0);
    any = true;
  }

  if (putts.length > 0) {
    strokes += putts.length;
    any = true;
  }

  if (!any) return null;
  return strokes;
}

export function effectiveHoleStrokes(entry: LiveHoleEntry): number | null {
  if (entry.strokesManual && entry.strokes != null && entry.strokes > 0) {
    return entry.strokes;
  }
  const derived = deriveLiveHoleStrokes(entry);
  if (derived != null) return derived;
  if (entry.strokes != null && entry.strokes > 0) return entry.strokes;
  return null;
}

export function applyDerivedHoleStrokes(entry: LiveHoleEntry): LiveHoleEntry {
  if (entry.strokesManual) return entry;
  const derived = deriveLiveHoleStrokes(entry);
  if (derived != null && derived > 0) {
    return { ...entry, strokes: derived };
  }
  return entry;
}

export function formatLiveScoreVsPar(delta: number): string {
  if (delta === 0) return "E";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

/** Golf score name for a single hole (Birdie, Bogey, Par, etc.). */
export function holeScoreNameVsPar(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -3) return "Albatross";
  if (diff === -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double";
  if (diff === 3) return "Triple";
  return `+${diff}`;
}

export function isHoleFinishedForRound(
  entry: LiveHoleEntry,
  currentPlayingHole: number,
): boolean {
  const strokes = entry.strokes ?? effectiveHoleStrokes(entry);
  if (strokes == null || strokes <= 0) return false;
  if (entry.hole < currentPlayingHole) return true;
  if (entry.hole === currentPlayingHole) {
    return puttingCompleteFromLogs(entry.puttLogs);
  }
  return false;
}

/** Running gross and vs-par through the current hole (includes in-progress strokes). */
export function roundTotalsThroughCurrent(draft: LiveRoundDraft): {
  gross: number | null;
  vsPar: number | null;
} {
  let gross = 0;
  let vsPar = 0;
  let holesCounted = 0;

  for (const h of draft.holes) {
    if (h.hole > draft.currentHole) continue;
    if (h.par == null) continue;

    let strokes: number | null;
    if (h.hole < draft.currentHole) {
      strokes = h.strokes ?? effectiveHoleStrokes(h);
      if (strokes == null || strokes <= 0) continue;
    } else {
      strokes = effectiveHoleStrokes(h);
      if (strokes == null || strokes <= 0) continue;
    }

    gross += strokes;
    vsPar += strokes - h.par;
    holesCounted += 1;
  }

  return {
    gross: holesCounted > 0 ? gross : null,
    vsPar: holesCounted > 0 ? vsPar : null,
  };
}

export type LiveRoundSetup = {
  date: string;
  course: string;
  handicap: number | null;
  holes: 9 | 18;
  /** Tees played (black, blue, white, etc.). */
  teeBox?: LiveTeeBox | null;
  /** Practice round, competition, or tournament. */
  roundType?: LiveRoundType | null;
  /** Which nine when playing 9 holes (uses saved 18-hole scorecard). */
  nineSide?: LiveNineSide;
  /** Full 18-hole par list when known. */
  coursePars?: number[];
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

export function courseHoleNumberForPlayingHole(
  playingHole: number,
  setup: Pick<LiveRoundSetup, "holes" | "nineSide">,
): number {
  if (setup.holes === 18) return playingHole;
  return setup.nineSide === "back" ? playingHole + 9 : playingHole;
}

export function parForPlayingHole(
  playingHole: number,
  setup: Pick<LiveRoundSetup, "holes" | "nineSide" | "coursePars">,
): number | null {
  const pars = setup.coursePars;
  if (!pars || pars.length < 18) return null;
  const courseHole = courseHoleNumberForPlayingHole(playingHole, setup);
  const p = pars[courseHole - 1];
  return typeof p === "number" && p >= 3 && p <= 6 ? p : null;
}

export function buildLiveHoleEntry(
  playingHole: number,
  setup: LiveRoundSetup,
  prev?: Partial<LiveHoleEntry>,
): LiveHoleEntry {
  const courseHoleNumber = courseHoleNumberForPlayingHole(playingHole, setup);
  const par = parForPlayingHole(playingHole, setup) ?? prev?.par ?? null;
  const isPar3 = par === 3;
  const workflow = defaultLiveHoleWorkflow(par);
  return {
    hole: playingHole,
    courseHoleNumber,
    par,
    strokes: prev?.strokes ?? null,
    strokesManual: prev?.strokesManual ?? false,
    putts: prev?.putts ?? 0,
    holePhase: prev?.holePhase ?? workflow.holePhase,
    teeRecorded: prev?.teeRecorded ?? workflow.teeRecorded,
    approachShots: normalizeApproachShots(prev?.approachShots ?? workflow.approachShots),
    currentApproachShot: prev?.currentApproachShot ?? workflow.currentApproachShot,
    firstPuttDistanceFeet: prev?.firstPuttDistanceFeet ?? workflow.firstPuttDistanceFeet,
    puttGreenBreak: prev?.puttGreenBreak ?? null,
    puttLogs: normalizePuttLogs(prev?.puttLogs ?? workflow.puttLogs),
    currentPuttNumber: prev?.currentPuttNumber ?? workflow.currentPuttNumber,
    girNotPossibleAttempt:
      prev?.girNotPossibleAttempt ?? workflow.girNotPossibleAttempt,
    teeClub: isPar3 ? null : (prev?.teeClub ?? null),
    teeDirection: isPar3 ? null : (prev?.teeDirection ?? null),
    teeMissLie: isPar3 ? null : (prev?.teeMissLie ?? null),
    teeSolidStrike: isPar3 ? null : (prev?.teeSolidStrike ?? null),
    teeFaceContact: isPar3 ? null : (prev?.teeFaceContact ?? null),
    teeCorrectFlight: isPar3 ? null : (prev?.teeCorrectFlight ?? null),
    teeDoubleCross: isPar3 ? null : (prev?.teeDoubleCross ?? null),
    fir: prev?.fir ?? (isPar3 ? "na" : null),
    gir: prev?.gir ?? null,
    penalties: prev?.penalties ?? 0,
  };
}

export function emptyLiveHole(hole: number): LiveHoleEntry {
  return buildLiveHoleEntry(hole, { date: "", course: "", handicap: null, holes: 18 });
}

export function createLiveRoundDraft(setup: LiveRoundSetup): LiveRoundDraft {
  const normalizedSetup: LiveRoundSetup = {
    ...setup,
    nineSide: setup.holes === 9 ? setup.nineSide ?? "front" : undefined,
  };
  return {
    setup: normalizedSetup,
    holes: Array.from({ length: normalizedSetup.holes }, (_, i) =>
      buildLiveHoleEntry(i + 1, normalizedSetup),
    ),
    currentHole: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function remapLiveDraftHoles(
  draft: LiveRoundDraft,
  setup: LiveRoundSetup,
): LiveRoundDraft {
  const prevByHole = new Map(draft.holes.map((h) => [h.hole, h]));
  const holes = Array.from({ length: setup.holes }, (_, i) => {
    const playingHole = i + 1;
    const prev = prevByHole.get(playingHole);
    return buildLiveHoleEntry(playingHole, setup, prev);
  });
  return {
    ...draft,
    setup,
    holes,
    currentHole: Math.min(draft.currentHole, setup.holes),
  };
}

export function loadLiveRoundDraft(userId: string): LiveRoundDraft | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(liveRoundDraftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveRoundDraft;
    if (!parsed?.setup?.course || !parsed.holes?.length) return null;
    const setup: LiveRoundSetup = {
      ...parsed.setup,
      nineSide:
        parsed.setup.holes === 9 ? parsed.setup.nineSide ?? "front" : undefined,
    };
    const holes = parsed.holes.map((h) =>
      buildLiveHoleEntry(h.hole, setup, {
        ...h,
        par: h.par ?? parForPlayingHole(h.hole, setup),
        courseHoleNumber:
          h.courseHoleNumber ?? courseHoleNumberForPlayingHole(h.hole, setup),
        approachShots: normalizeApproachShots(h.approachShots),
        puttLogs: normalizePuttLogs(h.puttLogs),
      }),
    );
    return { ...parsed, setup, holes };
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
  const played = draft.holes.filter((h) => {
    const strokes = effectiveHoleStrokes(h);
    return strokes != null && strokes > 0;
  });
  const score =
    played.length > 0
      ? played.reduce((sum, h) => sum + (effectiveHoleStrokes(h) ?? 0), 0)
      : null;

  let totalPutts = 0;
  let threePutts = 0;
  let firLeft = 0;
  let firHit = 0;
  let firRight = 0;
  let totalGir = 0;
  let totalPenalties = 0;

  for (const h of draft.holes) {
    const strokes = effectiveHoleStrokes(h);
    if (strokes == null || strokes <= 0) continue;
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
  return draft.holes.filter((h) =>
    isHoleFinishedForRound(h, draft.currentHole),
  ).length;
}

export function liveRoundInProgressSummary(draft: LiveRoundDraft): string {
  const n = holesLoggedCount(draft);
  return `${draft.setup.course} — ${n} of ${draft.setup.holes} holes logged`;
}
