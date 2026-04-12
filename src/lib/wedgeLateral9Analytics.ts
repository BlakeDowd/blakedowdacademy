import { fingerBandPoints } from "@/lib/ironPrecisionScoring";
import {
  normalizeLegacyVerticalStrike,
  type IronContact,
  type IronMissDirection,
  type IronStrike,
} from "@/lib/ironPrecisionProtocolConfig";

export type WedgeLateral9ShotLog = {
  shot: number;
  /** Requested carry / intent distance (m). */
  target_m: number;
  direction: IronMissDirection;
  /** Lateral dispersion in finger widths, 0–4 in 0.5 steps. */
  dispersion: number;
  strike: IronStrike;
  contact: IronContact;
  points: number;
};

/** +2 when normalized strike is solid and contact is middle (legacy `clip` counts as solid). */
export function wedgeLateral9ShotPoints(
  dispersion: number,
  strike: IronStrike | string,
  contact: IronContact,
): number {
  const v = normalizeLegacyVerticalStrike(strike);
  const bonus = v === "solid" && contact === "middle" ? 2 : 0;
  return fingerBandPoints(dispersion) + bonus;
}

export type WedgeLateral9Aggregates = {
  total_points: number;
  avg_points_per_shot: number;
  solid_middle_bonus_count: number;
  solid_middle_bonus_pct: number;
  wedge_bias_summary: string;
};

/** Leaderboard / analytics: recompute total from raw `metadata.shots` with current rules. */
export function totalPointsFromWedgeShotsJson(shots: unknown): number | null {
  if (!Array.isArray(shots)) return null;
  let sum = 0;
  let n = 0;
  for (const raw of shots) {
    if (!raw || typeof raw !== "object") continue;
    const sh = raw as Record<string, unknown>;
    const disp = typeof sh.dispersion === "number" ? sh.dispersion : Number(sh.dispersion);
    if (!Number.isFinite(disp)) continue;
    const contact = sh.contact;
    if (contact !== "heel" && contact !== "middle" && contact !== "toe") continue;
    const strike = String(sh.strike ?? "solid");
    sum += wedgeLateral9ShotPoints(disp, strike, contact);
    n++;
  }
  return n > 0 ? sum : null;
}

export function buildWedgeLateral9Aggregates(shots: WedgeLateral9ShotLog[]): WedgeLateral9Aggregates {
  const n = shots.length;
  const total_points = shots.reduce(
    (s, sh) => s + wedgeLateral9ShotPoints(sh.dispersion, sh.strike, sh.contact),
    0,
  );
  const solid_middle_bonus_count = shots.filter(
    (sh) => normalizeLegacyVerticalStrike(sh.strike) === "solid" && sh.contact === "middle",
  ).length;
  const solid_middle_bonus_pct = n > 0 ? (solid_middle_bonus_count / n) * 100 : 0;
  const lateral = shots.filter((s) => s.direction === "left" || s.direction === "right");
  let wedge_bias_summary =
    "Balanced start line — no strong pull or push tendency among lateral misses.";
  if (lateral.length === 0) {
    wedge_bias_summary = "No lateral pattern (all straight).";
  } else {
    const leftN = lateral.filter((s) => s.direction === "left").length;
    const rightN = lateral.length - leftN;
    const leftRatio = leftN / lateral.length;
    const rightRatio = rightN / lateral.length;
    if (leftRatio > 0.6) {
      wedge_bias_summary =
        "Tendency: Pull — dominant left misses vs. your start line on lateral shots.";
    } else if (rightRatio > 0.6) {
      wedge_bias_summary =
        "Tendency: Push — dominant right misses vs. your start line on lateral shots.";
    }
  }
  return {
    total_points,
    avg_points_per_shot: n > 0 ? total_points / n : 0,
    solid_middle_bonus_count,
    solid_middle_bonus_pct,
    wedge_bias_summary,
  };
}
