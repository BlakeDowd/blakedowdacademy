/** "Hitting all parts of the face" (DRIV-HAPF-033): the app calls a spot on the driver face, the player taps where the mark was. */

export const FACE_STRIKE_DRILL_KEY = "DRIV-HAPF-033";
export const FACE_STRIKE_SHOTS = 9;
export const FACE_STRIKE_MAX_SCORE = FACE_STRIKE_SHOTS * 2;
export const FACE_STRIKE_SCORE_TYPE = `makes/${FACE_STRIKE_MAX_SCORE}`;

/** Rows top to bottom, columns heel to toe. */
export const FACE_ROWS = ["high", "mid", "low"] as const;
export const FACE_COLS = ["heel", "centre", "toe"] as const;
export type FaceRow = (typeof FACE_ROWS)[number];
export type FaceCol = (typeof FACE_COLS)[number];
export type FaceZone = { row: FaceRow; col: FaceCol };

/**
 * A strike in face space, independent of handedness: `h` runs heel (0) to toe (1),
 * `v` runs low (0) to high (1).
 */
export type FaceStrikePoint = { h: number; v: number };

export type FaceStrikeShot = { target: FaceZone; hit: FaceStrikePoint; points: number };

export function zoneLabel(zone: FaceZone): string {
  if (zone.row === "mid" && zone.col === "centre") return "Centre";
  const row = zone.row === "mid" ? "Middle" : zone.row === "high" ? "High" : "Low";
  return zone.col === "centre" ? `${row} centre` : `${row} ${zone.col}`;
}

export function zoneKey(zone: FaceZone): string {
  return `${zone.row}-${zone.col}`;
}

export function zoneOf(point: FaceStrikePoint): FaceZone {
  const colIndex = Math.min(2, Math.max(0, Math.floor(point.h * 3)));
  const rowIndex = Math.min(2, Math.max(0, Math.floor((1 - point.v) * 3)));
  return { row: FACE_ROWS[rowIndex]!, col: FACE_COLS[colIndex]! };
}

/** Centre of a zone in face space. */
export function zoneCentre(zone: FaceZone): FaceStrikePoint {
  return {
    h: (FACE_COLS.indexOf(zone.col) + 0.5) / 3,
    v: 1 - (FACE_ROWS.indexOf(zone.row) + 0.5) / 3,
  };
}

/** 2 for the called zone, 1 for a zone touching it (including diagonally), 0 otherwise. */
export function scoreStrike(target: FaceZone, hit: FaceStrikePoint): number {
  const landed = zoneOf(hit);
  const dr = Math.abs(FACE_ROWS.indexOf(landed.row) - FACE_ROWS.indexOf(target.row));
  const dc = Math.abs(FACE_COLS.indexOf(landed.col) - FACE_COLS.indexOf(target.col));
  if (dr === 0 && dc === 0) return 2;
  return dr <= 1 && dc <= 1 ? 1 : 0;
}

/** Every zone once, in random order. */
export function buildFaceStrikeSequence(random: () => number = Math.random): FaceZone[] {
  const zones = FACE_ROWS.flatMap((row) => FACE_COLS.map((col) => ({ row, col })));
  for (let i = zones.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [zones[i], zones[j]] = [zones[j]!, zones[i]!];
  }
  return zones;
}

/** Where misses tend to finish relative to the called spot, as a short coaching line. */
export function missTendency(shots: FaceStrikeShot[]): string | null {
  const misses = shots.filter((s) => s.points < 2);
  if (misses.length < 2) return null;
  let dh = 0;
  let dv = 0;
  for (const s of misses) {
    const c = zoneCentre(s.target);
    dh += s.hit.h - c.h;
    dv += s.hit.v - c.v;
  }
  dh /= misses.length;
  dv /= misses.length;
  const parts: string[] = [];
  if (Math.abs(dv) >= 0.08) parts.push(dv > 0 ? "higher" : "lower");
  if (Math.abs(dh) >= 0.08) parts.push(dh > 0 ? "more toward the toe" : "more toward the heel");
  if (!parts.length) return "Misses were scattered, not leaning one way.";
  return `Misses tended to finish ${parts.join(" and ")} than called.`;
}

export type FaceStrikeDetails = { kind: "face_strike"; shots: FaceStrikeShot[] };

export function faceStrikeDetails(shots: FaceStrikeShot[]): FaceStrikeDetails {
  return {
    kind: "face_strike",
    shots: shots.map((s) => ({
      target: s.target,
      hit: { h: Math.round(s.hit.h * 1000) / 1000, v: Math.round(s.hit.v * 1000) / 1000 },
      points: s.points,
    })),
  };
}
