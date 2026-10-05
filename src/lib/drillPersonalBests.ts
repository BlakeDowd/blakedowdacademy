import type { SupabaseClient } from "@supabase/supabase-js";

/** Turns PostgREST “schema cache / relation” errors into something actionable in the UI. */
export function userFacingDrillPersonalBestsError(message: string | null | undefined): string {
  const raw = (message || "").trim();
  const m = raw.toLowerCase();
  if (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("relation") ||
    m.includes("pgrst205")
  ) {
    return "Personal bests need one database step: in Supabase → SQL Editor, run the file supabase/migrations/20260416120100_drill_personal_bests.sql (or supabase db push). Then Dashboard → Settings → API → Reload schema.";
  }
  return raw || "Could not save. Try again.";
}

export type DrillPersonalBestRow = {
  user_id: string;
  drill_key: string;
  achievement: string;
  updated_at: string;
};

export function stableDrillKey(drill: { id: string; drill_id?: string }): string {
  const raw = (drill as { drill_id?: string }).drill_id || drill.id;
  return String(raw || "").trim() || drill.id;
}

export async function fetchDrillPersonalBest(
  supabase: SupabaseClient,
  userId: string,
  drillKey: string,
): Promise<DrillPersonalBestRow | null> {
  const { data, error } = await supabase
    .from("drill_personal_bests")
    .select("user_id, drill_key, achievement, updated_at")
    .eq("user_id", userId)
    .eq("drill_key", drillKey)
    .maybeSingle();
  if (error) {
    const m = (error.message || "").toLowerCase();
    if (m.includes("relation") || m.includes("does not exist") || m.includes("schema cache")) {
      console.warn("[drillPersonalBests] table missing or not exposed:", error.message);
    } else {
      console.warn("[drillPersonalBests] fetch:", error.message);
    }
    return null;
  }
  return (data as DrillPersonalBestRow) ?? null;
}

function isMissingSchemaError(message: string | null | undefined): boolean {
  const m = (message || "").toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("relation") ||
    m.includes("pgrst205") ||
    m.includes("pgrst204") ||
    m.includes("column")
  );
}

export function userFacingDrillScoreError(message: string | null | undefined): string {
  if (isMissingSchemaError(message)) {
    return "Score tracking needs one database step: in Supabase → SQL Editor, run supabase/migrations/20261005150000_drill_score_logs.sql.";
  }
  return (message || "").trim() || "Could not save. Try again.";
}

export type DrillScoreLog = {
  id: string;
  score: number;
  created_at: string;
};

export type DrillScoreSettings = {
  unit: string;
  lowerIsBetter: boolean;
  /** Player-set goal; null means fall back to the drill's coach goal. */
  goalScore: number | null;
  /** Free-text personal best saved before numeric tracking existed. */
  legacyText: string;
};

export type DrillGoalTarget = { score: number; unit: string };

/** Reads catalog Goal/Reps text like "18 in a row", "8/10" or "2 chip ins" as a numeric target. */
export function parseDrillGoalTarget(text: string | null | undefined): DrillGoalTarget | null {
  const m = String(text ?? "")
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return null;
  const score = Number(m[1]);
  if (!Number.isFinite(score) || score <= 0) return null;
  return { score, unit: m[2].trim().slice(0, 40) };
}

export type DrillProgressData = {
  settings: DrillScoreSettings;
  /** Newest first. */
  logs: DrillScoreLog[];
  /** False when the score logs migration has not been run yet. */
  available: boolean;
};

const DRILL_SCORE_HISTORY_LIMIT = 30;

