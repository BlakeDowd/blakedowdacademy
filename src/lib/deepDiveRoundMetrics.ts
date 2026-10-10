import {
  fairwaysPossibleFor,
  normalizeTrackedStats,
  roundsTrackingStat,
  sandSaveAttempts,
  upAndDownAttempts,
  type RoundStatKey,
} from "@/lib/roundStatTracking";

/** Same shape as `getBenchmarkGoals` from stats page (benchmark targets by handicap). */
export type BenchmarkGoalsShape = {
  score: number;
  gir: number;
  fir: number;
  upAndDown: number;
  putts: number;
  bunkerSaves: number;
  within8ft: number;
  within20ft: number;
  chipsInside6ft: number;
  puttMake6ft: number;
  teePenalties: number;
  approachPenalties: number;
  totalPenalties: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
};

function getNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return Number.isNaN(n) ? fallback : n;
}

/** Normalize a round (camelCase RoundData or snake Supabase) to snake_case fields used by metric math. */
export function roundToCoachMetricShape(r: Record<string, unknown>) {
  const holes = getNum(r.holes, 18);
  const trackedStats = Array.isArray(r.trackedStats)
    ? normalizeTrackedStats(r.trackedStats)
    : normalizeTrackedStats(r.tracked_stats);
  const upDownMade = getNum(r.up_and_down_conversions ?? r.upAndDownConversions ?? r.conversions);
  const upDownColumn = Math.max(getNum(r.missed), getNum(r.up_and_down_missed));
  return {
    date: r.date,
    trackedStats,
    score: getNum(r.score),
    holes,
    total_gir: getNum(r.total_gir ?? r.totalGir),
    fir_hit: getNum(r.fir_hit ?? r.firHit),
    fir_left: getNum(r.fir_left ?? r.firLeft),
    fir_right: getNum(r.fir_right ?? r.firRight),
    fairways_possible: getNum(r.fairways_possible ?? r.fairwaysPossible),
    up_and_down_conversions: upDownMade,
    up_and_down_attempts: upAndDownAttempts(upDownMade, upDownColumn, r.created_at ?? r.date),
    missed: getNum(r.missed),
    up_and_down_missed: getNum(r.up_and_down_missed),
    total_putts: getNum(r.total_putts ?? r.totalPutts),
    birdies: getNum(r.birdies),
    bogeys: getNum(r.bogeys),
    pars: getNum(r.pars),
    double_bogeys: getNum(r.double_bogeys ?? r.doubleBogeys),
    three_putts: getNum(r.three_putts ?? r.threePutts),
    tee_penalties: getNum(r.tee_penalties ?? r.teePenalties),
    approach_penalties: getNum(r.approach_penalties ?? r.approachPenalties),
    bunker_attempts: getNum(r.bunker_attempts ?? r.bunkerAttempts),
    bunker_saves: getNum(r.bunker_saves ?? r.bunkerSaves),
    gir_8ft: getNum(r.gir_8ft ?? r.gir8ft),
    gir_20ft: getNum(r.gir_20ft ?? r.gir20ft),
    chip_inside_6ft: getNum(
      r.chip_inside_6ft ?? r.chipInside6ft ?? r.inside_6ft ?? r.inside6ft,
    ),
    putts_under_6ft_attempts: getNum(r.putts_under_6ft_attempts ?? r.puttsUnder6ftAttempts),
    made_under_6ft: getNum(r.made_under_6ft),
    missed_6ft_and_in: getNum(r.missed_6ft_and_in),
    made6ftAndIn: getNum(r.made6ftAndIn),
  };
}

export type DeepDiveBigSix = {
  scoringAvg: number;
  girPct: number;
  firPct: number;
  scramblePct: number;
  puttsPer18: number;
  birdiesPer18: number;
};

export type DeepDivePenaltyStats = {
  penaltiesPerRound: number;
  threePuttsPerRound: number;
  doublesPerRound: number;
};

export type MetricMatrixRow = {
  name: string;
  current: number;
  goal: number;
  gap: number;
  isLowerBetter: boolean;
  trend: "up" | "down" | "neutral";
};

