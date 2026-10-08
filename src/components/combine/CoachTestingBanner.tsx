"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCoachTestingPlayerId } from "@/hooks/useCombineUser";

/** Shown while a coach runs a combine for a player, so it's clear whose profile the result saves to. */
export function CoachTestingBanner() {
  const playerId = useCoachTestingPlayerId();
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!playerId || names[playerId]) return;
    let cancelled = false;
    void createClient()
      .from("profiles")
      .select("full_name")
      .eq("id", playerId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const name = (data?.full_name as string | null)?.trim() || "Player";
        setNames((n) => ({ ...n, [playerId]: name }));
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, names]);

  if (!playerId) return null;
  const name = names[playerId] ?? "…";

  return (
    <div className="print:hidden shrink-0 bg-[#FFA500] px-4 py-2 text-[#3d2600]">
      <div className="flex items-center gap-2.5">
        <ClipboardCheck className="h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-extrabold">Testing {name}</p>
          <p className="text-[11px] font-semibold opacity-80">Results save to their profile</p>
        </div>
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/profile"))}
          className="shrink-0 rounded-full bg-[#3d2600]/10 px-3 py-1.5 text-xs font-bold hover:bg-[#3d2600]/20"
        >
          Done
        </button>
      </div>
    </div>
  );
}
