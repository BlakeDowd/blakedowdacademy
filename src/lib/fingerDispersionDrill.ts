import { BALL_FLIGHT_SHOTS, FLIGHT_HEIGHTS, FLIGHT_SHAPES, type BallFlight } from "@/lib/ballFlightDrill";

/**
 * "Finger Dispersion 9 Shots" (IRON-FING-049): the 9 ball flights, each scored on whether the shape came off
 * and whether it finished inside the finger window. Tighter windows multiply the points.
 */

export const FINGER_DISPERSION_DRILL_KEY = "IRON-FING-049";

export const FINGER_WINDOWS = [1, 2, 3, 4] as const;
export type FingerWindow = (typeof FINGER_WINDOWS)[number];
export const FINGER_WINDOW_LABELS: Record<FingerWindow, string> = { 1: "Very hard", 2: "Hard", 3: "Medium", 4: "Easy" };

export function fingerMultiplier(fingers: FingerWindow): number {
  return 5 - fingers;
}

export function fingerWindowLabel(fingers: FingerWindow): string {
  return `${fingers} finger${fingers === 1 ? "" : "s"}`;
}

export const FINGER_MARKS = ["shape", "window"] as const;
export type FingerMark = (typeof FINGER_MARKS)[number];
export const FINGER_MARK_LABELS: Record<FingerMark, string> = { shape: "Shape", window: "In window" };

export const FINGER_RAW_MAX = BALL_FLIGHT_SHOTS * FINGER_MARKS.length;
export const FINGER_DISPERSION_MAX_SCORE = FINGER_RAW_MAX * fingerMultiplier(1);
export const FINGER_DISPERSION_SCORE_TYPE = `makes/${FINGER_DISPERSION_MAX_SCORE}`;

export type FingerShot = { target: BallFlight } & Record<FingerMark, boolean>;

export function fingerShotPoints(shot: Record<FingerMark, boolean>): number {
  return FINGER_MARKS.filter((m) => shot[m]).length;
}

export function fingerRawScore(shots: FingerShot[]): number {
  return shots.reduce((sum, s) => sum + fingerShotPoints(s), 0);
}

export function fingerScore(shots: FingerShot[], fingers: FingerWindow): number {
  return fingerRawScore(shots) * fingerMultiplier(fingers);
}

const SHAPE_PLURALS: Record<BallFlight["shape"], string> = { draw: "draws", straight: "straight shots", fade: "fades" };

function weakest<K extends string>(
  shots: FingerShot[],
  mark: FingerMark,
  groups: readonly K[],
  groupOf: (shot: FingerShot) => K,
): { group: K; hit: number; of: number } | null {
  const rates = groups.map((group) => {
    const of = shots.filter((s) => groupOf(s) === group);
    return { group, hit: of.filter((s) => s[mark]).length, of: of.length };
  });
  const worst = [...rates].sort((a, b) => a.hit - b.hit)[0];
  return worst && worst.of && rates.filter((r) => r.hit === worst.hit).length === 1 ? worst : null;
}

/** The flights that most often missed the shape or the window, when one clearly stands out. */
export function fingerWeakSpots(shots: FingerShot[]): string[] {
  const lines: string[] = [];
  const shape = weakest(shots, "shape", FLIGHT_SHAPES, (s) => s.target.shape);
  if (shape) lines.push(`Hardest shape: ${SHAPE_PLURALS[shape.group]} (${shape.hit} of ${shape.of}).`);
  const window = weakest(shots, "window", FLIGHT_SHAPES, (s) => s.target.shape);
  if (window) lines.push(`Most misses outside the window: ${SHAPE_PLURALS[window.group]} (${window.hit} of ${window.of} in).`);
  const height = weakest(shots, "window", FLIGHT_HEIGHTS, (s) => s.target.height);
  if (height) lines.push(`Hardest height to keep in the window: ${height.group} shots (${height.hit} of ${height.of} in).`);
  return lines;
}

export type FingerDispersionDetails = {
  kind: "finger_dispersion";
  fingers: FingerWindow;
  multiplier: number;
  shots: FingerShot[];
};

export function fingerDispersionDetails(shots: FingerShot[], fingers: FingerWindow): FingerDispersionDetails {
  return {
    kind: "finger_dispersion",
    fingers,
    multiplier: fingerMultiplier(fingers),
    shots: shots.map((s) => ({ target: s.target, shape: s.shape, window: s.window })),
  };
}
