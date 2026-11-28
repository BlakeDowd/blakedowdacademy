import { NextResponse } from "next/server";
import { requireNotificationUser } from "@/lib/notificationAuth";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export async function GET(req: Request) {
  const user = await requireNotificationUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const db = createServiceRoleSupabase();
  if (!db) return NextResponse.json({ notifications: [], unread: 0 });

  const { data, error } = await db
    .from("app_notifications")
    .select("id, user_id, kind, title, body, href, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    const missing = /app_notifications|schema cache|does not exist/i.test(error.message);
    if (missing) return NextResponse.json({ notifications: [], unread: 0, setupRequired: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    kind: r.kind as string,
    title: r.title as string,
    body: r.body as string,
    href: (r.href as string | null) ?? null,
    readAt: (r.read_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
  const unread = rows.filter((r) => !r.readAt).length;
  return NextResponse.json({ notifications: rows, unread });
}

export async function PATCH(req: Request) {
  const user = await requireNotificationUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean };
  const now = new Date().toISOString();
  const db = createServiceRoleSupabase();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  if (body.all) {
    const { error } = await db
      .from("app_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await db
    .from("app_notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
