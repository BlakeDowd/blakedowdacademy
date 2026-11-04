import type { SupabaseClient } from "@supabase/supabase-js";

/** Cadet on-course loops — each player sits in one group. */
export const CADET_HOLE_GROUPS = [3, 5, 7, 10] as const;
export type CadetHoleGroup = (typeof CADET_HOLE_GROUPS)[number];

export type CadetLeaderboardPeriod = "term" | "year";

export type CadetScoreRow = {
  id: string;
  player_id: string;
  hole_group: CadetHoleGroup;
  played_on: string;
  gross_score: number;
  to_par: number | null;
  course_name: string | null;
  notes: string | null;
  created_at: string;
};

export type CadetEnrollmentRow = {
  player_id: string;
  hole_group: CadetHoleGroup;
  enrolled_on: string;
  status: "active" | "paused" | "alumni";
  notes: string | null;
  is_junior_member: boolean;
};

/** Full Cadet pathway including Junior Member above 10-hole. */
export type CadetProgressionStepId = CadetHoleGroup | "junior_member";

export type CadetLeaderboardEntry = {
  playerId: string;
  playerName: string;
  rounds: number;
  /** Average gross for the period (lower is better). */
  avgGross: number;
  /** Average to-par when every round has to_par; otherwise null. */
  avgToPar: number | null;
  /** Sum of to-par when complete; otherwise null. */
  totalToPar: number | null;
  bestGross: number;
  lastPlayedOn: string;
};

export const CADET_MIGRATION_HINT =
  "Cadet scoring needs a database update. Run supabase/migrations/20261103120000_cadet_hole_groups_scores.sql in Supabase, then reload.";

function isMissingRelation(message: string): boolean {
  return /cadet_scores|cadet_enrollments|schema cache|does not exist/i.test(message);
}

export function isCadetHoleGroup(n: number): n is CadetHoleGroup {
  return (CADET_HOLE_GROUPS as readonly number[]).includes(n);
}

export function cadetHoleGroupLabel(holes: CadetHoleGroup): string {
  return `${holes}-hole`;
}

/** Progression standards: 3 → 5 → 7 → 10 → Junior Member. */
export const CADET_PROGRESSION_STANDARDS: {
  id: CadetProgressionStepId;
  title: string;
  shortLabel: string;
  focus: string;
  moveUp: string;
}[] = [
  {
    id: 3,
    title: "3-hole",
    shortLabel: "3",
    focus: "Short loop · basics of contact, putting, and course manners.",
    moveUp: "Complete term modules and pass tests that gate 5-hole.",
  },
  {
    id: 5,
    title: "5-hole",
    shortLabel: "5",
    focus: "Longer stretch · scoring awareness and simple course management.",
    moveUp: "Complete term modules and pass tests that gate 7-hole.",
  },
  {
    id: 7,
    title: "7-hole",
    shortLabel: "7",
    focus: "Near full-nine load · decision making under a bit more pressure.",
    moveUp: "Complete term modules and pass tests that gate 10-hole.",
  },
  {
    id: 10,
    title: "10-hole",
    shortLabel: "10",
    focus: "Longer Cadet loop · transfer skills under more holes.",
    moveUp: "Complete term modules, tests, and scoring to unlock Junior Member.",
  },
  {
    id: "junior_member",
    title: "Junior Member",
    shortLabel: "JM",
    focus: "Highest Cadet pathway step · ready for junior membership pathway.",
    moveUp: "Top of the Cadet pathway — keep competing and logging rounds.",
  },
];

/** @deprecated Use CADET_PROGRESSION_STANDARDS */
export const CADET_HOLE_GROUP_STANDARDS = CADET_PROGRESSION_STANDARDS.filter(
  (s): s is (typeof CADET_PROGRESSION_STANDARDS)[number] & { id: CadetHoleGroup } =>
    s.id !== "junior_member",
).map((s) => ({
  holes: s.id as CadetHoleGroup,
  title: s.title,
  focus: s.focus,
  moveUp: s.moveUp,
}));

