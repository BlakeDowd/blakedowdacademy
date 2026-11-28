/** Browser helpers for Web Push subscription. */

export type PushSubscribeResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "unsupported" | "no_key" | "error"; message?: string };

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (e) {
    console.warn("[push] SW register failed", e);
    return null;
  }
}

export async function subscribeToPush(): Promise<PushSubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported", message: "This browser doesn’t support phone alerts." };
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) return { ok: false, reason: "no_key", message: "Push isn’t configured (missing VAPID keys)." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason: permission === "denied" ? "denied" : "error",
      message:
        permission === "denied"
          ? "Notifications are blocked for this site."
          : "Permission wasn’t granted.",
    };
  }

  const reg = await registerPushWorker();
  if (!reg) return { ok: false, reason: "error", message: "Couldn’t register the notification service worker." };

  try {
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }));
    const json = sub.toJSON();
    const { notificationAuthHeaders } = await import("@/lib/notificationAuthClient");
    const headers = await notificationAuthHeaders();
    if (!("Authorization" in headers)) {
      return { ok: false, reason: "error", message: "Sign in again, then tap Enable." };
    }
    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers,
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      console.warn("[push] subscribe API", res.status, err.error);
      return {
        ok: false,
        reason: "error",
        message: err.error || (res.status === 401 ? "Sign in again, then tap Enable." : `Save failed (${res.status}).`),
      };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[push] subscribe failed", e);
    const raw = e instanceof Error ? e.message : "Subscribe failed.";
    const message = /push service not available/i.test(raw)
      ? "This browser can’t register phone alerts. Use Chrome or Edge (not an in-app browser), then tap again."
      : raw;
    return { ok: false, reason: "error", message };
  }
}
