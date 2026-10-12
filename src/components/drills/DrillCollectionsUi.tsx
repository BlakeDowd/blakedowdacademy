"use client";

import { useState } from "react";
import { Check, ListPlus, Plus, Star } from "lucide-react";
import {
  createDrillList,
  drillInKeys,
  toggleDrillInList,
  toggleFavouriteDrill,
  useDrillCollections,
} from "@/hooks/useDrillCollections";

type DrillLike = { id: string; drill_id?: string };

export function FavouriteButton({ drill, onDark = false }: { drill: DrillLike; onDark?: boolean }) {
  const { userId, status, favourites } = useDrillCollections();
  if (!userId || status !== "ready") return null;
  const on = drillInKeys(favourites, drill);
  const idle = onDark ? "bg-white/15 text-white hover:bg-white/25" : "text-gray-300 hover:text-[#FFA500]";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggleFavouriteDrill(drill);
      }}
      aria-pressed={on}
      aria-label={on ? "Remove from favourites" : "Add to favourites"}
      className={`shrink-0 rounded-full p-1.5 transition-colors ${on ? (onDark ? "bg-white text-[#FFA500]" : "text-[#FFA500]") : idle}`}
    >
      <Star className="h-4 w-4" fill={on ? "currentColor" : "none"} strokeWidth={on ? 2 : 1.75} aria-hidden />
    </button>
  );
}

/** Text box + button for naming a new list. */
export function NewListInput({ onCreate, autoFocus = false }: { onCreate: (name: string) => Promise<unknown>; autoFocus?: boolean }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    await onCreate(name);
    setBusy(false);
    setName("");
  };
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoFocus={autoFocus}
        placeholder="List name, e.g. Pre-round warm up"
        aria-label="New list name"
        className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#014421]"
      />
      <button
        type="submit"
        disabled={!name.trim() || busy}
        className="flex shrink-0 items-center gap-1 rounded-xl bg-[#014421] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Create
      </button>
    </form>
  );
}

/** "Save to list" block in the drill popup: tick the lists this drill belongs in, or start a new one with it. */
export function DrillListPicker({ drill }: { drill: DrillLike }) {
  const { userId, status, lists } = useDrillCollections();
  const [creating, setCreating] = useState(false);
  if (!userId || status !== "ready") return null;

  return (
    <div className="rounded-2xl bg-gray-50 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <ListPlus className="h-4 w-4 text-[#014421]" aria-hidden />
        Save to a list
      </p>
      {lists.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {lists.map((list) => {
            const on = drillInKeys(list.drillKeys, drill);
            return (
              <button
                key={list.id}
                type="button"
                onClick={() => void toggleDrillInList(list.id, drill)}
                aria-pressed={on}
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  on ? "bg-[#014421] text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
                }`}
              >
                {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                {list.name}
              </button>
            );
          })}
        </div>
      )}
      {creating ? (
        <NewListInput
          autoFocus
          onCreate={async (name) => {
            await createDrillList(name, drill);
            setCreating(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 text-xs font-semibold text-[#014421] hover:underline"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {lists.length === 0 ? "Make your first list with this drill" : "New list"}
        </button>
      )}
    </div>
  );
}
