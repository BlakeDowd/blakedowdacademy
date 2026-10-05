import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

export type RequestUser = { id: string; email: string | null; accessToken: string | null };

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}

/** Browser auth lives in localStorage, so routes accept a Bearer token before falling back to cookies. */
export async function resolveRequestUser(request: Request): Promise<RequestUser | null> {
  const supabase = await createServerSupabase();
  const bearer = readBearerToken(request);
  if (bearer) {
    const { data, error } = await supabase.auth.getUser(bearer);
    if (!error && data.user?.id) return { id: data.user.id, email: data.user.email ?? null, accessToken: bearer };
  }
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user?.id) return { id: data.user.id, email: data.user.email ?? null, accessToken: bearer };
  return null;
}

/** Supabase client that runs queries as the caller, so RLS applies. */
export function supabaseAsUser(accessToken: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
