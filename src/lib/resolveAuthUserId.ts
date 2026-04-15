import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves `auth.users.id` for browser Supabase calls that hit RLS (`auth.uid()`).
 * Hydrates the client session from storage first (so the access token is attached to requests),
 * refreshes once if needed, then validates with `getUser()`.
 */
export async function resolveAuthUserId(
  supabase: SupabaseClient,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<string | null> {
  const attempts = options?.attempts ?? 10;
  const base = options?.baseDelayMs ?? 150;

  for (let i = 0; i < attempts; i++) {
    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    const session = sessData?.session;
    if (sessErr) console.warn("[resolveAuthUserId] getSession:", sessErr.message);

    if (session?.access_token && session.user?.id) {
      const { data, error } = await supabase.auth.getUser();
      if (data?.user?.id) return data.user.id;
      if (error) console.warn("[resolveAuthUserId] getUser:", error.message);
    }

    if (i === 0) {
      const { data: refData, error: refErr } = await supabase.auth.refreshSession();
      if (refErr) console.warn("[resolveAuthUserId] refreshSession:", refErr.message);
      else if (refData.session?.user?.id) {
        const { data, error } = await supabase.auth.getUser();
        if (data?.user?.id) return data.user.id;
        if (error) console.warn("[resolveAuthUserId] getUser after refresh:", error.message);
      }
    }

    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, base * (i + 1)));
    }
  }
  return null;
}
