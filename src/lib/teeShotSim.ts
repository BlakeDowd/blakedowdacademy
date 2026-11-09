import type { Vec2 } from "@/lib/onCourseSimulator/types";
import { dist, pointInPolygon } from "@/lib/onCourseSimulator/physics";
import {
  handicapFromScore,
  PRACTICE_HANDICAP_BENCHMARKS,
} from "@/lib/practiceHandicapBenchmarks";
import { teeShotSimConfig } from "@/lib/teeShotSimConfig";

/** Radar = launch-monitor numbers. Finger = mark aim on the map. */
export type TeeMode = "launch_monitor" | "finger_dispersion";

export type TeeHazard =
  | { id: string; kind: "bunker"; polygon: Vec2[] }
  | { id: string; kind: "water"; polygon: Vec2[] };

export type TeeLie = "fairway" | "rough" | "bunker" | "water" | "oob";

/** Left / right of the centre line (negative x = L). */
export type TeeSide = "L" | "R" | "C";

export type TeeScenario = {
  id: string;
  /** Straight-line metres from tee to fairway target centre. */
  distanceM: number;
  /** Ideal landing centre (aim default) — on the centre line. */
  target: Vec2;
  /** Fairway polygon from tee toward target. */
  fairwayPoly: Vec2[];
  hazards: TeeHazard[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Trouble side — misses here cost more. */
  dangerSide: "L" | "R";
  /** Fairway half-width near the landing (m). */
  fairwayHalfM: number;
};

export type TeeShotResult = {
  id: string;
  scenarioId: string;
  distanceM: number;
  land: Vec2;
  lie: TeeLie;
  /** Metres offline from centre line (negative = left). */
  offlineM: number;
  side: TeeSide;
  danger: boolean;
  /** Points for this shot, 0–100. */
  points: number;
  club?: string | null;
};

export type TeeSessionStats = {
  shots: number;
  fairways: number;
  firPct: number;
  score: number;
  band: string;
};

export const TEE_CLUBS = [
  { id: "driver", label: "Driver", typicalCarryM: 230 },
  { id: "3w", label: "3-Wood", typicalCarryM: 210 },
  { id: "5w", label: "5-Wood", typicalCarryM: 195 },
  { id: "7w", label: "7-Wood", typicalCarryM: 185 },
  { id: "hybrid", label: "Hybrid", typicalCarryM: 180 },
  { id: "2i", label: "2-Iron", typicalCarryM: 190 },
  { id: "3i", label: "3-Iron", typicalCarryM: 180 },
  { id: "4i", label: "4-Iron", typicalCarryM: 170 },
  { id: "5i", label: "5-Iron", typicalCarryM: 160 },
  { id: "6i", label: "6-Iron", typicalCarryM: 150 },
  { id: "7i", label: "7-Iron", typicalCarryM: 140 },
] as const;

export const SHOTS_PER_SET = teeShotSimConfig.shotCount;

const BALL: Vec2 = { x: 0, y: 0 };
export { BALL as TEE_BALL };

/** Strict offline bands from centre (m) — used for guide rings on the canvas. */
export const CENTRE_BANDS = [
  { radiusM: 3, label: "Tour", approxPoints: 90 },
  { radiusM: 7, label: "Solid", approxPoints: 70 },
  { radiusM: 12, label: "Wide", approxPoints: 45 },
] as const;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

function irregularOval(cx: number, cy: number, rx: number, ry: number, n = 22): Vec2[] {
  const a1 = rand(0, Math.PI * 2);
  const a2 = rand(0, Math.PI * 2);
  const amp1 = rand(0.05, 0.12);
  const amp2 = rand(0.03, 0.08);
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const wobble = 1 + amp1 * Math.sin(t + a1) + amp2 * Math.sin(2 * t + a2);
    pts.push({ x: cx + Math.cos(t) * rx * wobble, y: cy + Math.sin(t) * ry * wobble });
  }
  return pts;
}

/** Straightish fairway corridor centred on x=0. */
function fairwayCorridor(distanceM: number, halfNear: number, halfFar: number): Vec2[] {
  return [
    { x: -halfNear * 0.55, y: -4 },
    { x: halfNear * 0.55, y: -4 },
    { x: halfNear * 0.9, y: distanceM * 0.35 },
    { x: halfFar, y: distanceM + 18 },
    { x: -halfFar, y: distanceM + 18 },
    { x: -halfNear * 0.9, y: distanceM * 0.35 },
  ];
}

/** Hard limits for custom carry ranges (metres). */
export const TEE_DISTANCE_LIMITS = { minM: 80, maxM: 300 } as const;

export type TeeDistanceRange = { minM: number; maxM: number };

