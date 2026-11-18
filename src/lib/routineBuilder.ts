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

/** Player-added custom cue in the questionnaire. */
export type RoutineExtra = {
  id: string;
  label: string;
  value: string;
};

/** Answers from the routine questionnaire (one set per game part). */
export type RoutineAnswers = {
  walkInSteps: string;
  stepPace: string;
  breaths: string;
  targeting: string;
  practiceSwings: string;
  gripPressure: string;
  /** One-hand then two, or both on from the start. */
  gripHands: string;
  ballPosition: string;
  /** What you set first at address. */
  setFirst: string;
  aim: string;
  shoulders: string;
  feet: string;
  /** How many looks at the target. */
  looks: string;
  club: string;
  /** Trigger that starts the swing. */
  goTrigger: string;
  goThought: string;
  extras: RoutineExtra[];
  /** Custom order of system stage ids (optional). */
  stageOrder?: string[];
};

export type GameRoutine = {
  gamePart: RoutineGamePartId;
  /** Questionnaire answers — source of truth for the system view. */
  answers?: RoutineAnswers;
  steps: RoutineStep[];
  updatedAt: string;
};

/** One card in the visual “system” pipeline. */
export type RoutineSystemStage = {
  id: string;
  title: string;
  detail: string;
};

export const blankAnswers = (): RoutineAnswers => ({
  walkInSteps: "",
  stepPace: "",
  breaths: "",
  targeting: "",
  practiceSwings: "",
  gripPressure: "",
  gripHands: "",
  ballPosition: "",
  setFirst: "",
  aim: "",
  shoulders: "",
  feet: "",
  looks: "",
  club: "",
  goTrigger: "",
  goThought: "",
  extras: [],
  stageOrder: undefined,
});

export type QuizQuestion = {
  id: keyof Omit<RoutineAnswers, "extras" | "stageOrder">;
  prompt: string;
  chips: string[];
  placeholder: string;
};

export const ROUTINE_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "walkInSteps",
    prompt: "How many steps in your walk-in?",
    chips: ["0", "1", "2", "3", "4", "5"],
    placeholder: "Or type a number",
  },
  {
    id: "stepPace",
    prompt: "What pace are your steps?",
    chips: ["Slow", "Even", "Deliberate", "Quick"],
    placeholder: "Or describe the pace",
  },
  {
    id: "breaths",
    prompt: "How many breaths before you go?",
    chips: ["0", "1", "2", "3"],
    placeholder: "Or describe your breath",
  },
  {
    id: "targeting",
    prompt: "How do you target?",
    chips: ["Intermediate target", "Final target", "Spot on ground", "Tree / edge"],
    placeholder: "Or describe your target",
  },
  {
    id: "looks",
    prompt: "How many looks at the target?",
    chips: ["1", "2", "3", "None"],
    placeholder: "Or describe your looks",
  },
  {
    id: "practiceSwings",
    prompt: "How many practice swings?",
    chips: ["0", "1", "2", "3"],
    placeholder: "Or describe them",
  },
  {
    id: "club",
    prompt: "Club?",
    chips: ["Commit to club", "Look at face", "One waggle", "Behind the ball"],
    placeholder: "What you do with the club",
  },
  {
    id: "gripHands",
    prompt: "Grip — one hand or two?",
    chips: ["Bottom hand first", "Top hand first", "Both on together", "Glove hand only then both"],
    placeholder: "How you take your grip",
  },
  {
    id: "gripPressure",
    prompt: "Grip pressure?",
    chips: ["Light", "Medium", "Firm", "3/10", "4/10", "5/10"],
    placeholder: "Or your own feel",
  },
  {
    id: "setFirst",
    prompt: "What do you set first?",
    chips: ["Clubface", "Feet", "Shoulders", "Grip", "Ball position", "Aim"],
    placeholder: "First thing you set at address",
  },
  {
    id: "aim",
    prompt: "Aim?",
    chips: ["Face to target", "Face to intermediate", "Body parallel", "Open body"],
    placeholder: "How you aim",
  },
  {
    id: "feet",
    prompt: "Feet?",
    chips: ["Square", "Open", "Closed", "Narrow", "Wide"],
    placeholder: "Foot position",
  },
  {
    id: "shoulders",
    prompt: "Shoulders?",
    chips: ["Square", "Open", "Closed", "Match feet", "Aim left / right"],
    placeholder: "Shoulder line",
  },
  {
    id: "ballPosition",
    prompt: "Ball position?",
    chips: ["Back", "Centre", "Forward", "Off left heel"],
    placeholder: "Optional",
  },
  {
    id: "goTrigger",
    prompt: "What is your trigger to go?",
    chips: ["Forward press", "Waggle then go", "Look then go", "Breath out", "Knee nudge", "Nothing — just go"],
    placeholder: "The move that starts the swing",
  },
  {
    id: "goThought",
    prompt: "Final thought before go?",
    chips: ["Trust it", "Smooth", "Target", "Nothing"],
    placeholder: "Optional",
  },
];

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

