import { createClient as createBrowserSupabase } from "@/lib/supabase/client";

/** @supabase/ssr stores the session as `academy-auth=base64-<json>` (sometimes chunked). */
function readAccessTokenFromDocumentCookie(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const parts = document.cookie.split("; ").filter((c) => c.startsWith("academy-auth"));
    if (parts.length === 0) return null;

    let raw = parts.find((c) => c.startsWith("academy-auth="))?.slice("academy-auth=".length);
    if (!raw) {
      const chunks = parts
        .map((c) => {
          const eq = c.indexOf("=");
          const name = c.slice(0, eq);
          const m = /^academy-auth\.(\d+)$/.exec(name);
          if (!m) return null;
          return { i: Number(m[1]), v: c.slice(eq + 1) };
        })
        .filter((x): x is { i: number; v: string } => !!x)
        .sort((a, b) => a.i - b.i);
      raw = chunks.map((c) => c.v).join("");
    }
    if (!raw) return null;

    const decoded = decodeURIComponent(raw);
    const json = decoded.startsWith("base64-")
      ? atob(decoded.slice(7).replace(/-/g, "+").replace(/_/g, "/"))
      : decoded;
    const parsed = JSON.parse(json) as { access_token?: string };
    return parsed.access_token?.trim() || null;
  } catch {
    return null;
  }
}

/** Browser: Authorization header from the academy-auth session (cookie). */
export async function notificationAuthHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  try {
    const supabase = createBrowserSupabase();
    let { data } = await supabase.auth.getSession();
    let token = data.session?.access_token ?? null;
    if (!token) {
      await supabase.auth.getUser().catch(() => null);
      ({ data } = await supabase.auth.getSession());
      token = data.session?.access_token ?? null;
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      return headers;
    }
  } catch {
    /* fall through to cookie parse */
  }

  const fromCookie = readAccessTokenFromDocumentCookie();
  if (fromCookie) headers.Authorization = `Bearer ${fromCookie}`;
  return headers;
}
