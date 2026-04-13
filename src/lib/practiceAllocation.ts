import { FOCUS_AREA_PRESETS } from "@/lib/goalPresetConstants";
import type { GoalFocusArea } from "@/types/playerGoals";
import type { RoundLikeForInsight, RoundStatRow, StatWeakBucket } from "@/lib/roundStatsGoalInsight";

export type PracticeHoursMap = Record<GoalFocusArea, number>;

function statRowsHaveSignal(rows: RoundStatRow[]): boolean {
  return rows.some((r) =>
    [r.loss_off_tee, r.loss_approach, r.loss_short_game, r.loss_putting].some(
      (v) => v != null && Number.isFinite(Number(v)) && Number(v) !== 0,
    ),
  );
}

function sumBucketTotalsFromRoundStats(rows: RoundStatRow[]): Record<StatWeakBucket, number> {
  const t: Record<StatWeakBucket, number> = { off_tee: 0, approach: 0, short_game: 0, putting: 0 };
  for (const r of rows) {
    t.off_tee += Number(r.loss_off_tee ?? 0);
    t.approach += Number(r.loss_approach ?? 0);
    t.short_game += Number(r.loss_short_game ?? 0);
    t.putting += Number(r.loss_putting ?? 0);
  }
  return t;
}

function sumBucketTotalsFromRoundProxies(rounds: RoundLikeForInsight[]): Record<StatWeakBucket, number> {
  const totals: Record<StatWeakBucket, number> = { off_tee: 0, approach: 0, short_game: 0, putting: 0 };
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
  return totals;
}

export function createEmptyPracticeAllocation(): PracticeHoursMap {
  const m = {} as PracticeHoursMap;
  for (const k of FOCUS_AREA_PRESETS) m[k] = 0;
  return m;
}

export function sumPracticeAllocation(m: PracticeHoursMap): number {
  let s = 0;
  for (const k of FOCUS_AREA_PRESETS) s += Number(m[k]) || 0;
  return Math.round(s * 1000) / 1000;
}

export function allocationMatchesBudget(m: PracticeHoursMap, budget: number, eps = 0.051): boolean {
  return Math.abs(sumPracticeAllocation(m) - budget) < eps;
}

export function primaryFocusFromAllocation(m: PracticeHoursMap): GoalFocusArea {
  let best: GoalFocusArea = "Putting";
  let bestV = -1;
  for (const k of FOCUS_AREA_PRESETS) {
    const v = Number(m[k]) || 0;
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}

function roundToQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

/** Single category holds the full weekly budget (legacy behaviour). */
export function defaultAllocationSingleFocus(focus: GoalFocusArea, budget: number): PracticeHoursMap {
  const m = createEmptyPracticeAllocation();
  if (budget <= 0) return m;
  m[focus] = roundToQuarter(budget);
  return m;
}

/** Distribute `totalQuarters` (each unit = 0.25h) across keys by weight. */
function distributeQuarters(weights: Record<GoalFocusArea, number>, totalQuarters: number): PracticeHoursMap {
  const keys = [...FOCUS_AREA_PRESETS] as GoalFocusArea[];
  const w = keys.map((k) => Math.max(0, weights[k] ?? 0));
  const W = w.reduce((a, b) => a + b, 0);
  const out = createEmptyPracticeAllocation();
  if (totalQuarters <= 0) return out;
  if (W <= 0) {
    const base = Math.floor(totalQuarters / keys.length);
    let rem = totalQuarters - base * keys.length;
    for (let i = 0; i < keys.length; i++) {
      const q = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      out[keys[i]] = q / 4;
    }
    return out;
  }
  const raw = w.map((wi) => (wi / W) * totalQuarters);
  const floors = raw.map((r) => Math.floor(r));
  let rem = totalQuarters - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - floors[i] })).sort((a, b) => b.frac - a.frac);
  for (let j = 0; j < rem; j++) floors[order[j % order.length].i]++;
  for (let i = 0; i < keys.length; i++) out[keys[i]] = floors[i] / 4;
  return out;
}

