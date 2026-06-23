"use client";

import { Users, X } from "lucide-react";

type ShareRoundCommunityModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called with true = share on community, false = keep private */
  onConfirm: (shareOnCommunity: boolean) => void;
  /** Shown under the title — e.g. "Save round" vs "Continue to log round" */
  context?: "save" | "live-finish";
};

export function ShareRoundCommunityModal({
  open,
  onClose,
  onConfirm,
  context = "save",
}: ShareRoundCommunityModalProps) {
  if (!open) return null;

  const subtitle =
    context === "live-finish"
      ? "Your round will be saved. Choose whether others can see it on the community leaderboard."
      : "Your coach can always see your stats. Choose whether this round appears on the community leaderboard.";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-labelledby="share-round-community-title"
        aria-describedby="share-round-community-desc"
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
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#014421]/10">
            <Users className="h-7 w-7 text-[#014421]" aria-hidden />
          </div>
          <h2
            id="share-round-community-title"
            className="text-lg font-bold text-gray-900"
          >
            Share round on community?
          </h2>
          <p id="share-round-community-desc" className="mt-2 text-sm leading-relaxed text-gray-600">
            {subtitle}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="w-full rounded-xl bg-[#FFA500] py-3.5 text-sm font-bold text-black shadow-md transition-colors hover:bg-amber-400"
          >
            Yes, share on community
          </button>
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="w-full rounded-xl border-2 border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            No, keep private
          </button>
        </div>
      </div>
    </div>
  );
}