export async function fetchDrillProgress(
  supabase: SupabaseClient,
  userId: string,
  drillKey: string,
): Promise<DrillProgressData> {
  const settings: DrillScoreSettings = { unit: "", lowerIsBetter: false, goalScore: null, legacyText: "" };

  const [pbRes, logsRes] = await Promise.all([
    supabase
      .from("drill_personal_bests")
      .select("achievement, score_unit, lower_is_better, goal_score")
      .eq("user_id", userId)
      .eq("drill_key", drillKey)
      .maybeSingle(),
    supabase
      .from("drill_score_logs")
      .select("id, score, created_at")
      .eq("user_id", userId)
      .eq("drill_key", drillKey)
      .order("created_at", { ascending: false })
      .limit(DRILL_SCORE_HISTORY_LIMIT),
  ]);

  if (pbRes.error) {
    const legacy = await fetchDrillPersonalBest(supabase, userId, drillKey);
    settings.legacyText = legacy?.achievement?.trim() ?? "";
  } else if (pbRes.data) {
    const row = pbRes.data as {
      achievement?: string;
      score_unit?: string | null;
      lower_is_better?: boolean;
      goal_score?: number | string | null;
    };
    settings.legacyText = (row.achievement ?? "").trim();
    settings.unit = (row.score_unit ?? "").trim();
    settings.lowerIsBetter = row.lower_is_better === true;
    const goal = row.goal_score == null ? null : Number(row.goal_score);
    settings.goalScore = goal != null && Number.isFinite(goal) ? goal : null;
  }

  if (logsRes.error) {
    if (!isMissingSchemaError(logsRes.error.message)) {
      console.warn("[drillPersonalBests] score logs fetch:", logsRes.error.message);
    }
    return { settings, logs: [], available: !isMissingSchemaError(logsRes.error.message) };
  }

  const logs = ((logsRes.data ?? []) as { id: string; score: number | string; created_at: string }[])
    .map((r) => ({ id: r.id, score: Number(r.score), created_at: r.created_at }))
    .filter((r) => Number.isFinite(r.score));

  return { settings, logs, available: true };
}

export async function insertDrillScore(
  supabase: SupabaseClient,
  userId: string,
  drillKey: string,
  score: number,
): Promise<{ log: DrillScoreLog | null; error: string | null }> {
  const { data, error } = await supabase
    .from("drill_score_logs")
    .insert({ user_id: userId, drill_key: drillKey, score })
    .select("id, score, created_at")
    .single();
  if (error) return { log: null, error: userFacingDrillScoreError(error.message) };
  const row = data as { id: string; score: number | string; created_at: string };
  return { log: { id: row.id, score: Number(row.score), created_at: row.created_at }, error: null };
}

export async function deleteDrillScore(
  supabase: SupabaseClient,
  logId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("drill_score_logs").delete().eq("id", logId);
  return { error: error ? userFacingDrillScoreError(error.message) : null };
}