/**
 * Cadet calendar uses 3 terms. Windows are approximate academy dates for leaderboards.
 */
export function cadetTermWindow(
  at: Date = new Date(),
): { term: 1 | 2 | 3; label: string; start: string; end: string; year: number } {
  const y = at.getFullYear();
  const md = (at.getMonth() + 1) * 100 + at.getDate();
  const windows: { term: 1 | 2 | 3; label: string; startMd: number; endMd: number }[] = [
    { term: 1, label: "Term 1", startMd: 127, endMd: 430 }, // late Jan – Apr
    { term: 2, label: "Term 2", startMd: 501, endMd: 815 }, // May – mid Aug
    { term: 3, label: "Term 3", startMd: 816, endMd: 1215 }, // mid Aug – mid Dec
  ];

  let hit = windows[0]!;
  for (const w of windows) {
    if (md >= w.startMd && md <= w.endMd) {
      hit = w;
      break;
    }
    if (md > w.endMd) hit = w;
  }

  const fmt = (year: number, startMd: number) => {
    const m = Math.floor(startMd / 100);
    const d = startMd % 100;
    return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };

  return {
    term: hit.term,
    label: `${hit.label} ${y}`,
    start: fmt(y, hit.startMd),
    end: fmt(y, hit.endMd),
    year: y,
  };
}

export function cadetYearWindow(at: Date = new Date()): { label: string; start: string; end: string; year: number } {
  const y = at.getFullYear();
  return { label: `Year ${y}`, start: `${y}-01-01`, end: `${y}-12-31`, year: y };
}

export function periodWindow(
  period: CadetLeaderboardPeriod,
  at: Date = new Date(),
): { label: string; start: string; end: string } {
  if (period === "term") {
    const t = cadetTermWindow(at);
    return { label: t.label, start: t.start, end: t.end };
  }
  const y = cadetYearWindow(at);
  return { label: y.label, start: y.start, end: y.end };
}

type ScoreJoin = CadetScoreRow & { profiles?: { full_name: string | null } | null };

function profileFullName(raw: unknown): string | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0] as { full_name?: string | null } | undefined;
    return first?.full_name ?? null;
  }
  if (typeof raw === "object" && "full_name" in (raw as object)) {
    return (raw as { full_name: string | null }).full_name ?? null;
  }
  return null;
}

function mapScoreJoinRow(row: Record<string, unknown>): ScoreJoin {
  const { profiles: _profiles, ...rest } = row;
  return {
    ...(rest as CadetScoreRow),
    profiles: { full_name: profileFullName(row.profiles) },
  };
}

function rankKey(entry: CadetLeaderboardEntry): number {
  // Prefer average to-par when available; else average gross.
  if (entry.avgToPar != null) return entry.avgToPar;
  return entry.avgGross;
}

export function buildCadetLeaderboard(
  scores: ScoreJoin[],
  namesById?: Map<string, string>,
): CadetLeaderboardEntry[] {
  type Acc = {
    playerId: string;
    playerName: string;
    rounds: number;
    grossSum: number;
    toParSum: number;
    toParCount: number;
    bestGross: number;
    lastPlayedOn: string;
  };
  const byPlayer = new Map<string, Acc>();

  for (const row of scores) {
    const name =
      namesById?.get(row.player_id) ||
      row.profiles?.full_name?.trim() ||
      "Player";
    const existing = byPlayer.get(row.player_id);
    if (!existing) {
      byPlayer.set(row.player_id, {
        playerId: row.player_id,
        playerName: name,
        rounds: 1,
        grossSum: row.gross_score,
        toParSum: row.to_par ?? 0,
        toParCount: row.to_par == null ? 0 : 1,
        bestGross: row.gross_score,
        lastPlayedOn: row.played_on,
      });
      continue;
    }
    existing.rounds += 1;
    existing.grossSum += row.gross_score;
    if (row.to_par != null) {
      existing.toParSum += row.to_par;
      existing.toParCount += 1;
    }
    existing.bestGross = Math.min(existing.bestGross, row.gross_score);
    if (row.played_on > existing.lastPlayedOn) existing.lastPlayedOn = row.played_on;
    if (name && existing.playerName === "Player") existing.playerName = name;
  }

  const entries: CadetLeaderboardEntry[] = [...byPlayer.values()].map((a) => ({
    playerId: a.playerId,
    playerName: a.playerName,
    rounds: a.rounds,
    avgGross: Math.round((a.grossSum / a.rounds) * 10) / 10,
    avgToPar: a.toParCount === a.rounds ? Math.round((a.toParSum / a.rounds) * 10) / 10 : null,
    totalToPar: a.toParCount === a.rounds ? a.toParSum : null,
    bestGross: a.bestGross,
    lastPlayedOn: a.lastPlayedOn,
  }));

  return entries.sort((a, b) => {
    const d = rankKey(a) - rankKey(b);
    if (d !== 0) return d;
    if (a.bestGross !== b.bestGross) return a.bestGross - b.bestGross;
    return b.rounds - a.rounds;
  });
}

