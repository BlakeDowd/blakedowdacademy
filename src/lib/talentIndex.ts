import {
  formatHandicap,
  recentCombineAverages,
  scorePracticeHandicap,
  type BenchmarkOverrides,
  type PracticeHandicap,
} from "@/lib/practiceHandicap";
import { practiceSessionMinutesFromRow } from "@/lib/practiceSessionDuration";
import { listUserCombineCompletionEvents } from "@/lib/combineCompletionDetection";
import { mobilityScreenConfig } from "@/lib/mobilityScreenConfig";
import { AGE_GROUPS, SQUADS, squadLabel } from "@/lib/playerGroups";
import {
  EVENT_TIERS,
  RECENCY_WINDOW_DAYS,
  eventTier,
  recencyWeight,
  scoreDifferential,
  type EventTier,
} from "@/lib/eventTiers";
import {
  buildCombineRankings,
  practiceHandicapAt,
  rowTime,
  timeOf,
  toNumber,
  type CompareRow,
  type Row,
  type TalentPlayer,
} from "@/lib/talentReport";

/** Fewest tournament rounds, players to rank against, or players with a date of birth for an age trend. */
export const MIN_DATA = 3;

const DAY = 86_400_000;

export type PillarId = "competitive" | "skill" | "ageSkill" | "improvement" | "commitment";

type PillarValue = { value: number; detail: string };

type Cohort = {
  players: TalentPlayer[];
  overrides: BenchmarkOverrides;
  /** Practice handicap from combines in the recency window. */
  recent: Map<string, PracticeHandicap>;
};

type PillarDef = {
  id: PillarId;
  label: string;
  /** Column heading on the group table. */
  short: string;
  weight: number;
  hint: string;
  higherIsBetter: boolean;
  /** Part of the Readiness line (competitive form, current skill, current workload). */
  readiness: boolean;
  compute: (cohort: Cohort) => Map<string, PillarValue>;
};

export type TournamentRound = {
  id: string;
  date: string;
  atMs: number;
  course: string;
  score: number | null;
  holes: number;
  tier: EventTier | null;
  eventName: string;
  courseRating: number | null;
  slope: number | null;
  /** Null for 9-hole rounds or when the rating, slope or score is missing. */
  differential: number | null;
  /** Who last set the event details. */
  taggedBy: "player" | "coach" | null;
};

/** A player's rounds, newest first, with any event details. */
export function playerRounds(p: TalentPlayer): TournamentRound[] {
  return p.rounds
    .map((r: Row) => {
      const date = String(r.date ?? r.created_at ?? "").slice(0, 10);
      const score = toNumber(r.score);
      const holes = toNumber(r.holes) ?? 18;
      const courseRating = toNumber(r.course_rating);
      const slope = toNumber(r.slope_rating);
      const tier = eventTier(r.event_tier)?.id ?? null;
      return {
        id: String(r.id ?? ""),
        date,
        atMs: timeOf(`${date}T00:00:00`),
        course: String(r.course_name ?? ""),
        score,
        holes,
        tier,
        eventName: String(r.event_name ?? ""),
        courseRating,
        slope,
        differential:
          score != null && courseRating != null && slope != null && holes >= 18
            ? scoreDifferential(score, courseRating, slope)
            : null,
        taggedBy: r.event_set_by ? (String(r.event_set_by) === p.id ? "player" : "coach") : null,
      } satisfies TournamentRound;
    })
    .filter((r) => r.id && Number.isFinite(r.atMs))
    .sort((a, b) => b.atMs - a.atMs);
}

/** Tournament rounds that count: tagged, 18 holes with a differential, inside the recency window. */
export function countingRounds(p: TalentPlayer) {
  return playerRounds(p)
    .filter((r) => r.tier != null && r.differential != null)
    .map((r) => ({ round: r, weight: eventTier(r.tier)!.weight * recencyWeight(r.atMs) }))
    .filter((x) => x.weight > 0);
}

function recentPractice(p: TalentPlayer, overrides: BenchmarkOverrides): PracticeHandicap {
  const from = Date.now() - RECENCY_WINDOW_DAYS * DAY;
  const recent = (rows: Row[]) => rows.filter((r) => timeOf(r.created_at) >= from);
  return scorePracticeHandicap(recentCombineAverages(p.id, recent(p.practice), recent(p.logs)), overrides);
}

