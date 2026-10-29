import type { Vec2 } from "@/lib/onCourseSimulator/types";
import { dist, pointInPolygon } from "@/lib/onCourseSimulator/physics";
import {
  handicapFromScore,
  PRACTICE_HANDICAP_BENCHMARKS,
} from "@/lib/practiceHandicapBenchmarks";

/** Radar = enter launch-monitor numbers. Finger = mark real landing on the map. */
export type ApproachMode = "launch_monitor" | "finger_dispersion";

export type ApproachHazard =
  | { id: string; kind: "bunker"; polygon: Vec2[] }
  | { id: string; kind: "water"; polygon: Vec2[] };

/**
 * Pin proximity guide rings for this sim’s scoring
 * (`points ≈ 100 − proximityM × 6` on the green).
 */
export const SCORE_RINGS = [
  { radiusM: 2, approxPoints: 88, label: "Tour" },
  { radiusM: 5, approxPoints: 70, label: "Solid" },
  { radiusM: 10, approxPoints: 40, label: "Weak GIR" },
] as const;

export type ApproachScenario = {
  id: string;
  /** Straight-line metres from ball to green centre. */
  distanceM: number;
  greenCenter: Vec2;
  /** Bounding half-width (x) and half-depth (y) of green, metres. */
  greenRx: number;
  greenRy: number;
  /** Irregular putting-surface outline (metres). */
  greenPoly: Vec2[];
  /** Collar / fringe just outside the green. */
  collarPoly: Vec2[];
  pin: Vec2;
  hazards: ApproachHazard[];
  /** World bounds for camera. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

export type ApproachLie = "green" | "bunker" | "water" | "fairway" | "rough";

export type ApproachShotResult = {
  id: string;
  scenarioId: string;
  distanceM: number;
  land: Vec2;
  rest: Vec2;
  lie: ApproachLie;
  proximityM: number | null;
  /** Points for this shot, 0–100. */
  points: number;
  /** Club used for this shot (e.g. 7i), optional for older sessions. */
  club?: string | null;
};

export type ApproachSessionStats = {
  shots: number;
  gir: number;
  girPct: number;
  avgProximityM: number | null;
  /** Average of shot points, 0–100. */
  score: number;
  band: string;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

function ellipsePoly(cx: number, cy: number, rx: number, ry: number, n = 28): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

/**
 * Realistic irregular green: elliptical base + low harmonics so edges look
 * natural (kidney / pear / skewed oval) rather than a perfect ellipse.
 */
function irregularGreenPoly(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = 40,
): Vec2[] {
  const a1 = rand(0, Math.PI * 2);
  const a2 = rand(0, Math.PI * 2);
  const a3 = rand(0, Math.PI * 2);
  const amp1 = rand(0.06, 0.14);
  const amp2 = rand(0.04, 0.1);
  const amp3 = rand(0.02, 0.06);
  // Mild squish so greens aren't circular
  const skew = rand(-0.12, 0.12);
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const wobble =
      1 +
      amp1 * Math.sin(t + a1) +
      amp2 * Math.sin(2 * t + a2) +
      amp3 * Math.sin(3 * t + a3);
    const x = cx + Math.cos(t) * rx * wobble + Math.sin(t) * ry * skew * 0.35;
    const y = cy + Math.sin(t) * ry * wobble;
    pts.push({ x, y });
  }
  return pts;
}

function scalePolyAbout(pts: Vec2[], c: Vec2, factor: number): Vec2[] {
  return pts.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }));
}

