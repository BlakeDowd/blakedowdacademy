/**
 * Scale combine proximity points by start distance — longer shots are harder,
 * so a hole-out from 30 m earns more than the same finish from 5 m.
 */

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Shortest ≈ 0.8×, longest ≈ 1.25× of the proximity score. */
export function startDistanceMultiplier(
  startDistanceM: number,
  range: { minM: number; maxM: number } = { minM: 5, maxM: 30 },
): number {
  if (!Number.isFinite(startDistanceM) || startDistanceM <= 0) return 1;
  const span = Math.max(0.001, range.maxM - range.minM);
  const t = Math.min(1, Math.max(0, (startDistanceM - range.minM) / span));
  return round1(0.8 + t * 0.45);
}

export function applyStartDistanceDifficulty(
  basePoints: number,
  startDistanceM: number,
  range?: { minM: number; maxM: number },
): number {
  if (!Number.isFinite(basePoints) || basePoints <= 0) return 0;
  return round1(basePoints * startDistanceMultiplier(startDistanceM, range));
}

/** Max points for a shot that scores `baseMax` at a specific start distance. */
export function maxPointsAtDistance(
  baseMax: number,
  startDistanceM: number,
  range: { minM: number; maxM: number } = { minM: 5, maxM: 30 },
): number {
  return applyStartDistanceDifficulty(baseMax, startDistanceM, range);
}

/** Max points for a shot that scores `baseMax` at the longest distance in range. */
export function maxPointsAtLongest(
  baseMax: number,
  range: { minM: number; maxM: number } = { minM: 5, maxM: 30 },
): number {
  return maxPointsAtDistance(baseMax, range.maxM, range);
}

/**
 * Sum of per-shot maxima for the distances actually played.
 * Falls back to `fallbackCount * maxAtLongest` when distances are missing (legacy rows).
 */
export function sessionMaxFromDistances(
  distancesM: readonly (number | null | undefined)[],
  baseMaxPerShot: number,
  range: { minM: number; maxM: number },
  fallbackCount: number,
): number {
  const known = distancesM.filter(
    (d): d is number => typeof d === "number" && Number.isFinite(d) && d > 0,
  );
  if (known.length === 0) {
    return round1(fallbackCount * maxPointsAtLongest(baseMaxPerShot, range));
  }
  return round1(known.reduce((sum, d) => sum + maxPointsAtDistance(baseMaxPerShot, d, range), 0));
}
