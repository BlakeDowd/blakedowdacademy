/**
 * Load drills via server API (service role) so RLS cannot hide catalog rows.
 * Falls back to null when the API is not configured or fails — callers should use Supabase client next.
 */

export async function fetchDrillsCatalogRows(): Promise<Record<string, unknown>[] | null> {
  try {
    const res = await fetch("/api/drills/catalog", { credentials: "same-origin" });
    if (!res.ok) return null;
    const json = (await res.json()) as { drills?: unknown; degraded?: boolean };
    if (json.degraded || json.drills === null || json.drills === undefined) return null;
    if (!Array.isArray(json.drills)) return null;
    return json.drills as Record<string, unknown>[];
  } catch {
    return null;
  }
}

export async function fetchDrillRowById(
  id: string
): Promise<Record<string, unknown> | null> {
  if (!id) return null;
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
