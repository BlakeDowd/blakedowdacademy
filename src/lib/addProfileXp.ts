/**
 * Increment `profiles.total_xp` and sync `current_level` (same rules as practice logging).
 * Dispatches `xpUpdated` on success so leaderboards can refresh.
 */

export const XP_AWARD_PER_LOGGED_ROUND = 500;

function levelFromTotalXp(newXP: number): number {
  if (!Number.isFinite(newXP) || newXP < 0) return 1;
  if (newXP < 500) return 1;
  if (newXP < 1500) return 2;
  if (newXP < 3000) return 3;
  return 4 + Math.floor((newXP - 3000) / 2000);
}

export async function addProfileXp(userId: string, delta: number): Promise<void> {
  if (!userId || !Number.isFinite(delta) || delta === 0) return;

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { data: currentProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("total_xp")
      .eq("id", userId)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("addProfileXp: error fetching profile XP:", fetchError);
    }

    const currentXP = currentProfile?.total_xp || 0;
    const newXP = currentXP + delta;
    const newLevel = levelFromTotalXp(newXP);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ total_xp: newXP, current_level: newLevel })
      .eq("id", userId);

    if (updateError) {
      console.error("addProfileXp: error updating profile:", updateError);
      return;
    }

    console.log(`addProfileXp: ${currentXP} + ${delta} = ${newXP} (level ${newLevel})`);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("xpUpdated"));
    }
  } catch (e) {
    console.error("addProfileXp:", e);
  }
}
