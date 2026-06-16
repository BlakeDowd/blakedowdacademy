"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";

export type DeletableRound = {
  id?: string;
  created_at?: string;
  date: string;
  course?: string;
};

const DELETE_CONFIRM_WORD = "delete";

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type DeleteRoundButtonProps = {
  round: DeletableRound;
  /** compact = icon only; default = icon + Delete label */
  variant?: "default" | "compact";
  className?: string;
  onDeleted?: () => void;
};

export function DeleteRoundButton({
  round,
  variant = "default",
  className = "",
  onDeleted,
}: DeleteRoundButtonProps) {
  const { user } = useAuth();
  const { refreshRounds } = useStats();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canTargetRound = Boolean(round.id || round.created_at);
  const deleteConfirmed = confirmText.trim().toLowerCase() === DELETE_CONFIRM_WORD;

  const closeModal = () => {
    setOpen(false);
    setConfirmText("");
    setError(null);
  };

  const handleDelete = async () => {
    if (!user?.id || !deleteConfirmed) return;

    setIsDeleting(true);
    setError(null);

    try {
      const supabase = createClient();
      let query = supabase.from("rounds").delete().eq("user_id", user.id);

      if (round.id) {
        query = query.eq("id", round.id);
      } else if (round.created_at) {
        query = query.eq("created_at", round.created_at);
      } else {
        setError("This round cannot be deleted because it has no saved reference.");
        return;
      }

      const { error: deleteError } = await query;

      if (deleteError) {
        setError(deleteError.message || "Failed to delete round.");
        return;
      }

      closeModal();
      refreshRounds();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("roundsUpdated"));
        window.dispatchEvent(new Event("academyLeaderboardRefresh"));
      }
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete round.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canTargetRound) {
    return (
      <button
        type="button"
        disabled
        className={
          variant === "compact"
            ? `flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg border border-gray-200 text-gray-300 ${className}`
            : `inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-300 ${className}`
        }
        title="Refresh the page to enable delete for this round"
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {variant === "default" ? <span>Delete</span> : null}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirmText("");
          setOpen(true);
        }}
        className={
          variant === "compact"
            ? `flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 ${className}`
            : `inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 ${className}`
        }
        aria-label={`Delete round at ${round.course || "Unknown Course"}`}
        title="Delete round"
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {variant === "default" ? <span>Delete</span> : null}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Delete Round</h3>
            <p className="mb-1 text-sm text-gray-600">
              Remove your round at{" "}
              <span className="font-medium text-gray-900">{round.course || "Unknown Course"}</span>
              {round.date ? <> on {formatDate(round.date)}</> : null}?
            </p>
            <p className="mb-4 text-sm text-gray-600">
              This cannot be undone. Type{" "}
              <span className="font-semibold text-gray-900">{DELETE_CONFIRM_WORD}</span> to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRM_WORD}
              autoComplete="off"
              autoFocus
              className="w-full rounded-lg border-2 border-gray-200 px-3 py-2.5 text-gray-900 focus:border-[#014421] focus:outline-none"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={isDeleting}
                className="rounded-lg bg-gray-100 py-2.5 px-4 font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={!deleteConfirmed || isDeleting}
                className="rounded-lg bg-red-600 py-2.5 px-4 font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Round"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
