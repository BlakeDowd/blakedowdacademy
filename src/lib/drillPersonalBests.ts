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
