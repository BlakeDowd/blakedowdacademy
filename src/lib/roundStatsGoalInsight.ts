import { handicapToMilestoneStrokesGap } from "@/lib/goalAccountability";
import {
  SCORING_MILESTONE_LABELS,
  formatWeeklyHoursLabel,
  weeklyHoursPresetToStoredHours,
  type ScoringMilestonePreset,
  type WeeklyHoursPreset,
} from "@/lib/goalPresetConstants";
import type { GoalFocusArea } from "@/types/playerGoals";

/** Buckets aligned with classic SG-style reporting (map to focus presets in the app). */
export type StatWeakBucket = "off_tee" | "approach" | "short_game" | "putting";

export type RoundStatRow = {
  loss_off_tee?: number | null;
  loss_approach?: number | null;
  loss_short_game?: number | null;
  loss_putting?: number | null;
  /** When set, used to default goal “Current handicap” from stats. */
  handicap_index?: number | null;
};

export type RoundLikeForHandicap = {
  handicap?: number | null;
  created_at?: string | null;
};

export type RoundLikeForInsight = {
  handicap?: number | null;
  holes?: number;
  teePenalties?: number;
  firLeft?: number;
  firHit?: number;
  firRight?: number;
  approachPenalties?: number;
  totalGir?: number;
  upAndDownConversions?: number;
  missed?: number;
  bunkerAttempts?: number;
  bunkerSaves?: number;
  doubleChips?: number;
  chipInside6ft?: number;
  threePutts?: number;
  totalPutts?: number;
};

const BUCKET_ORDER: StatWeakBucket[] = ["putting", "short_game", "approach", "off_tee"];

export function weakestBucketDisplay(bucket: StatWeakBucket): string {
  const labels: Record<StatWeakBucket, string> = {
    off_tee: "Off the Tee",
    approach: "Approach",
    short_game: "Short Game",
    putting: "Putting",
  };
  return labels[bucket];
}

export function focusMatchesWeakestBucket(focus: GoalFocusArea, weakest: StatWeakBucket | null): boolean {
  if (!weakest) return true;
  if (weakest === "off_tee") return focus === "Driving";
  if (weakest === "approach") return focus === "Irons" || focus === "Wedges";
  if (weakest === "short_game") return focus === "Chipping" || focus === "Bunkers";
  if (weakest === "putting") return focus === "Putting";
  return false;
}

function statRowsHaveSignal(rows: RoundStatRow[]): boolean {
  return rows.some((r) =>
    [r.loss_off_tee, r.loss_approach, r.loss_short_game, r.loss_putting].some(
      (v) => v != null && Number.isFinite(Number(v)) && Number(v) !== 0,
    ),
  );
}

function pickWeakestFromTotals(totals: Record<StatWeakBucket, number>): StatWeakBucket | null {
  let best: StatWeakBucket | null = null;
  let bestV = -Infinity;
  for (const b of ["off_tee", "approach", "short_game", "putting"] as const) {
    const v = totals[b];
    if (v > bestV) {
      bestV = v;
      best = b;
    } else if (v === bestV && best !== null && BUCKET_ORDER.indexOf(b) < BUCKET_ORDER.indexOf(best)) {
      best = b;
    }
  }
  if (best === null || bestV <= 0) return null;
  return best;
}

export function weakestBucketFromRoundStatRows(rows: RoundStatRow[]): StatWeakBucket | null {
  if (!rows.length) return null;
  const totals: Record<StatWeakBucket, number> = {
    off_tee: 0,
    approach: 0,
    short_game: 0,
    putting: 0,
  };
  for (const r of rows) {
    totals.off_tee += Number(r.loss_off_tee ?? 0);
    totals.approach += Number(r.loss_approach ?? 0);
    totals.short_game += Number(r.loss_short_game ?? 0);
    totals.putting += Number(r.loss_putting ?? 0);
  }
  return pickWeakestFromTotals(totals);
}

