import { pointsForAbsoluteError } from "@/lib/aimpoint6ftCombineScoring";

/**
 * AimPoint drill cards ("Aim Point 6foot and In", "Aim Point 8foot to 20ft", "Aim Point 21foot to 40ft"):
 * 10 putts, each read at set spots along the line (guess, then measured slope). Points per read use the
 * AimPoint combine scale, scaled to a score out of 100.
 */

export const READ_SPOTS = {
  first: { label: "First third", short: "1/3" },
  middle: { label: "Halfway", short: "1/2" },
  late: { label: "Two-thirds", short: "2/3" },
} as const;
export type ReadSpot = keyof typeof READ_SPOTS;

const SPOT_TIPS: Record<ReadSpot, string> = {
  first:
    "Your first-third reads were the furthest out. Stand on the line a third of the way along, face the hole, and give your feet a few seconds before calling it.",
  middle:
    "Your halfway reads were the furthest out. Straddle the line at the halfway point and feel for the heavier foot before you look at the hole.",
  late:
    "Your two-thirds reads were the furthest out. That's where the ball slows and breaks most, so take an extra few seconds there.",
};

export const AIMPOINT_READ_DRILLS = {
  "AIMPOINT-READ-6FT": {
    title: "6 ft and in",
    match: "aim point 6foot and in",
    spots: ["first", "late"],
    tip: "Inside 6 ft, the two-thirds read near the hole matters most. That's where the ball breaks most.",
  },
  "AIMPOINT-READ-8-20FT": {
    title: "8 to 20 ft",
    match: "aim point 8foot to 20ft",
    spots: ["first", "late"],
    tip: "From 8 to 20 ft, late slope near the hole is easy to miss. Trust the two-thirds read.",
  },
  "AIMPOINT-READ-21-40FT": {
    title: "21 to 40 ft",
    match: "aim point 21foot to 40ft",
    spots: ["first", "middle", "late"],
    tip: "From 21 to 40 ft, take all three reads and blend them rather than going off one spot.",
  },
} as const satisfies Record<string, { title: string; match: string; spots: readonly ReadSpot[]; tip: string }>;

export type AimpointReadKey = keyof typeof AIMPOINT_READ_DRILLS;

export function isAimpointReadKey(key: string | null | undefined): key is AimpointReadKey {
  return key != null && key in AIMPOINT_READ_DRILLS;
}

export const AIMPOINT_READ_PUTTS = 10;
export const AIMPOINT_READ_MAX_SCORE = 100;
export const AIMPOINT_READ_SCORE_TYPE = `makes/${AIMPOINT_READ_MAX_SCORE}`;
/** Reads this close (in %) count as on the money. */
const CLOSE = 0.2;

export type SlopeRead = { read: number; actual: number };
export type SpotRead = SlopeRead & { putt: number; spot: ReadSpot };

export function readPoints(r: SlopeRead): number {
  return pointsForAbsoluteError(Math.abs(r.read - r.actual));
}

/** Points earned as a score out of 100 (each read is worth up to 10). */
export function aimpointReadScore(reads: SlopeRead[]): number {
  if (!reads.length) return 0;
  const pts = reads.reduce((s, r) => s + readPoints(r), 0);
  return Math.round((pts / (reads.length * 10)) * AIMPOINT_READ_MAX_SCORE);
}

export const SLOPE_BANDS = [
  { key: "gentle", label: "Gentle (under 1%)", min: 0, max: 1 },
  { key: "medium", label: "Medium (1–2.4%)", min: 1, max: 2.5 },
  { key: "steep", label: "Steep (2.5%+)", min: 2.5, max: Infinity },
] as const;
type SlopeBandKey = (typeof SLOPE_BANDS)[number]["key"];

const BAND_TIPS: Record<SlopeBandKey, string> = {
  gentle:
    "Practise on near-flat putts. Stand with your feet together, close your eyes, and only call it 1% or more when you clearly feel one foot taking more weight.",
  medium:
    "Most putts are 1 to 2.5%. Do a few slow reads on one putt, check each against your level, and learn what 1.5% and 2% feel like.",
  steep:
    "On steep slopes, feel the heavy foot for a few seconds before you call a number, then check it against the level. Steep slopes are easy to under-call.",
};

/** Average signed miss beyond 0.1% (after rounding to 0.1%) counts as a lean. */
export function leanOf(bias: number): "high" | "low" | null {
  const r = Math.round(bias * 10) / 10;
  return r > 0.1 ? "high" : r < -0.1 ? "low" : null;
}

