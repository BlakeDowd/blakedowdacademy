import { pointsForAbsoluteError } from "@/lib/aimpoint6ftCombineScoring";

export type LongRangePuttReadings = {
  putt: number;
  target_ft: number;
  pct_33_guess: number;
  pct_33_actual: number;
  pct_50_guess: number;
  pct_50_actual: number;
  pct_66_guess: number;
  pct_66_actual: number;
};

export function totalPointsForPutt(p: LongRangePuttReadings): number {
  const e33 = Math.abs(p.pct_33_guess - p.pct_33_actual);
  const e50 = Math.abs(p.pct_50_guess - p.pct_50_actual);
  const e66 = Math.abs(p.pct_66_guess - p.pct_66_actual);
  return (
    pointsForAbsoluteError(e33) + pointsForAbsoluteError(e50) + pointsForAbsoluteError(e66)
  );
}

export function totalPointsSession(putts: LongRangePuttReadings[]): number {
  return putts.reduce((s, p) => s + totalPointsForPutt(p), 0);
}

export function calibrationAccuracyPercent(totalPoints: number, maxPoints = 300): number {
  return (totalPoints / maxPoints) * 100;
}

/** Average (guess − actual) across all 30 readings. */
export function averageBiasLongRange(putts: LongRangePuttReadings[]): number {
  if (putts.length === 0) return 0;
  const vals: number[] = [];
  for (const p of putts) {
    vals.push(
      p.pct_33_guess - p.pct_33_actual,
      p.pct_50_guess - p.pct_50_actual,
      p.pct_66_guess - p.pct_66_actual,
    );
  }
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function avgPointsMark(
  putts: LongRangePuttReadings[],
  mark: "33" | "50" | "66",
): number {
  if (putts.length === 0) return 0;
  const key =
    mark === "33"
      ? (p: LongRangePuttReadings) => Math.abs(p.pct_33_guess - p.pct_33_actual)
      : mark === "50"
        ? (p: LongRangePuttReadings) => Math.abs(p.pct_50_guess - p.pct_50_actual)
        : (p: LongRangePuttReadings) => Math.abs(p.pct_66_guess - p.pct_66_actual);
  return putts.reduce((s, p) => s + pointsForAbsoluteError(key(p)), 0) / putts.length;
}

/**
 * If average points earned at 50% are worse than at both 33% and 66%, flag midpoint perception.
 */
export function midPointTumbleMessage(putts: LongRangePuttReadings[]): string | null {
  if (putts.length === 0) return null;
  const p33 = avgPointsMark(putts, "33");
  const p50 = avgPointsMark(putts, "50");
  const p66 = avgPointsMark(putts, "66");
  if (p50 < p33 && p50 < p66) {
    return "Mid-Point Tumble Perception Error.";
  }
  return null;
}

export function thirtyDataPoints(
  putts: LongRangePuttReadings[],
): Array<{
  index: number;
  putt: number;
  target_ft: number;
  mark: "33" | "50" | "66";
  guess: number;
  actual: number;
  abs_error: number;
}> {
  const out: Array<{
    index: number;
    putt: number;
    target_ft: number;
    mark: "33" | "50" | "66";
    guess: number;
    actual: number;
    abs_error: number;
  }> = [];
  let idx = 0;
  for (const p of putts) {
    const rows: Array<["33", number, number] | ["50", number, number] | ["66", number, number]> = [
      ["33", p.pct_33_guess, p.pct_33_actual],
      ["50", p.pct_50_guess, p.pct_50_actual],
      ["66", p.pct_66_guess, p.pct_66_actual],
    ];
    for (const [mark, g, a] of rows) {
      const abs = Math.abs(g - a);
      out.push({
        index: idx++,
        putt: p.putt,
        target_ft: p.target_ft,
        mark: mark as "33" | "50" | "66",
        guess: g,
        actual: a,
        abs_error: abs,
      });
    }
  }
  return out;
}
