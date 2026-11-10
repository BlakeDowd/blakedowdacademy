"use client";

import { useEffect, useState } from "react";

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

/**
 * Keep the screen awake while `enabled` (Screen Wake Lock API).
 * Unsupported browsers / denied permission simply no-op.
 */
export function useWakeLock(enabled: boolean): { active: boolean; supported: boolean } {
  const [active, setActive] = useState(false);
  const supported =
    typeof navigator !== "undefined" &&
    "wakeLock" in navigator &&
    typeof (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } })
      .wakeLock?.request === "function";

  useEffect(() => {
    if (!enabled || !supported) {
      setActive(false);
      return;
    }

    let cancelled = false;
    let lock: WakeLockSentinel | null = null;

    const request = async () => {
      try {
        const wl = (
          navigator as Navigator & {
            wakeLock: { request: (t: "screen") => Promise<WakeLockSentinel> };
          }
        ).wakeLock;
        lock = await wl.request("screen");
        if (cancelled) {
          await lock.release().catch(() => undefined);
          lock = null;
          return;
        }
        setActive(true);
        lock.addEventListener("release", () => {
          if (!cancelled) setActive(false);
        });
      } catch {
        if (!cancelled) setActive(false);
      }
    };

    void request();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && enabled) void request();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => undefined);
      setActive(false);
    };
  }, [enabled, supported]);

  return { active, supported };
}
