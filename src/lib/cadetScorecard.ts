import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CADET_HOLE_GROUPS,
  cadetHoleGroupLabel,
  insertCadetScore,
  isCadetHoleGroup,
  matchCadetPlayerId,
  upsertCadetEnrollment,
  type CadetEnrollmentRow,
  type CadetHoleGroup,
} from "@/lib/cadetScoring";

export const CADET_SCORECARD_MIGRATION_HINT =
  "Cadet scorecards need a database update. Run supabase/migrations/20261104140000_cadet_scorecards.sql in Supabase, then reload.";

function isMissingRelation(message: string): boolean {
  return /cadet_scorecards|cadet_scorecard_holes|schema cache|does not exist/i.test(message);
}

export type CadetScorecardHoleInput = {
  holeNumber: number;
  par: number;
  shotsTo30m: number;
  chips: number;
  bunkerShots: number;
  putts: number;
  totalStrokes: number;
};

export type CadetScorecardHole = CadetScorecardHoleInput & { id: string };

export type CadetScorecard = {
  id: string;
  player_id: string;
  hole_group: CadetHoleGroup;
  played_on: string;
  course_name: string | null;
  notes: string | null;
  total_strokes: number;
  total_to_par: number | null;
  created_at: string;
  holes: CadetScorecardHole[];
};

export type CadetScorecardStatSummary = {
  cards: number;
  holes: number;
  avgPuttsPerHole: number | null;
  avgChipsPerHole: number | null;
  avgBunkerPerHole: number | null;
  avgShotsTo30m: number | null;
  avgStrokesPerHole: number | null;
  avgToParPerHole: number | null;
  totalPutts: number;
  totalChips: number;
  totalBunker: number;
  totalShotsTo30m: number;
  totalStrokes: number;
};

export type CadetPracticeAreaId =
  | "putting"
  | "chipping"
  | "bunkers"
  | "approach"
  | "scoring";

export type CadetPracticeRecommendation = {
  id: CadetPracticeAreaId;
  title: string;
  detail: string;
  severity: "high" | "medium" | "watch";
};

export function emptyScorecardHoles(holeGroup: CadetHoleGroup): CadetScorecardHoleInput[] {
  return Array.from({ length: holeGroup }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    shotsTo30m: 2,
    chips: 0,
    bunkerShots: 0,
    putts: 2,
    totalStrokes: 4,
  }));
}

export function validateCadetScorecardHoles(
  holes: CadetScorecardHoleInput[],
  holeGroup: CadetHoleGroup,
): string | null {
  if (holes.length !== holeGroup) {
    return `This ${cadetHoleGroupLabel(holeGroup)} card needs exactly ${holeGroup} holes.`;
  }
  for (const h of holes) {
    if (h.holeNumber < 1 || h.holeNumber > holeGroup) return `Hole ${h.holeNumber} is out of range.`;
    if (h.par < 3 || h.par > 5) return `Hole ${h.holeNumber}: par must be 3–5.`;
    if (h.totalStrokes < 1) return `Hole ${h.holeNumber}: enter total strokes.`;
    if (h.putts < 0 || h.chips < 0 || h.bunkerShots < 0 || h.shotsTo30m < 0) {
      return `Hole ${h.holeNumber}: stats can't be negative.`;
    }
    const parts = h.shotsTo30m + h.chips + h.bunkerShots + h.putts;
    // Soft check — chips/bunker may overlap with shots-to-30m depending on how coaches count.
    if (h.totalStrokes < h.putts) {
      return `Hole ${h.holeNumber}: total strokes can't be less than putts.`;
    }
    if (parts > h.totalStrokes + 4) {
      return `Hole ${h.holeNumber}: breakdown looks higher than total strokes — check the numbers.`;
    }
  }
  return null;
}

