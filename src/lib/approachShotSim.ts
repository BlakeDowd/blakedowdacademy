import type { Vec2 } from "@/lib/onCourseSimulator/types";
import { dist, pointInPolygon } from "@/lib/onCourseSimulator/physics";

export type ApproachMode = "launch_monitor" | "touch";

export type ApproachHazard =
  | { id: string; kind: "bunker"; polygon: Vec2[] }
  | { id: string; kind: "water"; polygon: Vec2[] };

export type ApproachScenario = {
  id: string;
  /** Straight-line metres from ball to green centre. */
  distanceM: number;
  greenCenter: Vec2;
  /** Half-width (x) and half-depth (y) of green ellipse, metres. */
  greenRx: number;
  greenRy: number;
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

function rectPoly(x0: number, y0: number, x1: number, y1: number): Vec2[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** Fresh random approach: distance, green size, pin, hazards. */
export function generateApproachScenario(): ApproachScenario {
  const distanceM = Math.round(rand(55, 175));
  const greenRx = rand(8, 18);
  const greenRy = rand(7, 16);
  const greenCenter = { x: rand(-6, 6), y: distanceM };

  // Pin inset from green edge
  const pinInset = 0.65;
  const pin = {
    x: greenCenter.x + rand(-greenRx * pinInset, greenRx * pinInset),
    y: greenCenter.y + rand(-greenRy * pinInset, greenRy * pinInset),
  };

  const hazards: ApproachHazard[] = [];
  const bunkerCount = randInt(0, 2);
  for (let i = 0; i < bunkerCount; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const bx = greenCenter.x + side * (greenRx + rand(1.5, 4.5));
    const by = greenCenter.y + rand(-greenRy * 0.7, greenRy * 0.5);
    const brx = rand(2.8, 5);
    const bry = rand(2.2, 4);
    hazards.push({
      id: `bunker-${i}`,
      kind: "bunker",
      polygon: ellipsePoly(bx, by, brx, bry, 18),
    });
  }

  if (Math.random() < 0.45) {
    const left = Math.random() > 0.5;
    // Keep water tight to the green so zoom stays close
    const wx0 = left ? greenCenter.x - greenRx - rand(3, 9) : greenCenter.x + greenRx + rand(1, 3);
    const wx1 = left ? greenCenter.x - greenRx - rand(1, 3) : greenCenter.x + greenRx + rand(3, 9);
    const wy0 = greenCenter.y - greenRy - rand(2, 8);
    const wy1 = greenCenter.y + greenRy + rand(1, 6);
    hazards.push({
      id: "water-0",
      kind: "water",
      polygon: rectPoly(Math.min(wx0, wx1), wy0, Math.max(wx0, wx1), wy1),
    });
  }

  // Tight frame: green fills most of the view; only nearby hazard tips expand it.
  const fringe = 6;
  let minX = greenCenter.x - greenRx - fringe;
  let maxX = greenCenter.x + greenRx + fringe;
  let minY = greenCenter.y - greenRy - fringe - 4;
  let maxY = greenCenter.y + greenRy + fringe;
  const maxReach = Math.max(greenRx, greenRy) + 14;
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
    pin,
    hazards,
    bounds: { minX, maxX, minY, maxY },
  };
}

export function greenPolygon(s: ApproachScenario): Vec2[] {
  return ellipsePoly(s.greenCenter.x, s.greenCenter.y, s.greenRx, s.greenRy);
}

/** Short fairway apron just short of the green (for zoomed green view). */
export function fairwayPolygon(s: ApproachScenario): Vec2[] {
  const half = Math.max(8, s.greenRx * 0.75);
  const front = s.greenCenter.y - s.greenRy;
  return [
    { x: s.greenCenter.x - half, y: front - 8 },
    { x: s.greenCenter.x + half, y: front - 8 },
    { x: s.greenCenter.x + s.greenRx * 0.5, y: front },
    { x: s.greenCenter.x - s.greenRx * 0.5, y: front },
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
  if (pointInEllipse(p, s.greenCenter, s.greenRx, s.greenRy)) return "green";
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
  let roll = lie === "green" ? rand(1.5, 4) : lie === "fairway" ? rand(2, 6) : rand(0.3, 1.2);
  const rest = { x: land.x + unit.x * roll, y: land.y + unit.y * roll };
  // Don't roll into water
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
  // Prefer green-centred tight zoom; bounds only nudge if a bunker sits wider.
  const greenSpanX = s.greenRx * 2.35;
  const greenSpanY = s.greenRy * 2.45;
  const boundW = s.bounds.maxX - s.bounds.minX;
  const boundH = s.bounds.maxY - s.bounds.minY;
  const worldW = Math.min(Math.max(greenSpanX, boundW * 0.92), greenSpanX * 1.35);
  const worldH = Math.min(Math.max(greenSpanY, boundH * 0.92), greenSpanY * 1.35);
  const cx = s.greenCenter.x;
  const cy = s.greenCenter.y - s.greenRy * 0.08; // slight bias to show front fringe
  const scale = Math.min(viewW / Math.max(worldW, 1), viewH / Math.max(worldH, 1));
  return { cx, cy, scale };
}

export const SHOTS_PER_SET = 9;