export type StrokeOpportunityRow = {
  name: string;
  current: number;
  goal: number;
  category: string;
  estimatedGain: number;
  unit: string;
};

type MetricRound = ReturnType<typeof roundToCoachMetricShape>;

const firPossible = (r: MetricRound) => fairwaysPossibleFor(r.fir_hit, r.fir_left, r.fir_right, r.fairways_possible);
const bunkerAttempts = (r: MetricRound) => sandSaveAttempts(r.bunker_saves, r.bunker_attempts);
const shortPuttsMade = (r: MetricRound) => Math.max(r.made_under_6ft, r.missed_6ft_and_in, r.made6ftAndIn);
const per18 = (count: number, r: MetricRound) => (count / getNum(r.holes, 18)) * 18;
const pctOf = (made: number, total: number) => (total > 0 ? (made / total) * 100 : 0);

/** Percentage metrics are pooled across rounds (total made / total chances), not averaged per round. */
const PERCENT_PARTS: Record<string, (r: MetricRound) => [number, number]> = {
  "GIR %": (r) => [r.total_gir, r.holes],
  "FIR %": (r) => [r.fir_hit, firPossible(r)],
  "Scrambling %": (r) => [r.up_and_down_conversions, r.up_and_down_attempts],
  "Bunker Save %": (r) => [r.bunker_saves, bunkerAttempts(r)],
  "GIR 8ft %": (r) => [r.gir_8ft, r.holes],
  "GIR 20ft %": (r) => [r.gir_20ft, r.holes],
  "Chips Inside 6ft %": (r) => [r.chip_inside_6ft, r.up_and_down_attempts],
  "Putts Under 6ft %": (r) => [shortPuttsMade(r), r.putts_under_6ft_attempts],
};

function calculateMetric(
  name: string,
  rounds: MetricRound[],
  extractor: (r: MetricRound) => number,
  goal: number,
  isLowerBetter = false,
): MetricMatrixRow {
  if (!rounds || rounds.length === 0) {
    return { name, current: 0, goal: Math.round(goal * 10) / 10, gap: 0, isLowerBetter, trend: "neutral" };
  }

  const parts = PERCENT_PARTS[name];
  if (parts) {
    let totalNumerator = 0;
    let totalDenominator = 0;
    rounds.forEach((rr) => {
      const [made, chances] = parts(rr);
      totalNumerator += made;
      totalDenominator += chances;
    });

    const current = pctOf(totalNumerator, totalDenominator);
    const gap = isLowerBetter ? goal - current : current - goal;

    let trend: "up" | "down" | "neutral" = "neutral";
    if (rounds.length > 1) {
      const latestVal = extractor(rounds[rounds.length - 1]!);
      if (latestVal > current * 1.05) trend = "up";
      else if (latestVal < current * 0.95) trend = "down";
    }

    return {
      name,
      current: Math.round(current * 10) / 10,
      goal: Math.round(goal * 10) / 10,
      gap: Math.round(gap * 10) / 10,
      isLowerBetter,
      trend,
    };
  }

  const current =
    rounds.reduce((s, rr) => s + extractor(rr), 0) / Math.max(1, rounds.length);
  const gap = isLowerBetter ? goal - current : current - goal;

  let trend: "up" | "down" | "neutral" = "neutral";
  if (rounds.length > 1) {
    const latest = extractor(rounds[rounds.length - 1]!);
    const prevAvg =
      rounds.slice(0, -1).reduce((s, rr) => s + extractor(rr), 0) / (rounds.length - 1);
    if (latest > prevAvg * 1.05) trend = "up";
    else if (latest < prevAvg * 0.95) trend = "down";
  }

  return {
    name,
    current: Math.round(current * 10) / 10,
    goal: Math.round(goal * 10) / 10,
    gap: Math.round(gap * 10) / 10,
    isLowerBetter,
    trend,
  };
}

export type ComputeDeepDiveRoundMetricsOptions = {
  /** Optional perf_stats rows (coach deep dive); extra numeric columns are appended to the matrix. */
  perfStatsData?: unknown[] | null;
};

