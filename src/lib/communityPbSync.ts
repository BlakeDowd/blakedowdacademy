import { createClient } from "@/lib/supabase/client";
import {
  COMBINE_LEADERBOARD_OPTIONS,
  collectCombineAttempts,
  isLeaderboardDrivenCombineId,
} from "@/lib/academyCombinesLeaderboard";

const SYNC_EVERY_MS = 30 * 60 * 1000;
const PB_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const combineLabel = (id: unknown) =>
  COMBINE_LEADERBOARD_OPTIONS.find((o) => o.id === id)?.label ?? "Combine";

/**
 * Shares the player's new combine personal bests to the community feed. A PB is the latest attempt at a
 * combine beating every earlier one, done in the last two weeks. Runs at most every 30 minutes.
 */
export async function syncMyCombinePbs(userId: string): Promise<void> {
  if (typeof window === "undefined" || !userId) return;
  const key = `communityPbSync:${userId}`;
  const last = Number(localStorage.getItem(key) || 0);
  if (Date.now() - last < SYNC_EVERY_MS) return;
  localStorage.setItem(key, String(Date.now()));

  const supabase = createClient();
  const [practice, logs] = await Promise.all([
    supabase.from("practice").select("*").eq("user_id", userId),
    supabase.from("practice_logs").select("*").eq("user_id", userId),
  ]);
  if (practice.error && logs.error) return;

  const now = Date.now();
  for (const option of COMBINE_LEADERBOARD_OPTIONS) {
    if (isLeaderboardDrivenCombineId(option.id)) continue;
    const attempts = collectCombineAttempts(option.id, practice.data ?? [], logs.data ?? [], "allTime")
      .filter((a) => a.dateMs > 0)
      .sort((a, b) => a.dateMs - b.dateMs);
    if (attempts.length < 2) continue;
    const latest = attempts[attempts.length - 1];
    if (now - latest.dateMs > PB_WINDOW_MS) continue;
    const previousBest = Math.max(...attempts.slice(0, -1).map((a) => a.sortValue));
    if (!(latest.sortValue > previousBest)) continue;

    const display = latest.display.replace(/[^-+0-9A-Za-z .,/()%]/g, "").slice(0, 30).trim();
    if (!display) continue;
    const { error } = await supabase.rpc("community_share_combine_pb", {
      p_combine: option.id,
      p_display: display,
      p_at: new Date(latest.dateMs).toISOString(),
    });
    if (error) {
      console.warn("[community] combine PB:", error.message);
      return;
    }
  }
}
