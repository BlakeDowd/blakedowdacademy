/** In-app + Web Push notifications (coaching videos, prize winners, etc.). */

export type NotificationKind = "coaching" | "prize" | "challenge" | "system";

export type AppNotification = {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotifyPayload = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string | null;
};

export function vapidPublicKey(): string | null {
  const key =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || process.env.VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

/** Client helper: ask the notify API to create an inbox row + push. */
export async function requestNotify(payload: NotifyPayload): Promise<void> {
  try {
    const { notificationAuthHeaders } = await import("@/lib/notificationAuthClient");
    const headers = await notificationAuthHeaders();
    if (!("Authorization" in (headers as Record<string, string>))) {
      console.warn("[notifications] notify skipped — no auth token");
      return;
    }
    const res = await fetch("/api/notifications/notify", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      console.warn("[notifications] notify failed", res.status, err.error);
    }
  } catch (e) {
    console.warn("[notifications] notify failed", e);
  }
}

export function coachingNotifyFromPost(input: {
  studentId: string;
  authorId: string;
  authorIsCoach: boolean;
  hasVideo: boolean;
  title?: string | null;
  body?: string | null;
}): NotifyPayload | null {
  if (!input.authorIsCoach) return null;
  if (!input.studentId || input.studentId === input.authorId) return null;
  const hasVideo = input.hasVideo;
  const snippet = (input.body || "").trim().slice(0, 120);
  return {
    userId: input.studentId,
    kind: "coaching",
    title: hasVideo ? "New coaching video" : "New message from your coach",
    body: snippet || (hasVideo ? "Your coach sent you a video." : "Open Coaching to read it."),
    href: "/profile?tab=coaching",
  };
}
