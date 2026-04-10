/** Primary reason for a missed first putt (saved on each miss row). */
export type PrimaryMissReason = "read" | "speed" | "startLine";

export const PRIMARY_MISS_LABELS: Record<PrimaryMissReason, string> = {
  read: "Read",
  speed: "Speed",
  startLine: "Start Line",
};

const DOMINANT_ADVICE: Record<PrimaryMissReason, string> = {
  startLine:
    "Your mechanics are the priority. Work on face-angle drills.",
  speed: "Work on your tempo and distance control.",
  read: "Work on your visualization and green-reading aim.",
};

export type HoleLogForDiagnostics = {
  outcome: "make" | "miss";
  primaryMissReason?: PrimaryMissReason | null;
};

export type MissDiagnosticsResult = {
  /** All first-putt misses in the session */
  totalMisses: number;
  /** Misses that include a primary reason (used for %) */
  counted: number;
  read: number;
  speed: number;
  startLine: number;
  percentages: Record<PrimaryMissReason, number>;
  dominant: PrimaryMissReason | null;
  dominantLabel: string;
  advice: string | null;
};

export function computeMissDiagnostics(
  entries: HoleLogForDiagnostics[],
): MissDiagnosticsResult | null {
  const misses = entries.filter((e) => e.outcome === "miss");
  if (misses.length === 0) return null;

  let read = 0;
  let speed = 0;
  let startLine = 0;
  for (const m of misses) {
    if (m.primaryMissReason === "read") read++;
    else if (m.primaryMissReason === "speed") speed++;
    else if (m.primaryMissReason === "startLine") startLine++;
  }
  const counted = read + speed + startLine;
  if (counted === 0) return null;

  const pct = (n: number) => Math.round((n / counted) * 100);
  const percentages: Record<PrimaryMissReason, number> = {
    read: pct(read),
    speed: pct(speed),
    startLine: pct(startLine),
  };

  const ranked: [PrimaryMissReason, number][] = [
    ["read", read],
    ["speed", speed],
    ["startLine", startLine],
  ];
  ranked.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0];
  const dominant = top[1] > 0 ? top[0] : null;

  return {
    totalMisses: misses.length,
    counted,
    read,
    speed,
    startLine,
    percentages,
    dominant,
    dominantLabel: dominant ? PRIMARY_MISS_LABELS[dominant] : "",
    advice: dominant ? DOMINANT_ADVICE[dominant] : null,
  };
}
