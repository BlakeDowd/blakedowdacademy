"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, PersonStanding, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { CombineTestPicker } from "@/components/combine/CombineTestPicker";
import { combineHrefForPlayer } from "@/hooks/useCombineUser";
import type { CombineCategoryId } from "@/lib/combineTestsCatalog";

function TestPlayerSheet({
  playerId,
  playerName,
  onClose,
}: {
  playerId: string;
  playerName: string;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<CombineCategoryId>("Putting");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-player-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-gray-50 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="test-player-title" className="truncate text-lg font-bold text-stone-900">
              Test {playerName}
            </h2>
            <p className="text-xs text-stone-500">Pick a test. Their score saves to their profile.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-stone-500 hover:bg-stone-200" aria-label="Close">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <Link
          href={combineHrefForPlayer("/practice/mobility-screen", playerId)}
          className="mb-4 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100 hover:bg-gray-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#014421]/10 text-[#014421]">
            <PersonStanding className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-sm font-bold text-gray-900">Mobility Screen</span>
            <span className="block text-xs text-gray-500">12 body tests. You mark each one off</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        </Link>
        <CombineTestPicker
          category={category}
          onCategoryChange={setCategory}
          hrefFor={(href) => combineHrefForPlayer(href, playerId)}
          historyFor={{ id: playerId, name: playerName }}
        />
      </div>
    </div>,
    document.body,
  );
}

/** Coach-only: run a combine with a player in a lesson and save the score to their profile. */
export function TestPlayerButton({
  playerId,
  playerName,
  className = "",
}: {
  playerId: string;
  playerName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  if (!isCoachEmail(user?.email) && user?.role !== "coach") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#FFA500] px-4 py-2 text-sm font-bold text-[#3d2600] shadow-sm transition hover:brightness-95 ${className}`}
      >
        <ClipboardCheck className="h-4 w-4" aria-hidden />
        Test {playerName.split(" ")[0] || "player"}
      </button>
      {open && <TestPlayerSheet playerId={playerId} playerName={playerName} onClose={() => setOpen(false)} />}
    </>
  );
}
