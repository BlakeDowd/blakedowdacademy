"use client";

import { AlertTriangle, X } from "lucide-react";

/** Set `NEXT_PUBLIC_LIVE_ENTRY_ENABLED=true` in `.env.local` to skip the gate for everyone. */
export const LIVE_ENTRY_ENABLED =
  process.env.NEXT_PUBLIC_LIVE_ENTRY_ENABLED === "true";

type LiveEntryNotReadyModalProps = {
  open: boolean;
  onClose: () => void;
  /** Opens Live Entry anyway (for you while testing / building). */
  onOpenForTesting?: () => void;
};

export function LiveEntryNotReadyModal({
  open,
  onClose,
  onOpenForTesting,
}: LiveEntryNotReadyModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-labelledby="live-entry-not-ready-title"
        aria-describedby="live-entry-not-ready-desc"
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden />
          </div>
          <h2
            id="live-entry-not-ready-title"
            className="text-lg font-bold text-gray-900"
          >
            Live Entry isn&apos;t ready yet
          </h2>
          <p id="live-entry-not-ready-desc" className="mt-3 text-sm leading-relaxed text-gray-600">
            We&apos;re still testing Live Entry. Students should{" "}
            <strong className="font-semibold text-gray-800">not use this for real rounds</strong>{" "}
            yet — use <strong className="font-semibold text-gray-800">Log Round</strong> after
            playing instead.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-[#014421] py-3 font-semibold text-white hover:bg-[#014421]/90"
            >
              Got it
            </button>
            {onOpenForTesting && (
              <button
                type="button"
                onClick={onOpenForTesting}
                className="w-full rounded-xl border-2 border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Open for testing anyway
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shown at top of Live Entry while the feature is gated off for students. */
export function LiveEntryTestingBanner() {
  if (LIVE_ENTRY_ENABLED) return null;

  return (
    <div
      role="status"
      className="rounded-xl border-2 border-amber-400/80 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p>
          <span className="font-semibold">Testing only</span> — Live Entry is not released to
          students yet. Use this screen to build and test; real rounds should still use{" "}
          <strong>Log Round</strong> for now.
        </p>
      </div>
    </div>
  );
}