type MetricSpec = {
  name: string;
  /** Rounds must have tracked all of these for the metric; empty = every round counts. */
  stats: RoundStatKey[];
  extractor: (r: MetricRound) => number;
  goal: number;
  lowerIsBetter?: boolean;
};

/** Pooled percentage over the given rounds, or -1 when none of them recorded it. */
function pooledPct(rounds: MetricRound[], parts: (r: MetricRound) => [number, number]): number {
  if (rounds.length === 0) return -1;
  let made = 0;
  let chances = 0;
  for (const r of rounds) {
    const [m, c] = parts(r);
    made += m;
    chances += c;
  }
  return chances > 0 ? Math.round(pctOf(made, chances) * 10) / 10 : -1;
}

/** Count per 18 holes over the given rounds, or -1 when none of them recorded it. */
function pooledPer18(rounds: MetricRound[], value: (r: MetricRound) => number): number {
  if (rounds.length === 0) return -1;
  const holes = rounds.reduce((s, r) => s + getNum(r.holes, 18), 0);
  const total = rounds.reduce((s, r) => s + value(r), 0);
  return holes > 0 ? Math.round((total / holes) * 18 * 10) / 10 : -1;
}

function perRound(rounds: MetricRound[], value: (r: MetricRound) => number): number {
  if (rounds.length === 0) return -1;
  return Math.round((rounds.reduce((s, r) => s + value(r), 0) / rounds.length) * 10) / 10;
}