const exactAge = (dob: string | null): number | null => {
  if (!dob) return null;
  const t = new Date(`${dob}T00:00:00`).getTime();
  return Number.isFinite(t) ? (Date.now() - t) / (365.25 * DAY) : null;
};

const shots = (n: number) => `${Math.abs(n).toFixed(1)} ${Math.abs(n) === 1 ? "shot" : "shots"}`;

/** Percentile and rank within the cohort for each player with a value. Ties share the lower percentile. */
function rankValues(values: Map<string, number>, higherIsBetter: boolean) {
  const out = new Map<string, { pct: number; rank: number; of: number; tied: boolean }>();
  const all = [...values.values()];
  const n = all.length;
  if (n < MIN_DATA) return out;
  for (const [id, v] of values) {
    let behind = 0;
    let ahead = 0;
    let level = 0;
    for (const o of all) {
      if (o === v) level++;
      else if (higherIsBetter ? o < v : o > v) behind++;
      else ahead++;
    }
    out.set(id, { pct: Math.round((behind / (n - 1)) * 100), rank: ahead + 1, of: n, tied: level > 1 });
  }
  return out;
}

function competitive({ players }: Cohort) {
  const out = new Map<string, PillarValue>();
  for (const p of players) {
    const counted = countingRounds(p);
    if (counted.length < MIN_DATA) continue;
    const total = counted.reduce((s, x) => s + x.weight, 0);
    const avg = counted.reduce((s, x) => s + x.weight * x.round.differential!, 0) / total;
    const byTier = EVENT_TIERS.map((t) => ({ t, n: counted.filter((x) => x.round.tier === t.id).length }))
      .filter((x) => x.n > 0)
      .reverse()
      .map((x) => `${x.n} ${x.t.short}`)
      .join(", ");
    out.set(p.id, { value: avg, detail: `Avg differential ${formatHandicap(avg)} from ${counted.length} events (${byTier})` });
  }
  return out;
}

function skill({ players, recent }: Cohort) {
  const out = new Map<string, PillarValue>();
  for (const p of players) {
    const h = recent.get(p.id)?.overall;
    if (h != null) out.set(p.id, { value: h, detail: `Practice handicap ${formatHandicap(h)} (last 6 months)` });
  }
  return out;
}

/** Line of best fit through (age, practice handicap) so a 12-year-old isn't judged against 17-year-olds. */
function ageSkill({ players, recent }: Cohort) {
  const out = new Map<string, PillarValue>();
  const points = players
    .map((p) => ({ id: p.id, age: exactAge(p.dob), h: recent.get(p.id)?.overall ?? null }))
    .filter((p): p is { id: string; age: number; h: number } => p.age != null && p.h != null);
  if (points.length < MIN_DATA) return out;
  const meanAge = points.reduce((s, p) => s + p.age, 0) / points.length;
  const meanH = points.reduce((s, p) => s + p.h, 0) / points.length;
  const varAge = points.reduce((s, p) => s + (p.age - meanAge) ** 2, 0);
  if (varAge <= 0.25) return out;
  const slope = points.reduce((s, p) => s + (p.age - meanAge) * (p.h - meanH), 0) / varAge;
  for (const p of points) {
    const diff = p.h - (meanH + slope * (p.age - meanAge));
    const r = Math.round(diff * 10) / 10;
    out.set(p.id, {
      value: diff,
      detail:
        r === 0
          ? `Right on the group trend for age ${Math.floor(p.age)}`
          : `${shots(r)} ${r < 0 ? "better" : "behind"} the trend for age ${Math.floor(p.age)}`,
    });
  }
  return out;
}

function improvement({ players, overrides, recent }: Cohort) {
  const out = new Map<string, PillarValue>();
  const sixMonthsAgo = Date.now() - 182 * DAY;
  for (const p of players) {
    const now = recent.get(p.id)?.overall;
    const then = practiceHandicapAt(p, overrides, sixMonthsAgo).overall;
    if (now == null || then == null) continue;
    const gain = then - now;
    const g = Math.round(gain * 10) / 10;
    out.set(p.id, {
      value: gain,
      detail: g === 0 ? "No change on practice handicap in 6 months" : `${g > 0 ? "▲" : "▼"} ${shots(g)} on practice handicap in 6 months`,
    });
  }
  return out;
}

