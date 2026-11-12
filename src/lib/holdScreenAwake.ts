/**
 * Keeps the screen awake while a long upload/recording runs.
 * Re-requests the lock when the tab becomes visible again (phones release it when dimmed).
 */

type WakeLockSentinel = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

export async function holdScreenAwake(): Promise<() => void> {
  if (typeof navigator === "undefined") return () => undefined;

  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
  };
  if (!nav.wakeLock?.request) return () => undefined;

  let cancelled = false;
  let lock: WakeLockSentinel | null = null;

  const request = async () => {
    if (cancelled) return;
    try {
      await lock?.release().catch(() => undefined);
      lock = await nav.wakeLock!.request("screen");
      lock.addEventListener?.("release", () => {
        if (!cancelled && document.visibilityState === "visible") void request();
      });
    } catch {
      lock = null;
    }
  };

  await request();

  const onVisibility = () => {
    if (document.visibilityState === "visible") void request();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    cancelled = true;
    document.removeEventListener("visibilitychange", onVisibility);
    void lock?.release().catch(() => undefined);
    lock = null;
  };
}
