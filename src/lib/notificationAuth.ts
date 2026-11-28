import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

function readBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/** Resolve the signed-in user for notification APIs (cookie or Bearer — app auth is cookie-based). */
export async function requireNotificationUser(request: Request): Promise<User | null> {
  const bearer = readBearer(request);
  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (url && anon) {
      const { data } = await createClient(url, anon).auth.getUser(bearer);
      if (data.user) return data.user;
    }
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser(bearer);
    if (data.user) return data.user;
  }

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