function polyBounds(pts: Vec2[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

/** Fresh random approach: distance, green size/shape, pin, hazards. */
export function generateApproachScenario(): ApproachScenario {
  const distanceM = Math.round(rand(55, 175));
  // Real greens ~300–700 m² → half-axes roughly 8–16 m (width) × 9–18 m (depth).
  const greenRx = rand(8.5, 15.5);
  const greenRy = rand(9.5, 17.5);
  const greenCenter = { x: rand(-5, 5), y: distanceM };
  const greenPoly = irregularGreenPoly(greenCenter.x, greenCenter.y, greenRx, greenRy);
  const collarPoly = scalePolyAbout(greenPoly, greenCenter, 1.14);

  // Pin inset from green edge (stay on surface)
  const pinInset = 0.55;
  let pin = {
    x: greenCenter.x + rand(-greenRx * pinInset, greenRx * pinInset),
    y: greenCenter.y + rand(-greenRy * pinInset, greenRy * pinInset),
  };
  // Nudge pin onto green if irregular edge pushed it out
  if (!pointInPolygon(pin, greenPoly)) {
    pin = { ...greenCenter };
  }

  const hazards: ApproachHazard[] = [];
  const bunkerCount = randInt(1, 3);
  for (let i = 0; i < bunkerCount; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const along = rand(-0.85, 0.65);
    const bx = greenCenter.x + side * (greenRx + rand(1.2, 4.2));
    const by = greenCenter.y + along * greenRy;
    const brx = rand(3.2, 6.5);
    const bry = rand(2.4, 4.8);
    hazards.push({
      id: `bunker-${i}`,
      kind: "bunker",
      polygon: irregularGreenPoly(bx, by, brx, bry, 20),
    });
  }

  if (Math.random() < 0.4) {
    const left = Math.random() > 0.5;
    const side = left ? -1 : 1;
    const wx = greenCenter.x + side * (greenRx + rand(5, 10));
    const wy = greenCenter.y + rand(-greenRy * 0.35, greenRy * 0.25);
    const wrx = rand(4.5, 8);
    const wry = rand(6, 12);
    hazards.push({
      id: "water-0",
      kind: "water",
      // Soft pond shape (same irregular outline as bunkers / greens)
      polygon: irregularGreenPoly(wx, wy, wrx, wry, 28),
    });
  }

  const fringe = 7;
  const gb = polyBounds(collarPoly);
  let minX = gb.minX - fringe;
  let maxX = gb.maxX + fringe;
  let minY = gb.minY - fringe - 4;
  let maxY = gb.maxY + fringe;
  const maxReach = Math.max(greenRx, greenRy) + 16;
  for (const h of hazards) {
    for (const p of h.polygon) {
      if (Math.hypot(p.x - greenCenter.x, p.y - greenCenter.y) > maxReach) continue;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }

  return {
    id: `apr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    distanceM,
    greenCenter,
    greenRx,
    greenRy,
    greenPoly,
    collarPoly,
    pin,
    hazards,
    bounds: { minX, maxX, minY, maxY },
  };
}

export function greenPolygon(s: ApproachScenario): Vec2[] {
  return s.greenPoly;
}

/** Short fairway apron just short of the green (for zoomed green view). */
export function fairwayPolygon(s: ApproachScenario): Vec2[] {
  const half = Math.max(9, s.greenRx * 0.85);
  const front = s.greenCenter.y - s.greenRy;
  return [
    { x: s.greenCenter.x - half * 1.15, y: front - 12 },
    { x: s.greenCenter.x + half * 1.15, y: front - 12 },
    { x: s.greenCenter.x + s.greenRx * 0.55, y: front + 1 },
    { x: s.greenCenter.x - s.greenRx * 0.55, y: front + 1 },
  ];
}

export function pointInEllipse(p: Vec2, c: Vec2, rx: number, ry: number): boolean {
  const dx = (p.x - c.x) / rx;
  const dy = (p.y - c.y) / ry;
  return dx * dx + dy * dy <= 1;
}

export function lieAtApproach(s: ApproachScenario, p: Vec2): ApproachLie {
  for (const h of s.hazards) {
    if (h.kind === "water" && pointInPolygon(p, h.polygon)) return "water";
  }
  if (pointInPolygon(p, s.greenPoly)) return "green";
  for (const h of s.hazards) {
    if (h.kind === "bunker" && pointInPolygon(p, h.polygon)) return "bunker";
  }
  if (pointInPolygon(p, fairwayPolygon(s))) return "fairway";
  return "rough";
}

/**
 * Score one approach out of 100 (not strokes gained).
 * On green: proximity-led. Misses get fixed low bands.
 */
export function pointsForShot(lie: ApproachLie, proximityM: number | null): number {
  if (lie === "water") return 0;
  if (lie === "bunker") return 12;
  if (lie === "rough") return 18;
  if (lie === "fairway") return 28;
  if (lie === "green" && proximityM != null) {
    // 0m → 100, ~3m → 82, ~6m → 64, ~10m → 40, 15m+ → floor 15
    return Math.max(15, Math.min(100, Math.round(100 - proximityM * 6)));
  }
  return 20;
}

export function scoreBand(score: number): string {
  if (score >= 90) return "Tour quality";
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Solid";
  if (score >= 55) return "Average";
  if (score >= 40) return "Below average";
  return "Needs work";
}

/** Estimated handicap from a set score (/100), using practice-handicap anchors. */
export function estimateApproachHandicap(score: number): number {
  const anchors =
    PRACTICE_HANDICAP_BENCHMARKS.approach_shot_sim?.anchors ??
    ([[-4, 88], [0, 75], [9, 58], [18, 42], [28, 28]] as const);
  return Math.round(handicapFromScore(anchors, score) * 10) / 10;
}

export function scoreApproachShot(
  scenario: ApproachScenario,
  rest: Vec2,
): Omit<ApproachShotResult, "id"> {
  const lie = lieAtApproach(scenario, rest);
  const proximityM = lie === "green" ? dist(rest, scenario.pin) : null;
  const proxRounded = proximityM != null ? Math.round(proximityM * 10) / 10 : null;
  return {
    scenarioId: scenario.id,
    distanceM: scenario.distanceM,
    land: rest,
    rest,
    lie,
    proximityM: proxRounded,
    points: pointsForShot(lie, proxRounded),
  };
}

/** Soft rollout toward pin for green / fairway landings. */
export function approachRoll(scenario: ApproachScenario, land: Vec2, from: Vec2): Vec2 {
  const lie = lieAtApproach(scenario, land);
  if (lie === "water" || lie === "bunker") return land;
  const toward = {
    x: land.x - from.x,
    y: land.y - from.y,
  };
  const len = Math.hypot(toward.x, toward.y) || 1;
  const unit = { x: toward.x / len, y: toward.y / len };
  const roll = lie === "green" ? rand(1.5, 4) : lie === "fairway" ? rand(2, 6) : rand(0.3, 1.2);
  const rest = { x: land.x + unit.x * roll, y: land.y + unit.y * roll };
  if (lieAtApproach(scenario, rest) === "water") return land;
  return rest;
}

export function summarizeSession(results: readonly ApproachShotResult[]): ApproachSessionStats {
  const shots = results.length;
  if (!shots) {
    return {
      shots: 0,
      gir: 0,
      girPct: 0,
      avgProximityM: null,
      score: 0,
      band: "No shots yet",
    };
  }
  const gir = results.filter((r) => r.lie === "green").length;
  const prox = results.map((r) => r.proximityM).filter((v): v is number => v != null);
  const avgProximityM = prox.length
    ? Math.round((prox.reduce((a, b) => a + b, 0) / prox.length) * 10) / 10
    : null;
  const score = Math.round(results.reduce((a, r) => a + r.points, 0) / shots);
  const girPct = Math.round((gir / shots) * 100);

  return { shots, gir, girPct, avgProximityM, score, band: scoreBand(score) };
}

export function cameraForApproach(
  s: ApproachScenario,
  viewW: number,
  viewH: number,
): { cx: number; cy: number; scale: number } {
  const greenSpanX = s.greenRx * 2.5;
  const greenSpanY = s.greenRy * 2.55;
  const boundW = s.bounds.maxX - s.bounds.minX;
  const boundH = s.bounds.maxY - s.bounds.minY;
  const worldW = Math.min(Math.max(greenSpanX, boundW * 0.92), greenSpanX * 1.4);
  const worldH = Math.min(Math.max(greenSpanY, boundH * 0.92), greenSpanY * 1.4);
  const cx = s.greenCenter.x;
  const cy = s.greenCenter.y - s.greenRy * 0.06;
  const scale = Math.min(viewW / Math.max(worldW, 1), viewH / Math.max(worldH, 1));
  return { cx, cy, scale };
}

export const SHOTS_PER_SET = 9;
