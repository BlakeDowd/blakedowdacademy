/**
 * "Drives & 5s" (9HOL-DR5S-122): on-course combine over the 7 non-par-3 holes of a 9-hole round.
 * Each hole: two tee shots (fairway 0, rough 1, hazard/bunker/OB 2) plus strokes to hole out from
 * a wedge (80–120 m), a pitch (40–79 m) and a greenside chip. Lowest total wins.
 */

export const DRIVES_5S_DRILL_KEY = "9HOL-DR5S-122";
export const DRIVES_5S_DRILL_ID = "eea0615a-c417-458b-b8aa-16e80a7140ac";
export const DRIVES_5S_HOLES = 7;
export const DRIVES_5S_SCORE_TYPE = "strokes: pts";
/** 2 fairways (0) + three 2-shot hole-outs (2 each). */
export const DRIVES_5S_HOLE_BASELINE = 6;
export const DRIVES_5S_BASELINE = DRIVES_5S_HOLES * DRIVES_5S_HOLE_BASELINE;
/** "5+" on the stroke buttons. */
export const DRIVES_5S_MAX_STROKES = 5;

export type TeeResult = 0 | 1 | 2;
export type ChipDifficulty = "easy" | "medium" | "hard";
export type ShortStation = "approach" | "pitch" | "chip";

export const TEE_OPTIONS: { value: TeeResult; label: string; hint: string }[] = [
  { value: 0, label: "Fairway", hint: "0 pts" },
  { value: 1, label: "Rough", hint: "1 pt" },
  { value: 2, label: "Hazard", hint: "Bunker, OB, lost · 2 pts" },
];

export const SHORT_STATIONS: { key: ShortStation; label: string; range: string; holed: string }[] = [
  { key: "approach", label: "Wedge approach", range: "80–120 m", holed: "Holed" },
  { key: "pitch", label: "Pitch", range: "40–79 m", holed: "Holed" },
  { key: "chip", label: "Greenside chip", range: "Around the green", holed: "Chip in" },
];

export const CHIP_LIES: { difficulty: ChipDifficulty; lie: string }[] = [
  { difficulty: "easy", lie: "Fringe or fairway, plenty of green" },
  { difficulty: "medium", lie: "Standard rough or a tier to carry" },
  { difficulty: "hard", lie: "Bunker, or short-sided to a tucked pin" },
  { difficulty: "easy", lie: "Clean lie, plenty of green" },
  { difficulty: "medium", lie: "Downhill or sidehill rough" },
  { difficulty: "hard", lie: "Deep rough or a plugged bunker" },
  { difficulty: "hard", lie: "Toughest pin, recovery shot" },
];

export type Drives5sHole = {
  drive1: TeeResult | null;
  drive2: TeeResult | null;
  approach: number | null;
  pitch: number | null;
  chip: number | null;
};

export type Drives5sHoleLog = {
  drive1: TeeResult;
  drive2: TeeResult;
  approach: number;
  pitch: number;
  chip: number;
  chipDifficulty: ChipDifficulty;
};

export function emptyHole(): Drives5sHole {
  return { drive1: null, drive2: null, approach: null, pitch: null, chip: null };
}

export function holeComplete(h: Drives5sHole): boolean {
  return h.drive1 != null && h.drive2 != null && h.approach != null && h.pitch != null && h.chip != null;
}

/** Points scored so far on a hole (missing stations count 0). */
export function holePoints(h: Drives5sHole): number {
  return (h.drive1 ?? 0) + (h.drive2 ?? 0) + (h.approach ?? 0) + (h.pitch ?? 0) + (h.chip ?? 0);
}

export const BENCHMARK_TIERS = [
  { label: "Tour", range: "Under 40", max: 39 },
  { label: "Scratch–4", range: "40–46", max: 46 },
  { label: "5–9 hcp", range: "47–56", max: 56 },
  { label: "10–18 hcp", range: "57–70", max: 70 },
  { label: "19+ hcp", range: "71+", max: Infinity },
] as const;

export function benchmarkTier(total: number) {
  return BENCHMARK_TIERS.find((t) => total <= t.max) ?? BENCHMARK_TIERS[BENCHMARK_TIERS.length - 1]!;
}

export function toLogs(holes: Drives5sHole[]): Drives5sHoleLog[] {
  return holes.flatMap((h, i) =>
    holeComplete(h)
      ? [
          {
            drive1: h.drive1!,
            drive2: h.drive2!,
            approach: h.approach!,
            pitch: h.pitch!,
            chip: h.chip!,
            chipDifficulty: CHIP_LIES[i]?.difficulty ?? "medium",
          },
        ]
      : [],
  );
}

export function drives5sSummary(holes: Drives5sHoleLog[]) {
  const total = holes.reduce((s, h) => s + h.drive1 + h.drive2 + h.approach + h.pitch + h.chip, 0);
  const tees = holes.flatMap((h) => [h.drive1, h.drive2]);
  const driving = {
    fairways: tees.filter((t) => t === 0).length,
    rough: tees.filter((t) => t === 1).length,
    hazard: tees.filter((t) => t === 2).length,
    shots: tees.length,
  };
  const station = (key: ShortStation) => {
    const strokes = holes.map((h) => h[key]);
    return {
      key,
      avg: strokes.length ? strokes.reduce((s, n) => s + n, 0) / strokes.length : 0,
      holed: strokes.filter((n) => n === 1).length,
      upAndDowns: strokes.filter((n) => n <= 2).length,
      count: strokes.length,
    };
  };
  const short = SHORT_STATIONS.map((s) => ({ ...s, ...station(s.key) }));
  const scrambles = short.reduce((s, x) => s + x.upAndDowns, 0);
  const scrambleChances = short.reduce((s, x) => s + x.count, 0);
  const chipByDifficulty = (["easy", "medium", "hard"] as const).map((d) => {
    const at = holes.filter((h) => h.chipDifficulty === d);
    return { difficulty: d, count: at.length, avg: at.length ? at.reduce((s, h) => s + h.chip, 0) / at.length : 0 };
  });
  return {
    total,
    vsBaseline: total - holes.length * DRIVES_5S_HOLE_BASELINE,
    tier: benchmarkTier(total),
    driving,
    drivingPct: driving.shots ? Math.round((driving.fairways / driving.shots) * 100) : 0,
    short,
    scrambles,
    scrambleChances,
    scramblePct: scrambleChances ? Math.round((scrambles / scrambleChances) * 100) : 0,
    chipByDifficulty,
  };
}

export type Drives5sDetails = {
  kind: "drives_5s";
  holes: Drives5sHoleLog[];
  total: number;
  fairways: number;
  fairwayPct: number;
  scrambles: number;
  scramblePct: number;
};
