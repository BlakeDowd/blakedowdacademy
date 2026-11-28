import { sendNotification, setVapidDetails } from "web-push";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import type { NotifyPayload } from "@/lib/notifications";

type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function configureWebPush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:bdowd@pgamember.org.au";
  if (!publicKey || !privateKey) return false;
  setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/** Insert inbox row + send Web Push to all of the user's subscriptions. */
export async function deliverNotification(payload: NotifyPayload): Promise<{ ok: boolean; reason?: string }> {
  const db = createServiceRoleSupabase();
  if (!db) return { ok: false, reason: "missing_service_role" };

  const title = payload.title.trim().slice(0, 120);
  const body = payload.body.trim().slice(0, 280);
  const href = payload.href?.trim().slice(0, 240) || null;
  if (!payload.userId || !title || !body) return { ok: false, reason: "bad_payload" };

  const { error: insertErr } = await db.from("app_notifications").insert({
    user_id: payload.userId,
    kind: payload.kind,
    title,
    body,
    href,
  });
  if (insertErr) {
    console.warn("[notifications] insert", insertErr.message);
    return { ok: false, reason: insertErr.message };
  }

  if (!configureWebPush()) {
    return { ok: true, reason: "saved_no_vapid" };
  }

  const { data: subs, error: subErr } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", payload.userId);
  if (subErr) {
    console.warn("[notifications] subs", subErr.message);
    return { ok: true, reason: "saved_subs_error" };
  }

  const rows = (subs ?? []) as SubRow[];
  if (rows.length === 0) return { ok: true, reason: "saved_no_subscribers" };

  const payloadJson = JSON.stringify({
    title,
    body,
    href: href || "/",
    kind: payload.kind,
  });

  await Promise.all(
    rows.map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadJson,
          { TTL: 60 * 60 * 24 },
        );
      } catch (err: unknown) {
        const status = typeof err === "object" && err && "statusCode" in err ? Number((err as { statusCode: number }).statusCode) : 0;
        // Gone / expired subscription
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.warn("[notifications] push failed", status || err);
        }
      }
    }),
  );

  return { ok: true };
}
