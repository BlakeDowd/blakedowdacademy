import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Writes `profiles.combine_profile` for `userId`. When a coach is saving a test for a player,
 * RLS blocks the direct update (and Supabase reports no error), so the fields are merged through
 * the coach-only `coach_merge_player_combine_profile` RPC instead.
 */
export async function saveCombineProfile(
  supabase: SupabaseClient,
  userId: string,
  next: Record<string, unknown>,
): Promise<{ message: string } | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user?.id && session.user.id !== userId) {
    const { error } = await supabase.rpc("coach_merge_player_combine_profile", {
      p_player: userId,
      p_patch: next,
    });
    return error ? { message: error.message } : null;
  }

  const { error } = await supabase.from("profiles").update({ combine_profile: next }).eq("id", userId);
  return error ? { message: error.message } : null;
}