export function computeDeepDiveRoundMetrics(
  rounds: readonly Record<string, unknown>[],
  goals: BenchmarkGoalsShape,
  options: ComputeDeepDiveRoundMetricsOptions = {},
): {
  bigSix: DeepDiveBigSix | null;
  penaltyStats: DeepDivePenaltyStats | null;
  metricMatrix: MetricMatrixRow[];
} {
  const { perfStatsData } = options;

  const sortedRounds = [...rounds]
    .map((r) => roundToCoachMetricShape(r as Record<string, unknown>))
    .sort((a, b) => new Date(String(a.date)).getTime() - new Date(String(b.date)).getTime());

  if (sortedRounds.length === 0) {
    return { bigSix: null, penaltyStats: null, metricMatrix: [] };
  }

  const tracking = (...keys: RoundStatKey[]) => roundsTrackingStat(sortedRounds, ...keys);

  const last5 = sortedRounds.slice(-5);
  const scoringAvg =
    last5.reduce((s, r) => s + getNum(r.score), 0) / Math.max(1, last5.length);

  const bigSix: DeepDiveBigSix = {
    scoringAvg: Math.round(scoringAvg * 10) / 10,
    girPct: pooledPct(tracking("gir"), PERCENT_PARTS["GIR %"]!),
    firPct: pooledPct(tracking("fairways"), PERCENT_PARTS["FIR %"]!),
    scramblePct: pooledPct(tracking("scrambling"), PERCENT_PARTS["Scrambling %"]!),
    puttsPer18: pooledPer18(tracking("putts"), (r) => r.total_putts),
    birdiesPer18: pooledPer18(tracking("distribution"), (r) => r.birdies),
  };

  const penaltyStats: DeepDivePenaltyStats = {
    penaltiesPerRound: perRound(tracking("penalties"), (r) => r.tee_penalties + r.approach_penalties),
    threePuttsPerRound: perRound(tracking("three_putts"), (r) => r.three_putts),
    doublesPerRound: perRound(tracking("distribution"), (r) => r.double_bogeys),
  };

  const specs: MetricSpec[] = [
    { name: "Scoring Avg", stats: [], extractor: (r) => getNum(r.score), goal: goals.score, lowerIsBetter: true },
    { name: "GIR %", stats: ["gir"], extractor: (r) => pctOf(r.total_gir, getNum(r.holes, 18)), goal: goals.gir },
    { name: "FIR %", stats: ["fairways"], extractor: (r) => pctOf(r.fir_hit, firPossible(r)), goal: goals.fir },
    {
      name: "Scrambling %",
      stats: ["scrambling"],
      extractor: (r) => pctOf(r.up_and_down_conversions, r.up_and_down_attempts),
      goal: goals.upAndDown,
    },
    {
      name: "Putts Per 18",
      stats: ["putts"],
      extractor: (r) => per18(r.total_putts, r),
      goal: goals.putts,
      lowerIsBetter: true,
    },
    {
      name: "Bunker Save %",
      stats: ["sand_saves"],
      extractor: (r) => pctOf(r.bunker_saves, bunkerAttempts(r)),
      goal: goals.bunkerSaves,
    },
    {
      name: "GIR 8ft %",
      stats: ["gir_proximity"],
      extractor: (r) => pctOf(r.gir_8ft, getNum(r.holes, 18)),
      goal: goals.within8ft,
    },
    {
      name: "GIR 20ft %",
      stats: ["gir_proximity"],
      extractor: (r) => pctOf(r.gir_20ft, getNum(r.holes, 18)),
      goal: goals.within20ft,
    },
    {
      name: "Chips Inside 6ft %",
      stats: ["chipping", "scrambling"],
      extractor: (r) => pctOf(r.chip_inside_6ft, r.up_and_down_attempts),
      goal: goals.chipsInside6ft,
    },
    {
      name: "Putts Under 6ft %",
      stats: ["short_putts"],
      extractor: (r) => pctOf(shortPuttsMade(r), r.putts_under_6ft_attempts),
      goal: goals.puttMake6ft,
    },
    {
      name: "3-Putts / Round",
      stats: ["three_putts"],
      extractor: (r) => per18(r.three_putts, r),
      goal: Math.max(0, goals.putts / 18 - 1),
      lowerIsBetter: true,
    },
    {
      name: "Tee Penalties",
      stats: ["penalties"],
      extractor: (r) => per18(r.tee_penalties, r),
      goal: goals.teePenalties,
      lowerIsBetter: true,
    },
    {
      name: "Approach Penalties",
      stats: ["penalties"],
      extractor: (r) => per18(r.approach_penalties, r),
      goal: goals.approachPenalties,
      lowerIsBetter: true,
    },
    {
      name: "Total Penalties",
      stats: ["penalties"],
      extractor: (r) => per18(r.tee_penalties + r.approach_penalties, r),
      goal: goals.totalPenalties,
      lowerIsBetter: true,
    },
    { name: "Birdies / Round", stats: ["distribution"], extractor: (r) => per18(r.birdies, r), goal: goals.birdies },
    { name: "Pars / Round", stats: ["distribution"], extractor: (r) => per18(r.pars, r), goal: goals.pars },
    {
      name: "Bogeys / Round",
      stats: ["distribution"],
      extractor: (r) => per18(r.bogeys, r),
      goal: goals.bogeys,
      lowerIsBetter: true,
    },
    {
      name: "Double Bogeys+ / Round",
      stats: ["distribution"],
      extractor: (r) => per18(r.double_bogeys, r),
      goal: goals.doubleBogeys,
      lowerIsBetter: true,
    },
  ];

  const matrix: MetricMatrixRow[] = specs.flatMap((spec) => {
    const parts = PERCENT_PARTS[spec.name];
    const used = tracking(...spec.stats).filter((r) => !parts || parts(r)[1] > 0);
    if (used.length === 0) return [];
    return [calculateMetric(spec.name, used, spec.extractor, spec.goal, spec.lowerIsBetter)];
  });

  if (perfStatsData && perfStatsData.length > 0) {
    const latestStats = perfStatsData[perfStatsData.length - 1] as Record<string, unknown>;
    const standardKeys = [
      "id",
      "user_id",
      "date",
      "created_at",
      "updated_at",
      "fairways_pct",
      "fir_pct",
      "fairways_hit_pct",
      "gir_pct",
      "green_contact_pct",
    ];

    Object.keys(latestStats).forEach((key) => {
      if (!standardKeys.includes(key) && typeof latestStats[key] === "number") {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
        const current = latestStats[key] as number;
        const goalVal = ((goals as Record<string, number>)[key] ?? 0) as number;

        matrix.push({
          name: label,
          current: Math.round(current * 10) / 10,
          goal: Math.round(goalVal * 10) / 10,
          gap: Math.round((current - goalVal) * 10) / 10,
          isLowerBetter:
            key.includes("penalties") || key.includes("score") || key.includes("putts"),
          trend: "neutral",
        });
      }
    });
  }

  return { bigSix, penaltyStats, metricMatrix: matrix };
}