export async function saveDrillScoreSettings(
  supabase: SupabaseClient,
  userId: string,
  drillKey: string,
  settings: { unit: string; lowerIsBetter: boolean; goalScore: number | null },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("drill_personal_bests").upsert(
    {
      user_id: userId,
      drill_key: drillKey,
      score_unit: settings.unit.trim().slice(0, 40) || null,
      lower_is_better: settings.lowerIsBetter,
      goal_score: settings.goalScore,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,drill_key" },
  );
  return { error: error ? userFacingDrillScoreError(error.message) : null };
}

export type DrillRecord = {
  drillKey: string;
  unit: string;
  lowerIsBetter: boolean;
  goalScore: number | null;
  /** Newest first. */
  logs: DrillScoreLog[];
};

/** Every drill the player has logged a score for, newest activity first. */
export async function fetchAllDrillRecords(
  supabase: SupabaseClient,
  userId: string,
): Promise<DrillRecord[]> {
  const [logsRes, settingsRes] = await Promise.all([
    supabase
      .from("drill_score_logs")
      .select("id, drill_key, score, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("drill_personal_bests")
      .select("drill_key, score_unit, lower_is_better, goal_score")
      .eq("user_id", userId),
  ]);
  if (logsRes.error) return [];

  const settingsByKey = new Map<string, { unit: string; lowerIsBetter: boolean; goalScore: number | null }>();
  for (const row of (settingsRes.data || []) as {
    drill_key: string;
    score_unit?: string | null;
    lower_is_better?: boolean | null;
    goal_score?: number | string | null;
  }[]) {
    const goal = row.goal_score == null ? null : Number(row.goal_score);
    settingsByKey.set(row.drill_key, {
      unit: (row.score_unit ?? "").trim(),
      lowerIsBetter: row.lower_is_better === true,
      goalScore: goal != null && Number.isFinite(goal) ? goal : null,
    });
  }

  const byKey = new Map<string, DrillRecord>();
  for (const row of (logsRes.data || []) as { id: string; drill_key: string; score: number | string; created_at: string }[]) {
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    let record = byKey.get(row.drill_key);
    if (!record) {
      const s = settingsByKey.get(row.drill_key);
      record = {
        drillKey: row.drill_key,
        unit: s?.unit ?? "",
        lowerIsBetter: s?.lowerIsBetter ?? false,
        goalScore: s?.goalScore ?? null,
        logs: [],
      };
      byKey.set(row.drill_key, record);
    }
    record.logs.push({ id: row.id, score, created_at: row.created_at });
  }
  return [...byKey.values()];
}

export function formatDrillScore(score: number, unit: string): string {
  const n = Number.isInteger(score) ? String(score) : String(Math.round(score * 100) / 100);
  const u = unit.trim();
  if (!u) return n;
  return /^[/%]/.test(u) ? `${n}${u}` : `${n} ${u}`;
}

export type DrillProgressSummary = {
  best: number;
  last: number;
  count: number;
  /** Change of the latest log vs the one before it, signed so positive = better. */
  lastChange: number | null;
};

export function summarizeDrillProgress(
  logs: DrillScoreLog[],
  lowerIsBetter: boolean,
): DrillProgressSummary | null {
  if (logs.length === 0) return null;
  const scores = logs.map((l) => l.score);
  const best = lowerIsBetter ? Math.min(...scores) : Math.max(...scores);
  const last = scores[0];
  const prev = scores.length > 1 ? scores[1] : null;
  const lastChange = prev == null ? null : lowerIsBetter ? prev - last : last - prev;
  return { best, last, count: logs.length, lastChange };
}

/** One-line reaction shown right after a score is logged. */
export function describeNewDrillScore(
  score: number,
  previous: DrillScoreLog[],
  lowerIsBetter: boolean,
  unit: string,
  goal: number | null = null,
): { text: string; tone: "pb" | "up" | "even" | "down" } {
  const better = (a: number, b: number) => (lowerIsBetter ? a < b : a > b);
  const reaches = (s: number) => goal != null && (s === goal || better(s, goal));
  const prevSummary = summarizeDrillProgress(previous, lowerIsBetter);
  if (reaches(score) && !(prevSummary && reaches(prevSummary.best))) {
    return { text: `Goal reached: ${formatDrillScore(score, unit)}! Time to set a new one.`, tone: "pb" };
  }
  if (!prevSummary) {
    return { text: "First score logged. That's your bar to beat next time.", tone: "pb" };
  }
  const diff = (a: number, b: number) => Math.round(Math.abs(a - b) * 100) / 100;
  if (better(score, prevSummary.best)) {
    return {
      text: `New personal best! ${diff(score, prevSummary.best)} better than ${formatDrillScore(prevSummary.best, unit)}.`,
      tone: "pb",
    };
  }
  if (score === prevSummary.best) {
    return { text: "Matched your personal best.", tone: "even" };
  }
  if (better(score, prevSummary.last)) {
    return {
      text: `Up ${diff(score, prevSummary.last)} on last time. ${diff(score, prevSummary.best)} off your best.`,
      tone: "up",
    };
  }
  return {
    text: `${diff(score, prevSummary.best)} off your best of ${formatDrillScore(prevSummary.best, unit)}. Keep pushing.`,
    tone: "down",
  };
}

export async function upsertDrillPersonalBest(
  supabase: SupabaseClient,
  userId: string,
  drillKey: string,
  achievement: string,
): Promise<{ error: Error | null }> {
  const trimmed = achievement.trim().slice(0, 500);
  const { error } = await supabase.from("drill_personal_bests").upsert(
    {
      user_id: userId,
      drill_key: drillKey,
      achievement: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,drill_key" },
  );
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
