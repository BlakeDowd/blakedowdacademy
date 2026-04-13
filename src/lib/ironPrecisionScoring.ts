import {
  normalizeLegacyVerticalStrike,
  type IronContact,
  type IronMissDirection,
  type IronStrike,
} from "@/lib/ironPrecisionProtocolConfig";

/** Recorded miss width: half-finger steps 0–4, or wider than 4 fingers. */
export type IronFingerMiss = number | "outside";

const FINGER_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const;

export function isValidFingerStep(value: number): boolean {
  return (FINGER_STEPS as readonly number[]).includes(value);
}

/** Base points from lateral dispersion (fingers). Outside / wider than 4 ⇒ 0 (same as greater than 4.0). */
export function fingerBandPoints(fingers: IronFingerMiss): number {
  if (fingers === "outside") return 0;
  if (fingers <= 0.5) return 10;
  if (fingers <= 1.5) return 7;
  if (fingers <= 2.5) return 4;
  if (fingers <= 4.0) return 1;
  return 0;
}

/** +2 when normalized vertical strike is solid and horizontal contact is middle. */
export function qualityBonusPoints(
  strike: IronStrike | string,
  contact: IronContact,
): number {
  return normalizeLegacyVerticalStrike(strike) === "solid" && contact === "middle" ? 2 : 0;
}

export function shotPoints(
  fingers: IronFingerMiss,
  strike: IronStrike | string,
  contact: IronContact,
): number {
  return fingerBandPoints(fingers) + qualityBonusPoints(strike, contact);
}

export type IronShotInput = {
  fingers: IronFingerMiss;
  strike: IronStrike | string;
  contact: IronContact;
};

/** Sum of per-shot points (theory max 9×12 with all solid + middle + best bands; dispersion-only max is 90). */
export function totalSessionPoints(shots: IronShotInput[]): number {
  return shots.reduce((sum, s) => sum + shotPoints(s.fingers, s.strike, s.contact), 0);
}

/** Shot consistency: average points per shot. */
export function averagePointsPerShot(shots: IronShotInput[]): number {
  if (shots.length === 0) return 0;
  return totalSessionPoints(shots) / shots.length;
}

/** Shots with miss width in the 0–1 finger range (not outside). */
export function wallShotCount(shots: Pick<IronShotInput, "fingers">[]): number {
  return shots.filter((s) => s.fingers !== "outside" && s.fingers <= 1.0).length;
}

/** Shots that score 0 on the finger band (outside or >4; only outside is used in UI). */
export function zeroPointBandShotCount(shots: Pick<IronShotInput, "fingers">[]): number {
  return shots.filter((s) => fingerBandPoints(s.fingers) === 0).length;
}

export function wallPercentage(shots: Pick<IronShotInput, "fingers">[]): number {
  if (shots.length === 0) return 0;
  return (wallShotCount(shots) / shots.length) * 100;
}

export function zeroPointRangePercentage(shots: Pick<IronShotInput, "fingers">[]): number {
  if (shots.length === 0) return 0;
  return (zeroPointBandShotCount(shots) / shots.length) * 100;
}

const CONTACT_LABEL: Record<IronContact, string> = {
  heel: "Heel",
  middle: "Middle",
  toe: "Toe",
};

/**
 * Among shots logged as left or right (lateral aim), if one side exceeds 60% of those shots,
 * returns a bias warning. All-straight sessions return null.
 */
export function dominantDirectionalBiasWarning(
  shots: { direction: IronMissDirection }[],
): string | null {
  const lateral = shots.filter((s) => s.direction === "left" || s.direction === "right");
  if (lateral.length === 0) return null;
  const leftN = lateral.filter((s) => s.direction === "left").length;
  const rightN = lateral.length - leftN;
  const leftRatio = leftN / lateral.length;
  if (leftRatio > 0.6) return "Warning: Dominant Left Bias detected.";
  const rightRatio = rightN / lateral.length;
  if (rightRatio > 0.6) return "Warning: Dominant Right Bias detected.";
  return null;
}

/**
 * For each lateral side with at least one shot, one line naming the dominant face contact
 * (e.g. share of heel / middle / toe contact on that side).
 */
export function horizontalStrikeSummaryLines(
  shots: { direction: IronMissDirection; contact: IronContact }[],
): string[] {
  const lines: string[] = [];
  for (const dir of ["left", "right"] as const) {
    const subset = shots.filter((s) => s.direction === dir);
    if (subset.length === 0) continue;
    const counts: Record<IronContact, number> = { heel: 0, middle: 0, toe: 0 };
    for (const s of subset) counts[s.contact]++;
    const ranked = (Object.entries(counts) as [IronContact, number][]).sort((a, b) => b[1] - a[1]);
    const [topContact, topCount] = ranked[0];
    if (topCount === 0) continue;
    const pct = Math.round((topCount / subset.length) * 100);
    const sideLabel = dir === "left" ? "Left" : "Right";
    lines.push(
      `${pct}% of your ${sideLabel} misses were ${CONTACT_LABEL[topContact]} contacts.`,
    );
  }
  return lines;
}

/** Normalize JSONB / API quirks: array, or JSON string of an array. */
export function coerceIronStrikeDataArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeIronContact(raw: unknown): IronContact | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "heel" || s === "middle" || s === "toe") return s;
  return null;
}

/** Recompute session total from `practice_logs.strike_data` (legacy `clip` → solid for bonus rules). */
export function totalIronPointsFromStrikeData(strikeData: unknown): number | null {
  const strikeArray = coerceIronStrikeDataArray(strikeData);
  if (!strikeArray) return null;
  let sum = 0;
  let counted = 0;
  for (const raw of strikeArray) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const contact = normalizeIronContact(o.contact);
    if (!contact) continue;
    const fingersRaw = o.fingers;
    let fingers: IronFingerMiss;
    if (fingersRaw === "outside") fingers = "outside";
    else if (typeof fingersRaw === "number" && Number.isFinite(fingersRaw)) fingers = fingersRaw;
    else {
      const n = Number(fingersRaw);
      fingers = Number.isFinite(n) ? n : 0;
    }
    sum += shotPoints(fingers, String(o.strike ?? "solid"), contact);
    counted++;
  }
  if (counted > 0) return sum;
  let ptsSum = 0;
  let ptsN = 0;
  for (const raw of strikeArray) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const p = o.points;
    const n = typeof p === "number" && Number.isFinite(p) ? p : typeof p === "string" ? Number(p) : NaN;
    if (Number.isFinite(n)) {
      ptsSum += n;
      ptsN++;
    }
  }
  return ptsN > 0 ? ptsSum : null;
}