/** Hours, practice days and combines, each weighted by how recent they are, then ranked and averaged. */
function commitment({ players }: Cohort) {
  const out = new Map<string, PillarValue>();
  const from = Date.now() - RECENCY_WINDOW_DAYS * DAY;
  const totals = players.map((p) => {
    const practice = p.practice.filter((r) => rowTime(r) >= from);
    const dayWeights = new Map<string, number>();
    let hours = 0;
    let rawHours = 0;
    for (const r of practice) {
      const at = rowTime(r);
      const h = practiceSessionMinutesFromRow(r as Parameters<typeof practiceSessionMinutesFromRow>[0]) / 60;
      hours += h * recencyWeight(at);
      rawHours += h;
      dayWeights.set(new Date(at).toDateString(), recencyWeight(at));
    }
    const combineEvents = listUserCombineCompletionEvents({ userId: p.id, practiceSessions: p.practice, practiceLogs: p.logs })
      .map((e) => ({ at: timeOf(e.at), label: e.label }))
      .filter((e) => e.at >= from && e.label !== mobilityScreenConfig.testName);
    return {
      id: p.id,
      hours,
      days: [...dayWeights.values()].reduce((s, w) => s + w, 0),
      combines: combineEvents.reduce((s, e) => s + recencyWeight(e.at), 0),
      rawHours,
      rawDays: dayWeights.size,
      rawCombines: combineEvents.length,
    };
  });
  const hoursRank = rankValues(new Map(totals.map((t) => [t.id, t.hours])), true);
  const daysRank = rankValues(new Map(totals.map((t) => [t.id, t.days])), true);
  const combinesRank = rankValues(new Map(totals.map((t) => [t.id, t.combines])), true);
  for (const t of totals) {
    const h = hoursRank.get(t.id);
    const d = daysRank.get(t.id);
    const c = combinesRank.get(t.id);
    if (!h || !d || !c) continue;
    const parts = [
      `${Math.round(t.rawHours)} h`,
      `${t.rawDays} practice ${t.rawDays === 1 ? "day" : "days"}`,
      `${t.rawCombines} ${t.rawCombines === 1 ? "combine" : "combines"}`,
    ];
    out.set(t.id, {
      value: (h.pct + d.pct + c.pct) / 3,
      detail: t.rawDays === 0 && t.rawCombines === 0 ? "Nothing logged in 6 months" : `${parts.join(" · ")} in 6 months`,
    });
  }
  return out;
}

/** What the Talent Index is built from. Weights are re-shared across the pillars a player has data for. */
export const TALENT_PILLARS: PillarDef[] = [
  {
    id: "competitive",
    label: "Competitive",
    short: "Comp",
    weight: 30,
    hint: `Score differential in coach-tagged events over 6 months (needs ${MIN_DATA})`,
    higherIsBetter: false,
    readiness: true,
    compute: competitive,
  },
  {
    id: "skill",
    label: "Skill",
    short: "Skill",
    weight: 20,
    hint: "Practice handicap from combines in the last 6 months",
    higherIsBetter: false,
    readiness: true,
    compute: skill,
  },
  {
    id: "ageSkill",
    label: "Skill for age",
    short: "For age",
    weight: 20,
    hint: "Practice handicap against what the group's trend expects at their age",
    higherIsBetter: false,
    readiness: false,
    compute: ageSkill,
  },
  {
    id: "improvement",
    label: "Improvement",
    short: "Improve",
    weight: 15,
    hint: "Practice handicap change over the last 6 months",
    higherIsBetter: true,
    readiness: false,
    compute: improvement,
  },
  {
    id: "commitment",
    label: "Commitment",
    short: "Commit",
    weight: 15,
    hint: "Practice hours, days and combines; recent weeks count most",
    higherIsBetter: true,
    readiness: true,
    compute: commitment,
  },
];

export type PillarScore = {
  /** 0–100: share of the cohort this player is ahead of. */
  pct: number;
  rank: number;
  of: number;
  tied: boolean;
  detail: string;
};

export type RankScope = "group" | "age" | "squad";

