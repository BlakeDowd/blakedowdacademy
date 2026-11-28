import { NextResponse } from "next/server";
import { requireNotificationUser } from "@/lib/notificationAuth";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
};

export async function POST(req: Request) {
  const user = await requireNotificationUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const db = createServiceRoleSupabase();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { error } = await db.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: body.userAgent?.slice(0, 240) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    const missing = /push_subscriptions|schema cache|does not exist/i.test(error.message);
    return NextResponse.json(
      {
        error: missing
          ? "Run supabase/migrations/20261128200000_app_notifications.sql in Supabase first."
          : error.message,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await requireNotificationUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = body.endpoint?.trim();
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  const db = createServiceRoleSupabase();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { error } = await db
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
