import { formatDrillScore, summarizeDrillProgress, type DrillScoreLog } from "@/lib/drillPersonalBests";
import { getTieredGoalItems, tierLineDisplayBody } from "@/lib/parseTieredGoal";

/** How a drill is scored. Decides the input on the card and which way counts as beating your best. */
export type DrillScoreType = "streak" | "makes" | "count" | "strokes" | "time" | "speed" | "completion";

export type DrillScoring = {
  type: DrillScoreType;
  unit: string;
  lowerIsBetter: boolean;
  /** Top score for "makes" drills (e.g. 10 for "/10"). */
  max: number | null;
  /** "coach" when set in the drill catalog's Score Type column, otherwise the app's guess. */
  source: "coach" | "guess";
  /** Coach turned on the drill timer (saved as a `+timer` suffix on the score type). */
  timer: boolean;
};

export const DRILL_SCORE_TYPE_LABELS: Record<DrillScoreType, string> = {
  streak: "Best streak",
  makes: "Out of",
  count: "Count",
  strokes: "Lower is better",
  time: "Fastest time",
  speed: "Top speed",
  completion: "Sessions",
};

const LOWER_IS_BETTER: Record<DrillScoreType, boolean> = {
  streak: false,
  makes: false,
  count: false,
  strokes: true,
  time: true,
  speed: false,
  completion: false,
};

const DEFAULT_MAKES_OUT_OF = 10;

function scoring(type: DrillScoreType, unit: string, source: DrillScoring["source"], max: number | null = null): DrillScoring {
  return {
    type,
    unit: type === "makes" ? `/${max ?? DEFAULT_MAKES_OUT_OF}` : unit,
    lowerIsBetter: LOWER_IS_BETTER[type],
    max,
    source,
    timer: false,
  };
}

const TIMER_SUFFIX = /\s*\+\s*timer\s*$/i;

const OVERRIDE_TYPES: Record<string, DrillScoreType> = {
  streak: "streak",
  "in a row": "streak",
  makes: "makes",
  "out of": "makes",
  count: "count",
  reps: "count",
  strokes: "strokes",
  score: "strokes",
  putts: "strokes",
  time: "time",
  seconds: "time",
  speed: "speed",
  mph: "speed",
  completion: "completion",
  done: "completion",
};

const DEFAULT_UNITS: Record<DrillScoreType, string> = {
  streak: "in a row",
  makes: "",
  count: "",
  strokes: "strokes",
  time: "sec",
  speed: "mph",
  completion: "",
};

/**
 * Reads the catalog's Score Type column: `streak`, `makes/10`, `count: chip ins`, `strokes: putts`,
 * `time: sec`, `speed: mph` or `completion`. Any of them can end in `+timer` to show the drill timer.
 */
export function parseScoreTypeOverride(text: string | null | undefined): DrillScoring | null {
  const raw = String(text ?? "").trim();
  const timer = TIMER_SUFFIX.test(raw);
  const m = raw
    .replace(TIMER_SUFFIX, "")
    .toLowerCase()
    .match(/^([a-z ]+?)\s*(?:\/\s*(\d+))?\s*(?::\s*(.+))?$/);
  if (!m) return null;
  const type = OVERRIDE_TYPES[m[1].trim()];
  if (!type) return null;
  const max = type === "makes" ? Math.max(1, Number(m[2] ?? DEFAULT_MAKES_OUT_OF)) : null;
  return { ...scoring(type, (m[3] ?? "").trim().slice(0, 24) || DEFAULT_UNITS[type], "coach", max), timer };
}

function baseScoreTypeText(s: Pick<DrillScoring, "type" | "unit" | "max">): string {
  if (s.type === "makes") return `makes/${s.max ?? DEFAULT_MAKES_OUT_OF}`;
  if (s.type === "streak" || s.type === "completion") return s.type;
  const unit = s.unit.trim().slice(0, 24) || DEFAULT_UNITS[s.type];
  return unit ? `${s.type}: ${unit}` : s.type;
}

/** The saved form of a scoring method, readable by `parseScoreTypeOverride`. */
export function scoreTypeText(s: Pick<DrillScoring, "type" | "unit" | "max"> & { timer?: boolean }): string {
  return s.timer ? `${baseScoreTypeText(s)} +timer` : baseScoreTypeText(s);
}

/** Plain-English description, e.g. "Out of 10" or "Lower is better (putts)". */
export function describeScoring(s: DrillScoring): string {
  switch (s.type) {
    case "makes":
      return `Out of ${s.max ?? DEFAULT_MAKES_OUT_OF}`;
    case "streak":
      return "Streak (in a row)";
    case "count":
      return s.unit ? `Count (${s.unit})` : "Count";
    case "strokes":
      return `Lower is better (${s.unit || "strokes"})`;
    case "time":
      return `Fastest time (${s.unit || "sec"})`;
    case "speed":
      return `Top speed (${s.unit || "mph"})`;
    case "completion":
      return "Just done, no score";
  }
}

