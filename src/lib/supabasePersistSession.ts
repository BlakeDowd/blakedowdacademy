import type { SupabaseClient } from "@supabase/supabase-js";

/** Only refresh when the access token is close to expiry to avoid racing auto-refresh (same refresh token → "Already Used"). */
const REFRESH_IF_EXPIRES_WITHIN_SEC = 90;

/**
 * Combines can take several minutes; the Supabase JWT may be near expiry when the student finishes.
 * Refreshes only when needed so we do not call `refreshSession()` while the client is already refreshing.
 */
export async function refreshAuthSessionIfPossible(supabase: SupabaseClient): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.expires_at) return;
    const nowSec = Math.floor(Date.now() / 1000);
    if (session.expires_at - nowSec > REFRESH_IF_EXPIRES_WITHIN_SEC) return;
    await supabase.auth.refreshSession();
  } catch {
    /* non-fatal */
  }
}
