/** Pre-shot / game-part routines: script each stage, then rehearse on a timer. */

export const ROUTINE_GAME_PARTS = [
  { id: "tee", label: "Tee shot" },
  { id: "approach", label: "Approach" },
  { id: "chip", label: "Chip" },
  { id: "pitch", label: "Pitch" },
  { id: "bunker", label: "Bunker" },
  { id: "putt", label: "Putt" },
] as const;

export type RoutineGamePartId = (typeof ROUTINE_GAME_PARTS)[number]["id"];

export type RoutineStep = {
  id: string;
  title: string;
  /** Cue / thought / what you do for this stage. */
  thoughts: string;
  /** How many / what kind of practice swings. */
  practiceSwings: string;
  /** Feel of the walk-in (slow, even, etc.). */
  walkingTempo: string;
  /** Steps in the walk-in. */
  stepCount: string;
  /** Target / intermediate target / aim point. */
  targeting: string;
  /** Club chosen / pulled from the bag. */
  club: string;
  /** Grip pressure feel (e.g. 3/10). */
  gripPressure: string;
  /** Ball position. */
  ballPosition: string;
  /** Alignment / feet / shoulders. */
  alignment: string;
  /** Breath / settle before go. */
  breath: string;
  /** Last rehearsed duration in seconds. */
  lastSeconds: number | null;
};

export type GameRoutine = {
  gamePart: RoutineGamePartId;
  steps: RoutineStep[];
  updatedAt: string;
};

/** One timed rehearse of a single step. */
export type RoutineTimeLog = {
  id: string;
  gamePart: RoutineGamePartId;
  stepId: string;
  stepTitle: string;
  /** Duration in seconds, to hundredths. */
  seconds: number;
  at: string;
};

export type RoutineStore = {
  version: 1;
  routines: Partial<Record<RoutineGamePartId, GameRoutine>>;
  /** Newest first. Capped when saving. */
  history?: RoutineTimeLog[];
};

const STORAGE_KEY = "routineBuilder.v1";
const HISTORY_CAP = 300;

/** Default step names for a fresh routine (typical pre-shot flow). */
export const STARTER_TITLES = [
  "Club from bag",
  "Target",
  "Practice swings",
  "Walk in",
  "Set up",
  "Go",
] as const;

/** Quick-pick names covering common pre-shot pieces. */
export const STEP_NAME_CHIPS = [
  "Club from bag",
  "Target",
  "Practice swings",
  "Walk in",
  "Grip",
  "Set up",
  "Align",
  "Ball position",
  "Breath",
  "Go",
] as const;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankStep(title = ""): RoutineStep {
  return {
    id: newId(),
    title,
    thoughts: "",
    practiceSwings: "",
    walkingTempo: "",
    stepCount: "",
    targeting: "",
    club: "",
    gripPressure: "",
    ballPosition: "",
    alignment: "",
    breath: "",
    lastSeconds: null,
  };
}

/** Fill missing fields from older saved steps. */
export function normalizeStep(raw: Partial<RoutineStep> & { id?: string; title?: string }): RoutineStep {
  const base = blankStep(typeof raw.title === "string" ? raw.title : "");
  return {
    ...base,
    id: typeof raw.id === "string" && raw.id ? raw.id : base.id,
    thoughts: typeof raw.thoughts === "string" ? raw.thoughts : "",
    practiceSwings: typeof raw.practiceSwings === "string" ? raw.practiceSwings : "",
    walkingTempo: typeof raw.walkingTempo === "string" ? raw.walkingTempo : "",
    stepCount: typeof raw.stepCount === "string" ? raw.stepCount : "",
    targeting: typeof raw.targeting === "string" ? raw.targeting : "",
    club: typeof raw.club === "string" ? raw.club : "",
    gripPressure: typeof raw.gripPressure === "string" ? raw.gripPressure : "",
    ballPosition: typeof raw.ballPosition === "string" ? raw.ballPosition : "",
    alignment: typeof raw.alignment === "string" ? raw.alignment : "",
    breath: typeof raw.breath === "string" ? raw.breath : "",
    lastSeconds:
      typeof raw.lastSeconds === "number" && Number.isFinite(raw.lastSeconds) ? raw.lastSeconds : null,
  };
}