function guessFromGoalText(text: string): DrillScoring | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const speed = t.match(/\b(mph|km\/h|kph)\b/);
  if (speed) return scoring("speed", speed[1] === "mph" ? "mph" : "km/h", "guess");
  if (/in a row|consecutive|straight/.test(t)) return scoring("streak", "in a row", "guess");
  const outOf = t.match(/(\d+)\s*(?:\/|out of)\s*(\d+)/);
  if (outOf) return scoring("makes", "", "guess", Number(outOf[2]));
  const strokes = t.match(/\b(putts|strokes?|shots?|score|under par|over par)\b/);
  if (strokes) return scoring("strokes", strokes[1] === "putts" ? "putts" : "strokes", "guess");
  const time = t.match(/\b(sec|secs|seconds|mins?|minutes)\b/);
  if (time) return scoring("time", time[1].startsWith("m") ? "min" : "sec", "guess");
  const count = t.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (count) return scoring("count", count[2].trim().slice(0, 24), "guess");
  return null;
}

function guessFromDrill(focus: string, title: string): DrillScoring {
  const f = focus.toLowerCase();
  const t = title.toLowerCase();
  if (/speed training|swing speed|club ?head speed|ball speed|over ?speed|speed sticks?/.test(t)) {
    return scoring("speed", "mph", "guess");
  }
  if (/consecutive|in a row/.test(t)) return scoring("streak", "in a row", "guess");
  if (/make %|make%/.test(f)) return scoring("streak", "in a row", "guess");
  if (/total putts/.test(f)) return scoring("strokes", "putts", "guess");
  if (/gross score|score/.test(f)) return scoring("strokes", "strokes", "guess");
  return scoring("makes", "", "guess", DEFAULT_MAKES_OUT_OF);
}

export function resolveDrillScoring(input: {
  override?: string | null;
  goalText?: string | null;
  focus?: string | null;
  title?: string | null;
}): DrillScoring {
  const fromOverride = parseScoreTypeOverride(input.override);
  if (fromOverride) return fromOverride;
  const goalText = String(input.goalText ?? "");
  const tiers = getTieredGoalItems(goalText);
  const firstGoal = tiers?.length ? tierLineDisplayBody(tiers[0].line) : goalText;
  return guessFromGoalText(firstGoal) ?? guessFromDrill(String(input.focus ?? ""), String(input.title ?? ""));
}

const better = (s: DrillScoring, a: number, b: number) => (s.lowerIsBetter ? a < b : a > b);
const meets = (s: DrillScoring, score: number, target: number) => score === target || better(s, score, target);

/** True when the best can't be beaten any more (e.g. 10/10), only matched. */
export function isPerfectScore(score: number, s: DrillScoring): boolean {
  return s.max != null && !s.lowerIsBetter && score >= s.max;
}

export type DrillMilestone = { label: string; score: number };

/** One-line reaction right after a score is logged. */
export function describeDrillLog(
  score: number,
  previous: DrillScoreLog[],
  s: DrillScoring,
  milestones: DrillMilestone[] = [],
): { text: string; tone: "pb" | "up" | "even" | "down" } {
  const fmt = (n: number) => formatDrillScore(n, s.unit);
  if (s.type === "completion") {
    return { text: `Session ${previous.length + 1} done. Nice work.`, tone: "up" };
  }
  const prevBest = summarizeDrillProgress(previous, s.lowerIsBetter)?.best ?? null;
  if (prevBest == null) {
    return isPerfectScore(score, s)
      ? { text: "Perfect score first time! Match it again next time.", tone: "pb" }
      : { text: `That's your first best: ${fmt(score)}. Beat it next time.`, tone: "up" };
  }

  const reached = [...milestones]
    .reverse()
    .find((m) => meets(s, score, m.score) && !meets(s, prevBest, m.score));
  if (better(s, score, prevBest)) {
    const headline = reached ? `${reached.label} level reached! New personal best` : "New personal best";
    return isPerfectScore(score, s)
      ? { text: `${headline}: a perfect ${fmt(score)}!`, tone: "pb" }
      : { text: `${headline}: ${fmt(score)}! Now beat that.`, tone: "pb" };
  }
  if (score === prevBest) {
    return isPerfectScore(score, s)
      ? { text: "Perfect again. Keep owning this drill.", tone: "up" }
      : { text: `Matched your best of ${fmt(prevBest)}. So close, beat it next time.`, tone: "up" };
  }
  return { text: `Your best is ${fmt(prevBest)}. Keep going, you'll beat it.`, tone: "even" };
}
