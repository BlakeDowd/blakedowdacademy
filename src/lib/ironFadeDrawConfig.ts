/**
 * Fade vs Draw — equal fades and draws (each club hits one of each) to find the player's stronger shape.
 * Logs start side, curve (as called / straight / double cross) and finger distance from target to practice_logs.
 */
export const ironFadeDrawConfig = {
  testName: "Fade vs Draw Test",
  practiceLogType: "iron_fade_draw",
  shotCount: 10,
  ptsStartCorrect: 3,
  ptsStartOnLine: 1,
  ptsCurveCalled: 4,
  ptsDoubleCross: -3,
  /** Finish distance from target in fingers → points. Wider than the last band scores 0. */
  finishBands: [
    { upTo: 0.5, points: 3 },
    { upTo: 1.5, points: 2 },
    { upTo: 2.5, points: 1 },
  ],
  maxShotPoints: 10,
  maxSessionPoints: 100,
} as const;

export type ShotShape = "fade" | "draw";
export type Handedness = "right" | "left";
export type StartSide = "left" | "line" | "right";
export type CurveResult = "called" | "straight" | "double";
export type FinishFingers = number | "outside";
export type ClubOrder = "order" | "random";

export const FINISH_FINGER_OPTIONS: FinishFingers[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, "outside"];

/** Where a shape should start, seen from behind the ball: a right-hander's draw starts right of target. */
export function correctStartSide(shape: ShotShape, hand: Handedness): "left" | "right" {
  const drawStartsRight = hand === "right";
  return (shape === "draw") === drawStartsRight ? "right" : "left";
}

/** Which way the shape curves in the air, seen from behind the ball. */
export function curveDirection(shape: ShotShape, hand: Handedness): "left" | "right" {
  return correctStartSide(shape, hand) === "right" ? "left" : "right";
}

export function startPoints(start: StartSide, shape: ShotShape, hand: Handedness): number {
  if (start === "line") return ironFadeDrawConfig.ptsStartOnLine;
  return start === correctStartSide(shape, hand) ? ironFadeDrawConfig.ptsStartCorrect : 0;
}

export function curvePoints(curve: CurveResult): number {
  if (curve === "called") return ironFadeDrawConfig.ptsCurveCalled;
  if (curve === "double") return ironFadeDrawConfig.ptsDoubleCross;
  return 0;
}

export function finishPoints(fingers: FinishFingers): number {
  if (fingers === "outside") return 0;
  for (const band of ironFadeDrawConfig.finishBands) {
    if (fingers <= band.upTo) return band.points;
  }
  return 0;
}

export function fadeDrawShotPoints(
  shape: ShotShape,
  hand: Handedness,
  start: StartSide,
  curve: CurveResult,
  fingers: FinishFingers,
): number {
  return startPoints(start, shape, hand) + curvePoints(curve) + finishPoints(fingers);
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Shots come in pairs: one fade and one draw with the same club (in random order), so every club
 * is tested with both shapes. "order" walks the picks short → long; "random" draws a club per pair.
 */
export function buildFadeDrawSequence(
  clubs: string[],
  order: ClubOrder,
  shots: number = ironFadeDrawConfig.shotCount,
  random = Math.random,
): { club: string; shape: ShotShape }[] {
  if (clubs.length === 0) return [];
  const pairs = Math.ceil(shots / 2);
  let pairClubs: string[];
  if (order === "order") {
    pairClubs = Array.from({ length: pairs }, (_, i) => clubs[i % clubs.length]!);
  } else {
    pairClubs = [];
    let bag: string[] = [];
    for (let i = 0; i < pairs; i++) {
      if (bag.length === 0) bag = shuffle(clubs, random);
      pairClubs.push(bag.pop()!);
    }
  }
  return pairClubs
    .flatMap((club) => {
      const shapes: ShotShape[] = random() < 0.5 ? ["fade", "draw"] : ["draw", "fade"];
      return shapes.map((shape) => ({ club, shape }));
    })
    .slice(0, shots);
}
