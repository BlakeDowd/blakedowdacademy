/**
 * Tee Shot Hazard Combine — 14 tee shots with the player's three tee clubs. Each shot gets a random
 * club, its carry as the target, and a bunker or out of bounds a set number of fingers to one side.
 * Finger dispersion scores the shot; finishing past the hazard line on that side is a heavy penalty.
 */
import { fingerBandPoints } from "@/lib/ironPrecisionScoring";
import { lateralMissMeters } from "@/lib/teeShotDispersionCombineAnalytics";

export const teeShotHazardConfig = {
  testName: "Tee Shot Hazard Combine",
  practiceLogType: "tee_shot_hazard",
  shotCount: 14,
  clubCount: 3,
  maxShotPoints: 10,
  minCarryM: 80,
  maxCarryM: 400,
} as const;

export const TEE_SHOT_HAZARD_MAX_POINTS = teeShotHazardConfig.shotCount * teeShotHazardConfig.maxShotPoints;

export const TEE_CLUBS = ["Driver", "3 Wood", "5 Wood", "7 Wood", "Hybrid", "2 Iron"] as const;
export type TeeClub = (typeof TEE_CLUBS)[number];

export const TEE_CLUB_SHORT: Record<TeeClub, string> = {
  Driver: "D",
  "3 Wood": "3W",
  "5 Wood": "5W",
  "7 Wood": "7W",
  Hybrid: "Hy",
  "2 Iron": "2i",
};

export type HazardKind = "bunker" | "ob";
export type HazardSide = "left" | "right";
export type ShotDirection = "left" | "straight" | "right";
export type HazardFingers = number | "outside";

export const HAZARD_PENALTY: Record<HazardKind, number> = { bunker: -5, ob: -10 };
export const HAZARD_NAME: Record<HazardKind, string> = { bunker: "Bunker", ob: "Out of bounds" };
export const HAZARD_SHORT: Record<HazardKind, string> = { bunker: "Bunker", ob: "OB" };

/** How far off the target line the hazard starts. */
export const HAZARD_FINGER_STEPS = [1.5, 2, 2.5, 3] as const;
export const SHOT_FINGER_OPTIONS: HazardFingers[] = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, "outside"];

export type TeeClubCarry = { club: TeeClub; carry: number };

export type TeeHazardHole = {
  club: TeeClub;
  target_m: number;
  hazard: HazardKind;
  side: HazardSide;
  hazard_fingers: number;
};

export type TeeHazardShot = TeeHazardHole & {
  shot: number;
  direction: ShotDirection;
  fingers: HazardFingers;
  in_hazard: boolean;
  points: number;
};

export function isTeeClub(v: unknown): v is TeeClub {
  return typeof v === "string" && (TEE_CLUBS as readonly string[]).includes(v);
}

export function fingerLabel(f: HazardFingers): string {
  return f === "outside" ? "4+" : String(f);
}

/** Hazard line in metres from the target line at the target's carry. */
export function hazardMetres(hole: Pick<TeeHazardHole, "target_m" | "hazard_fingers">): number {
  return Math.round(lateralMissMeters(hole.target_m, hole.hazard_fingers));
}

export function inHazard(hole: Pick<TeeHazardHole, "side" | "hazard_fingers">, direction: ShotDirection, fingers: HazardFingers): boolean {
  if (direction !== hole.side) return false;
  return fingers === "outside" || fingers > hole.hazard_fingers;
}

export function hazardShotPoints(
  hole: Pick<TeeHazardHole, "side" | "hazard_fingers" | "hazard">,
  direction: ShotDirection,
  fingers: HazardFingers,
): number {
  if (inHazard(hole, direction, fingers)) return HAZARD_PENALTY[hole.hazard];
  return fingerBandPoints(direction === "straight" ? 0 : fingers);
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Same number of each item (spare ones go to a random few), in random order. */
function spread<T>(options: readonly T[], count: number, random: () => number): T[] {
  const extras = shuffle([...options], random);
  const list = Array.from({ length: count }, (_, i) => (i < count - (count % options.length) ? options[i % options.length]! : extras[i % options.length]!));
  return shuffle(list, random);
}

export function buildHazardHoles(clubs: TeeClubCarry[], count: number = teeShotHazardConfig.shotCount, random = Math.random): TeeHazardHole[] {
  const order = spread(clubs, count, random);
  const kinds = spread<HazardKind>(["bunker", "ob"], count, random);
  const sides = spread<HazardSide>(["left", "right"], count, random);
  return order.map((c, i) => ({
    club: c.club,
    target_m: Math.round(c.carry / 5) * 5,
    hazard: kinds[i]!,
    side: sides[i]!,
    hazard_fingers: HAZARD_FINGER_STEPS[Math.floor(random() * HAZARD_FINGER_STEPS.length)]!,
  }));
}

/** Matches a Virtual Caddie bag label ("Driver", "3W", "4 Hybrid", "2i") to a tee club. */
export function teeClubFromLabel(label: string): TeeClub | null {
  const t = label.toLowerCase().replace(/[\s_-]+/g, "");
  if (/^(driver|dr|d|1w|1wood)$/.test(t)) return "Driver";
  if (/^(3w|3wood)$/.test(t)) return "3 Wood";
  if (/^(5w|5wood)$/.test(t)) return "5 Wood";
  if (/^(7w|7wood)$/.test(t)) return "7 Wood";
  if (/^\d?(h|hy|hyb|hybrid)\d?$/.test(t)) return "Hybrid";
  if (/^(2i|2iron)$/.test(t)) return "2 Iron";
  return null;
}

/** Saved shots from a practice_logs row's strike_data, or null when they weren't stored. */
export function parseTeeHazardShots(strikeData: unknown): TeeHazardShot[] | null {
  if (!Array.isArray(strikeData) || strikeData.length === 0) return null;
  const shots: TeeHazardShot[] = [];
  for (const raw of strikeData) {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const direction = o.direction;
    const side = o.side;
    const hazard = o.hazard;
    const fingers: HazardFingers | null =
      o.fingers === "outside" ? "outside" : typeof o.fingers === "number" && Number.isFinite(o.fingers) ? o.fingers : null;
    if (
      !isTeeClub(o.club) ||
      (direction !== "left" && direction !== "straight" && direction !== "right") ||
      (side !== "left" && side !== "right") ||
      (hazard !== "bunker" && hazard !== "ob") ||
      typeof o.hazard_fingers !== "number" ||
      typeof o.target_m !== "number" ||
      fingers === null
    ) {
      return null;
    }
    const hole: TeeHazardHole = { club: o.club, target_m: o.target_m, hazard, side, hazard_fingers: o.hazard_fingers };
    shots.push({
      ...hole,
      shot: shots.length + 1,
      direction,
      fingers: direction === "straight" ? 0 : fingers,
      in_hazard: inHazard(hole, direction, fingers),
      points: hazardShotPoints(hole, direction, fingers),
    });
  }
  return shots;
}
