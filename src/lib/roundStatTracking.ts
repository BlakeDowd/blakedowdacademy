export type RoundStatKey =
  | "stableford"
  | "front_back"
  | "fairways"
  | "gir"
  | "putts"
  | "putts_per_gir"
  | "three_putts"
  | "scrambling"
  | "sand_saves"
  | "distribution"
  | "penalties"
  | "gir_proximity"
  | "going_for_green"
  | "advanced_approach"
  | "chipping"
  | "short_putts";

export type RoundStatOption = { key: RoundStatKey; label: string; hint: string };
export type RoundStatGroup = { title: string; miscore: boolean; stats: RoundStatOption[] };

export const ROUND_STAT_GROUPS: RoundStatGroup[] = [
  {
    title: "Core scoring",
    miscore: true,
    stats: [
      { key: "stableford", label: "Stableford points", hint: "e.g. 38" },
      { key: "front_back", label: "Front 9 / Back 9", hint: "Gross for each nine" },
    ],
  },
  {
    title: "Driving",
    miscore: true,
    stats: [{ key: "fairways", label: "Fairways", hint: "Hit, possible, miss left and right" }],
  },
  {
    title: "Approach",
    miscore: true,
    stats: [{ key: "gir", label: "Greens in regulation", hint: "GIR hit" }],
  },
  {
    title: "Putting",
    miscore: true,
    stats: [
      { key: "putts", label: "Total putts", hint: "e.g. 32" },
      { key: "putts_per_gir", label: "Putts per GIR", hint: "Average on greens hit, e.g. 1.8" },
      { key: "three_putts", label: "3-putts", hint: "Holes with 3 or more putts" },
    ],
  },
  {
    title: "Short game",
    miscore: true,
    stats: [
      { key: "scrambling", label: "Up & downs", hint: "Par saves after missing the green" },
      { key: "sand_saves", label: "Sand saves", hint: "Greenside bunker saves" },
    ],
  },
  {
    title: "Scoring distribution",
    miscore: true,
    stats: [{ key: "distribution", label: "Eagles to triple bogey+", hint: "Count of each result" }],
  },
  {
    title: "Extras",
    miscore: false,
    stats: [
      { key: "penalties", label: "Penalties", hint: "Total, tee and approach" },
      { key: "gir_proximity", label: "GIR inside 8ft / 20ft", hint: "How close you hit greens" },
      { key: "going_for_green", label: "Going for green", hint: "Par 4 in 1, par 5 in 2" },
      { key: "chipping", label: "Chipping", hint: "Chips inside 6ft, double chips" },
      { key: "short_putts", label: "Putts inside 6ft", hint: "Attempts and makes" },
      { key: "advanced_approach", label: "Advanced approach", hint: "Club and miss direction per hole" },
    ],
  },
];

export const ALL_ROUND_STATS: RoundStatKey[] = ROUND_STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.key));
export const MISCORE_ROUND_STATS: RoundStatKey[] = ROUND_STAT_GROUPS.filter((g) => g.miscore).flatMap((g) =>
  g.stats.map((s) => s.key),
);
export const DEFAULT_TRACKED_ROUND_STATS: RoundStatKey[] = ["putts"];

/** Scorecard colours for the scoring distribution. */
export const SCORE_DISTRIBUTION_COLORS = {
  eagles: "#F59E0B",
  birdies: "#E11D48",
  pars: "#014421",
  bogeys: "#0EA5E9",
  doubleBogeys: "#6366F1",
  tripleBogeys: "#44403C",
} as const;

const STAT_KEY_SET = new Set<string>(ALL_ROUND_STATS);

/** Valid stat keys in canonical order, or null when the value isn't a stat list. */
export function normalizeTrackedStats(raw: unknown): RoundStatKey[] | null {
  if (!Array.isArray(raw)) return null;
  const picked = new Set(raw.filter((k): k is string => typeof k === "string" && STAT_KEY_SET.has(k)));
  return ALL_ROUND_STATS.filter((k) => picked.has(k));
}

/** Rounds saved before stat tracking existed have no list and count as tracking everything. */
export function roundTracksStat(
  round: { trackedStats?: readonly string[] | null; tracked_stats?: unknown },
  key: RoundStatKey,
): boolean {
  const list = round.trackedStats ?? normalizeTrackedStats(round.tracked_stats);
  return !list || list.includes(key);
}

export function roundsTrackingStat<T extends { trackedStats?: readonly string[] | null; tracked_stats?: unknown }>(
  rounds: readonly T[],
  ...keys: RoundStatKey[]
): T[] {
  return rounds.filter((r) => keys.every((k) => roundTracksStat(r, k)));
}

/** The up & down tile was labelled "Missed" until this date and "Attempts" after it. */
const UP_DOWN_ATTEMPTS_SINCE = Date.parse("2026-03-04T00:00:00+11:00");

export function upAndDownAttempts(made: number, missedColumn: number, createdAt?: unknown): number {
  const at = typeof createdAt === "string" ? Date.parse(createdAt) : NaN;
  if (Number.isFinite(at) && at < UP_DOWN_ATTEMPTS_SINCE) return made + missedColumn;
  return Math.max(made, missedColumn);
}

export function sandSaveAttempts(saves: number, attempts: number): number {
  return Math.max(saves, attempts);
}

/** Possible fairways when recorded, otherwise hit plus misses. */
export function fairwaysPossibleFor(hit: number, left: number, right: number, possible?: number | null): number {
  if (typeof possible === "number" && possible > 0) return Math.max(possible, hit);
  return hit + left + right;
}

/** Par 4s and par 5s on a standard 18-hole course. */
export const DEFAULT_FAIRWAYS_POSSIBLE = 14;

/** Rounds are 18 holes only; older 9-hole rounds are left out everywhere. */
export function onlyEighteenHoleRounds<T extends { holes?: number | null }>(rounds: readonly T[]): T[] {
  return rounds.filter((r) => r.holes == null || r.holes >= 18);
}

const prefKey = (userId: string) => `trackedRoundStats_${userId}`;

function readLocalPref(userId: string): RoundStatKey[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(prefKey(userId));
    return raw ? normalizeTrackedStats(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocalPref(userId: string, stats: RoundStatKey[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(prefKey(userId), JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

export function loadLocalTrackedRoundStats(userId: string): RoundStatKey[] {
  return readLocalPref(userId) ?? DEFAULT_TRACKED_ROUND_STATS;
}

/** Profile setting first (follows the student across devices), then this device, then the default. */
export async function loadTrackedRoundStats(userId: string): Promise<RoundStatKey[]> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { data, error } = await createClient()
      .from("profiles")
      .select("tracked_round_stats")
      .eq("id", userId)
      .maybeSingle();
    if (!error) {
      const fromProfile = normalizeTrackedStats((data as { tracked_round_stats?: unknown } | null)?.tracked_round_stats);
      if (fromProfile) {
        writeLocalPref(userId, fromProfile);
        return fromProfile;
      }
    }
  } catch {
    /* fall back to this device */
  }
  return loadLocalTrackedRoundStats(userId);
}

export async function saveTrackedRoundStats(userId: string, stats: RoundStatKey[]): Promise<void> {
  const normalized = normalizeTrackedStats(stats) ?? [];
  writeLocalPref(userId, normalized);
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient()
      .from("profiles")
      .update({ tracked_round_stats: normalized })
      .eq("id", userId);
    if (error && !/tracked_round_stats/.test(error.message ?? "")) {
      console.warn("Could not save tracked round stats to profile:", error.message);
    }
  } catch {
    /* saved on this device */
  }
}