export function summarizeCadetScorecards(cards: CadetScorecard[]): CadetScorecardStatSummary {
  let holes = 0;
  let putts = 0;
  let chips = 0;
  let bunker = 0;
  let to30 = 0;
  let strokes = 0;
  let toPar = 0;
  let toParHoles = 0;

  for (const card of cards) {
    for (const h of card.holes) {
      holes += 1;
      putts += h.putts;
      chips += h.chips;
      bunker += h.bunkerShots;
      to30 += h.shotsTo30m;
      strokes += h.totalStrokes;
      toPar += h.totalStrokes - h.par;
      toParHoles += 1;
    }
  }

  const avg = (n: number) => (holes > 0 ? Math.round((n / holes) * 100) / 100 : null);

  return {
    cards: cards.length,
    holes,
    avgPuttsPerHole: avg(putts),
    avgChipsPerHole: avg(chips),
    avgBunkerPerHole: avg(bunker),
    avgShotsTo30m: avg(to30),
    avgStrokesPerHole: avg(strokes),
    avgToParPerHole: toParHoles > 0 ? Math.round((toPar / toParHoles) * 100) / 100 : null,
    totalPutts: putts,
    totalChips: chips,
    totalBunker: bunker,
    totalShotsTo30m: to30,
    totalStrokes: strokes,
  };
}

/**
 * Practice areas from hole stats.
 * Thresholds are coach-friendly averages per hole across recent scorecards.
 */
