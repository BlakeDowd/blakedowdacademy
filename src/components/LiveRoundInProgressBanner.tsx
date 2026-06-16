"use client";

import { AlertTriangle } from "lucide-react";
import type { LiveRoundDraft } from "@/lib/liveRoundDraft";
import { liveRoundInProgressSummary } from "@/lib/liveRoundDraft";

type LiveRoundInProgressBannerProps = {
  draft: LiveRoundDraft;
  /** Where the banner is shown — copy differs slightly. */
  variant: "live" | "post-round" | "home";
  onContinueLive?: () => void;
};

export function LiveRoundInProgressBanner({
  draft,
  variant,
  onContinueLive,
}: LiveRoundInProgressBannerProps) {
  const summary = liveRoundInProgressSummary(draft);

  if (variant === "live") {
    return (
      <div
        role="status"
        className="rounded-xl border-2 border-amber-400/80 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="font-semibold">Live round in progress</p>
            <p className="mt-1 text-amber-900/90">
              {summary}. Keep logging holes here only —{" "}
              <strong>do not enter this round in Post-round entry</strong> until you tap{" "}
              <strong>Finish round</strong>, or you may save duplicate scores.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "post-round") {
    return (
      <div
        role="alert"
        className="mb-4 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
      >
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="flex-1">
            <p className="font-bold text-amber-950">Unfinished Live Entry</p>
            <p className="mt-1">
              You have a round still open: <strong>{summary}</strong>.
            </p>
            <p className="mt-2">
              <strong>Do not enter scores on this page</strong> for that round — you&apos;ll
              duplicate your data. Continue Live Entry, log remaining holes, then tap{" "}
              <strong>Finish round</strong> to review and save once.
            </p>
            {onContinueLive && (
              <button
                type="button"
                onClick={onContinueLive}
                className="mt-3 w-full rounded-lg bg-[#014421] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#014421]/90"
              >
                Continue Live Entry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="mb-3 rounded-xl border border-amber-400/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-950"
    >
      <div className="flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p>
          <span className="font-semibold">Live round not finished:</span> {summary}. Use{" "}
          <strong>Live Entry</strong> to keep logging — don&apos;t use Log Round for the same
          round until you finish live entry.
        </p>
      </div>
    </div>
  );
}