export function aimpointReadReport(reads: SpotRead[]) {
  const errs = reads.map((p) => p.read - p.actual);
  const n = reads.length || 1;
  const score = aimpointReadScore(reads);
  const avgAbsErr = errs.reduce((s, e) => s + Math.abs(e), 0) / n;
  const bias = errs.reduce((s, e) => s + e, 0) / n;
  const close = errs.filter((e) => Math.abs(e) <= CLOSE).length;
  const over = errs.filter((e) => e > CLOSE).length;
  const under = errs.filter((e) => e < -CLOSE).length;
  const wayOut = errs.filter((e) => Math.abs(e) > 1).length;

  const bands = SLOPE_BANDS.map((b) => {
    const at = reads.filter((p) => Math.abs(p.actual) >= b.min && Math.abs(p.actual) < b.max);
    return {
      ...b,
      n: at.length,
      avgAbsErr: at.length ? at.reduce((s, p) => s + Math.abs(p.read - p.actual), 0) / at.length : 0,
    };
  }).filter((b) => b.n > 0);
  const ranked = [...bands].sort((a, b) => b.avgAbsErr - a.avgAbsErr);
  const weakBand =
    ranked.length > 1 && ranked[0]!.avgAbsErr - ranked[ranked.length - 1]!.avgAbsErr >= 0.15 ? ranked[0]! : null;

  const spots = (Object.keys(READ_SPOTS) as ReadSpot[])
    .map((spot) => {
      const at = reads.filter((p) => p.spot === spot);
      const spotErrs = at.map((p) => p.read - p.actual);
      return {
        spot,
        label: READ_SPOTS[spot].label,
        n: at.length,
        avgAbsErr: at.length ? spotErrs.reduce((s, e) => s + Math.abs(e), 0) / at.length : 0,
        bias: at.length ? spotErrs.reduce((s, e) => s + e, 0) / at.length : 0,
      };
    })
    .filter((s) => s.n > 0);
  const spotsRanked = [...spots].sort((a, b) => b.avgAbsErr - a.avgAbsErr);
  const weakSpot =
    spotsRanked.length > 1 && spotsRanked[0]!.avgAbsErr - spotsRanked[spotsRanked.length - 1]!.avgAbsErr >= 0.15
      ? spotsRanked[0]!
      : null;

  const reader: "Over-reader" | "Under-reader" | "Balanced reader" =
    leanOf(bias) === "high" ? "Over-reader" : leanOf(bias) === "low" ? "Under-reader" : "Balanced reader";

  const off = over + under;
  const lean = off > 0 ? Math.max(over, under) / off : 0;
  let focus: { title: string; lines: string[] };
  if (close === reads.length) {
    focus = {
      title: "Great reading",
      lines: ["Every read was within 0.2%. Keep it sharp, or move on to longer putts."],
    };
  } else if (off >= 3 && lean >= 0.7) {
    focus =
      over > under
        ? {
            title: "Practise: reading less slope",
            lines: [
              `${over} of your ${off} misses called more slope than was there.`,
              "When you're between two numbers, go with the smaller one, and let your feet decide before your eyes.",
            ],
          }
        : {
            title: "Practise: seeing all the slope",
            lines: [
              `${under} of your ${off} misses called less slope than was there.`,
              "Stand still a little longer and feel which foot takes more weight. When you're unsure, go one step higher.",
            ],
          };
    if (weakBand) focus.lines.push(`Your biggest misses were on ${weakBand.label.toLowerCase()} slopes.`);
  } else if (weakBand) {
    focus = {
      title: `Practise: ${weakBand.label.split(" (")[0]!.toLowerCase()} slopes`,
      lines: [`You were out by ${weakBand.avgAbsErr.toFixed(1)}% on average there.`, BAND_TIPS[weakBand.key]],
    };
  } else {
    focus = {
      title: "Practise: tighter reads",
      lines: [
        `${close} of your ${reads.length} reads were within 0.2%.`,
        "Get to the nearest 0.5% first, then fine-tune. Check every read against your level.",
      ],
    };
  }

  if (weakSpot && close < reads.length) focus.lines.push(SPOT_TIPS[weakSpot.spot]);

  return {
    score,
    avgAbsErr,
    bias,
    close,
    over,
    under,
    wayOut,
    bands,
    weakBand: weakBand?.key ?? null,
    spots,
    weakSpot: weakSpot?.spot ?? null,
    reader,
    focus,
  };
}

export type AimpointReadDetails = { kind: "aimpoint_reads"; spots: readonly ReadSpot[]; reads: SpotRead[] };
