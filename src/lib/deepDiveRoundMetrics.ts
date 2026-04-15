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
  return {
    date: r.date,
    score: getNum(r.score),
    holes,
    total_gir: getNum(r.total_gir ?? r.totalGir),
    fir_hit: getNum(r.fir_hit ?? r.firHit),
    fir_left: getNum(r.fir_left ?? r.firLeft),
    fir_right: getNum(r.fir_right ?? r.firRight),
    up_and_down_conversions: getNum(r.up_and_down_conversions ?? r.upAndDownConversions),
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

function getChipInside6ft(r: ReturnType<typeof roundToCoachMetricShape>) {
  return r.chip_inside_6ft;
}

function getUpDownAttempts(r: ReturnType<typeof roundToCoachMetricShape>) {
  return r.up_and_down_conversions + r.missed + getNum(r.up_and_down_missed);
}

function calculateMetric(
  name: string,
  rounds: ReturnType<typeof roundToCoachMetricShape>[],
  extractor: (r: ReturnType<typeof roundToCoachMetricShape>) => number,
  goal: number,
  isLowerBetter = false,
): MetricMatrixRow {
  if (!rounds || rounds.length === 0) {
    return { name, current: 0, goal: Math.round(goal * 10) / 10, gap: 0, isLowerBetter, trend: "neutral" };
  }

  if (name.includes("%") && name !== "Scoring Avg") {
    let totalNumerator = 0;
    let totalDenominator = 0;

    rounds.forEach((rr) => {
      if (name === "GIR %") {
        totalNumerator += rr.total_gir;
        totalDenominator += rr.holes;
      } else if (name === "FIR %") {
        totalNumerator += rr.fir_hit;
        totalDenominator += rr.fir_hit + rr.fir_left + rr.fir_right;
      } else if (name === "Scrambling %") {
        totalNumerator += rr.up_and_down_conversions;
        totalDenominator += rr.up_and_down_conversions + rr.missed;
      } else if (name === "Bunker Save %") {
        totalNumerator += rr.bunker_saves;
        totalDenominator += rr.bunker_attempts + rr.bunker_saves;
      } else if (name === "GIR 8ft %") {
        totalNumerator += rr.gir_8ft;
        totalDenominator += rr.holes;
      } else if (name === "GIR 20ft %") {
        totalNumerator += rr.gir_20ft;
        totalDenominator += rr.holes;
      } else if (name === "Chips Inside 6ft %") {
        totalNumerator += getChipInside6ft(rr);
        totalDenominator += getUpDownAttempts(rr);
      } else if (name === "Putts Under 6ft %") {
        const attempts = rr.putts_under_6ft_attempts;
        const made = Math.max(rr.made_under_6ft, rr.missed_6ft_and_in, rr.made6ftAndIn);
        totalNumerator += made;
        totalDenominator += attempts;
      }
    });

    const current = totalDenominator > 0 ? (totalNumerator / totalDenominator) * 100 : 0;
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

  const nRounds = sortedRounds.length;

  if (nRounds === 0) {
    return { bigSix: null, penaltyStats: null, metricMatrix: [] };
  }

  const last5 = sortedRounds.slice(-5);
  const scoringAvg =
    last5.reduce((s, r) => s + getNum(r.score), 0) / Math.max(1, last5.length);

  const totalGir = sortedRounds.reduce((s, r) => s + r.total_gir, 0);
  const totalHolesForGir = sortedRounds.reduce((s, r) => s + getNum(r.holes, 18), 0);
  const girPct = totalHolesForGir > 0 ? (totalGir / totalHolesForGir) * 100 : 0;

  const totalFirHit = sortedRounds.reduce((s, r) => s + r.fir_hit, 0);
  const totalFirShots = sortedRounds.reduce(
    (s, r) => s + r.fir_hit + r.fir_left + r.fir_right,
    0,
  );
  const firPct = totalFirShots > 0 ? (totalFirHit / totalFirShots) * 100 : 0;

  const totalScrambleSuccess = sortedRounds.reduce((s, r) => s + r.up_and_down_conversions, 0);
  const totalScrambleAttempts = sortedRounds.reduce(
    (s, r) => s + r.up_and_down_conversions + r.missed,
    0,
  );
  const scramblePct =
    totalScrambleAttempts > 0 ? (totalScrambleSuccess / totalScrambleAttempts) * 100 : 0;

  const totalPutts = sortedRounds.reduce((s, r) => s + r.total_putts, 0);
  const totalHoles = sortedRounds.reduce((s, r) => s + getNum(r.holes, 18), 0);
  const puttsPer18 = totalHoles > 0 ? (totalPutts / totalHoles) * 18 : 0;

  const totalBirdies = sortedRounds.reduce((s, r) => s + r.birdies, 0);
  const birdiesPer18 = totalHoles > 0 ? (totalBirdies / totalHoles) * 18 : 0;

  const bigSix: DeepDiveBigSix = {
    scoringAvg: Math.round(scoringAvg * 10) / 10,
    girPct: Math.round(girPct * 10) / 10,
    firPct: Math.round(firPct * 10) / 10,
    scramblePct: Math.round(scramblePct * 10) / 10,
    puttsPer18: Math.round(puttsPer18 * 10) / 10,
    birdiesPer18: Math.round(birdiesPer18 * 10) / 10,
  };

  const totalPenalties = sortedRounds.reduce(
    (s, r) => s + r.tee_penalties + r.approach_penalties,
    0,
  );
  const total3Putts = sortedRounds.reduce((s, r) => s + r.three_putts, 0);
  const totalDoublePlus = sortedRounds.reduce((s, r) => s + r.double_bogeys, 0);

  const penaltyStats: DeepDivePenaltyStats = {
    penaltiesPerRound: Math.round((totalPenalties / nRounds) * 10) / 10,
    threePuttsPerRound: Math.round((total3Putts / nRounds) * 10) / 10,
    doublesPerRound: Math.round((totalDoublePlus / nRounds) * 10) / 10,
  };

  const matrix: MetricMatrixRow[] = [
    calculateMetric("Scoring Avg", sortedRounds, (r) => getNum(r.score), goals.score, true),
    calculateMetric("GIR %", sortedRounds, (r) => (r.total_gir / getNum(r.holes, 18)) * 100, goals.gir),
    calculateMetric(
      "FIR %",
      sortedRounds,
      (r) => {
        const tot = r.fir_hit + r.fir_left + r.fir_right;
        return tot > 0 ? (r.fir_hit / tot) * 100 : 0;
      },
      goals.fir,
    ),
    calculateMetric(
      "Scrambling %",
      sortedRounds,
      (r) => {
        const tot = r.up_and_down_conversions + r.missed;
        return tot > 0 ? (r.up_and_down_conversions / tot) * 100 : 0;
      },
      goals.upAndDown,
    ),
    calculateMetric(
      "Putts Per 18",
      sortedRounds,
      (r) => (r.total_putts / getNum(r.holes, 18)) * 18,
      goals.putts,
      true,
    ),
    calculateMetric(
      "Bunker Save %",
      sortedRounds,
      (r) => {
        const tot = r.bunker_attempts + r.bunker_saves;
        return tot > 0 ? (r.bunker_saves / tot) * 100 : 0;
      },
      goals.bunkerSaves,
    ),
    calculateMetric(
      "GIR 8ft %",
      sortedRounds,
      (r) => {
        const holes = getNum(r.holes, 18);
        return holes > 0 ? (r.gir_8ft / holes) * 100 : 0;
      },
      goals.within8ft,
    ),
    calculateMetric(
      "GIR 20ft %",
      sortedRounds,
      (r) => {
        const holes = getNum(r.holes, 18);
        return holes > 0 ? (r.gir_20ft / holes) * 100 : 0;
      },
      goals.within20ft,
    ),
    calculateMetric(
      "Chips Inside 6ft %",
      sortedRounds,
      (r) => {
        const denominator = getUpDownAttempts(r);
        const numerator = getChipInside6ft(r);
        if (denominator <= 0) return 0;
        return (numerator / denominator) * 100;
      },
      goals.chipsInside6ft,
    ),
    calculateMetric(
      "Putts Under 6ft %",
      sortedRounds,
      (r) => {
        const tot = r.putts_under_6ft_attempts;
        const made = Math.max(r.made_under_6ft, r.missed_6ft_and_in, r.made6ftAndIn);
        return tot > 0 ? (made / tot) * 100 : 0;
      },
      goals.puttMake6ft,
    ),
    calculateMetric(
      "3-Putts / Round",
      sortedRounds,
      (r) => (r.three_putts / getNum(r.holes, 18)) * 18,
      Math.max(0, goals.putts / 18 - 1),
      true,
    ),
    calculateMetric(
      "Tee Penalties",
      sortedRounds,
      (r) => (r.tee_penalties / getNum(r.holes, 18)) * 18,
      goals.teePenalties,
      true,
    ),
    calculateMetric(
      "Approach Penalties",
      sortedRounds,
      (r) => (r.approach_penalties / getNum(r.holes, 18)) * 18,
      goals.approachPenalties,
      true,
    ),
    calculateMetric(
      "Total Penalties",
      sortedRounds,
      (r) => ((r.tee_penalties + r.approach_penalties) / getNum(r.holes, 18)) * 18,
      goals.totalPenalties,
      true,
    ),
    calculateMetric(
      "Birdies / Round",
      sortedRounds,
      (r) => (r.birdies / getNum(r.holes, 18)) * 18,
      goals.birdies,
    ),
    calculateMetric(
      "Pars / Round",
      sortedRounds,
      (r) => (r.pars / getNum(r.holes, 18)) * 18,
      goals.pars,
    ),
    calculateMetric(
      "Bogeys / Round",
      sortedRounds,
      (r) => (r.bogeys / getNum(r.holes, 18)) * 18,
      goals.bogeys,
      true,
    ),
    calculateMetric(
      "Double Bogeys+ / Round",
      sortedRounds,
      (r) => (r.double_bogeys / getNum(r.holes, 18)) * 18,
      goals.doubleBogeys,
      true,
    ),
  ];

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
