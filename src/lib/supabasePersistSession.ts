import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Combines can take several minutes; the Supabase JWT may be near expiry when the student finishes.
 * Refreshing before a write reduces spurious RLS / auth failures on `practice_logs` / `practice` inserts.
 */
export async function refreshAuthSessionIfPossible(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase.auth.refreshSession();
  } catch {
    /* non-fatal */
  }
}
