"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { usePushOptIn } from "@/hooks/usePushOptIn";

/** Compact one-time popup for phone alerts — closes after Enable or Not now. */
export function PushOptInCard() {
  const { state, busy, error, enable, dismiss, dismissed } = usePushOptIn();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (dismissed || state === "loading" || state === "on" || state === "unsupported") {
      setOpen(false);
      return;
    }
    // Show for ready/denied/error; also for no_key so missing Vercel env is obvious.
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [dismissed, state]);

  if (!open) return null;

  const close = () => {
    dismiss();
    setOpen(false);
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-opt-in-title"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#014421] p-3 text-white shadow-lg">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
            <Bell className="h-4 w-4 text-[#FFC966]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 id="push-opt-in-title" className="text-sm font-bold leading-snug">
                Turn on alerts?
              </h2>
              <button
                type="button"
                onClick={close}
                className="-mr-1 -mt-0.5 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Not now"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-white/75">
              {state === "denied"
                ? "Blocked in browser settings — allow notifications, then try again."
                : state === "no_key"
                  ? "Phone alerts aren’t set up on the server yet."
                  : "Ping when a coaching video lands or you win a prize."}
            </p>
            {error && <p className="mt-1 text-[11px] font-medium text-[#FFC966]">{error}</p>}
            <div className="mt-2.5 flex items-center gap-2">
              {state !== "no_key" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      const result = await enable();
                      if (result === "granted") setOpen(false);
                    })();
                  }}
                  className="rounded-lg bg-[#FFA500] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy ? "…" : state === "denied" || state === "error" ? "Try again" : "Enable"}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={close}
                className="rounded-lg px-2 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
