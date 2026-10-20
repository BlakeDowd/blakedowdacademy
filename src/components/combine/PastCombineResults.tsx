"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { CombineReportSheet, type CombineReportId } from "@/components/coaching/CombineReportSheet";
import { useAuth } from "@/contexts/AuthContext";
import { useCoachTestingPlayerId, useCombineUser } from "@/hooks/useCombineUser";

/** Opens saved sessions for this test. Does not start a new one. */
export function PastCombineResultsButton({
  reportId,
  label,
  className = "",
  playerId,
  playerName,
}: {
  reportId: CombineReportId;
  label: string;
  className?: string;
  /** When a coach has picked someone to test, history is that player's, not the coach's. */
  playerId?: string;
  playerName?: string;
}) {
  const { user: signedIn } = useAuth();
  const account = useCombineUser();
  const testingPlayer = useCoachTestingPlayerId();
  const [open, setOpen] = useState(false);
  const id = playerId || account?.id;
  if (!id) return null;

  const name = playerName?.trim() || (testingPlayer ? "Saved results" : signedIn?.fullName?.trim() || "You");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#014421] ring-1 ring-[#014421]/20 hover:bg-[#014421]/5 ${className}`}
      >
        <History className="h-3.5 w-3.5" aria-hidden />
        Past results
      </button>
      {open && (
        <CombineReportSheet
          playerId={id}
          playerName={name}
          testId={reportId}
          label={label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
