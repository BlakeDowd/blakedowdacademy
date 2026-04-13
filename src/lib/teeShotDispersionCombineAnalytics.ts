import { fingerBandPoints, type IronFingerMiss } from "@/lib/ironPrecisionScoring";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";

/** Vertical band on the driver face (crown → sole). */
export type FaceRow = "high" | "middle" | "low";

/** Horizontal band on the driver face (heel → toe). */
export type FaceCol = "heel" | "middle" | "toe";

export type TeeShotDirection = "left" | "straight" | "right";

/** Logged finger width: half-finger steps 0–4, or wider than 4 (“Outside 4”). */
export type TeeShotFingerDispersion = number | "outside";

export type TeeShotFingerSelection =
  | { mode: "numeric"; value: number }
  | { mode: "outside" };

export const TEE_SHOT_FINGER_STEPS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4,
] as const;

export function defaultTeeShotFingerSelection(): TeeShotFingerSelection {
  return { mode: "numeric", value: 0 };
}

export function selectionToLoggedFingers(
  direction: TeeShotDirection,
  selection: TeeShotFingerSelection,
): TeeShotFingerDispersion {
  if (selection.mode === "outside") return "outside";
  return direction === "straight" ? 0 : selection.value;
}

/** Maps UI selection + direction to the value used for finger bands and lateral math. */
export function fingerBandInput(
  direction: TeeShotDirection,
  selection: TeeShotFingerSelection,
): IronFingerMiss {
  if (selection.mode === "outside") return "outside";
  return direction === "straight" ? 0 : selection.value;
}

export type TeeShotDispersionShotLog = {
  shot: number;
  carry_distance_m: number;
  direction: TeeShotDirection;
  finger_dispersion: TeeShotFingerDispersion;
  /**
   * Lateral miss magnitude (m) when dispersion is numeric; null for Outside 4
   * (no numeric lateral model).
   */
  lateral_meters: number | null;
  strike_vertical: FaceRow;
  strike_horizontal: FaceCol;
  /** Human label for metadata, e.g. "High Toe", "Middle Middle". */
  strike_quadrant: string;
  points: number;
};

const ROW_LABEL: Record<FaceRow, string> = {
  high: "High",
  middle: "Middle",
  low: "Low",
};

const COL_LABEL: Record<FaceCol, string> = {
  heel: "Heel",
  middle: "Middle",
  toe: "Toe",
};

export function strikeQuadrantLabel(row: FaceRow, col: FaceCol): string {
  return `${ROW_LABEL[row]} ${COL_LABEL[col]}`;
}

export function isMiddleMiddle(row: FaceRow, col: FaceCol): boolean {
  return row === "middle" && col === "middle";
}

/**
 * Lateral miss magnitude (m) from carry and finger model (numeric fingers only).
 * Formula: Math.abs(Distance * Math.sin((fingers * 2) * (Math.PI / 180)))
 */
export function lateralMissMeters(distanceM: number, fingers: number): number {
  if (!Number.isFinite(distanceM) || distanceM < 0) return 0;
  if (!Number.isFinite(fingers)) return 0;
  return Math.abs(distanceM * Math.sin((fingers * 2) * (Math.PI / 180)));
}

/** Client-facing line under dispersion; Outside 4 avoids numeric lateral. */
export function lateralMissDisplayLine(
  direction: TeeShotDirection,
  carryM: number,
  selection: TeeShotFingerSelection,
): string {
  if (selection.mode === "outside") {
    return "> 15% Error";
  }
  const fingers = direction === "straight" ? 0 : selection.value;
  const m = lateralMissMeters(carryM, fingers);
  if (direction === "straight") {
    return `Miss: ${m.toFixed(1)}m (straight)`;
  }
  const side = direction === "left" ? "Left" : "Right";
  return `Miss: ${m.toFixed(1)}m ${side}`;
}

/**
 * Points: iron/wedge finger bands + sweet-spot bonus.
 * Outside 4 ⇒ 0 total (no Middle/Middle bonus).
 */
export function shotPointsForTeeDispersionShot(
  direction: TeeShotDirection,
  selection: TeeShotFingerSelection,
  row: FaceRow,
  col: FaceCol,
): number {
  if (selection.mode === "outside") return 0;
  const band = fingerBandInput(direction, selection);
  const base = fingerBandPoints(band);
  const bonus = isMiddleMiddle(row, col) ? teeShotDispersionCombineConfig.middleMiddleBonus : 0;
  return base + bonus;
}

export function sessionTotalPoints(shots: TeeShotDispersionShotLog[]): number {
  return shots.reduce((s, sh) => s + sh.points, 0);
}

/** Max if every shot scores 10 fingers + middle/middle bonus. */
export const MAX_SESSION_POINTS =
  teeShotDispersionCombineConfig.shotCount * (10 + teeShotDispersionCombineConfig.middleMiddleBonus);

const STRIKE_BIAS_TAIL: Record<string, string> = {
  "Low Heel": "low-spinning fade bias",
  "Low Middle": "low-face contact pattern that often reduces dynamic loft",
  "Low Toe": "gear-effect draw tendency from low-toe impact",
  "Middle Heel": "heel-side strike pattern that can pull start line with reduced spin",
  "Middle Middle": "neutral face impact — strong baseline for predictable flight",
  "Middle Toe": "toe-side strike that can add spin and influence start line",
  "High Heel": "high-face heel pattern often linked to higher launch and left bias",
  "High Middle": "thin or high-face contact that can add spin and launch",
  "High Toe": "high-toe pattern often associated with a high-spinning draw bias",
};

export function strikeClusterLine(shots: TeeShotDispersionShotLog[]): string {
  if (shots.length === 0) {
    return "Log strikes across all 14 shots to see your strike cluster.";
  }
  const counts: Record<string, number> = {};
  for (const s of shots) {
    const k = s.strike_quadrant;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  let topLabel = "";
  let topN = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (n > topN || (n === topN && (topLabel === "" || k.localeCompare(topLabel) < 0))) {
      topN = n;
      topLabel = k;
    }
  }
  const pct = Math.round((topN / shots.length) * 100);
  const tail =
    STRIKE_BIAS_TAIL[topLabel] ?? "your typical impact pattern for this session";
  return `${pct}% of your strikes were ${topLabel}, explaining the ${tail}.`;
}

export function buildAggregates(
  shots: TeeShotDispersionShotLog[],
): Record<string, unknown> {
  const total = sessionTotalPoints(shots);
  const n = shots.length;
  const avgCarry =
    n > 0
      ? shots.reduce((s, sh) => s + sh.carry_distance_m, 0) / n
      : 0;
  return {
    shot_count: shots.length,
    total_points: total,
    total_score: total,
    max_session_points: MAX_SESSION_POINTS,
    strike_cluster: strikeClusterLine(shots),
    avg_carry_m: avgCarry,
  };
}
