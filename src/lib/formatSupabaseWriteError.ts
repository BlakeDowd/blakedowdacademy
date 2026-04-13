/**
 * Turn a Supabase PostgREST / auth error into a short string for UI / logs.
 * Helps diagnose RLS, missing columns, and constraint failures in production.
 */
export function formatSupabaseWriteError(err: unknown): string {
  if (err == null) return "Unknown error (null).";
  if (typeof err === "string") return err.trim() || "Unknown error (empty string).";
  if (typeof err === "number" || typeof err === "boolean") return String(err);
  if (err instanceof Error) {
    const msg = (err.message || "").trim();
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause != null) {
      const c = formatSupabaseWriteError(cause);
      return msg ? `${msg} — ${c}` : c;
    }
    return msg || "Unknown error (Error with no message).";
  }
  if (typeof err === "object") {
    const o = err as {
      message?: string;
      error_description?: string;
      details?: string;
      hint?: string;
      code?: string;
      status?: number;
      statusCode?: number;
    };
    const parts = [
      o.message,
      o.error_description,
      o.details,
      o.hint,
      o.status != null ? `HTTP ${o.status}` : null,
      o.statusCode != null ? `HTTP ${o.statusCode}` : null,
    ].filter(Boolean);
    let base = parts.length > 0 ? parts.join(" — ") : "";
    if (!base) {
      try {
        base = JSON.stringify(err, Object.getOwnPropertyNames(err));
      } catch {
        base = "Unknown database error (could not serialize details).";
      }
    }
    if (!base || base === "{}") base = "Unknown database error (empty object).";
    return o.code ? `${base} (code: ${o.code})` : base;
  }
  return String(err);
}
