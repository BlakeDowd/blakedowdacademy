"use client";

import { useState } from "react";
import { ChevronDown, Gauge } from "lucide-react";
import SpeedLogging from "@/components/speed/SpeedLogging";
import { SpeedTrendChart } from "@/components/profile/SpeedTrendChart";

/** Coach space: view a player's driver-speed trend and log new speeds for them. */
export function PlayerSpeedLogging({
  playerId,
  playerName,
}: {
  playerId: string;
  playerName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-stone-50"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#014421]/10 text-[#014421]">
          <Gauge className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-stone-900">Driver speed</span>
          <span className="block text-xs text-stone-500">Log and track {playerName.split(" ")[0]}&apos;s club speed</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-4 border-t border-stone-100 px-3 pb-3 pt-3">
          <SpeedTrendChart userId={playerId} />
          <SpeedLogging hideHeader lockedPlayer={{ id: playerId, name: playerName }} />
        </div>
      )}
    </section>
  );
}