export function normalizeAnswers(raw: Partial<RoutineAnswers> | null | undefined): RoutineAnswers {
  const base = blankAnswers();
  if (!raw || typeof raw !== "object") return base;
  const extras = Array.isArray(raw.extras)
    ? raw.extras
        .map((e) => {
          if (!e || typeof e !== "object") return null;
          const label = typeof e.label === "string" ? e.label.trim() : "";
          const value = typeof e.value === "string" ? e.value.trim() : "";
          if (!label && !value) return null;
          return {
            id: typeof e.id === "string" && e.id ? e.id : newId(),
            label,
            value,
          };
        })
        .filter((e): e is RoutineExtra => e != null)
    : [];
  const stageOrder = Array.isArray(raw.stageOrder)
    ? raw.stageOrder.filter((id): id is string => typeof id === "string" && id.length > 0)
    : undefined;
  const legacyAlignment = typeof (raw as { alignment?: string }).alignment === "string"
    ? (raw as { alignment?: string }).alignment!.trim()
    : "";
  return {
    walkInSteps: typeof raw.walkInSteps === "string" ? raw.walkInSteps : "",
    stepPace: typeof raw.stepPace === "string" ? raw.stepPace : "",
    breaths: typeof raw.breaths === "string" ? raw.breaths : "",
    targeting: typeof raw.targeting === "string" ? raw.targeting : "",
    practiceSwings: typeof raw.practiceSwings === "string" ? raw.practiceSwings : "",
    gripPressure: typeof raw.gripPressure === "string" ? raw.gripPressure : "",
    gripHands: typeof raw.gripHands === "string" ? raw.gripHands : "",
    ballPosition: typeof raw.ballPosition === "string" ? raw.ballPosition : "",
    setFirst: typeof raw.setFirst === "string" ? raw.setFirst : "",
    aim: typeof raw.aim === "string" ? raw.aim : "",
    shoulders: typeof raw.shoulders === "string" ? raw.shoulders : "",
    feet: typeof raw.feet === "string" ? raw.feet : legacyAlignment,
    looks: typeof raw.looks === "string" ? raw.looks : "",
    club: typeof raw.club === "string" ? raw.club : "",
    goTrigger: typeof raw.goTrigger === "string" ? raw.goTrigger : "",
    goThought: typeof raw.goThought === "string" ? raw.goThought : "",
    extras,
    stageOrder: stageOrder && stageOrder.length > 0 ? stageOrder : undefined,
  };
}