export function formatToPar(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

export async function fetchCadetScores(
  client: SupabaseClient,
  opts: { holeGroup: CadetHoleGroup; start: string; end: string },
): Promise<{ scores: ScoreJoin[]; error: string | null; available: boolean }> {
  const { data, error } = await client
    .from("cadet_scores")
    .select("id, player_id, hole_group, played_on, gross_score, to_par, course_name, notes, created_at, profiles(full_name)")
    .eq("hole_group", opts.holeGroup)
    .gte("played_on", opts.start)
    .lte("played_on", opts.end)
    .order("played_on", { ascending: false });

  if (error) {
    const msg = error.message || "Couldn't load cadet scores.";
    if (isMissingRelation(msg)) return { scores: [], error: CADET_MIGRATION_HINT, available: false };
    return { scores: [], error: msg, available: true };
  }
  return {
    scores: ((data as Record<string, unknown>[] | null) || []).map(mapScoreJoinRow),
    error: null,
    available: true,
  };
}

/** Player on-course rounds (optionally scoped to hole group + date window). */
export async function fetchCadetScoresForPlayer(
  client: SupabaseClient,
  opts: {
    playerId: string;
    holeGroup?: CadetHoleGroup;
    start?: string;
    end?: string;
  },
): Promise<{ scores: CadetScoreRow[]; error: string | null; available: boolean }> {
  let q = client
    .from("cadet_scores")
    .select("id, player_id, hole_group, played_on, gross_score, to_par, course_name, notes, created_at")
    .eq("player_id", opts.playerId)
    .order("played_on", { ascending: false });
  if (opts.holeGroup != null) q = q.eq("hole_group", opts.holeGroup);
  if (opts.start) q = q.gte("played_on", opts.start);
  if (opts.end) q = q.lte("played_on", opts.end);

  const { data, error } = await q;
  if (error) {
    const msg = error.message || "Couldn't load player scores.";
    if (isMissingRelation(msg)) return { scores: [], error: CADET_MIGRATION_HINT, available: false };
    return { scores: [], error: msg, available: true };
  }
  return { scores: (data as CadetScoreRow[]) || [], error: null, available: true };
}

/** Minimum rounds this term before recommending a hole-group move-up. */
export const CADET_LEVEL_UP_MIN_ROUNDS = 3;

/**
 * Soft avg to-par ceiling for recommending move-up from each hole group.
 * Coaches can still promote manually; this drives Curriculum recommendations.
 */
export const CADET_LEVEL_UP_TO_PAR_CEILING: Record<CadetHoleGroup, number> = {
  3: 4,
  5: 6,
  7: 8,
  10: 10,
};

export type CadetOnCourseLevelSummary = {
  rounds: number;
  avgGross: number | null;
  avgToPar: number | null;
  bestGross: number | null;
  lastPlayedOn: string | null;
  minRounds: number;
  toParCeiling: number | null;
  ready: boolean;
  detail: string;
};

export function summarizeCadetOnCourseForLevelUp(
  scores: CadetScoreRow[],
  holeGroup: CadetHoleGroup | null,
): CadetOnCourseLevelSummary {
  const minRounds = CADET_LEVEL_UP_MIN_ROUNDS;
  const toParCeiling = holeGroup != null ? CADET_LEVEL_UP_TO_PAR_CEILING[holeGroup] : null;

  if (!scores.length) {
    return {
      rounds: 0,
      avgGross: null,
      avgToPar: null,
      bestGross: null,
      lastPlayedOn: null,
      minRounds,
      toParCeiling,
      ready: false,
      detail: `Log at least ${minRounds} ${holeGroup ? cadetHoleGroupLabel(holeGroup) : "Cadet"} rounds this term.`,
    };
  }

  let grossSum = 0;
  let toParSum = 0;
  let toParCount = 0;
  let bestGross = scores[0]!.gross_score;
  let lastPlayedOn = scores[0]!.played_on;
  for (const s of scores) {
    grossSum += s.gross_score;
    if (s.to_par != null) {
      toParSum += s.to_par;
      toParCount += 1;
    }
    bestGross = Math.min(bestGross, s.gross_score);
    if (s.played_on > lastPlayedOn) lastPlayedOn = s.played_on;
  }

  const rounds = scores.length;
  const avgGross = Math.round((grossSum / rounds) * 10) / 10;
  const avgToPar =
    toParCount > 0 ? Math.round((toParSum / toParCount) * 10) / 10 : null;

  if (rounds < minRounds) {
    return {
      rounds,
      avgGross,
      avgToPar,
      bestGross,
      lastPlayedOn,
      minRounds,
      toParCeiling,
      ready: false,
      detail: `Need ${minRounds - rounds} more round${minRounds - rounds === 1 ? "" : "s"} this term (have ${rounds}).`,
    };
  }

  if (avgToPar == null) {
    return {
      rounds,
      avgGross,
      avgToPar,
      bestGross,
      lastPlayedOn,
      minRounds,
      toParCeiling,
      ready: false,
      detail: `Have ${rounds} rounds (avg gross ${avgGross}) — add to-par so scoring readiness is clear.`,
    };
  }

  if (toParCeiling != null && avgToPar > toParCeiling) {
    return {
      rounds,
      avgGross,
      avgToPar,
      bestGross,
      lastPlayedOn,
      minRounds,
      toParCeiling,
      ready: false,
      detail: `Avg ${formatToPar(avgToPar)} over ${rounds} rounds — aim for ${formatToPar(toParCeiling)} or better before moving up.`,
    };
  }

  return {
    rounds,
    avgGross,
    avgToPar,
    bestGross,
    lastPlayedOn,
    minRounds,
    toParCeiling,
    ready: true,
    detail: `On-course ready · ${rounds} rounds · avg ${formatToPar(avgToPar)} (target ${formatToPar(toParCeiling)}).`,
  };
}

function mapEnrollmentRow(row: Record<string, unknown>): CadetEnrollmentRow {
  return {
    player_id: String(row.player_id),
    hole_group: Number(row.hole_group) as CadetHoleGroup,
    enrolled_on: String(row.enrolled_on || ""),
    status: (String(row.status || "active") as CadetEnrollmentRow["status"]) || "active",
    notes: typeof row.notes === "string" ? row.notes : null,
    is_junior_member: Boolean(row.is_junior_member),
  };
}

export async function fetchCadetEnrollments(
  client: SupabaseClient,
  holeGroup?: CadetHoleGroup,
): Promise<{ rows: CadetEnrollmentRow[]; error: string | null; available: boolean }> {
  let q = client
    .from("cadet_enrollments")
    .select("player_id, hole_group, enrolled_on, status, notes, is_junior_member")
    .eq("status", "active")
    .order("hole_group", { ascending: true });
  if (holeGroup != null) q = q.eq("hole_group", holeGroup);

  const { data, error } = await q;
  if (error) {
    const msg = error.message || "Couldn't load enrolments.";
    // Column may be missing before junior-member migration — retry without it.
    if (/is_junior_member/i.test(msg)) {
      let q2 = client
        .from("cadet_enrollments")
        .select("player_id, hole_group, enrolled_on, status, notes")
        .eq("status", "active")
        .order("hole_group", { ascending: true });
      if (holeGroup != null) q2 = q2.eq("hole_group", holeGroup);
      const retry = await q2;
      if (retry.error) {
        const m2 = retry.error.message || msg;
        if (isMissingRelation(m2)) return { rows: [], error: CADET_MIGRATION_HINT, available: false };
        return { rows: [], error: m2, available: true };
      }
      return {
        rows: ((retry.data as Record<string, unknown>[]) || []).map((r) =>
          mapEnrollmentRow({ ...r, is_junior_member: false }),
        ),
        error: null,
        available: true,
      };
    }
    if (isMissingRelation(msg)) return { rows: [], error: CADET_MIGRATION_HINT, available: false };
    return { rows: [], error: msg, available: true };
  }
  return {
    rows: ((data as Record<string, unknown>[]) || []).map(mapEnrollmentRow),
    error: null,
    available: true,
  };
}

export async function upsertCadetEnrollment(
  client: SupabaseClient,
  input: {
    playerId: string;
    holeGroup: CadetHoleGroup;
    notes?: string;
    isJuniorMember?: boolean;
  },
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {
    player_id: input.playerId,
    hole_group: input.holeGroup,
    status: "active",
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (input.isJuniorMember != null) {
    payload.is_junior_member = input.isJuniorMember;
  }

  const { error } = await client.from("cadet_enrollments").upsert(payload, { onConflict: "player_id" });
  if (error) {
    const msg = error.message || "Couldn't save enrolment.";
    if (/is_junior_member/i.test(msg) && input.isJuniorMember != null) {
      // Migration not applied yet — still save hole group.
      const { error: e2 } = await client.from("cadet_enrollments").upsert(
        {
          player_id: input.playerId,
          hole_group: input.holeGroup,
          status: "active",
          notes: input.notes?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "player_id" },
      );
      if (e2) {
        const m2 = e2.message || msg;
        return { error: isMissingRelation(m2) ? CADET_MIGRATION_HINT : m2 };
      }
      return {
        error:
          "Junior Member flag needs a database update. Run supabase/migrations/20261104130000_cadet_junior_member.sql, then reload.",
      };
    }
    return { error: isMissingRelation(msg) ? CADET_MIGRATION_HINT : msg };
  }
  return { error: null };
}

export async function insertCadetScore(
  client: SupabaseClient,
  input: {
    playerId: string;
    holeGroup: CadetHoleGroup;
    playedOn: string;
    grossScore: number;
    toPar?: number | null;
    courseName?: string;
    notes?: string;
  },
): Promise<{ error: string | null }> {
  const { error } = await client.from("cadet_scores").insert({
    player_id: input.playerId,
    hole_group: input.holeGroup,
    played_on: input.playedOn,
    gross_score: input.grossScore,
    to_par: input.toPar ?? null,
    course_name: input.courseName?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) {
    const msg = error.message || "Couldn't save score.";
    return { error: isMissingRelation(msg) ? CADET_MIGRATION_HINT : msg };
  }
  return { error: null };
}

export type CadetScoreDraft = {
  playerId: string;
  holeGroup: CadetHoleGroup;
  playedOn: string;
  grossScore: number;
  toPar?: number | null;
  courseName?: string;
};

/** Insert many round scores (one spreadsheet session). Enrols each player into the hole group. */
export async function insertCadetScoresBulk(
  client: SupabaseClient,
  rows: CadetScoreDraft[],
): Promise<{ saved: number; error: string | null }> {
  if (!rows.length) return { saved: 0, error: "No scores to save." };

  for (const row of rows) {
    const enrol = await upsertCadetEnrollment(client, {
      playerId: row.playerId,
      holeGroup: row.holeGroup,
    });
    if (enrol.error) return { saved: 0, error: enrol.error };
  }

  const payload = rows.map((row) => ({
    player_id: row.playerId,
    hole_group: row.holeGroup,
    played_on: row.playedOn,
    gross_score: row.grossScore,
    to_par: row.toPar ?? null,
    course_name: row.courseName?.trim() || null,
  }));

  const { error } = await client.from("cadet_scores").insert(payload);
  if (error) {
    const msg = error.message || "Couldn't save scores.";
    return { saved: 0, error: isMissingRelation(msg) ? CADET_MIGRATION_HINT : msg };
  }
  return { saved: payload.length, error: null };
}

export type ParsedCadetScoreLine = {
  name: string;
  grossScore: number;
  toPar: number | null;
  playedOn: string | null;
  raw: string;
  error?: string;
};

function parseToParCell(raw: string): number | null {
  const t = raw.trim().replace(/^\+/, "");
  if (!t || /^e(ven)?$/i.test(t)) return 0;
  if (t === "-" || t === "—") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseGrossCell(raw: string): number | null {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 1 || n > 120) return null;
  return Math.round(n);
}

function looksLikeHeader(cols: string[]): boolean {
  const joined = cols.join(" ").toLowerCase();
  return /name|player|gross|score|to\s*par|date/.test(joined) && cols.length >= 2;
}

/**
 * Parse spreadsheet paste (Excel / Sheets).
 * Columns: Name | Gross | To-par (optional) | Date (optional)
 * Tab, comma, or semicolon separated. Skips blank / header rows.
 */
export function parseCadetScorePaste(
  text: string,
  defaultDate: string,
): ParsedCadetScoreLine[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const out: ParsedCadetScoreLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const cols = raw.includes("\t")
      ? raw.split("\t").map((c) => c.trim())
      : raw.includes(";")
        ? raw.split(";").map((c) => c.trim())
        : raw.split(",").map((c) => c.trim());
    if (i === 0 && looksLikeHeader(cols)) continue;

    const name = cols[0] || "";
    const grossScore = parseGrossCell(cols[1] || "");
    const toPar =
      cols[2] != null && String(cols[2]).trim() !== "" ? parseToParCell(cols[2]) : null;
    const dateCol = cols[3]?.trim() || "";
    let playedOn: string | null = defaultDate;
    if (dateCol) {
      const d = Date.parse(dateCol);
      playedOn = Number.isFinite(d) ? new Date(d).toISOString().slice(0, 10) : null;
    }

    if (!name) {
      out.push({ name: "", grossScore: 0, toPar: null, playedOn, raw, error: "Missing name" });
      continue;
    }
    if (grossScore == null) {
      out.push({
        name,
        grossScore: 0,
        toPar,
        playedOn,
        raw,
        error: "Gross score must be a number",
      });
      continue;
    }
    if (cols[2] != null && String(cols[2]).trim() !== "" && toPar == null && !/^e(ven)?$/i.test(cols[2].trim())) {
      out.push({
        name,
        grossScore,
        toPar: null,
        playedOn,
        raw,
        error: "To-par must be a number (e.g. -2, 0, +3)",
      });
      continue;
    }
    if (dateCol && !playedOn) {
      out.push({
        name,
        grossScore,
        toPar,
        playedOn: null,
        raw,
        error: "Date not recognised — use YYYY-MM-DD",
      });
      continue;
    }

    out.push({ name, grossScore, toPar, playedOn: playedOn || defaultDate, raw });
  }
  return out;
}

/** Match pasted names to profiles (exact, then case-insensitive, then unique partial). */
export function matchCadetPlayerId(
  name: string,
  players: { id: string; full_name: string | null }[],
): string | null {
  const needle = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!needle) return null;
  const exact = players.find((p) => (p.full_name || "").trim().toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = players.filter((p) => {
    const n = (p.full_name || "").trim().toLowerCase();
    return n.includes(needle) || needle.includes(n);
  });
  return partial.length === 1 ? partial[0]!.id : null;
}
