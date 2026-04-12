export type AimpointPuttReadings = {
  putt: number;
  /** Optional target length (ft) for mid-range protocols */
  target_ft?: number;
  pct_33_guess: number;
  pct_33_actual: number;
  pct_66_guess: number;
  pct_66_actual: number;
};

/** Points from absolute error (same % units as inputs). */
export function pointsForAbsoluteError(absErr: number): number {
  if (absErr <= 0.05) return 10;
  if (absErr <= 0.2) return 8;
  if (absErr <= 0.5) return 5;
  if (absErr <= 1.0) return 1;
  return 0;
}

/** Two scored errors per putt (33% and 66% marks); 10 putts → 20 measurements, max 200 points. */
export function totalPointsForPutt(p: AimpointPuttReadings): number {
  const e33 = Math.abs(p.pct_33_guess - p.pct_33_actual);
  const e66 = Math.abs(p.pct_66_guess - p.pct_66_actual);
  return pointsForAbsoluteError(e33) + pointsForAbsoluteError(e66);
}

export function totalPointsSession(putts: AimpointPuttReadings[]): number {
  return putts.reduce((s, p) => s + totalPointsForPutt(p), 0);
}

export function calibrationScorePercent(totalPoints: number, maxPoints = 200): number {
  return (totalPoints / maxPoints) * 100;
}

/** Average (guess − actual) across 20 pair-differences (two per putt). */
export function averageBias(putts: AimpointPuttReadings[]): number {
  if (putts.length === 0) return 0;
  const vals: number[] = [];
  for (const p of putts) {
    vals.push(p.pct_33_guess - p.pct_33_actual, p.pct_66_guess - p.pct_66_actual);
  }
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function readerLabelFromBias(avgBias: number): "Under-Reader" | "Over-Reader" | "Neutral" {
  if (avgBias > 0.02) return "Over-Reader";
  if (avgBias < -0.02) return "Under-Reader";
  return "Neutral";
}

export function avgPointsAt33(putts: AimpointPuttReadings[]): number {
  if (putts.length === 0) return 0;
  const sum = putts.reduce((s, p) => {
    const e = Math.abs(p.pct_33_guess - p.pct_33_actual);
    return s + pointsForAbsoluteError(e);
  }, 0);
  return sum / putts.length;
}

export function avgPointsAt66(putts: AimpointPuttReadings[]): number {
  if (putts.length === 0) return 0;
  const sum = putts.reduce((s, p) => {
    const e = Math.abs(p.pct_66_guess - p.pct_66_actual);
    return s + pointsForAbsoluteError(e);
  }, 0);
  return sum / putts.length;
}

export function captureZonePerceptionMessage(
  putts: AimpointPuttReadings[],
): string | null {
  const a33 = avgPointsAt33(putts);
  const a66 = avgPointsAt66(putts);
  if (a66 < a33) return "Capture Zone Perception Error.";
  return null;
}
