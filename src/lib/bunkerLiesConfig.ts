/**
 * Bunker Lies Challenge — nine 5–10 m bunker shots to a flag with a medium roll out, each from a lie the
 * app generates (slope, sand and how the ball sits). Players hole out every one; par is 2 a hole. A lie
 * the player can't set up can be passed, which swaps it for a flat, good lie so the round is still 9 holes.
 */
export const bunkerLiesConfig = {
  testName: "Bunker Lies Challenge",
  practiceLogType: "bunker_lies",
  holeCount: 9,
  parPerHole: 2,
  maxStrokes: 6,
} as const;

export const BUNKER_LIES_PAR = bunkerLiesConfig.holeCount * bunkerLiesConfig.parPerHole;

export type SlopeLie = "flat" | "uphill" | "downhill" | "below_feet" | "above_feet";
export type SandLie = "normal" | "hard" | "soft";
export type BallLie = "sitting_up" | "sitting_down" | "plugged";
export type FirstShot = "holed" | "green" | "missed_green" | "stayed_in";

export type BunkerLie = { slope: SlopeLie; sand: SandLie; ball: BallLie };
export type BunkerLieHole = BunkerLie & { hole: number; passed: boolean; first: FirstShot; strokes: number };

export const PASS_LIE: BunkerLie = { slope: "flat", sand: "normal", ball: "sitting_up" };

export const SLOPE_LABEL: Record<SlopeLie, string> = {
  flat: "Flat",
  uphill: "Uphill",
  downhill: "Downhill",
  below_feet: "Ball below feet",
  above_feet: "Ball above feet",
};
export const SAND_LABEL: Record<SandLie, string> = { normal: "Normal sand", hard: "Hard sand", soft: "Soft sand" };
export const BALL_LABEL: Record<BallLie, string> = { sitting_up: "Sitting up", sitting_down: "Sitting down", plugged: "Plugged" };
export const FIRST_SHOT_LABEL: Record<FirstShot, string> = {
  holed: "Holed it",
  green: "On the green",
  missed_green: "Out, missed the green",
  stayed_in: "Stayed in the bunker",
};

/** How to play each condition, used for the tip on the shot and the focus card. */
export const LIE_TIPS: Record<SlopeLie | SandLie | BallLie, string> = {
  flat: "Open the face, ball forward, and splash a thin cut of sand.",
  uphill: "Set your shoulders with the slope and swing up it. It comes out high and stops, so give it more speed.",
  downhill: "Lean with the slope, ball a touch back, and chase the club down the hill. It comes out low and runs.",
  below_feet: "Bend more from the hips and stay down through it. It tends to go right, so aim a touch left.",
  above_feet: "Grip down and stand a little taller. It tends to go left, so aim a touch right.",
  normal: "Use the bounce and commit to the splash.",
  hard: "Less bounce here: square the face a touch and take a shallow, thin cut of sand.",
  soft: "Open the face wide and swing harder. Soft sand slows the club down.",
  sitting_up: "A good lie. Open face, thin splash, and let the bounce do the work.",
  sitting_down: "Square the face up more and hit a touch steeper so the club gets under it.",
  plugged: "Close the face, ball back, and hit down hard behind it with little follow-through. Expect it to run out.",
};

export function minStrokes(first: FirstShot): number {
  if (first === "holed") return 1;
  return first === "stayed_in" ? 3 : 2;
}

export function strokesLabel(n: number): string {
  return n >= bunkerLiesConfig.maxStrokes ? `${bunkerLiesConfig.maxStrokes}+` : String(n);
}

export function formatToPar(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `\u2212${Math.abs(n)}`;
}

export function lieTitle(lie: BunkerLie): string {
  return [SLOPE_LABEL[lie.slope], SAND_LABEL[lie.sand], BALL_LABEL[lie.ball]].join(" · ");
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Nine lies covering every slope twice, and each sand and ball condition three times, in random combinations. */
export function buildBunkerLies(random = Math.random): BunkerLie[] {
  const slopes = shuffle<SlopeLie>(["uphill", "uphill", "downhill", "downhill", "below_feet", "below_feet", "above_feet", "above_feet", "flat"], random);
  const sands = shuffle<SandLie>(["hard", "hard", "hard", "soft", "soft", "soft", "normal", "normal", "normal"], random);
  const balls = shuffle<BallLie>(["sitting_up", "sitting_up", "sitting_up", "sitting_down", "sitting_down", "sitting_down", "plugged", "plugged", "plugged"], random);
  return slopes.map((slope, i) => ({ slope, sand: sands[i]!, ball: balls[i]! }));
}

const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | null =>
  typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : null;

/** Saved holes from a practice_logs row's strike_data, or null when they weren't stored. */
export function parseBunkerLieHoles(strikeData: unknown): BunkerLieHole[] | null {
  if (!Array.isArray(strikeData) || strikeData.length === 0) return null;
  const holes: BunkerLieHole[] = [];
  for (const raw of strikeData) {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const slope = oneOf(o.slope, ["flat", "uphill", "downhill", "below_feet", "above_feet"] as const);
    const sand = oneOf(o.sand, ["normal", "hard", "soft"] as const);
    const ball = oneOf(o.ball, ["sitting_up", "sitting_down", "plugged"] as const);
    const first = oneOf(o.first, ["holed", "green", "missed_green", "stayed_in"] as const);
    const strokes = typeof o.strokes === "number" && Number.isFinite(o.strokes) ? o.strokes : null;
    if (!slope || !sand || !ball || !first || strokes === null) return null;
    holes.push({ hole: holes.length + 1, slope, sand, ball, passed: o.passed === true, first, strokes });
  }
  return holes;
}
