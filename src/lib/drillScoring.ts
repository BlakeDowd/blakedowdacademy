import { formatDrillScore, summarizeDrillProgress, type DrillScoreLog } from "@/lib/drillPersonalBests";
import { getTieredGoalItems, tierLineDisplayBody } from "@/lib/parseTieredGoal";

/** How a drill is scored. Decides the input on the card and how "Today's target" moves. */
export type DrillScoreType = "streak" | "makes" | "count" | "strokes" | "time" | "completion";

export type DrillScoring = {
  type: DrillScoreType;
  unit: string;
  lowerIsBetter: boolean;
  /** Top score for "makes" drills (e.g. 10 for "/10"). */
  max: number | null;
  /** "coach" when set in the drill catalog's Score Type column, otherwise the app's guess. */
  source: "coach" | "guess";
};

export const DRILL_SCORE_TYPE_LABELS: Record<DrillScoreType, string> = {
  streak: "Best streak",
  makes: "Out of",
  count: "Count",
  strokes: "Lower is better",
  time: "Fastest time",
  completion: "Sessions",
};

const LOWER_IS_BETTER: Record<DrillScoreType, boolean> = {
  streak: false,
  makes: false,
  count: false,
  strokes: true,
  time: true,
  completion: false,
};

const DEFAULT_MAKES_OUT_OF = 10;

/** Misses in a row before today's target eases back one step. */
export const MISSES_BEFORE_EASING = 3;

const TIME_STEP = 0.97;

function scoring(type: DrillScoreType, unit: string, source: DrillScoring["source"], max: number | null = null): DrillScoring {
  return { type, unit: type === "makes" ? `/${max ?? DEFAULT_MAKES_OUT_OF}` : unit, lowerIsBetter: LOWER_IS_BETTER[type], max, source };
}

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
  completion: "completion",
  done: "completion",
};

const DEFAULT_UNITS: Record<DrillScoreType, string> = {
  streak: "in a row",
  makes: "",
  count: "",
  strokes: "strokes",
  time: "sec",
  completion: "",
};

/**
 * Reads the catalog's Score Type column: `streak`, `makes/10`, `count: chip ins`, `strokes: putts`,
 * `time: sec` or `completion`.
 */
export function parseScoreTypeOverride(text: string | null | undefined): DrillScoring | null {
  const m = String(text ?? "")
    .trim()
    .toLowerCase()
    .match(/^([a-z ]+?)\s*(?:\/\s*(\d+))?\s*(?::\s*(.+))?$/);
  if (!m) return null;
  const type = OVERRIDE_TYPES[m[1].trim()];
  if (!type) return null;
  const max = type === "makes" ? Math.max(1, Number(m[2] ?? DEFAULT_MAKES_OUT_OF)) : null;
  return scoring(type, (m[3] ?? "").trim().slice(0, 24) || DEFAULT_UNITS[type], "coach", max);
}

function guessFromGoalText(text: string): DrillScoring | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
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
  if (/consecutive|in a row/.test(title.toLowerCase())) return scoring("streak", "in a row", "guess");
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

function clamp(s: DrillScoring, value: number): number {
  let v = s.type === "time" ? Math.round(value * 10) / 10 : Math.round(value);
  if (s.max != null) v = Math.min(v, s.max);
  return Math.max(s.lowerIsBetter ? 0 : 1, v);
}

function advance(s: DrillScoring, target: number): number {
  if (s.type === "time") return clamp(s, target * TIME_STEP);
  return clamp(s, s.lowerIsBetter ? target - 1 : target + 1);
}

function ease(s: DrillScoring, target: number): number {
  if (s.type === "time") return clamp(s, target / TIME_STEP);
  return clamp(s, s.lowerIsBetter ? target + 1 : target - 1);
}

export type DrillTarget = {
  /** Target for the next session, or null before the first score. */
  next: number | null;
  /** The target the most recent score was measured against. */
  previous: number | null;
  lastResult: "first" | "hit" | "miss" | "eased" | null;
  missesInARow: number;
};

/**
 * Replays the score history: the first score sets the bar, a hit moves it one step (or up to the
 * score, if it beat the target by more), and it eases back one step after repeated misses.
 */
export function computeDrillTarget(logsNewestFirst: DrillScoreLog[], s: DrillScoring): DrillTarget {
  const result: DrillTarget = { next: null, previous: null, lastResult: null, missesInARow: 0 };
  if (s.type === "completion") return result;
  for (let i = logsNewestFirst.length - 1; i >= 0; i--) {
    const score = logsNewestFirst[i].score;
    const target = result.next;
    result.previous = target;
    if (target == null) {
      result.next = advance(s, score);
      result.lastResult = "first";
    } else if (meets(s, score, target)) {
      const stepped = advance(s, target);
      result.next = better(s, score, stepped) ? clamp(s, score) : stepped;
      result.missesInARow = 0;
      result.lastResult = "hit";
    } else if (result.missesInARow + 1 >= MISSES_BEFORE_EASING) {
      result.next = ease(s, target);
      result.missesInARow = 0;
      result.lastResult = "eased";
    } else {
      result.missesInARow += 1;
      result.lastResult = "miss";
    }
  }
  return result;
}

export type DrillMilestone = { label: string; score: number };

/** One-line reaction right after a score is logged. */
export function describeDrillLog(
  score: number,
  previous: DrillScoreLog[],
  s: DrillScoring,
  goal: number | null,
  milestones: DrillMilestone[] = [],
): { text: string; tone: "pb" | "up" | "even" | "down" } {
  const fmt = (n: number) => formatDrillScore(n, s.unit);
  if (s.type === "completion") {
    return { text: `Session ${previous.length + 1} done. Nice work.`, tone: "up" };
  }
  const prevBest = summarizeDrillProgress(previous, s.lowerIsBetter)?.best ?? null;
  const firstToReach = (target: number) =>
    meets(s, score, target) && (prevBest == null || !meets(s, prevBest, target));

  const reached = [...milestones].reverse().find((m) => firstToReach(m.score));
  const headline = reached
    ? `${reached.label} level reached!`
    : goal != null && firstToReach(goal)
      ? "Goal reached!"
      : prevBest != null && better(s, score, prevBest)
        ? "New personal best!"
        : null;

  const after = computeDrillTarget([{ id: "new", score, created_at: new Date().toISOString() }, ...previous], s);
  const next = after.next != null ? fmt(after.next) : "";
  const targetLine =
    after.lastResult === "first"
      ? `That's your starting point. Next target: ${next}.`
      : after.lastResult === "hit"
        ? `Target hit! Next time: ${next}.`
        : after.lastResult === "eased"
          ? `Tough few sessions, so the target eases to ${next}.`
          : `Target stays at ${next}. You'll get it.`;

  const tone = headline ? "pb" : after.lastResult === "hit" || after.lastResult === "first" ? "up" : "even";
  return { text: headline ? `${headline} ${targetLine}` : targetLine, tone };
}

export function suggestNextGoal(goal: number, s: DrillScoring): number {
  const raw = s.lowerIsBetter ? Math.min(goal - 1, Math.floor(goal * 0.9)) : Math.max(goal + 1, Math.ceil(goal * 1.2));
  return clamp(s, raw);
}
