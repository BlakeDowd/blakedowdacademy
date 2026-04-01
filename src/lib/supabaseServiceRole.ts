import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** Server-only: full access to Supabase. Returns null if env is incomplete. */
export function createServiceRoleSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}