export function recommendCadetPracticeFromScorecards(
  summary: CadetScorecardStatSummary,
): CadetPracticeRecommendation[] {
  if (summary.holes < 3) {
    return [
      {
        id: "scoring",
        title: "Log more scorecards",
        detail: "Need a few more holes of Hole / Par / <30m / Chips / Bunker / Putts / Total to spot patterns.",
        severity: "watch",
      },
    ];
  }

  const out: CadetPracticeRecommendation[] = [];

  if (summary.avgPuttsPerHole != null && summary.avgPuttsPerHole >= 2.4) {
    out.push({
      id: "putting",
      title: "Putting",
      detail: `Avg ${summary.avgPuttsPerHole} putts/hole — work start line & lag (aim under 2.2).`,
      severity: summary.avgPuttsPerHole >= 2.7 ? "high" : "medium",
    });
  }

  if (summary.avgChipsPerHole != null && summary.avgChipsPerHole >= 0.9) {
    out.push({
      id: "chipping",
      title: "Chipping",
      detail: `Avg ${summary.avgChipsPerHole} chips/hole — tighten landing spots around the green.`,
      severity: summary.avgChipsPerHole >= 1.3 ? "high" : "medium",
    });
  }

  if (summary.avgBunkerPerHole != null && summary.avgBunkerPerHole >= 0.35) {
    out.push({
      id: "bunkers",
      title: "Bunker play",
      detail: `Avg ${summary.avgBunkerPerHole} bunker shots/hole — splash contact & proximity.`,
      severity: summary.avgBunkerPerHole >= 0.6 ? "high" : "medium",
    });
  }

  if (summary.avgShotsTo30m != null && summary.avgShotsTo30m >= 2.6) {
    out.push({
      id: "approach",
      title: "Getting it inside 30m",
      detail: `Avg ${summary.avgShotsTo30m} shots to <30m — approach distance control.`,
      severity: summary.avgShotsTo30m >= 3.2 ? "high" : "medium",
    });
  }

  if (summary.avgToParPerHole != null && summary.avgToParPerHole >= 1.2) {
    out.push({
      id: "scoring",
      title: "Scoring management",
      detail: `Avg ${summary.avgToParPerHole > 0 ? "+" : ""}${summary.avgToParPerHole} vs par/hole — miss management & avoid doubles.`,
      severity: summary.avgToParPerHole >= 1.8 ? "high" : "medium",
    });
  }

  if (!out.length) {
    out.push({
      id: "scoring",
      title: "Stats look solid",
      detail: "Keep logging scorecards — short game and <30m numbers support moving up.",
      severity: "watch",
    });
  }

  return out.sort((a, b) => {
    const rank = { high: 0, medium: 1, watch: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}

/** Soft gate for move-up from detailed scorecards (in addition to rounds / tests). */
export function cadetScorecardReadyForLevelUp(
  summary: CadetScorecardStatSummary,
  holeGroup: CadetHoleGroup | null,
): { ready: boolean; detail: string } {
  const minHoles = holeGroup ? holeGroup * 2 : 6; // ~2 loops
  if (summary.holes < minHoles) {
    return {
      ready: false,
      detail: `Scorecard detail: need ~${minHoles} holes logged (have ${summary.holes}).`,
    };
  }
  const blockers: string[] = [];
  if (summary.avgPuttsPerHole != null && summary.avgPuttsPerHole > 2.5) {
    blockers.push(`putts ${summary.avgPuttsPerHole}/hole`);
  }
  if (summary.avgChipsPerHole != null && summary.avgChipsPerHole > 1.2) {
    blockers.push(`chips ${summary.avgChipsPerHole}/hole`);
  }
  if (summary.avgBunkerPerHole != null && summary.avgBunkerPerHole > 0.55) {
    blockers.push(`bunker ${summary.avgBunkerPerHole}/hole`);
  }
  if (summary.avgShotsTo30m != null && summary.avgShotsTo30m > 3.0) {
    blockers.push(`to <30m ${summary.avgShotsTo30m}`);
  }
  if (blockers.length) {
    return {
      ready: false,
      detail: `Scorecard needs work: ${blockers.join(" · ")}.`,
    };
  }
  return {
    ready: true,
    detail: `Scorecard ready · ${summary.cards} cards · ${summary.holes} holes · putts ${summary.avgPuttsPerHole ?? "—"}/hole.`,
  };
}

function mapHole(row: Record<string, unknown>): CadetScorecardHole {
  return {
    id: String(row.id),
    holeNumber: Number(row.hole_number),
    par: Number(row.par),
    shotsTo30m: Number(row.shots_to_30m),
    chips: Number(row.chips),
    bunkerShots: Number(row.bunker_shots),
    putts: Number(row.putts),
    totalStrokes: Number(row.total_strokes),
  };
}

function mapCard(row: Record<string, unknown>): CadetScorecard {
  const holesRaw = row.cadet_scorecard_holes;
  const holes = Array.isArray(holesRaw)
    ? (holesRaw as Record<string, unknown>[]).map(mapHole).sort((a, b) => a.holeNumber - b.holeNumber)
    : [];
  const hg = Number(row.hole_group);
  return {
    id: String(row.id),
    player_id: String(row.player_id),
    hole_group: isCadetHoleGroup(hg) ? hg : 3,
    played_on: String(row.played_on || ""),
    course_name: typeof row.course_name === "string" ? row.course_name : null,
    notes: typeof row.notes === "string" ? row.notes : null,
    total_strokes: Number(row.total_strokes),
    total_to_par: row.total_to_par == null ? null : Number(row.total_to_par),
    created_at: String(row.created_at || ""),
    holes,
  };
}

export async function fetchCadetScorecardsForPlayer(
  client: SupabaseClient,
  opts: {
    playerId: string;
    holeGroup?: CadetHoleGroup;
    start?: string;
    end?: string;
    limit?: number;
  },
): Promise<{ cards: CadetScorecard[]; error: string | null; available: boolean }> {
  let q = client
    .from("cadet_scorecards")
    .select(
      "id, player_id, hole_group, played_on, course_name, notes, total_strokes, total_to_par, created_at, cadet_scorecard_holes(id, hole_number, par, shots_to_30m, chips, bunker_shots, putts, total_strokes)",
    )
    .eq("player_id", opts.playerId)
    .order("played_on", { ascending: false })
    .limit(opts.limit ?? 20);
  if (opts.holeGroup != null) q = q.eq("hole_group", opts.holeGroup);
  if (opts.start) q = q.gte("played_on", opts.start);
  if (opts.end) q = q.lte("played_on", opts.end);

  const { data, error } = await q;
  if (error) {
    const msg = error.message || "Couldn't load scorecards.";
    if (isMissingRelation(msg)) {
      return { cards: [], error: CADET_SCORECARD_MIGRATION_HINT, available: false };
    }
    return { cards: [], error: msg, available: true };
  }
  return {
    cards: ((data as Record<string, unknown>[]) || []).map(mapCard),
    error: null,
    available: true,
  };
}

export type CadetScorecardWithName = CadetScorecard & { player_name: string };

/** Scorecards for a hole-group leaderboard window (term / year awards). */
export async function fetchCadetScorecardsForGroup(
  client: SupabaseClient,
  opts: { holeGroup: CadetHoleGroup; start: string; end: string },
): Promise<{ cards: CadetScorecardWithName[]; error: string | null; available: boolean }> {
  const { data, error } = await client
    .from("cadet_scorecards")
    .select(
      "id, player_id, hole_group, played_on, course_name, notes, total_strokes, total_to_par, created_at, profiles(full_name), cadet_scorecard_holes(id, hole_number, par, shots_to_30m, chips, bunker_shots, putts, total_strokes)",
    )
    .eq("hole_group", opts.holeGroup)
    .gte("played_on", opts.start)
    .lte("played_on", opts.end)
    .order("played_on", { ascending: false });

  if (error) {
    const msg = error.message || "Couldn't load scorecards.";
    if (isMissingRelation(msg)) {
      return { cards: [], error: CADET_SCORECARD_MIGRATION_HINT, available: false };
    }
    return { cards: [], error: msg, available: true };
  }

  return {
    cards: ((data as Record<string, unknown>[]) || []).map((row) => {
      const profiles = row.profiles as { full_name?: string | null } | null | undefined;
      return {
        ...mapCard(row),
        player_name: profiles?.full_name?.trim() || "Player",
      };
    }),
    error: null,
    available: true,
  };
}

export type CadetStatLeaderboardId =
  | "putts"
  | "chips"
  | "bunker"
  | "approach"
  | "scoring";

export type CadetStatLeaderboardEntry = {
  playerId: string;
  playerName: string;
  holes: number;
  cards: number;
  value: number;
};

export const CADET_STAT_LEADERBOARD_CATEGORIES: {
  id: CadetStatLeaderboardId;
  label: string;
  shortLabel: string;
  unit: string;
  /** Lower average wins (awards). */
  lowerIsBetter: true;
}[] = [
  { id: "putts", label: "Putting", shortLabel: "Putts", unit: "avg / hole", lowerIsBetter: true },
  { id: "chips", label: "Chipping", shortLabel: "Chips", unit: "avg / hole", lowerIsBetter: true },
  { id: "bunker", label: "Bunker play", shortLabel: "Bunker", unit: "avg / hole", lowerIsBetter: true },
  { id: "approach", label: "Inside 30m", shortLabel: "<30m", unit: "avg shots", lowerIsBetter: true },
  { id: "scoring", label: "Scoring", shortLabel: "To par", unit: "avg / hole", lowerIsBetter: true },
];

/**
 * Rank cadets by hole-stat averages for end-of-term / year awards.
 * Needs at least one full loop (holeGroup holes) to appear.
 */
export function buildCadetStatLeaderboard(
  cards: CadetScorecardWithName[],
  category: CadetStatLeaderboardId,
  holeGroup: CadetHoleGroup,
): CadetStatLeaderboardEntry[] {
  type Acc = {
    playerId: string;
    playerName: string;
    holes: number;
    cards: number;
    putts: number;
    chips: number;
    bunker: number;
    to30: number;
    toPar: number;
  };
  const byPlayer = new Map<string, Acc>();

  for (const card of cards) {
    let acc = byPlayer.get(card.player_id);
    if (!acc) {
      acc = {
        playerId: card.player_id,
        playerName: card.player_name,
        holes: 0,
        cards: 0,
        putts: 0,
        chips: 0,
        bunker: 0,
        to30: 0,
        toPar: 0,
      };
      byPlayer.set(card.player_id, acc);
    }
    acc.cards += 1;
    if (card.player_name && acc.playerName === "Player") acc.playerName = card.player_name;
    for (const h of card.holes) {
      acc.holes += 1;
      acc.putts += h.putts;
      acc.chips += h.chips;
      acc.bunker += h.bunkerShots;
      acc.to30 += h.shotsTo30m;
      acc.toPar += h.totalStrokes - h.par;
    }
  }

  const minHoles = Math.max(holeGroup, 3);
  const avg = (n: number, holes: number) => Math.round((n / holes) * 100) / 100;

  const entries: CadetStatLeaderboardEntry[] = [];
  for (const a of byPlayer.values()) {
    if (a.holes < minHoles) continue;
    let value: number;
    switch (category) {
      case "putts":
        value = avg(a.putts, a.holes);
        break;
      case "chips":
        value = avg(a.chips, a.holes);
        break;
      case "bunker":
        value = avg(a.bunker, a.holes);
        break;
      case "approach":
        value = avg(a.to30, a.holes);
        break;
      case "scoring":
        value = avg(a.toPar, a.holes);
        break;
    }
    entries.push({
      playerId: a.playerId,
      playerName: a.playerName,
      holes: a.holes,
      cards: a.cards,
      value,
    });
  }

  return entries.sort((a, b) => {
    if (a.value !== b.value) return a.value - b.value;
    if (a.holes !== b.holes) return b.holes - a.holes;
    return a.playerName.localeCompare(b.playerName);
  });
}

export function formatCadetStatLeaderboardValue(
  category: CadetStatLeaderboardId,
  value: number,
): string {
  if (category === "scoring") {
    if (value === 0) return "E";
    return value > 0 ? `+${value}` : String(value);
  }
  return String(value);
}

export async function insertCadetScorecard(
  client: SupabaseClient,
  input: {
    playerId: string;
    holeGroup: CadetHoleGroup;
    playedOn: string;
    courseName?: string;
    notes?: string;
    holes: CadetScorecardHoleInput[];
    /** Also write a simple cadet_scores row for leaderboards. */
    syncLeaderboardScore?: boolean;
  },
): Promise<{ id: string | null; error: string | null }> {
  const invalid = validateCadetScorecardHoles(input.holes, input.holeGroup);
  if (invalid) return { id: null, error: invalid };

  const totalStrokes = input.holes.reduce((n, h) => n + h.totalStrokes, 0);
  const totalPar = input.holes.reduce((n, h) => n + h.par, 0);
  const totalToPar = totalStrokes - totalPar;

  const { data, error } = await client
    .from("cadet_scorecards")
    .insert({
      player_id: input.playerId,
      hole_group: input.holeGroup,
      played_on: input.playedOn,
      course_name: input.courseName?.trim() || null,
      notes: input.notes?.trim() || null,
      total_strokes: totalStrokes,
      total_to_par: totalToPar,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    const msg = error?.message || "Couldn't save scorecard.";
    return { id: null, error: isMissingRelation(msg) ? CADET_SCORECARD_MIGRATION_HINT : msg };
  }

  const scorecardId = String((data as { id: string }).id);
  const holeRows = input.holes.map((h) => ({
    scorecard_id: scorecardId,
    hole_number: h.holeNumber,
    par: h.par,
    shots_to_30m: h.shotsTo30m,
    chips: h.chips,
    bunker_shots: h.bunkerShots,
    putts: h.putts,
    total_strokes: h.totalStrokes,
  }));

  const { error: holeErr } = await client.from("cadet_scorecard_holes").insert(holeRows);
  if (holeErr) {
    await client.from("cadet_scorecards").delete().eq("id", scorecardId);
    const msg = holeErr.message || "Couldn't save hole rows.";
    return { id: null, error: isMissingRelation(msg) ? CADET_SCORECARD_MIGRATION_HINT : msg };
  }

  if (input.syncLeaderboardScore !== false) {
    await insertCadetScore(client, {
      playerId: input.playerId,
      holeGroup: input.holeGroup,
      playedOn: input.playedOn,
      grossScore: totalStrokes,
      toPar: totalToPar,
      courseName: input.courseName,
      notes: "From scorecard",
    });
  }

  return { id: scorecardId, error: null };
}

export async function fetchCadetEnrollmentForPlayer(
  client: SupabaseClient,
  playerId: string,
): Promise<{ enrollment: CadetEnrollmentRow | null; error: string | null; available: boolean }> {
  const { data, error } = await client
    .from("cadet_enrollments")
    .select("player_id, hole_group, enrolled_on, status, notes, is_junior_member")
    .eq("player_id", playerId)
    .maybeSingle();

  if (error) {
    const msg = error.message || "Couldn't load enrolment.";
    if (/is_junior_member/i.test(msg)) {
      const retry = await client
        .from("cadet_enrollments")
        .select("player_id, hole_group, enrolled_on, status, notes")
        .eq("player_id", playerId)
        .maybeSingle();
      if (retry.error) {
        const m2 = retry.error.message || msg;
        if (isMissingRelation(m2) || /cadet_enrollments/i.test(m2)) {
          return { enrollment: null, error: null, available: false };
        }
        return { enrollment: null, error: m2, available: true };
      }
      if (!retry.data) return { enrollment: null, error: null, available: true };
      const row = retry.data as Record<string, unknown>;
      return {
        enrollment: {
          player_id: String(row.player_id),
          hole_group: Number(row.hole_group) as CadetHoleGroup,
          enrolled_on: String(row.enrolled_on || ""),
          status: (String(row.status || "active") as CadetEnrollmentRow["status"]) || "active",
          notes: typeof row.notes === "string" ? row.notes : null,
          is_junior_member: false,
        },
        error: null,
        available: true,
      };
    }
    if (isMissingRelation(msg) || /cadet_enrollments/i.test(msg)) {
      return { enrollment: null, error: null, available: false };
    }
    return { enrollment: null, error: msg, available: true };
  }
  if (!data) return { enrollment: null, error: null, available: true };
  const row = data as Record<string, unknown>;
  const hg = Number(row.hole_group);
  return {
    enrollment: {
      player_id: String(row.player_id),
      hole_group: isCadetHoleGroup(hg) ? hg : 3,
      enrolled_on: String(row.enrolled_on || ""),
      status: (String(row.status || "active") as CadetEnrollmentRow["status"]) || "active",
      notes: typeof row.notes === "string" ? row.notes : null,
      is_junior_member: Boolean(row.is_junior_member),
    },
    error: null,
    available: true,
  };
}

/** Spreadsheet columns (tab / comma / semicolon). One row per hole. */
export const CADET_SCORECARD_PASTE_HEADERS =
  "Name · Date · Hole · Par · <30m · Chips · Bunker · Putts · Total · Course (optional)";

export const CADET_SCORECARD_TEMPLATE_TSV = [
  "Name\tDate\tHole\tPar\t<30m\tChips\tBunker\tPutts\tTotal\tCourse",
  "Example Player\t2026-11-04\t1\t4\t2\t1\t0\t2\t5\tStonecutters Ridge",
  "Example Player\t2026-11-04\t2\t3\t1\t0\t0\t2\t3\tStonecutters Ridge",
  "Example Player\t2026-11-04\t3\t5\t3\t1\t1\t2\t7\tStonecutters Ridge",
].join("\n");

export type ParsedCadetScorecardHoleLine = {
  name: string;
  playedOn: string | null;
  holeNumber: number;
  par: number;
  shotsTo30m: number;
  chips: number;
  bunkerShots: number;
  putts: number;
  totalStrokes: number;
  courseName: string | null;
  raw: string;
  error?: string;
};

export type CadetScorecardDraft = {
  playerId: string;
  playerName: string;
  holeGroup: CadetHoleGroup;
  playedOn: string;
  courseName?: string;
  holes: CadetScorecardHoleInput[];
};

function splitPasteCols(raw: string): string[] {
  if (raw.includes("\t")) return raw.split("\t").map((c) => c.trim());
  if (raw.includes(";")) return raw.split(";").map((c) => c.trim());
  return raw.split(",").map((c) => c.trim());
}

function looksLikeScorecardHeader(cols: string[]): boolean {
  const joined = cols.join(" ").toLowerCase();
  return /name|player/.test(joined) && /hole|par|putt|total|30/.test(joined);
}

function parseNonNegInt(raw: string, max: number): number | null {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n);
}

function inferHoleGroup(maxHole: number, holeCount: number): CadetHoleGroup | null {
  if (isCadetHoleGroup(maxHole) && holeCount === maxHole) return maxHole;
  // Prefer exact match on hole count among ladder sizes.
  const byCount = CADET_HOLE_GROUPS.find((g) => g === holeCount);
  if (byCount) return byCount;
  return null;
}

/**
 * Parse coach spreadsheet paste — one row per hole.
 * Columns: Name | Date | Hole | Par | <30m | Chips | Bunker | Putts | Total | Course?
 */
export function parseCadetScorecardPaste(
  text: string,
  defaultDate: string,
): ParsedCadetScorecardHoleLine[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const out: ParsedCadetScorecardHoleLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const cols = splitPasteCols(raw);
    if (i === 0 && looksLikeScorecardHeader(cols)) continue;

    const name = cols[0] || "";
    const dateCol = cols[1]?.trim() || "";
    let playedOn: string | null = defaultDate;
    if (dateCol) {
      // Accept YYYY-MM-DD or Excel-ish dates
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateCol)) {
        playedOn = dateCol;
      } else {
        const d = Date.parse(dateCol);
        playedOn = Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
      }
    }

    const holeNumber = parseNonNegInt(cols[2] || "", 10);
    const par = parseNonNegInt(cols[3] || "", 5);
    const shotsTo30m = parseNonNegInt(cols[4] || "", 20);
    const chips = parseNonNegInt(cols[5] || "", 15);
    const bunkerShots = parseNonNegInt(cols[6] || "", 15);
    const putts = parseNonNegInt(cols[7] || "", 15);
    const totalStrokes = parseNonNegInt(cols[8] || "", 20);
    const courseName = cols[9]?.trim() || null;

    if (!name) {
      out.push({
        name: "",
        playedOn,
        holeNumber: 0,
        par: 0,
        shotsTo30m: 0,
        chips: 0,
        bunkerShots: 0,
        putts: 0,
        totalStrokes: 0,
        courseName,
        raw,
        error: "Missing name",
      });
      continue;
    }
    if (dateCol && !playedOn) {
      out.push({
        name,
        playedOn: null,
        holeNumber: holeNumber ?? 0,
        par: par ?? 0,
        shotsTo30m: shotsTo30m ?? 0,
        chips: chips ?? 0,
        bunkerShots: bunkerShots ?? 0,
        putts: putts ?? 0,
        totalStrokes: totalStrokes ?? 0,
        courseName,
        raw,
        error: "Date not recognised — use YYYY-MM-DD",
      });
      continue;
    }
    if (holeNumber == null || holeNumber < 1) {
      out.push({
        name,
        playedOn,
        holeNumber: 0,
        par: 0,
        shotsTo30m: 0,
        chips: 0,
        bunkerShots: 0,
        putts: 0,
        totalStrokes: 0,
        courseName,
        raw,
        error: "Hole must be 1–10",
      });
      continue;
    }
    if (par == null || par < 3) {
      out.push({
        name,
        playedOn,
        holeNumber,
        par: 0,
        shotsTo30m: 0,
        chips: 0,
        bunkerShots: 0,
        putts: 0,
        totalStrokes: 0,
        courseName,
        raw,
        error: `Hole ${holeNumber}: par must be 3–5`,
      });
      continue;
    }
    if (
      shotsTo30m == null ||
      chips == null ||
      bunkerShots == null ||
      putts == null ||
      totalStrokes == null ||
      totalStrokes < 1
    ) {
      out.push({
        name,
        playedOn,
        holeNumber,
        par,
        shotsTo30m: shotsTo30m ?? 0,
        chips: chips ?? 0,
        bunkerShots: bunkerShots ?? 0,
        putts: putts ?? 0,
        totalStrokes: totalStrokes ?? 0,
        courseName,
        raw,
        error: `Hole ${holeNumber}: need <30m, chips, bunker, putts, and total`,
      });
      continue;
    }

    out.push({
      name,
      playedOn: playedOn || defaultDate,
      holeNumber,
      par,
      shotsTo30m,
      chips,
      bunkerShots,
      putts,
      totalStrokes,
      courseName,
      raw,
    });
  }
  return out;
}