const IMPACT_CONFIG: Record<string, { strokesPerUnit: number; unit: string; category: string }> = {
  "Total Penalties": { strokesPerUnit: 1.0, unit: "strokes/penalty", category: "Driving + Approach" },
  "3-Putts / Round": { strokesPerUnit: 1.0, unit: "strokes/3-putt", category: "Putting" },
  "Double Bogeys+ / Round": { strokesPerUnit: 1.0, unit: "strokes/double+", category: "Course Management" },
  "Putts Per 18": { strokesPerUnit: 0.8, unit: "strokes/putt", category: "Putting" },
  "Tee Penalties": { strokesPerUnit: 1.0, unit: "strokes/penalty", category: "Driving" },
  "Approach Penalties": { strokesPerUnit: 1.0, unit: "strokes/penalty", category: "Approach" },
  "Scrambling %": { strokesPerUnit: 0.05, unit: "strokes/%", category: "Short Game" },
  "Bunker Save %": { strokesPerUnit: 0.035, unit: "strokes/%", category: "Bunkers" },
  "Chips Inside 6ft %": { strokesPerUnit: 0.03, unit: "strokes/%", category: "Chipping" },
  "Putts Under 6ft %": { strokesPerUnit: 0.035, unit: "strokes/%", category: "Putting" },
  "GIR %": { strokesPerUnit: 0.02, unit: "strokes/%", category: "Approach" },
  "FIR %": { strokesPerUnit: 0.01, unit: "strokes/%", category: "Driving" },
  "GIR 8ft %": { strokesPerUnit: 0.01, unit: "strokes/%", category: "Approach" },
  "GIR 20ft %": { strokesPerUnit: 0.008, unit: "strokes/%", category: "Approach" },
  "Scoring Avg": { strokesPerUnit: 1.0, unit: "strokes", category: "Overall" },
};

export function computeStrokeOpportunityTop3(metricMatrix: MetricMatrixRow[]): StrokeOpportunityRow[] {
  if (!metricMatrix || metricMatrix.length === 0) return [];

  return metricMatrix
    .map((stat) => {
      const name = String(stat?.name ?? "");
      const current = Number(stat?.current ?? 0);
      const goal = Number(stat?.goal ?? 0);
      const isLowerBetter = Boolean(stat?.isLowerBetter);
      const config = IMPACT_CONFIG[name];

      if (!config) return null;

      const improvementUnits = isLowerBetter ? Math.max(0, current - goal) : Math.max(0, goal - current);
      const estimatedGain = improvementUnits * config.strokesPerUnit;

      if (estimatedGain <= 0) return null;

      return {
        name,
        current: Math.round(current * 10) / 10,
        goal: Math.round(goal * 10) / 10,
        category: config.category,
        estimatedGain: Math.round(estimatedGain * 100) / 100,
        unit: config.unit,
      };
    })
    .filter((x): x is StrokeOpportunityRow => x != null)
    .sort((a, b) => b.estimatedGain - a.estimatedGain)
    .slice(0, 3);
}

export function sortMetricMatrix(
  metricMatrix: MetricMatrixRow[],
  worstFirst: boolean,
): MetricMatrixRow[] {
  const gapNum = (row: MetricMatrixRow) => {
    const n = Number(row?.gap);
    return Number.isFinite(n) ? n : 0;
  };
  const rows = [...metricMatrix];
  rows.sort((a, b) => {
    const bestFirst = gapNum(b) - gapNum(a);
    if (bestFirst !== 0) return worstFirst ? -bestFirst : bestFirst;
    return String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
  });
  return rows;
}