export type TalentIndexRow = {
  player: TalentPlayer;
  /** 0–100, null until there are at least 2 pillars to go on. */
  index: number | null;
  /** 0–100 from competitive, skill and commitment; null with fewer than 2 of those. */
  readiness: number | null;
  rank: number | null;
  ranked: number;
  /** Who they were ranked against: the whole group, or their age group. */
  cohort: string;
  pillars: Partial<Record<PillarId, PillarScore>>;
  /** Combines where this player tops the cohort. */
  combineLeads: { label: string; of: number }[];
};

function weightedPct(pillars: TalentIndexRow["pillars"], include: (p: PillarDef) => boolean): number | null {
  let weighted = 0;
  let weights = 0;
  let count = 0;
  for (const p of TALENT_PILLARS) {
    const s = pillars[p.id];
    if (!s || !include(p)) continue;
    weighted += s.pct * p.weight;
    weights += p.weight;
    count++;
  }
  return count >= 2 ? Math.round(weighted / weights) : null;
}

function scoreCohort(players: TalentPlayer[], overrides: BenchmarkOverrides, cohortLabel: string): TalentIndexRow[] {
  const recent = new Map(players.map((p) => [p.id, recentPractice(p, overrides)]));
  const cohort: Cohort = { players, overrides, recent };
  const computed = TALENT_PILLARS.map((p) => {
    const values = p.compute(cohort);
    const ranks = rankValues(new Map([...values].map(([id, v]) => [id, v.value])), p.higherIsBetter);
    return { def: p, values, ranks };
  });

  const compare: CompareRow[] = players.map((player) => ({ player, playing: null, practice: recent.get(player.id)! }));
  const leads = new Map<string, { label: string; of: number }[]>();
  for (const ranking of buildCombineRankings(compare)) {
    if (ranking.entries.length < MIN_DATA) continue;
    const [first, second] = ranking.entries;
    if (first.combine.handicap === second.combine.handicap) continue;
    const list = leads.get(first.player.id) ?? [];
    list.push({ label: ranking.label, of: ranking.entries.length });
    leads.set(first.player.id, list);
  }

  const rows: TalentIndexRow[] = players.map((player) => {
    const pillars: TalentIndexRow["pillars"] = {};
    for (const { def, values, ranks } of computed) {
      const r = ranks.get(player.id);
      if (r) pillars[def.id] = { ...r, detail: values.get(player.id)?.detail ?? "" };
    }
    return {
      player,
      index: weightedPct(pillars, () => true),
      readiness: weightedPct(pillars, (p) => p.readiness),
      rank: null,
      ranked: 0,
      cohort: cohortLabel,
      pillars,
      combineLeads: leads.get(player.id) ?? [],
    };
  });

  const indexRank = rankValues(new Map(rows.filter((r) => r.index != null).map((r) => [r.player.id, r.index!])), true);
  for (const row of rows) {
    const r = indexRank.get(row.player.id);
    row.rank = r?.rank ?? null;
    row.ranked = r?.of ?? 0;
  }
  return rows;
}

/**
 * Objective Talent Index: only logged combines, practice and coach-tagged tournament rounds count, with recent
 * results weighted higher. Coach notes, names and who the parents are play no part.
 * `scope` ranks everyone against the whole group, or only against their own age group or squad.
 */
export function buildTalentIndex(
  players: TalentPlayer[],
  overrides: BenchmarkOverrides,
  scope: RankScope = "group",
  groupLabel = "the group",
): TalentIndexRow[] {
  if (scope === "group") return scoreCohort(players, overrides, groupLabel);
  const cohortOf = (p: TalentPlayer) => (scope === "age" ? p.ageGroup : squadLabel(p.squad));
  const cohorts = new Map<string, TalentPlayer[]>();
  for (const p of players) cohorts.set(cohortOf(p), [...(cohorts.get(cohortOf(p)) ?? []), p]);
  return [...cohorts].flatMap(([label, list]) => scoreCohort(list, overrides, label));
}

/** Display order for cohort tables: age groups youngest first, squads Elite first. */
export const COHORT_ORDER = [...AGE_GROUPS, ...[...SQUADS].reverse().map((s) => s.label), squadLabel(null)];

/** Stable "Player A, B, …" labels for blind review, shuffled by id so they don't follow the alphabet. */
export function blindLabels(ids: string[]): Map<string, string> {
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const letters = (i: number) => {
    let s = "";
    let n = i;
    do {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
  };
  return new Map([...ids].sort((a, b) => hash(a) - hash(b)).map((id, i) => [id, `Player ${letters(i)}`]));
}
