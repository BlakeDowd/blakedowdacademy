/**
 * Drill catalog for the UI — simple path:
 * 1) Read via the browser Supabase client (works on Vercel with only NEXT_PUBLIC_* if you applied
 *    supabase/migrations/20260401120000_drills_public_select.sql once).
 * 2) If that returns nothing, GET /api/drills/catalog (service role bypass — optional on Vercel).
 */

export async function fetchDrillsCatalogRows(): Promise<Record<string, unknown>[]> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase.from("drills").select("*");
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as Record<string, unknown>[];
    }
  } catch {
    /* offline / import failed */
  }

  try {
    const res = await fetch("/api/drills/catalog", { credentials: "same-origin" });
    if (!res.ok) return [];
    const json = (await res.json()) as { drills?: unknown; degraded?: boolean };
    if (json.degraded || !Array.isArray(json.drills)) return [];
    return json.drills as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function fetchDrillRowById(
  id: string
): Promise<Record<string, unknown> | null> {
  if (!id) return null;

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data, error } = await sb.from("drills").select("*").eq("id", id).maybeSingle();
    if (!error && data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch(
      `/api/drills/catalog?id=${encodeURIComponent(id)}`,
      { credentials: "same-origin" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      drill?: unknown;
      degraded?: boolean;
    };
    if (json.degraded || json.drill == null || typeof json.drill !== "object") {
      return null;
    }
    return json.drill as Record<string, unknown>;
  } catch {
    return null;
  }
}