export function starterRoutine(gamePart: RoutineGamePartId): GameRoutine {
  return {
    gamePart,
    steps: STARTER_TITLES.map((title) => blankStep(title)),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeRoutine(raw: Partial<GameRoutine>, fallbackPart: RoutineGamePartId): GameRoutine {
  const gamePart =
    typeof raw.gamePart === "string" &&
    ROUTINE_GAME_PARTS.some((p) => p.id === raw.gamePart)
      ? (raw.gamePart as RoutineGamePartId)
      : fallbackPart;
  const steps = Array.isArray(raw.steps) ? raw.steps.map((s) => normalizeStep(s ?? {})) : [];
  return {
    gamePart,
    steps: steps.length > 0 ? steps : starterRoutine(gamePart).steps,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

function normalizeTimeLog(raw: Partial<RoutineTimeLog>): RoutineTimeLog | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.gamePart !== "string" || !ROUTINE_GAME_PARTS.some((p) => p.id === raw.gamePart)) {
    return null;
  }
  if (typeof raw.seconds !== "number" || !Number.isFinite(raw.seconds) || raw.seconds < 0) return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    gamePart: raw.gamePart as RoutineGamePartId,
    stepId: typeof raw.stepId === "string" ? raw.stepId : "",
    stepTitle: typeof raw.stepTitle === "string" ? raw.stepTitle : "Step",
    seconds: Math.round(raw.seconds * 100) / 100,
    at: typeof raw.at === "string" ? raw.at : new Date().toISOString(),
  };
}

export function loadRoutineStore(): RoutineStore {
  if (typeof window === "undefined") return { version: 1, routines: {}, history: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, routines: {}, history: [] };
    const parsed = JSON.parse(raw) as RoutineStore;
    if (!parsed || parsed.version !== 1 || typeof parsed.routines !== "object") {
      return { version: 1, routines: {}, history: [] };
    }
    const routines: RoutineStore["routines"] = {};
    for (const part of ROUTINE_GAME_PARTS) {
      const r = parsed.routines[part.id];
      if (r) routines[part.id] = normalizeRoutine(r, part.id);
    }
    const history = Array.isArray(parsed.history)
      ? parsed.history.map(normalizeTimeLog).filter((x): x is RoutineTimeLog => x != null)
      : [];
    return { version: 1, routines, history };
  } catch {
    return { version: 1, routines: {}, history: [] };
  }
}

export function saveRoutineStore(store: RoutineStore): void {
  if (typeof window === "undefined") return;
  const history = (store.history ?? []).slice(0, HISTORY_CAP);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, history }));
}

/** Round timer ms to hundredths of a second. */
export function secondsFromMs(ms: number): number {
  return Math.max(0.01, Math.round(Math.max(0, ms) / 10) / 100);
}

export function appendRoutineTimeLog(
  store: RoutineStore,
  entry: Omit<RoutineTimeLog, "id" | "at"> & { id?: string; at?: string },
): RoutineStore {
  const log: RoutineTimeLog = {
    id: entry.id ?? newId(),
    gamePart: entry.gamePart,
    stepId: entry.stepId,
    stepTitle: entry.stepTitle,
    seconds: Math.round(entry.seconds * 100) / 100,
    at: entry.at ?? new Date().toISOString(),
  };
  return {
    ...store,
    history: [log, ...(store.history ?? [])].slice(0, HISTORY_CAP),
  };
}

export function getOrCreateRoutine(
  store: RoutineStore,
  gamePart: RoutineGamePartId,
): GameRoutine {
  return store.routines[gamePart] ?? starterRoutine(gamePart);
}

export function upsertRoutine(store: RoutineStore, routine: GameRoutine): RoutineStore {
  return {
    ...store,
    routines: {
      ...store.routines,
      [routine.gamePart]: {
        ...normalizeRoutine(routine, routine.gamePart),
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

/** Whole seconds for a live clock (mm:ss). */
export function formatRoutineClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** History display to hundredths — elite routines are measured this tightly. */
export function formatRoutineTimePrecise(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(2).padStart(5, "0")}`;
}

export type ConsistencyStat = {
  stepTitle: string;
  count: number;
  avg: number;
  best: number;
  spread: number;
};

/** Consistency for a step title within a game part (newest logs first). */
export function consistencyForStep(
  history: readonly RoutineTimeLog[],
  gamePart: RoutineGamePartId,
  stepTitle: string,
  window = 8,
): ConsistencyStat | null {
  const title = stepTitle.trim().toLowerCase();
  const rows = history
    .filter((h) => h.gamePart === gamePart && h.stepTitle.trim().toLowerCase() === title)
    .slice(0, window);
  if (rows.length < 2) return null;
  const values = rows.map((r) => r.seconds);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const best = Math.min(...values);
  const spread = Math.max(...values) - Math.min(...values);
  return {
    stepTitle: rows[0]!.stepTitle,
    count: values.length,
    avg: Math.round(avg * 100) / 100,
    best: Math.round(best * 100) / 100,
    spread: Math.round(spread * 100) / 100,
  };
}

export function stepDetailEntries(step: RoutineStep): { label: string; value: string }[] {
  return (
    [
      ["Club", step.club],
      ["Target", step.targeting],
      ["Practice swings", step.practiceSwings],
      ["Walk-in steps", step.stepCount],
      ["Walking tempo", step.walkingTempo],
      ["Grip pressure", step.gripPressure],
      ["Ball position", step.ballPosition],
      ["Alignment", step.alignment],
      ["Breath", step.breath],
    ] as const
  )
    .filter(([, value]) => value.trim())
    .map(([label, value]) => ({ label, value: value.trim() }));
}

export function hasStepDetails(step: RoutineStep): boolean {
  return stepDetailEntries(step).length > 0;
}

export function routineFilledCount(routine: GameRoutine): number {
  return routine.steps.filter(
    (st) => st.title.trim() || st.thoughts.trim() || hasStepDetails(st),
  ).length;
}
