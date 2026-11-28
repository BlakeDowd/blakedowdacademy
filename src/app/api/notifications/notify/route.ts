import { NextResponse } from "next/server";
import { isCoachEmail } from "@/lib/coachEmails";
import { deliverNotification } from "@/lib/notificationsServer";
import type { NotificationKind } from "@/lib/notifications";
import { requireNotificationUser } from "@/lib/notificationAuth";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

type Body = {
  userId?: string;
  kind?: NotificationKind;
  title?: string;
  body?: string;
  href?: string | null;
};

export async function POST(req: Request) {
  const user = await requireNotificationUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const payload = (await req.json().catch(() => ({}))) as Body;
  const targetId = payload.userId?.trim();
  if (!targetId || !payload.title?.trim() || !payload.body?.trim() || !payload.kind) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let coach = isCoachEmail(user.email);
  if (!coach) {
    const db = createServiceRoleSupabase();
    const { data: profile } = db
      ? await db.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : { data: null };
    coach = (profile?.role ?? "").toLowerCase() === "coach";
  }
  if (!coach && user.id !== targetId) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const result = await deliverNotification({
    userId: targetId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body,
    href: payload.href,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason || "Failed" }, { status: 500 });
  return NextResponse.json({ ok: true, reason: result.reason });
}