/**
 * Clamp a player-chosen carry window.
 * If min > max, keep the field they just set and move the other
 * (so typing min first doesn't swap the numbers around).
 */
export function normalizeTeeDistanceRange(
  minM: number,
  maxM: number,
  prefer: "min" | "max" | "both" = "both",
): TeeDistanceRange {
  let lo = Math.max(
    TEE_DISTANCE_LIMITS.minM,
    Math.min(TEE_DISTANCE_LIMITS.maxM, Math.round(Number.isFinite(minM) ? minM : 140)),
  );
  let hi = Math.max(
    TEE_DISTANCE_LIMITS.minM,
    Math.min(TEE_DISTANCE_LIMITS.maxM, Math.round(Number.isFinite(maxM) ? maxM : 185)),
  );
  if (hi < lo) {
    if (prefer === "max") lo = hi;
    else hi = lo; // prefer min / both: raise max to match the new min
  }
  return { minM: lo, maxM: hi };
}

export function generateTeeScenario(range?: TeeDistanceRange): TeeScenario {
  const { minM, maxM } = normalizeTeeDistanceRange(range?.minM ?? 140, range?.maxM ?? 185);
  const distanceM = Math.round(rand(minM, maxM));
  const halfNear = rand(6, 8.5);
  const halfFar = rand(11, 16);
  const fairwayPoly = fairwayCorridor(distanceM, halfNear, halfFar);
  const target: Vec2 = { x: 0, y: distanceM };
  const dangerSide: "L" | "R" = Math.random() > 0.5 ? "L" : "R";
  const dangerSign = dangerSide === "R" ? 1 : -1;
  const safeSign = -dangerSign;

  const hazards: TeeHazard[] = [];
  // Compact bunkers hugging the danger-side fairway edge near the landing.
  const dangerBunkers = randInt(1, 2);
  for (let i = 0; i < dangerBunkers; i++) {
    const along = distanceM + rand(-18, 8);
    const bx = dangerSign * (halfFar + rand(1.5, 4.5));
    hazards.push({
      id: `bunker-d-${i}`,
      kind: "bunker",
      polygon: irregularOval(bx, along, rand(3.2, 5.2), rand(2.4, 4), 18),
    });
  }
  if (Math.random() < 0.4) {
    hazards.push({
      id: "bunker-safe",
      kind: "bunker",
      polygon: irregularOval(
        safeSign * (halfFar + rand(2, 5)),
        distanceM + rand(-12, 6),
        rand(2.8, 4.5),
        rand(2.2, 3.6),
        16,
      ),
    });
  }

  // Slim lateral water hazard on the danger side (pond, not a huge lake).
  if (Math.random() < 0.5) {
    hazards.push({
      id: "water-0",
      kind: "water",
      polygon: irregularOval(
        dangerSign * (halfFar + rand(6, 11)),
        distanceM + rand(-10, 10),
        rand(4.5, 7),
        rand(7, 12),
        24,
      ),
    });
  }

  // Framing for the landing zoom (not the whole tee shot).
  const viewHalf = halfFar + 16;
  const bounds = {
    minX: -viewHalf,
    maxX: viewHalf,
    minY: distanceM - 70,
    maxY: distanceM + 28,
  };

  return {
    id: `tee-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    distanceM,
    target,
    fairwayPoly,
    hazards,
    bounds,
    dangerSide,
    fairwayHalfM: halfFar,
  };
}

export function lieAtTee(s: TeeScenario, p: Vec2): TeeLie {
  for (const h of s.hazards) {
    if (h.kind === "water" && pointInPolygon(p, h.polygon)) return "water";
  }
  for (const h of s.hazards) {
    if (h.kind === "bunker" && pointInPolygon(p, h.polygon)) return "bunker";
  }
  if (pointInPolygon(p, s.fairwayPoly)) return "fairway";
  if (p.y < -8 || p.y > s.distanceM + 55 || Math.abs(p.x) > s.fairwayHalfM + 40) return "oob";
  return "rough";
}

export function sideOfCentre(offlineM: number): TeeSide {
  if (Math.abs(offlineM) < 0.75) return "C";
  return offlineM < 0 ? "L" : "R";
}

/**
 * Strict centre-line scoring with asymmetric safe vs danger penalties.
 * Even on the fairway, wide misses lose points fast; danger-side misses lose more.
 */
export function pointsForTeeShot(
  lie: TeeLie,
  offlineFromCentreM: number,
  dangerSide: "L" | "R",
): number {
  const absOff = Math.abs(offlineFromCentreM);
  const side = sideOfCentre(offlineFromCentreM);
  const danger = side !== "C" && side === dangerSide;

  // Metres offline → point loss. Danger side is roughly 1.7× harsher.
  const perMetre = danger ? 7.5 : 4.4;
  let pts = Math.round(100 - absOff * perMetre);

  if (lie === "water" || lie === "oob") {
    // Danger water/OOB is a zero; safe-side freak OOB still almost nothing.
    return danger ? 0 : Math.min(8, Math.max(0, pts));
  }
  if (lie === "bunker") {
    const cap = danger ? 18 : 32;
    pts = Math.min(pts, cap);
  } else if (lie === "rough") {
    const cap = danger ? 38 : 58;
    pts = Math.min(pts, cap);
  } else if (lie === "fairway") {
    // Must be near centre to keep a top score — edge of fairway isn't automatic 100.
    if (absOff > 10) pts = Math.min(pts, danger ? 48 : 62);
  }

  return Math.max(0, Math.min(100, pts));
}

export function teeResultLabel(lie: TeeLie): string {
  switch (lie) {
    case "fairway":
      return "Fairway";
    case "rough":
      return "Rough";
    case "bunker":
      return "Bunker";
    case "water":
      return "Hazard";
    case "oob":
      return "OOB";
    default:
      return "Miss";
  }
}

export function isFairwayHit(lie: TeeLie): boolean {
  return lie === "fairway";
}

export function scoreBand(score: number): string {
  if (score >= 90) return "Tour quality";
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Solid";
  if (score >= 55) return "Average";
  if (score >= 40) return "Below average";
  return "Needs work";
}

export function scoreTeeShot(
  scenario: TeeScenario,
  land: Vec2,
): Omit<TeeShotResult, "id" | "club"> {
  const lie = lieAtTee(scenario, land);
  const offlineM = Math.round((land.x - scenario.target.x) * 10) / 10;
  const side = sideOfCentre(offlineM);
  const danger = side !== "C" && side === scenario.dangerSide;
  return {
    scenarioId: scenario.id,
    distanceM: scenario.distanceM,
    land,
    lie,
    offlineM,
    side,
    danger,
    points: pointsForTeeShot(lie, offlineM, scenario.dangerSide),
  };
}

export function summarizeTeeSession(results: readonly TeeShotResult[]): TeeSessionStats {
  const shots = results.length;
  if (!shots) {
    return { shots: 0, fairways: 0, firPct: 0, score: 0, band: "No shots yet" };
  }
  const fairways = results.filter((r) => isFairwayHit(r.lie)).length;
  const score = Math.round(results.reduce((a, r) => a + r.points, 0) / shots);
  return {
    shots,
    fairways,
    firPct: Math.round((fairways / shots) * 100),
    score,
    band: scoreBand(score),
  };
}

export function estimateTeeShotHandicap(score: number): number {
  const anchors =
    PRACTICE_HANDICAP_BENCHMARKS.tee_shot_sim?.anchors ??
    ([[-4, 92], [0, 78], [9, 58], [18, 40], [28, 22]] as const);
  return Math.round(handicapFromScore(anchors, score) * 10) / 10;
}

/** Anchor rows for the report: typical set score (/100) at each handicap. */
export function teeShotHandicapBands(): { hcp: number; score: number; label: string }[] {
  const anchors =
    PRACTICE_HANDICAP_BENCHMARKS.tee_shot_sim?.anchors ??
    ([[-4, 92], [0, 78], [9, 58], [18, 40], [28, 22]] as const);
  return anchors.map(([hcp, score]) => ({
    hcp,
    score,
    label:
      hcp <= 0 ? "Scratch / plus" : hcp <= 9 ? "Single-figure" : hcp <= 18 ? "Mid" : "High",
  }));
}

/**
 * Rough strokes-gained tee estimate vs a scratch baseline for this scoring scale.
 * ~78/100 ≈ scratch (0 SG/shot); 100 ≈ +0.30; 40 ≈ −0.45.
 */
export function sgTeeFromPoints(points: number): number {
  return Math.round(((points - 78) / 100) * 0.85 * 100) / 100;
}

export type TeeSessionAnalysis = {
  stats: TeeSessionStats;
  handicapEstimate: number;
  /** Total estimated SG: Tee for the set. */
  sgTotal: number;
  /** Average SG per tee shot. */
  sgPerShot: number;
  left: number;
  right: number;
  centre: number;
  dangerMisses: number;
  safeMisses: number;
  avgOfflineM: number | null;
  /** e.g. "Left (danger side)" */
  dominantMiss: string;
  dominantMissDetail: string;
  lieBreakdown: { lie: TeeLie; n: number; pct: number }[];
};

export function analyzeTeeSession(results: readonly TeeShotResult[]): TeeSessionAnalysis {
  const stats = summarizeTeeSession(results);
  const handicapEstimate = estimateTeeShotHandicap(stats.score);
  const empty: TeeSessionAnalysis = {
    stats,
    handicapEstimate,
    sgTotal: 0,
    sgPerShot: 0,
    left: 0,
    right: 0,
    centre: 0,
    dangerMisses: 0,
    safeMisses: 0,
    avgOfflineM: null,
    dominantMiss: "No shots yet",
    dominantMissDetail: "",
    lieBreakdown: [],
  };
  if (!results.length) return empty;

  let left = 0;
  let right = 0;
  let centre = 0;
  let dangerMisses = 0;
  let safeMisses = 0;
  let offlineSum = 0;
  const lieCounts = new Map<TeeLie, number>();

  for (const r of results) {
    if (r.side === "L") left += 1;
    else if (r.side === "R") right += 1;
    else centre += 1;
    if (r.side !== "C") {
      if (r.danger) dangerMisses += 1;
      else safeMisses += 1;
    }
    offlineSum += Math.abs(r.offlineM);
    lieCounts.set(r.lie, (lieCounts.get(r.lie) ?? 0) + 1);
  }

  const sgPerShotValues = results.map((r) => sgTeeFromPoints(r.points));
  const sgTotal =
    Math.round(sgPerShotValues.reduce((a, b) => a + b, 0) * 100) / 100;
  const sgPerShot = Math.round((sgTotal / results.length) * 100) / 100;
  const avgOfflineM = Math.round((offlineSum / results.length) * 10) / 10;

  let dominantMiss: string;
  let dominantMissDetail: string;
  if (left === 0 && right === 0) {
    dominantMiss = "Centre line";
    dominantMissDetail = "Mostly on or near the centre — keep that pattern.";
  } else if (left === right) {
    dominantMiss = "Split L / R";
    dominantMissDetail = `${left} left · ${right} right · ${dangerMisses} danger-side`;
  } else if (left > right) {
    const dangerHeavy = dangerMisses > safeMisses;
    dominantMiss = dangerHeavy ? "Left (danger)" : "Left (safe)";
    dominantMissDetail = `${left} of ${results.length} left · avg ${avgOfflineM} m offline`;
  } else {
    const dangerHeavy = dangerMisses > safeMisses;
    dominantMiss = dangerHeavy ? "Right (danger)" : "Right (safe)";
    dominantMissDetail = `${right} of ${results.length} right · avg ${avgOfflineM} m offline`;
  }

  const lieBreakdown = (["fairway", "rough", "bunker", "water", "oob"] as TeeLie[])
    .map((lie) => {
      const n = lieCounts.get(lie) ?? 0;
      return { lie, n, pct: Math.round((n / results.length) * 100) };
    })
    .filter((r) => r.n > 0);

  return {
    stats,
    handicapEstimate,
    sgTotal,
    sgPerShot,
    left,
    right,
    centre,
    dangerMisses,
    safeMisses,
    avgOfflineM,
    dominantMiss,
    dominantMissDetail,
    lieBreakdown,
  };
}

export function suggestTeeClub(distanceM: number): string {
  if (distanceM < 145) return "6i";
  if (distanceM < 155) return "5i";
  if (distanceM < 165) return "4i";
  if (distanceM < 175) return "hybrid";
  if (distanceM < 185) return "7w";
  if (distanceM < 195) return "5w";
  if (distanceM < 210) return "3w";
  return "driver";
}

/**
 * Zoom on the landing corridor (like approach zooms the green) — not the full tee shot.
 * Aim line starts from the bottom of the canvas toward the target.
 */
export function cameraForTee(
  s: TeeScenario,
  viewW: number,
  viewH: number,
): { cx: number; cy: number; scale: number } {
  const worldW = Math.max(36, s.fairwayHalfM * 2.6 + 10);
  const worldH = 88;
  const cx = 0;
  const cy = s.distanceM - 8;
  const scale = Math.min(viewW / worldW, viewH / worldH) * 0.94;
  return { cx, cy, scale };
}

/** Clamp aim marks so they stay inside a sensible corridor window. */
export function clampTeeAim(s: TeeScenario, mark: Vec2, depthFree: boolean): Vec2 {
  const maxX = s.fairwayHalfM + 10;
  const x = Math.max(-maxX, Math.min(maxX, mark.x));
  const y = depthFree
    ? Math.max(s.distanceM - 45, Math.min(s.distanceM + 12, mark.y))
    : s.target.y;
  return { x, y };
}

export function offlineFromTarget(land: Vec2, target: Vec2): number {
  return Math.round((land.x - target.x) * 10) / 10;
}

export function carryToLand(from: Vec2, land: Vec2): number {
  return Math.round(dist(from, land) * 10) / 10;
}
