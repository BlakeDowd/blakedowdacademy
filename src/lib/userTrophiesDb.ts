import type { SupabaseClient } from "@supabase/supabase-js";

import { trophyIdForDbTrophyName } from "@/lib/userAchievements";

/** Normalized row from `public.user_trophies` (`achievement_id` + `earned_at`). */
export type NormalizedUserTrophyRow = {
  achievement_id: string;
  earned_at?: string;
  trophy_icon?: string;
  description?: string;
};

/**
 * Maps a `user_trophies` row to our canonical shape. Prefers `achievement_id` and `earned_at`;
 * falls back to legacy display columns only to derive an `achievement_id` when needed.
 */
export function normalizeUserTrophyRow(row: Record<string, unknown>): NormalizedUserTrophyRow | null {
  let achievementId: string | undefined;
  if (typeof row.achievement_id === "string" && row.achievement_id.trim()) {
    achievementId = row.achievement_id.trim();
  } else if (typeof row.achievement_key === "string" && row.achievement_key.trim()) {
    achievementId = row.achievement_key.trim();
  } else {
    const legacyLabel =
      row.trophy_name ??
      row.name ??
      row.title ??
      row.trophy_title ??
      row.achievement_name ??
      row.trophy;
    if (typeof legacyLabel === "string" && legacyLabel.trim()) {
      achievementId = trophyIdForDbTrophyName(legacyLabel.trim());
    }
  }
  if (!achievementId) return null;

  const earned =
    typeof row.earned_at === "string"
      ? row.earned_at
      : typeof row.unlocked_at === "string"
        ? row.unlocked_at
        : typeof row.created_at === "string"
          ? row.created_at
          : undefined;

  return {
    achievement_id: achievementId,
    earned_at: earned,
    trophy_icon: typeof row.trophy_icon === "string" ? row.trophy_icon : undefined,
    description: typeof row.description === "string" ? row.description : undefined,
  };
}

/** Fetch all trophy rows for a user (`select *` so reads stay tolerant of extra columns). */
export async function fetchUserTrophiesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: NormalizedUserTrophyRow[]; error: { message: string; code?: string } | null }> {
  const { data, error } = await supabase.from("user_trophies").select("*").eq("user_id", userId);

  if (error) {
    return { rows: [], error: { message: error.message, code: error.code } };
  }

  const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const rows = arr
    .map((r) => normalizeUserTrophyRow(r))
    .filter((r): r is NormalizedUserTrophyRow => r != null)
    .sort((a, b) => {
      const ta = new Date(a.earned_at || 0).getTime();
      const tb = new Date(b.earned_at || 0).getTime();
      return tb - ta;
    });

  return { rows, error: null };
}

export type InsertUserTrophyFields = {
  userId: string;
  achievementId: string;
  description?: string;
  earnedAt: string;
};

export type InsertUserTrophyRowError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

function pickErr(e: unknown): InsertUserTrophyRowError {
  if (e == null) return { message: "null error from Supabase insert" };
  if (typeof e === "string") return { message: e };
  if (typeof e !== "object") return { message: String(e) };
  const o = e as Record<string, unknown>;
  const fromKeys =
    (typeof o.message === "string" && o.message.trim()) ||
    (typeof o.error_description === "string" && o.error_description.trim()) ||
    "";
  const serialized = (() => {
    try {
      const s = JSON.stringify(e, Object.getOwnPropertyNames(e));
      return s === "{}" ? "" : s;
    } catch {
      return "";
    }
  })();
  return {
    message: fromKeys || serialized || "(no message)",
    code: typeof o.code === "string" ? o.code : undefined,
    details: o.details != null ? String(o.details) : undefined,
    hint: typeof o.hint === "string" ? o.hint : undefined,
  };
}

/** One-line text for logs / error overlays (avoids Turbopack showing `{}`). */
export function formatInsertUserTrophyRowError(e: unknown): string {
  if (e == null) return "unknown";
  if (typeof e === "string") return e;
  const picked = pickErr(e);
  const parts = [picked.message, picked.code, picked.details, picked.hint].filter(
    (x) => x != null && String(x).length > 0,
  );
  return parts.join(" | ");
}

const PGRST_UNKNOWN_COL = /Could not find the '([^']+)' column/;

function buildInsertPayload(
  userId: string,
  achievementId: string,
  earnedAt: string,
  desc?: string,
): Record<string, unknown>[] {
  const base: Record<string, unknown> = {
    user_id: userId,
    achievement_id: achievementId,
    earned_at: earnedAt,
  };
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const push = (row: Record<string, unknown>) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  };
  push({ ...base });
  if (desc) {
    push({ ...base, description: desc });
  }
  return out;
}

/** Inserts one earned `user_trophies` row (`achievement_id`, `earned_at`). */
export async function insertUserTrophyRow(
  supabase: SupabaseClient,
  { userId, achievementId, description, earnedAt }: InsertUserTrophyFields,
): Promise<{ error: InsertUserTrophyRowError | null }> {
  const desc = description && description.trim().length > 0 ? description.trim() : undefined;

  const payloads = buildInsertPayload(userId, achievementId, earnedAt, desc);

  const unknownCols = new Set<string>();
  let last: InsertUserTrophyRowError | null = null;
  for (const payload of payloads) {
    if (Object.keys(payload).some((k) => unknownCols.has(k))) continue;

    const { error } = await supabase.from("user_trophies").insert(payload as never);
    if (!error) return { error: null };
    last = pickErr(error);
    if (error.code === "23505") return { error: last };
    if (error.code === "PGRST204" && typeof error.message === "string") {
      const m = PGRST_UNKNOWN_COL.exec(error.message);
      if (m?.[1]) unknownCols.add(m[1]);
    }
  }

  return {
    error:
      last ??
      ({
        message: "All user_trophies insert variants failed (no error object returned)",
        code: "UNKNOWN",
      } satisfies InsertUserTrophyRowError),
  };
}