export function answersHaveContent(a: RoutineAnswers): boolean {
  if (
    [
      a.walkInSteps,
      a.stepPace,
      a.breaths,
      a.targeting,
      a.practiceSwings,
      a.gripPressure,
      a.gripHands,
      a.ballPosition,
      a.setFirst,
      a.aim,
      a.shoulders,
      a.feet,
      a.looks,
      a.club,
      a.goTrigger,
      a.goThought,
    ].some((v) => v.trim())
  ) {
    return true;
  }
  return a.extras.some((e) => e.label.trim() || e.value.trim());
}

/** Build default stages (before custom order). */
function defaultSystemStages(a: RoutineAnswers): RoutineSystemStage[] {
  const stages: RoutineSystemStage[] = [];
  if (a.club.trim()) {
    stages.push({ id: "club", title: "Club", detail: a.club.trim() });
  }
  if (a.targeting.trim()) {
    stages.push({ id: "target", title: "Target", detail: a.targeting.trim() });
  }
  if (a.looks.trim()) {
    stages.push({
      id: "looks",
      title: "Looks",
      detail:
        /^\d+$/.test(a.looks.trim())
          ? `${a.looks.trim()} look${a.looks.trim() === "1" ? "" : "s"}`
          : a.looks.trim(),
    });
  }
  if (a.practiceSwings.trim()) {
    stages.push({
      id: "swings",
      title: "Practice swings",
      detail: a.practiceSwings.trim(),
    });
  }
  if (a.walkInSteps.trim() || a.stepPace.trim()) {
    const bits = [
      a.walkInSteps.trim() ? `${a.walkInSteps.trim()} step${a.walkInSteps.trim() === "1" ? "" : "s"}` : "",
      a.stepPace.trim(),
    ].filter(Boolean);
    stages.push({ id: "walk", title: "Walk in", detail: bits.join(" · ") });
  }
  if (a.gripHands.trim() || a.gripPressure.trim()) {
    const bits = [a.gripHands.trim(), a.gripPressure.trim() ? `Pressure ${a.gripPressure.trim()}` : ""].filter(
      Boolean,
    );
    stages.push({ id: "grip", title: "Grip", detail: bits.join(" · ") });
  }
  if (a.setFirst.trim()) {
    stages.push({ id: "set-first", title: "Set first", detail: a.setFirst.trim() });
  }
  if (a.aim.trim()) {
    stages.push({ id: "aim", title: "Aim", detail: a.aim.trim() });
  }
  if (a.feet.trim()) {
    stages.push({ id: "feet", title: "Feet", detail: a.feet.trim() });
  }
  if (a.shoulders.trim()) {
    stages.push({ id: "shoulders", title: "Shoulders", detail: a.shoulders.trim() });
  }
  if (a.ballPosition.trim()) {
    stages.push({ id: "ball", title: "Ball", detail: a.ballPosition.trim() });
  }
  if (a.breaths.trim()) {
    stages.push({
      id: "breath",
      title: "Breath",
      detail:
        /^\d+$/.test(a.breaths.trim())
          ? `${a.breaths.trim()} breath${a.breaths.trim() === "1" ? "" : "s"}`
          : a.breaths.trim(),
    });
  }
  for (const extra of a.extras) {
    if (!extra.label.trim() && !extra.value.trim()) continue;
    stages.push({
      id: `extra-${extra.id}`,
      title: extra.label.trim() || "Extra",
      detail: extra.value.trim() || "—",
    });
  }
  const goBits = [a.goTrigger.trim(), a.goThought.trim()].filter(Boolean);
  stages.push({
    id: "go",
    title: "Go",
    detail: goBits.length > 0 ? goBits.join(" · ") : "Commit and swing",
  });
  return stages;
}

/** Apply saved stageOrder, keeping any new stages appended. */
export function applyStageOrder(
  stages: RoutineSystemStage[],
  order: string[] | undefined,
): RoutineSystemStage[] {
  if (!order || order.length === 0) return stages;
  const byId = new Map(stages.map((s) => [s.id, s]));
  const ordered: RoutineSystemStage[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const s = byId.get(id);
    if (s && !seen.has(id)) {
      ordered.push(s);
      seen.add(id);
    }
  }
  for (const s of stages) {
    if (!seen.has(s.id)) ordered.push(s);
  }
  return ordered;
}