/** Heuristic “stroke pressure” per bucket from scorecard-style fields (last N rounds). */
export function weakestBucketFromRoundProxies(rounds: RoundLikeForInsight[]): StatWeakBucket | null {
  if (!rounds.length) return null;
  const totals: Record<StatWeakBucket, number> = {
    off_tee: 0,
    approach: 0,
    short_game: 0,
    putting: 0,
  };
  for (const r of rounds) {
    const h = Math.max(1, r.holes ?? 18);
    const firL = r.firLeft ?? 0;
    const firH = r.firHit ?? 0;
    const firR = r.firRight ?? 0;
    const firAtt = firL + firH + firR;
    const firMiss = firL + firR;
    const gir = r.totalGir ?? 0;
    const girRate = gir / h;

    totals.off_tee += (r.teePenalties ?? 0) * 1.15 + firMiss * 0.12 + (firAtt > 0 ? (1 - firH / firAtt) * 2.2 * (h / 18) : 0);
    totals.approach += (r.approachPenalties ?? 0) * 1.15 + (1 - girRate) * 3.2;
    const udAtt = (r.upAndDownConversions ?? 0) + (r.missed ?? 0);
    const missRate = udAtt > 0 ? (r.missed ?? 0) / udAtt : 0;
    totals.short_game +=
      missRate * 3.5 +
      Math.max(0, (r.bunkerAttempts ?? 0) - (r.bunkerSaves ?? 0)) * 0.35 +
      (r.doubleChips ?? 0) * 0.45 +
      (r.chipInside6ft ?? 0) * 0.02;
    totals.putting += (r.threePutts ?? 0) * 0.42 + Math.max(0, (r.totalPutts ?? 0) - 31) * 0.18;
  }
  return pickWeakestFromTotals(totals);
}

/** True when there is any round_stats or logged round data to drive SG-style insights. */
export function hasStatsRoundContext(roundStatRows: RoundStatRow[], loggedRounds: RoundLikeForHandicap[]): boolean {
  return roundStatRows.length > 0 || loggedRounds.length > 0;
}

/**
 * Default “current handicap” from stats: prefers average `handicap_index` on recent `round_stats`,
 * else most recent non-null `handicap` on logged rounds.
 */
export function defaultHandicapFromStats(
  roundStatRows: RoundStatRow[],
  recentLoggedRounds: RoundLikeForHandicap[],
): number | null {
  const idxVals = roundStatRows
    .map((r) => r.handicap_index)
    .filter((v): v is number => v != null && Number.isFinite(Number(v)));
  if (idxVals.length > 0) {
    const sum = idxVals.reduce((a, v) => a + Number(v), 0);
    return Math.round((sum / idxVals.length) * 10) / 10;
  }
  for (const r of recentLoggedRounds) {
    const h = r.handicap;
    if (h != null && Number.isFinite(Number(h))) {
      return Math.round(Number(h) * 10) / 10;
    }
  }
  return null;
}

/** Average loss_putting per round_stats row (0 if none). */
export function avgPuttingLossFromRoundStats(rows: RoundStatRow[]): number {
  if (!rows.length) return 0;
  const sum = rows.reduce((a, r) => a + Number(r.loss_putting ?? 0), 0);
  return sum / rows.length;
}

/** Proxy “putting pressure” per round (same scale as weakestBucketFromRoundProxies line items). */
export function avgPuttingProxyFromRounds(rounds: RoundLikeForInsight[]): number {
  if (!rounds.length) return 0;
  let sum = 0;
  for (const r of rounds) {
    sum += (r.threePutts ?? 0) * 0.42 + Math.max(0, (r.totalPutts ?? 0) - 31) * 0.18;
  }
  return sum / rounds.length;
}

export function resolveWeakestBucket(roundStatRows: RoundStatRow[], fallbackRounds: RoundLikeForInsight[]): StatWeakBucket | null {
  if (roundStatRows.length && statRowsHaveSignal(roundStatRows)) {
    return weakestBucketFromRoundStatRows(roundStatRows);
  }
  if (fallbackRounds.length) {
    return weakestBucketFromRoundProxies(fallbackRounds);
  }
  return null;
}

