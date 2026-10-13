"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import { initials } from "@/components/coach/CoachReportParts";
import { membersOfGroup, setGroupMembership, usePlayerGroups, type PlayerGroup } from "@/lib/playerGroups";

export type GroupSheetPlayer = { id: string; full_name: string; email?: string };

/** Tick players in or out of a group. Each tap saves straight away. */
export function GroupMembersSheet({
  group,
  players,
  onClose,
}: {
  group: PlayerGroup;
  players: GroupSheetPlayer[];
  onClose: () => void;
}) {
  const groupsState = usePlayerGroups();
  const memberIds = new Set(membersOfGroup(groupsState, group.id).map((m) => m.player_id));
  const [pinnedIds] = useState(() => new Set(memberIds));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const term = query.trim().toLowerCase();
  const shown = players
    .filter(
      (p) =>
        !term ||
        (p.full_name || "").toLowerCase().includes(term) ||
        (p.email || "").toLowerCase().includes(term),
    )
    .sort((a, b) => {
      const inA = pinnedIds.has(a.id) ? 0 : 1;
      const inB = pinnedIds.has(b.id) ? 0 : 1;
      return inA - inB || (a.full_name || "").localeCompare(b.full_name || "");
    });

  const toggle = async (playerId: string) => {
    setError(null);
    const err = await setGroupMembership(group.id, playerId, !memberIds.has(playerId));
    if (err) setError(err);
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex flex-col bg-[#f4f6f4]" role="dialog" aria-modal="true" aria-label={`Players in ${group.name}`}>
      <header className="shrink-0 bg-[#014421] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-md items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white/75">
              {memberIds.size} {memberIds.size === 1 ? "player" : "players"} in the group
            </p>
            <h2 className="truncate text-lg font-bold tracking-tight">{group.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-[#014421] hover:bg-white/90"
          >
            Done
          </button>
        </div>
        <div className="relative mx-auto mt-3 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players"
            autoFocus
            className="w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-9 text-sm text-stone-900 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 hover:text-stone-700"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-3">
        <div className="mx-auto max-w-md">
          <p className="mb-2 text-xs text-stone-500">Tap a player to add or remove them. Changes save straight away.</p>
          {error && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            {shown.length === 0 && <li className="py-8 text-center text-sm text-stone-500">No players match that search.</li>}
            {shown.map((p) => {
              const on = memberIds.has(p.id);
              const name = p.full_name || "Unknown player";
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => void toggle(p.id)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      on ? "bg-[#014421]/5" : "hover:bg-stone-50"
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#014421]/10 text-xs font-bold text-[#014421]"
                      aria-hidden
                    >
                      {initials(name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-stone-900">{name}</span>
                      {p.email && <span className="block truncate text-[11px] text-stone-500">{p.email}</span>}
                    </span>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                        on ? "border-[#014421] bg-[#014421] text-white" : "border-stone-300 bg-white"
                      }`}
                      aria-hidden
                    >
                      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