/** Ordered system cards from questionnaire answers. */
export function systemStagesFromAnswers(answers: RoutineAnswers): RoutineSystemStage[] {
  const a = normalizeAnswers(answers);
  return applyStageOrder(defaultSystemStages(a), a.stageOrder);
}

/** Move a stage up/down and return the new order ids. */
export function reorderStageIds(order: string[], fromIndex: number, direction: -1 | 1): string[] {
  const to = fromIndex + direction;
  if (to < 0 || to >= order.length) return order;
  const next = [...order];
  const tmp = next[fromIndex]!;
  next[fromIndex] = next[to]!;
  next[to] = tmp;
  return next;
}

/** Build rehearse steps from questionnaire answers (preserves prior step times by title). */
export function buildStepsFromAnswers(
  answers: RoutineAnswers,
  previousSteps: RoutineStep[] = [],
): RoutineStep[] {
  const stages = systemStagesFromAnswers(answers);
  const byTitle = new Map(
    previousSteps.map((s) => [s.title.trim().toLowerCase(), s] as const),
  );
  const a = normalizeAnswers(answers);
  return stages.map((stage) => {
    const prev = byTitle.get(stage.title.toLowerCase());
    const step = blankStep(stage.title);
    step.thoughts = stage.detail;
    if (stage.id === "club") step.club = a.club;
    if (stage.id === "target") step.targeting = a.targeting;
    if (stage.id === "swings") step.practiceSwings = a.practiceSwings;
    if (stage.id === "walk") {
      step.stepCount = a.walkInSteps;
      step.walkingTempo = a.stepPace;
    }
    if (stage.id === "grip") {
      step.gripPressure = [a.gripHands, a.gripPressure].filter(Boolean).join(" · ");
    }
    if (stage.id === "ball") step.ballPosition = a.ballPosition;
    if (stage.id === "feet" || stage.id === "shoulders" || stage.id === "aim" || stage.id === "set-first") {
      step.alignment = stage.detail;
    }
    if (stage.id === "breath") step.breath = a.breaths;
    if (stage.id === "go") {
      step.thoughts = stage.detail;
    }
    if (prev) {
      step.id = prev.id;
      step.lastSeconds = prev.lastSeconds;
    }
    return step;
  });
}

export function starterRoutine(gamePart: RoutineGamePartId): GameRoutine {
  const answers = blankAnswers();
  return {
    gamePart,
    answers,
    steps: buildStepsFromAnswers(answers),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeRoutine(raw: Partial<GameRoutine>, fallbackPart: RoutineGamePartId): GameRoutine {
  const gamePart =
    typeof raw.gamePart === "string" &&
    ROUTINE_GAME_PARTS.some((p) => p.id === raw.gamePart)
      ? (raw.gamePart as RoutineGamePartId)
      : fallbackPart;
  const answers = raw.answers ? normalizeAnswers(raw.answers) : undefined;
  const steps = Array.isArray(raw.steps) ? raw.steps.map((s) => normalizeStep(s ?? {})) : [];
  // Prefer regenerating steps from answers when the questionnaire has content.
  const nextSteps =
    answers && answersHaveContent(answers)
      ? buildStepsFromAnswers(answers, steps)
      : steps.length > 0
        ? steps
        : buildStepsFromAnswers(answers ?? blankAnswers());
  return {
    gamePart,
    answers: answers ?? blankAnswers(),
    steps: nextSteps,
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
  if (routine.answers && answersHaveContent(routine.answers)) {
    return systemStagesFromAnswers(routine.answers).length;
  }
  return routine.steps.filter(
    (st) => st.title.trim() || st.thoughts.trim() || hasStepDetails(st),
  ).length;
}
