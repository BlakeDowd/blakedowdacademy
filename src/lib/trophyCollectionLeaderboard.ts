import type { SupabaseClient } from "@supabase/supabase-js";

/** Repo migration filenames (full paths are long for UI—use these in copy + `break-all` blocks). */
export const TROPHY_LEADERBOARD_MIGRATION = "20260422130000_trophy_collection_leaderboard_rpc.sql";
export const TROPHY_ACHIEVEMENTS_BACKFILL_MIGRATION = "20260423140000_backfill_user_achievements_from_user_trophies.sql";
/** Replaces leaderboard RPCs to rank by max(user_trophies count, user_achievements count) so trophies alone count. */
export const TROPHY_LEADERBOARD_MERGE_MIGRATION = "20260424120000_leaderboard_merge_user_trophies.sql";
/** Distinct achievement/trophy keys so duplicate DB rows do not inflate leaderboard scores. */
export const TROPHY_LEADERBOARD_DISTINCT_MIGRATION = "20260425200000_leaderboard_distinct_achievement_counts.sql";

/** True when PostgREST cannot find the leaderboard RPC (migration not applied or schema cache stale). */
export function isMissingLeaderboardRpcError(message: string): boolean {
  const e = message.toLowerCase();
  return (
    e.includes("could not find the function") ||
    e.includes("schema cache") ||
    e.includes("trophy_collection_leaderboard") ||
    e.includes("trophy_collection_rank_for_user") ||
    e.includes("backfill_my_user_achievements_from_trophies")
  );
}

/** User-facing copy so raw PGRST errors are not shown in the Trophy Case. */
export function formatCommunityLeaderboardErrorMessage(message: string): string {
  if (isMissingLeaderboardRpcError(message)) {
    return `Community rankings need the latest database functions. In Supabase SQL Editor, run these migrations in order (paste each full file from your repo):

1) supabase/migrations/${TROPHY_LEADERBOARD_MIGRATION}
2) supabase/migrations/${TROPHY_ACHIEVEMENTS_BACKFILL_MIGRATION}
3) supabase/migrations/${TROPHY_LEADERBOARD_MERGE_MIGRATION} (ranking uses trophies + achievements)
4) supabase/migrations/${TROPHY_LEADERBOARD_DISTINCT_MIGRATION} (counts distinct trophy keys — avoids inflated scores)

Then: Project Settings → API → Reload schema → refresh this page.`;
  }
  return message;
}

export type TrophyCollectionLeaderboardRow = {
  boardRank: number;
  userId: string;
  displayName: string;
  totalCollections: number;
};

export type TrophyCollectionViewerRank = {
  rank: number | null;
  totalDbEvents: number;
};

type RpcLbRow = {
  board_rank?: number | string | null;
  user_id?: string | null;
  display_name?: string | null;
  total_collections?: number | string | null;
};

type RpcRankRow = {
  rank_out?: number | string | null;
  total_out?: number | string | null;
};

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Server-side sync from `user_trophies` → `user_achievements` for the signed-in user (needs DB migration). */
export async function runBackfillMyAchievementsFromTrophies(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("backfill_my_user_achievements_from_trophies");
  if (error) {
    console.warn("[backfill_my_user_achievements_from_trophies]", error.message);
    return 0;
  }
  if (typeof data === "number" && Number.isFinite(data)) return data;
  if (typeof data === "string" && data.trim() !== "") {
    const n = Number(data);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Top players by merged distinct trophy id / achievement key counts (see DB RPC; not raw row totals). */
export async function fetchTrophyCollectionLeaderboard(
  supabase: SupabaseClient,
  topN = 40,
): Promise<TrophyCollectionLeaderboardRow[]> {
  const { data, error } = await supabase.rpc("trophy_collection_leaderboard", {
    p_top_n: topN,
  });
  if (error) {
    console.warn("[trophy_collection_leaderboard] rpc:", error.message);
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? (data as RpcLbRow[]) : [];
  return rows
    .map((r) => ({
      boardRank: num(r.board_rank, 0),
      userId: String(r.user_id ?? ""),
      displayName:
        typeof r.display_name === "string" && r.display_name.trim().length > 0
          ? r.display_name.trim()
          : "Academy Member",
      totalCollections: num(r.total_collections, 0),
    }))
    .filter((r) => r.userId.length > 0 && r.boardRank > 0);
}

/** Signed-in user only (`p_user_id` must match JWT); returns empty if unauthorized. */
export async function fetchTrophyCollectionRankForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<TrophyCollectionViewerRank> {
  const { data, error } = await supabase.rpc("trophy_collection_rank_for_user", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("[trophy_collection_rank_for_user] rpc:", error.message);
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? (data as RpcRankRow[]) : [];
  const row = rows[0];
  if (!row) return { rank: null, totalDbEvents: 0 };
  const rank = numOrNull(row.rank_out);
  const totalDbEvents = num(row.total_out, 0);
  return { rank, totalDbEvents };
}