export function computeGoalSystemMessages(input: {
  focus: GoalFocusArea;
  weeklyHours: WeeklyHoursPreset;
  baselineHandicapRaw: string;
  scoringMilestone: ScoringMilestonePreset;
  roundStatRows: RoundStatRow[];
  fallbackRounds: RoundLikeForInsight[];
}): {
  dataInsightMessage: string | null;
  suggestedHoursLine: string | null;
  coachAmbitiousBadge: string | null;
  accountabilityLeakAlert: string | null;
} {
  const weakest = resolveWeakestBucket(input.roundStatRows, input.fallbackRounds);
  let dataInsightMessage: string | null = null;
  if (weakest && !focusMatchesWeakestBucket(input.focus, weakest)) {
    const area = weakestBucketDisplay(weakest);
    const tail =
      input.weeklyHours === "15+"
        ? "Consider switching your Focus Area to optimize your 15h+ commitment."
        : "Consider switching your Focus Area to align with where your scorecard is costing you the most.";
    dataInsightMessage = `Data Insight: Your stats show you are losing the most strokes in ${area}. ${tail}`;
  }

  let suggestedHoursLine: string | null = null;
  let coachAmbitiousBadge: string | null = null;
  const raw = input.baselineHandicapRaw.replace(",", ".").trim();
  if (raw) {
    const h = parseFloat(raw);
    if (Number.isFinite(h)) {
      const gap = handicapToMilestoneStrokesGap(h, input.scoringMilestone);
      if (gap > 5) {
        const targetNum = weeklyHoursPresetToStoredHours(input.weeklyHours);
        const extra = Math.ceil((gap - 5) / 2);
        const suggested = Math.min(targetNum + extra, 30);
        const targetLabel = formatWeeklyHoursLabel(input.weeklyHours);
        suggestedHoursLine = `Target: ${targetLabel} | Suggested: ${suggested}h to stay on track`;
      }
      if (gap > 8) {
        const targetNum = weeklyHoursPresetToStoredHours(input.weeklyHours);
        const extra = Math.ceil((gap - 8) / 1.5);
        const suggested = Math.min(targetNum + extra, 30);
        const currentLabel = formatWeeklyHoursLabel(input.weeklyHours);
        const suggestedLabel = `${suggested}h`;
        const levels = Math.max(1, Math.round(gap));
        coachAmbitiousBadge = `Ambitious Goal: To jump ${levels} levels, we recommend moving from ${currentLabel} to ${suggestedLabel}.`;
      }
    }
  }

  let accountabilityLeakAlert: string | null = null;
  const statPuttingAvg = avgPuttingLossFromRoundStats(input.roundStatRows);
  const proxyPuttingAvg = avgPuttingProxyFromRounds(input.fallbackRounds);
  const explicitPuttingInStats = input.roundStatRows.some(
    (r) => r.loss_putting != null && Number.isFinite(Number(r.loss_putting)),
  );
  let puttingLeakStrong = false;
  if (explicitPuttingInStats && statPuttingAvg >= 5 && input.focus !== "Putting") {
    puttingLeakStrong = true;
  } else if (
    !explicitPuttingInStats &&
    input.fallbackRounds.length > 0 &&
    weakest === "putting" &&
    proxyPuttingAvg >= 2.5 &&
    input.focus !== "Putting"
  ) {
    puttingLeakStrong = true;
  }

  if (puttingLeakStrong && input.focus === "Driving") {
    const milestoneLabel = SCORING_MILESTONE_LABELS[input.scoringMilestone];
    accountabilityLeakAlert = `Accountability Check: Your data shows Putting is your biggest leak. Your current focus on Driving will not reach your ${milestoneLabel} as fast.`;
  }

  return { dataInsightMessage, suggestedHoursLine, coachAmbitiousBadge, accountabilityLeakAlert };
}
