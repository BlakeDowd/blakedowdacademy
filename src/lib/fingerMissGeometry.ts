import { lateralMissMeters } from "@/lib/teeShotDispersionCombineAnalytics";
import { dist, landFromCarryOffline, sub } from "@/lib/onCourseSimulator/physics";
import type { Vec2 } from "@/lib/onCourseSimulator/types";

export type FingerMissDirection = "left" | "straight" | "right";
export type FingerMissWidth = number | "outside";

/** Same half-finger steps used across academy dispersion tests. */
export const FINGER_MISS_OPTIONS: FingerMissWidth[] = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, "outside"];

export function fingerMissLabel(f: FingerMissWidth): string {
  return f === "outside" ? "4+" : String(f);
}

/**
 * Signed offline metres (positive = right of target line) from finger count
 * at the shot distance. "Outside" ≈ 5 fingers for geometry.
 */
export function offlineMetresFromFingers(
  distanceM: number,
  direction: FingerMissDirection,
  fingers: FingerMissWidth,
): number {
  if (direction === "straight") return 0;
  const width = fingers === "outside" ? 5 : fingers;
  const m = lateralMissMeters(distanceM, width);
  return direction === "right" ? m : -m;
}

/**
 * Land along the chosen aim line, offset by finger miss.
 * `carryM` defaults to distance ball→aim (approach); pass explicit carry for on-course.
 */
export function landFromFingerMiss(
  ball: Vec2,
  aim: Vec2,
  direction: FingerMissDirection,
  fingers: FingerMissWidth,
  carryM = dist(ball, aim),
): { land: Vec2; offlineM: number; carryM: number } {
  const offlineM = offlineMetresFromFingers(carryM, direction, fingers);
  const land = landFromCarryOffline(ball, sub(aim, ball), carryM, offlineM);
  return { land, offlineM, carryM };
}
