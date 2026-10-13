import type { CombineLeaderboardTestId } from "@/lib/academyCombinesLeaderboard";

export type GameArea = "driving" | "irons" | "wedges" | "chipping" | "bunkers" | "putting";

export const GAME_AREAS: { id: GameArea; label: string }[] = [
  { id: "driving", label: "Driving" },
  { id: "irons", label: "Irons" },
  { id: "wedges", label: "Wedges" },
  { id: "chipping", label: "Chipping" },
  { id: "bunkers", label: "Bunkers" },
  { id: "putting", label: "Putting" },
];

/** [handicap, typical score] pairs. Plus handicaps are negative (+4 is -4). */
export type BenchmarkAnchors = readonly (readonly [number, number])[];

export type CombineBenchmark = {
  area: GameArea;
  /** Score units match the leaderboard. Bunker Lies is in strokes, so lower is better. */
  anchors: BenchmarkAnchors;
};

/**
 * Typical score at each handicap for every combine that feeds the practice handicap.
 * A combine missing from this table doesn't count. Tune these as real academy results come in.
 */
export const PRACTICE_HANDICAP_BENCHMARKS: Partial<Record<CombineLeaderboardTestId, CombineBenchmark>> = {
  // Driving
  tee_shot_hazard: { area: "driving", anchors: [[-4, 115], [0, 95], [9, 70], [18, 45], [28, 15]] },
  driver_flight_control: { area: "driving", anchors: [[-4, 38], [0, 30], [9, 21], [18, 13], [28, 6]] },

  // Irons
  ironPrecisionProtocol: { area: "irons", anchors: [[-4, 85], [0, 68], [9, 50], [18, 32], [28, 18]] },
  iron_face_control: { area: "irons", anchors: [[-4, 85], [0, 70], [9, 52], [18, 35], [28, 20]] },
  iron_safe_side: { area: "irons", anchors: [[-4, 72], [0, 58], [9, 40], [18, 22], [28, 5]] },
  iron_fade_draw: { area: "irons", anchors: [[-4, 80], [0, 65], [9, 45], [18, 28], [28, 12]] },

  // Wedges
  wedge_lateral_9: { area: "wedges", anchors: [[-4, 90], [0, 72], [9, 54], [18, 36], [28, 22]] },
  three_strikes: { area: "wedges", anchors: [[-4, 15], [0, 10], [9, 6], [18, 3], [28, 1]] },
  survival_20: { area: "wedges", anchors: [[-4, 25], [0, 15], [9, 9], [18, 5], [28, 2]] },

  // Chipping
  chipping_combine_9: { area: "chipping", anchors: [[-4, 90], [0, 77], [9, 60], [18, 40], [28, 23]] },
  flop_shot: { area: "chipping", anchors: [[-4, 135], [0, 115], [9, 90], [18, 60], [28, 35]] },
  chipping: { area: "chipping", anchors: [[-4, 120], [0, 105], [9, 85], [18, 60], [28, 35]] },

  // Bunkers
  bunker_protocol: { area: "bunkers", anchors: [[-4, 85], [0, 65], [9, 40], [18, 15], [28, -15]] },
  bunker_lies: { area: "bunkers", anchors: [[-4, 21], [0, 24], [9, 28], [18, 32], [28, 37]] },

  // Putting
  puttingCombine: { area: "putting", anchors: [[-4, 145], [0, 120], [9, 90], [18, 50], [28, 25]] },
  puttingTest9Holes: { area: "putting", anchors: [[-4, 73], [0, 60], [9, 45], [18, 25], [28, 10]] },
  puttingTest3To6ft: { area: "putting", anchors: [[-4, 95], [0, 85], [9, 70], [18, 50], [28, 30]] },
  puttingTest8To20: { area: "putting", anchors: [[-4, 85], [0, 72], [9, 55], [18, 35], [28, 18]] },
  puttingTest20To40: { area: "putting", anchors: [[-4, 70], [0, 58], [9, 42], [18, 22], [28, 8]] },
  aimpoint_6ft_combine: { area: "putting", anchors: [[-4, 90], [0, 80], [9, 65], [18, 50], [28, 35]] },
  slope_mid_20ft: { area: "putting", anchors: [[-4, 85], [0, 72], [9, 58], [18, 45], [28, 30]] },
  aimpoint_long_40ft: { area: "putting", anchors: [[-4, 80], [0, 65], [9, 50], [18, 38], [28, 25]] },
};

/** Handicaps every benchmark sets a score for, best first. */
export const BENCHMARK_LEVELS = [-4, 0, 9, 18, 28] as const;

/** True when lower scores are better (Bunker Lies strokes), read from the default anchors. */
export function benchmarkLowerIsBetter(anchors: BenchmarkAnchors): boolean {
  const pts = [...anchors].sort((a, b) => a[0] - b[0]);
  return pts[pts.length - 1]![1] > pts[0]![1];
}

/** Scores must get steadily worse as the handicap goes up, or the handicap can't be read off them. */
export function benchmarkOrderError(scores: number[], lowerIsBetter: boolean): string | null {
  for (let i = 1; i < scores.length; i++) {
    const ok = lowerIsBetter ? scores[i]! > scores[i - 1]! : scores[i]! < scores[i - 1]!;
    if (!ok) {
      return lowerIsBetter
        ? "Each handicap needs more strokes than the better one above it."
        : "Each handicap needs a lower score than the better one above it.";
    }
  }
  return null;
}

export const PRACTICE_HANDICAP_MIN = -6;
export const PRACTICE_HANDICAP_MAX = 40;

/** Handicap a score plays to, read off the anchors and extended past the ends. */
export function handicapFromScore(anchors: BenchmarkAnchors, score: number): number {
  const pts = [...anchors].sort((a, b) => a[0] - b[0]);
  let seg = 0;
  const ascending = pts[pts.length - 1]![1] > pts[0]![1];
  while (seg < pts.length - 2) {
    const next = pts[seg + 1]![1];
    const beyond = ascending ? score > next : score < next;
    if (!beyond) break;
    seg++;
  }
  const [h0, s0] = pts[seg]!;
  const [h1, s1] = pts[seg + 1]!;
  const h = s1 === s0 ? h0 : h0 + ((score - s0) * (h1 - h0)) / (s1 - s0);
  return Math.min(PRACTICE_HANDICAP_MAX, Math.max(PRACTICE_HANDICAP_MIN, h));
}