/**
 * Group hole lines into scorecard drafts. Matches names to profiles.
 * Returns drafts ready to save + warnings for unmatched / incomplete cards.
 */
export function buildCadetScorecardDraftsFromPaste(
  lines: ParsedCadetScorecardHoleLine[],
  players: { id: string; full_name: string | null }[],
  defaultHoleGroup: CadetHoleGroup,
): { drafts: CadetScorecardDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  const buckets = new Map<
    string,
    {
      name: string;
      playedOn: string;
      courseName: string | null;
      holes: Map<number, CadetScorecardHoleInput>;
    }
  >();

  for (const line of lines) {
    if (line.error) {
      warnings.push(`${line.name || "Row"}: ${line.error}`);
      continue;
    }
    const playedOn = line.playedOn || "";
    if (!playedOn) {
      warnings.push(`${line.name}: missing date`);
      continue;
    }
    const key = `${line.name.trim().toLowerCase()}|${playedOn}|${(line.courseName || "").trim().toLowerCase()}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        name: line.name.trim(),
        playedOn,
        courseName: line.courseName,
        holes: new Map(),
      };
      buckets.set(key, bucket);
    }
    if (bucket.holes.has(line.holeNumber)) {
      warnings.push(`${line.name} ${playedOn}: duplicate hole ${line.holeNumber} — kept first`);
      continue;
    }
    bucket.holes.set(line.holeNumber, {
      holeNumber: line.holeNumber,
      par: line.par,
      shotsTo30m: line.shotsTo30m,
      chips: line.chips,
      bunkerShots: line.bunkerShots,
      putts: line.putts,
      totalStrokes: line.totalStrokes,
    });
    if (!bucket.courseName && line.courseName) bucket.courseName = line.courseName;
  }

  const drafts: CadetScorecardDraft[] = [];
  for (const bucket of buckets.values()) {
    const playerId = matchCadetPlayerId(bucket.name, players);
    if (!playerId) {
      warnings.push(`${bucket.name}: no matching player — skip this card`);
      continue;
    }
    const holes = [...bucket.holes.values()].sort((a, b) => a.holeNumber - b.holeNumber);
    const maxHole = holes.reduce((m, h) => Math.max(m, h.holeNumber), 0);
    let holeGroup = inferHoleGroup(maxHole, holes.length);
    if (!holeGroup) {
      // Fall back to selected group if holes look like a prefix of that loop.
      if (holes.length === defaultHoleGroup && maxHole <= defaultHoleGroup) {
        holeGroup = defaultHoleGroup;
      } else {
        warnings.push(
          `${bucket.name} ${bucket.playedOn}: need a full 3 / 5 / 7 / 10-hole set (got ${holes.length} holes, max #${maxHole})`,
        );
        continue;
      }
    }
    // Ensure contiguous 1..N
    const missing = [];
    for (let n = 1; n <= holeGroup; n++) {
      if (!bucket.holes.has(n)) missing.push(n);
    }
    if (missing.length) {
      warnings.push(`${bucket.name} ${bucket.playedOn}: missing hole(s) ${missing.join(", ")}`);
      continue;
    }
    const invalid = validateCadetScorecardHoles(holes, holeGroup);
    if (invalid) {
      warnings.push(`${bucket.name} ${bucket.playedOn}: ${invalid}`);
      continue;
    }
    drafts.push({
      playerId,
      playerName: bucket.name,
      holeGroup,
      playedOn: bucket.playedOn,
      courseName: bucket.courseName || undefined,
      holes,
    });
  }

  return { drafts, warnings };
}

export async function insertCadetScorecardsBulk(
  client: SupabaseClient,
  drafts: CadetScorecardDraft[],
): Promise<{ saved: number; error: string | null }> {
  if (!drafts.length) return { saved: 0, error: "No scorecards to save." };

  let saved = 0;
  for (const draft of drafts) {
    const enrol = await upsertCadetEnrollment(client, {
      playerId: draft.playerId,
      holeGroup: draft.holeGroup,
    });
    if (enrol.error) return { saved, error: enrol.error };

    const res = await insertCadetScorecard(client, {
      playerId: draft.playerId,
      holeGroup: draft.holeGroup,
      playedOn: draft.playedOn,
      courseName: draft.courseName,
      holes: draft.holes,
      syncLeaderboardScore: true,
    });
    if (res.error) return { saved, error: `${draft.playerName}: ${res.error}` };
    saved += 1;
  }
  return { saved, error: null };
}

export function downloadCadetScorecardTemplate() {
  if (typeof window === "undefined") return;
  const blob = new Blob([CADET_SCORECARD_TEMPLATE_TSV], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cadet-scorecard-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