function buildFocusWeightsFromStats(
  roundStatRows: RoundStatRow[],
  fallbackRounds: RoundLikeForInsight[],
  handicapGap: number | null,
): Record<GoalFocusArea, number> {
  let totals: Record<StatWeakBucket, number>;
  if (roundStatRows.length && statRowsHaveSignal(roundStatRows)) {
    totals = sumBucketTotalsFromRoundStats(roundStatRows);
  } else if (fallbackRounds.length) {
    totals = sumBucketTotalsFromRoundProxies(fallbackRounds);
  } else {
    totals = { off_tee: 0, approach: 0, short_game: 0, putting: 0 };
  }

  const leakBoost =
    handicapGap != null && Number.isFinite(handicapGap) && handicapGap > 8 ? 1.12 : handicapGap != null && handicapGap > 4 ? 1.06 : 1;

  const w = createEmptyPracticeAllocation();
  w.Driving = Math.max(0, totals.off_tee) * leakBoost;
  w.Irons = Math.max(0, totals.approach) * 0.5 * leakBoost;
  w.Wedges = Math.max(0, totals.approach) * 0.5 * leakBoost;
  w.Chipping = Math.max(0, totals.short_game) * 0.55 * leakBoost;
  w.Bunkers = Math.max(0, totals.short_game) * 0.45 * leakBoost;
  w.Putting = Math.max(0, totals.putting) * leakBoost;
  const sumCore = w.Driving + w.Irons + w.Wedges + w.Chipping + w.Bunkers + w.Putting;
  const floor = sumCore > 0 ? sumCore * 0.04 : 1;
  w["On-Course"] = floor;
  w["Mental/Strategy"] = floor;

  const minEach = sumCore > 0 ? sumCore * 0.02 : 0.25;
  for (const k of FOCUS_AREA_PRESETS) w[k] = Math.max(w[k], minEach);
  return w;
}

export type SuggestedAllocationResult = {
  hours: PracticeHoursMap;
  source: "stats" | "uniform";
};

export function buildSuggestedPracticeAllocation(
  roundStatRows: RoundStatRow[],
  fallbackRounds: RoundLikeForInsight[],
  budgetHours: number,
  handicapGap: number | null,
): SuggestedAllocationResult {
  if (budgetHours <= 0) {
    return { hours: createEmptyPracticeAllocation(), source: "uniform" };
  }
  const totalQ = Math.round(budgetHours * 4);
  const hasStats =
    (roundStatRows.length && statRowsHaveSignal(roundStatRows)) || fallbackRounds.length > 0;
  if (!hasStats) {
    const uniform = createEmptyPracticeAllocation();
    for (const k of FOCUS_AREA_PRESETS) uniform[k] = 0;
    return { hours: distributeQuarters(uniform, totalQ), source: "uniform" };
  }
  const weights = buildFocusWeightsFromStats(roundStatRows, fallbackRounds, handicapGap);
  return { hours: distributeQuarters(weights, totalQ), source: "stats" };
}

export function scalePracticeAllocationToBudget(m: PracticeHoursMap, budget: number): PracticeHoursMap {
  if (budget <= 0) return createEmptyPracticeAllocation();
  const s = sumPracticeAllocation(m);
  if (s <= 0) return defaultAllocationSingleFocus(primaryFocusFromAllocation(m), budget);
  const w = createEmptyPracticeAllocation();
  for (const k of FOCUS_AREA_PRESETS) w[k] = Math.max(0, m[k]);
  return distributeQuarters(w, Math.round(budget * 4));
}

export function parsePracticeAllocationFromDb(
  raw: unknown,
  budget: number,
  legacyFocus: GoalFocusArea,
): PracticeHoursMap {
  if (budget <= 0) return createEmptyPracticeAllocation();
  if (!raw || typeof raw !== "object") return defaultAllocationSingleFocus(legacyFocus, budget);

  const m = createEmptyPracticeAllocation();
  for (const k of FOCUS_AREA_PRESETS) {
    const v = (raw as Record<string, unknown>)[k];
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    if (Number.isFinite(n) && n >= 0) m[k] = roundToQuarter(n);
  }
  const s = sumPracticeAllocation(m);
  if (allocationMatchesBudget(m, budget)) return m;
  if (s < 0.01) return defaultAllocationSingleFocus(legacyFocus, budget);
  return scalePracticeAllocationToBudget(m, budget);
}

export function computeAllocationDisparityLines(
  manual: PracticeHoursMap,
  suggested: PracticeHoursMap,
  budget: number,
  thresholdPct = 20,
): string[] {
  if (budget <= 0 || !allocationMatchesBudget(manual, budget)) return [];
  const lines: string[] = [];
  for (const k of FOCUS_AREA_PRESETS) {
    const pm = (manual[k] / budget) * 100;
    const ps = (suggested[k] / budget) * 100;
    if (Math.abs(pm - ps) > thresholdPct) {
      lines.push(
        `${k}: your plan is about ${Math.round(pm)}% of allocated hours vs data-driven ~${Math.round(ps)}%.`,
      );
    }
  }
  return lines;
}

export function bumpAllocationQuarter(
  m: PracticeHoursMap,
  key: GoalFocusArea,
  deltaQuarters: number,
  budget: number,
): PracticeHoursMap {
  const next = { ...m };
  const deltaH = 0.25 * deltaQuarters;
  if (deltaH === 0) return next;
  if (deltaH < 0) {
    next[key] = roundToQuarter(Math.max(0, m[key] + deltaH));
    return next;
  }
  const usedElsewhere = sumPracticeAllocation(m) - m[key];
  const maxHere = Math.max(0, budget - usedElsewhere);
  next[key] = roundToQuarter(Math.min(m[key] + deltaH, maxHere));
  return next;
}
