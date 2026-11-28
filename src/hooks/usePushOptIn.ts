"use client";

import { useCallback, useEffect, useState } from "react";
import { pushSupported, subscribeToPush } from "@/lib/pushClient";

export type PushOptInState = "loading" | "ready" | "on" | "denied" | "no_key" | "unsupported" | "error";

const DISMISS_KEY = "push-opt-in-dismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Tracks whether this device is fully subscribed for Web Push. */
export function usePushOptIn() {
  const [state, setState] = useState<PushOptInState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    setDismissed(readDismissed());
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()) {
      setState("no_key");
      return;
    }
    if (!pushSupported()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      await navigator.serviceWorker.ready.catch(() => null);
      const reg =
        (await navigator.serviceWorker.getRegistration("/sw.js")) ??
        (await navigator.serviceWorker.getRegistration());
      const sub = await reg?.pushManager.getSubscription();
      // Only treat as "on" after a successful server save (local flag).
      const saved = typeof window !== "undefined" && window.localStorage.getItem("push-opt-in") === "1";
      if (Notification.permission === "granted" && sub && saved) {
        setState("on");
        setError(null);
      } else {
        setState("ready");
      }
    } catch {
      setState("ready");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await subscribeToPush();
    setBusy(false);
    if (result.ok) {
      try {
        window.localStorage.setItem("push-opt-in", "1");
        window.localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* ignore */
      }
      setDismissed(false);
      setState("on");
      setError(null);
      return "granted" as const;
    }
    if (result.reason === "denied") setState("denied");
    else if (result.reason === "no_key") setState("no_key");
    else setState("error");
    setError(result.message ?? "Couldn’t enable alerts.");
    return result.reason;
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  return {
    state,
    busy,
    error,
    enable,
    dismiss,
    dismissed,
    refresh,
    needsOptIn: !dismissed && (state === "ready" || state === "no_key" || state === "error"),
  };
}
