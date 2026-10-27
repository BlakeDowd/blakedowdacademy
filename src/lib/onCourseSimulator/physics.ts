import type { ClubId, HoleData, LieKind, TerrainKind, TerrainZone, Vec2 } from "./types";

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/**
 * Lateral (offline) and depth offset of `aim` vs `pin`, relative to the
 * ball→pin line. Positive offline = right of the flag; positive long = past pin.
 */
export function aimVsPin(
  ball: Vec2,
  pin: Vec2,
  aim: Vec2,
): { offlineM: number; longM: number; toPinM: number } {
  const toPin = sub(pin, ball);
  const forward = normalize(toPin);
  const right = { x: forward.y, y: -forward.x };
  const d = sub(aim, pin);
  return {
    offlineM: Math.round((d.x * right.x + d.y * right.y) * 10) / 10,
    longM: Math.round((d.x * forward.x + d.y * forward.y) * 10) / 10,
    toPinM: Math.round(dist(aim, pin) * 10) / 10,
  };
}

export function formatAimOffline(
  offlineM: number,
  toDisplay: (m: number) => number,
  unitLabel: string,
): string {
  if (Math.abs(offlineM) < 0.15) return `On line with flag`;
  const side = offlineM > 0 ? "right" : "left";
  return `${toDisplay(Math.abs(offlineM))}${unitLabel} ${side} of flag`;
}

/** Ray-cast point-in-polygon. */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.x;
    const yi = poly[i]!.y;
    const xj = poly[j]!.x;
    const yj = poly[j]!.y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const PRIORITY: TerrainKind[] = ["green", "bunker", "water", "tee", "fairway", "rough", "heavy"];

export function lieAt(hole: HoleData, p: Vec2): LieKind {
  for (const kind of PRIORITY) {
    for (const z of hole.zones) {
      if (z.kind !== kind) continue;
      if (pointInPolygon(p, z.polygon)) {
        if (kind === "water") return "water";
        return kind;
      }
    }
  }
  return "oob";
}

export function zoneAt(hole: HoleData, p: Vec2): TerrainZone | null {
  for (const kind of PRIORITY) {
    for (const z of hole.zones) {
      if (z.kind !== kind) continue;
      if (pointInPolygon(p, z.polygon)) return z;
    }
  }
  return null;
}

/** Typical forward roll (m) after carry for club + landing lie. */
export function rolloutMetres(club: ClubId, lie: LieKind, carryM: number): number {
  if (lie === "water" || lie === "oob") return 0;
  if (lie === "bunker") return Math.min(0.8, carryM * 0.01);
  if (lie === "green") {
    if (club === "putter") return 0;
    return Math.min(8, 2 + carryM * 0.02);
  }
  const isWedge = club === "pw" || club === "gw" || club === "sw" || club === "lw";
  const isDriverLike = club === "driver" || club === "3w" || club === "5w";
  let base = isWedge ? 3 : isDriverLike ? 20 : 10;
  if (club === "putter") base = 0;
  if (lie === "rough") base *= 0.3;
  if (lie === "heavy") base *= 0.12;
  if (lie === "fairway" || lie === "tee") {
    /* full roll */
  }
  return Math.max(0, base);
}

/**
 * Walk along a segment and find first water entry (for drop / penalty).
 * Returns entry point or null.
 */
export function firstWaterCrossing(hole: HoleData, from: Vec2, to: Vec2): Vec2 | null {
  const steps = 48;
  let prevIn = lieAt(hole, from) === "water";
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const inWater = lieAt(hole, p) === "water";
    if (!prevIn && inWater) return p;
    prevIn = inWater;
  }
  return null;
}

/** Drop just short of water along the flight (1 club-length back toward tee-ish). */
export function dropNearHazard(from: Vec2, entry: Vec2): Vec2 {
  const back = normalize(sub(from, entry));
  return add(entry, scale(back, 2));
}

export function applyRoll(hole: HoleData, land: Vec2, dir: Vec2, club: ClubId): { rest: Vec2; lie: LieKind } {
  const landLie = lieAt(hole, land);
  if (landLie === "water") {
    return { rest: land, lie: "water" };
  }
  const roll = rolloutMetres(club, landLie, dist({ x: 0, y: 0 }, dir) || 1);
  if (roll < 0.05) return { rest: land, lie: landLie };

  const unit = normalize(dir);
  const steps = Math.max(8, Math.ceil(roll * 2));
  let cur = land;
  let lie = landLie;
  for (let i = 1; i <= steps; i++) {
    const next = add(land, scale(unit, (roll * i) / steps));
    const nextLie = lieAt(hole, next);
    if (nextLie === "water") {
      return { rest: cur, lie };
    }
    if (nextLie === "oob") {
      return { rest: cur, lie };
    }
    if (nextLie === "bunker" && lie !== "bunker") {
      return { rest: next, lie: "bunker" };
    }
    cur = next;
    lie = nextLie;
  }
  return { rest: cur, lie };
}

/** Carry + offline relative to aim direction (unit vector from ball to aim). */
export function landFromCarryOffline(
  ball: Vec2,
  aimDir: Vec2,
  carryM: number,
  offlineM: number,
): Vec2 {
  const forward = normalize(aimDir);
  const right = { x: forward.y, y: -forward.x };
  return add(add(ball, scale(forward, carryM)), scale(right, offlineM));
}

export function randomInDispersion(aim: Vec2, ball: Vec2, radiusM: number): Vec2 {
  const ang = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radiusM;
  return { x: aim.x + Math.cos(ang) * r, y: aim.y + Math.sin(ang) * r };
}

/** Make % for putt from metres (arcade). */
export function puttMakeChance(distM: number): number {
  if (distM <= 0.3) return 0.99;
  if (distM <= 1) return 0.92;
  if (distM <= 2) return 0.7;
  if (distM <= 4) return 0.4;
  if (distM <= 8) return 0.18;
  if (distM <= 12) return 0.08;
  return 0.03;
}

export function simulatePutt(from: Vec2, pin: Vec2): { holed: boolean; rest: Vec2; strokes: number } {
  const d = dist(from, pin);
  if (d < 0.15) return { holed: true, rest: pin, strokes: 1 };
  if (Math.random() < puttMakeChance(d)) return { holed: true, rest: pin, strokes: 1 };
  // Leave ~10–25% of original distance past / short
  const leave = Math.max(0.2, d * (0.1 + Math.random() * 0.2));
  const dir = normalize(sub(pin, from));
  const overshoot = Math.random() > 0.45;
  const rest = overshoot ? add(pin, scale(dir, leave * 0.6)) : add(from, scale(dir, d - leave));
  return { holed: false, rest, strokes: 1 };
}
