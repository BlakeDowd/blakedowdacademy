import type { SupabaseClient } from "@supabase/supabase-js";

import type { TrophyContributionLine } from "@/lib/trophyMultiplierContributions";

/** Row shape for `public.user_achievements` (Supabase column `achievement_key`). */
export type UserAchievementRow = {
  achievement_key: string;
  created_at: string;
};

/** Count how many times each `achievement_key` appears for the user. */
export function achievementCountsFromRows(rows: UserAchievementRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = String(r.achievement_key || "").trim();
    if (!key) continue;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

export async function fetchUserAchievementRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserAchievementRow[]> {
  const { data, error } = await supabase
    .from("user_achievements")
    .select("achievement_key, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[user_achievements] fetch:", error.message);
    return [];
  }

  type RawUserAchievement = { achievement_key?: string | null; created_at?: string | null };
  const rows = Array.isArray(data) ? (data as RawUserAchievement[]) : [];
  return rows
    .map((r) => ({
      achievement_key: String(r.achievement_key ?? ""),
      created_at: String(r.created_at ?? ""),
    }))
    .filter((r) => r.achievement_key.length > 0);
}

function formatAchievementDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Modal lines from `user_achievements` rows for a given trophy / `achievement_key`. */
export function achievementContributionsForKey(
  rows: readonly UserAchievementRow[],
  achievementKey: string,
  max = 50,
): TrophyContributionLine[] {
  return rows
    .filter((r) => r.achievement_key === achievementKey)
    .slice(0, max)
    .map((r) => ({
      label: "Achievement (user_achievements)",
      dateLabel: formatAchievementDate(r.created_at),
    }));
}

/** If a trophy is earned but has no `user_achievements` rows yet, insert one (backfill). */
export async function ensureAchievementsForEarnedTrophies(
  supabase: SupabaseClient,
  userId: string,
  earned: readonly { id?: string | null; trophy_name: string; unlocked_at?: string | null }[],
): Promise<void> {
  const existing = await fetchUserAchievementRows(supabase, userId);
  const counts = achievementCountsFromRows(existing);
  for (const t of earned) {
    const key = String(t.id ?? "").trim();
    if (!key) continue;
    if ((counts.get(key) ?? 0) > 0) continue;
    await insertUserAchievement(supabase, userId, key, t.unlocked_at ?? undefined);
    counts.set(key, 1);
  }
}

export async function insertUserAchievement(
  supabase: SupabaseClient,
  userId: string,
  achievementKey: string,
  createdAt?: string,
): Promise<boolean> {
  const payload: { user_id: string; achievement_key: string; created_at?: string } = {
    user_id: userId,
    achievement_key: achievementKey,
  };
  if (createdAt) payload.created_at = createdAt;
  const { error } = await supabase.from("user_achievements").insert(payload);
  if (error) {
    console.warn("[user_achievements] insert:", error.message);
    return false;
  }
  return true;
}
