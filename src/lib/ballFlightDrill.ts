/** "9 Ball flight Driver" (DRIV-9BFD-036): the app calls a flight, the player marks the start line, curve and height. */

export const BALL_FLIGHT_DRILL_KEY = "DRIV-9BFD-036";
export const BALL_FLIGHT_SHOTS = 9;

export const FLIGHT_MARKS = ["start", "curve", "height"] as const;
export type FlightMark = (typeof FLIGHT_MARKS)[number];
export const MARK_LABELS: Record<FlightMark, string> = { start: "Start line", curve: "Curve", height: "Height" };

export const BALL_FLIGHT_MAX_SCORE = BALL_FLIGHT_SHOTS * FLIGHT_MARKS.length;
export const BALL_FLIGHT_SCORE_TYPE = `makes/${BALL_FLIGHT_MAX_SCORE}`;

export const FLIGHT_SHAPES = ["draw", "straight", "fade"] as const;
export const FLIGHT_HEIGHTS = ["high", "mid", "low"] as const;
export type FlightShape = (typeof FLIGHT_SHAPES)[number];
export type FlightHeight = (typeof FLIGHT_HEIGHTS)[number];
export type BallFlight = { shape: FlightShape; height: FlightHeight };

export type BallFlightShot = { target: BallFlight } & Record<FlightMark, boolean>;

const SHAPE_NAMES: Record<FlightShape, string> = { draw: "draw", straight: "straight", fade: "fade" };
const SHAPE_PLURALS: Record<FlightShape, string> = { draw: "draws", straight: "straight shots", fade: "fades" };
const HEIGHT_NAMES: Record<FlightHeight, string> = { high: "High", mid: "Mid", low: "Low" };

export function flightLabel(flight: BallFlight): string {
  return `${HEIGHT_NAMES[flight.height]} ${SHAPE_NAMES[flight.shape]}`;
}

export function flightKey(flight: BallFlight): string {
  return `${flight.height}-${flight.shape}`;
}

/** What the player is trying to do, worded for their handedness. */
export function flightInstruction(flight: BallFlight, lefty: boolean): string {
  const [away, back] = lefty ? ["left", "right"] : ["right", "left"];
  const shape =
    flight.shape === "straight"
      ? "Start it on the target with no curve"
      : flight.shape === "draw"
        ? `Start it ${away} of the target, curve it back ${back}`
        : `Start it ${back} of the target, curve it back ${away}`;
  const height =
    flight.height === "high" ? "high apex" : flight.height === "low" ? "low, flat flight" : "normal height";
  return `${shape}. ${height[0]!.toUpperCase()}${height.slice(1)}.`;
}

export function shotPoints(shot: Record<FlightMark, boolean>): number {
  return FLIGHT_MARKS.filter((m) => shot[m]).length;
}

/** Every flight once, in random order. */
export function buildBallFlightSequence(random: () => number = Math.random): BallFlight[] {
  const flights = FLIGHT_HEIGHTS.flatMap((height) => FLIGHT_SHAPES.map((shape) => ({ shape, height })));
  for (let i = flights.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [flights[i], flights[j]] = [flights[j]!, flights[i]!];
  }
  return flights;
}

function weakest<K extends string>(
  shots: BallFlightShot[],
  mark: FlightMark,
  groups: readonly K[],
  groupOf: (shot: BallFlightShot) => K,
): { group: K; hit: number; of: number } | null {
  const rates = groups.map((group) => {
    const of = shots.filter((s) => groupOf(s) === group);
    return { group, hit: of.filter((s) => s[mark]).length, of: of.length };
  });
  const worst = [...rates].sort((a, b) => a.hit - b.hit)[0];
  return worst && worst.of && rates.some((r) => r.hit > worst.hit) ? worst : null;
}

/** The flights the player found hardest on each mark, when one clearly stands out. */
export function ballFlightWeakSpots(shots: BallFlightShot[]): string[] {
  const lines: string[] = [];
  const start = weakest(shots, "start", FLIGHT_SHAPES, (s) => s.target.shape);
  if (start) lines.push(`Hardest start line: ${SHAPE_PLURALS[start.group]} (${start.hit} of ${start.of}).`);
  const curve = weakest(shots, "curve", FLIGHT_SHAPES, (s) => s.target.shape);
  if (curve) lines.push(`Hardest curve: ${SHAPE_PLURALS[curve.group]} (${curve.hit} of ${curve.of}).`);
  const height = weakest(shots, "height", FLIGHT_HEIGHTS, (s) => s.target.height);
  if (height) lines.push(`Hardest height: ${HEIGHT_NAMES[height.group].toLowerCase()} shots (${height.hit} of ${height.of}).`);
  return lines;
}

export type BallFlightDetails = { kind: "ball_flight"; shots: BallFlightShot[] };

export function ballFlightDetails(shots: BallFlightShot[]): BallFlightDetails {
  return {
    kind: "ball_flight",
    shots: shots.map((s) => ({ target: s.target, start: s.start, curve: s.curve, height: s.height })),
  };
}
