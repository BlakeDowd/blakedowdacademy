/**
 * Driver Flight Control Test — three drives: the player's normal shape, a low version of it, then the
 * opposite shape. Finger dispersion scores each drive, plus a bonus for pulling off the flight asked for.
 */
import { fingerBandPoints } from "@/lib/ironPrecisionScoring";

export const driverFlightTestConfig = {
  testName: "Driver Flight Control Test",
  practiceLogType: "driver_flight_control",
  flightBonus: 5,
  maxShotPoints: 15,
  maxSessionPoints: 45,
} as const;

export type StockShape = "draw" | "fade";
export type FlightKind = "normal" | "low" | "opposite";
export type DriveDirection = "left" | "straight" | "right";
export type DriveFingers = number | "outside";

export const FLIGHT_ORDER: FlightKind[] = ["normal", "low", "opposite"];
export const DRIVE_FINGER_OPTIONS: DriveFingers[] = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, "outside"];

export type DriverFlightShot = {
  shot: number;
  flight: FlightKind;
  shape: StockShape;
  achieved: boolean;
  direction: DriveDirection;
  fingers: DriveFingers;
  points: number;
};

export const otherShape = (s: StockShape): StockShape => (s === "draw" ? "fade" : "draw");

export function shapeFor(flight: FlightKind, stock: StockShape): StockShape {
  return flight === "opposite" ? otherShape(stock) : stock;
}

export function flightTitle(flight: FlightKind, shape: StockShape): string {
  if (flight === "low") return `Low ${shape}`;
  if (flight === "opposite") return `Opposite: ${shape}`;
  return `Normal ${shape}`;
}

/** The yes/no question that decides the flight bonus. */
export function flightQuestion(flight: FlightKind, shape: StockShape): string {
  if (flight === "low") return "Did it fly noticeably lower than normal?";
  return shape === "draw" ? "Did it draw?" : "Did it fade?";
}

export function fingerLabel(f: DriveFingers): string {
  return f === "outside" ? "4+" : String(f);
}

export function flightShotPoints(achieved: boolean, direction: DriveDirection, fingers: DriveFingers): number {
  return fingerBandPoints(direction === "straight" ? 0 : fingers) + (achieved ? driverFlightTestConfig.flightBonus : 0);
}

/** Saved shots from a practice_logs row's strike_data, or null when they weren't stored. */
export function parseDriverFlightShots(strikeData: unknown): DriverFlightShot[] | null {
  if (!Array.isArray(strikeData) || strikeData.length === 0) return null;
  const shots: DriverFlightShot[] = [];
  for (const raw of strikeData) {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const { flight, shape, direction } = o;
    const fingers: DriveFingers | null =
      o.fingers === "outside" ? "outside" : typeof o.fingers === "number" && Number.isFinite(o.fingers) ? o.fingers : null;
    if (
      (flight !== "normal" && flight !== "low" && flight !== "opposite") ||
      (shape !== "draw" && shape !== "fade") ||
      (direction !== "left" && direction !== "straight" && direction !== "right") ||
      typeof o.achieved !== "boolean" ||
      fingers === null
    ) {
      return null;
    }
    shots.push({
      shot: shots.length + 1,
      flight,
      shape,
      achieved: o.achieved,
      direction,
      fingers: direction === "straight" ? 0 : fingers,
      points: flightShotPoints(o.achieved, direction, fingers),
    });
  }
  return shots;
}
