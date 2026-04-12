import type { AimpointPuttReadings } from "@/lib/aimpoint6ftCombineScoring";

export type MidRangeSlopePuttReadings = AimpointPuttReadings & {
  target_ft: number;
};

export function meanAbsError33(putts: AimpointPuttReadings[]): number {
  if (putts.length === 0) return 0;
  return (
    putts.reduce((s, p) => s + Math.abs(p.pct_33_guess - p.pct_33_actual), 0) / putts.length
  );
}

export function meanAbsError66(putts: AimpointPuttReadings[]): number {
  if (putts.length === 0) return 0;
  return (
    putts.reduce((s, p) => s + Math.abs(p.pct_66_guess - p.pct_66_actual), 0) / putts.length
  );
}

/**
 * If average absolute error at 66% is clearly worse than at 33% (late break), flag perception gap.
 */
export function lateBreakTransitionMessage(putts: AimpointPuttReadings[]): string | null {
  if (putts.length === 0) return null;
  const m33 = meanAbsError33(putts);
  const m66 = meanAbsError66(putts);
  if (m66 > m33 + 0.12 && m66 >= 0.18) {
    return "Failing To See Late-Break Transitions.";
  }
  return null;
}

/** Twenty explicit measurement rows for metadata / charting. */
export function twentySlopeDataPoints(
  putts: MidRangeSlopePuttReadings[],
): Array<{
  index: number;
  putt: number;
  target_ft: number;
  mark: "33" | "66";
  guess: number;
  actual: number;
  abs_error: number;
}> {
  const out: Array<{
    index: number;
    putt: number;
    target_ft: number;
    mark: "33" | "66";
    guess: number;
    actual: number;
    abs_error: number;
  }> = [];
  let idx = 0;
  for (const p of putts) {
    const e33 = Math.abs(p.pct_33_guess - p.pct_33_actual);
    const e66 = Math.abs(p.pct_66_guess - p.pct_66_actual);
    out.push(
      {
        index: idx++,
        putt: p.putt,
        target_ft: p.target_ft,
        mark: "33",
        guess: p.pct_33_guess,
        actual: p.pct_33_actual,
        abs_error: e33,
      },
      {
        index: idx++,
        putt: p.putt,
        target_ft: p.target_ft,
        mark: "66",
        guess: p.pct_66_guess,
        actual: p.pct_66_actual,
        abs_error: e66,
      },
    );
  }
  return out;
}
