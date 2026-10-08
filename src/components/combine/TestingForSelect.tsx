"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Search, User, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { isCoachEmail } from "@/lib/coachEmails";
import { fetchPlayerOptions, type PlayerOption } from "@/lib/coachingSpaces";
import type { CombineCategoryId } from "@/lib/combineTestsCatalog";
import { combineHrefForPlayer } from "@/hooks/useCombineUser";
import { CombineTestPicker } from "@/components/combine/CombineTestPicker";

const STORAGE_KEY = "combine:testing-for";

function readTestingFor(): PlayerOption | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    return parsed && typeof parsed.id === "string" && typeof parsed.name === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeTestingFor(player: PlayerOption | null) {
  try {
    if (player) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(player));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Coach-only: choose whether a combine is for yourself or a player in a lesson. */
export function TestingForSelect({
  value,
  onChange,
}: {
  value: PlayerOption | null;
  onChange: (player: PlayerOption | null) => void;
}) {
  const [players, setPlayers] = useState<PlayerOption[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    fetchPlayerOptions(createClient())
      .then((list) => {
        if (!cancelled) setPlayers(list);
      })
      .catch(() => {
        if (!cancelled) setPlayers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !players) return [];
    return players.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [players, query]);

  const choose = (player: PlayerOption | null) => {
    writeTestingFor(player);
    setQuery("");
    onChange(player);
  };

  if (value) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl bg-[#FFA500] px-3 py-2.5 text-[#3d2600]">
        <ClipboardCheck className="h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-extrabold">Testing {value.name}</p>
          <p className="text-[11px] font-semibold opacity-80">Pick a combine. Their score saves to their profile.</p>
        </div>
        <button
          type="button"
          onClick={() => choose(null)}
          className="shrink-0 rounded-full bg-[#3d2600]/10 p-1.5 hover:bg-[#3d2600]/20"
          aria-label="Stop testing a player"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-gray-200">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#014421]/10 text-[#014421]">
          <User className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-bold text-gray-900">Who are you testing?</p>
          <p className="text-[11px] text-gray-500">Yourself, or search a player in your lesson</p>
        </div>
      </div>
      <label className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={players ? "Search a player" : "Loading players…"}
          aria-label="Search a player to test"
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      </label>
      {query.trim() && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl ring-1 ring-gray-100">
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-gray-500">{players ? "No players match" : "Loading…"}</li>
          ) : (
            matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p)}
                  className="w-full px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
                >
                  {p.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Practice hub combine list. Coaches also get "Who are you testing?" so a lesson test saves to the player. */
export function PracticeCombinePicker({
  category,
  onCategoryChange,
}: {
  category: CombineCategoryId;
  onCategoryChange: (c: CombineCategoryId) => void;
}) {
  const { user } = useAuth();
  const isCoach = isCoachEmail(user?.email) || user?.role === "coach";
  const [testingFor, setTestingFor] = useState<PlayerOption | null>(readTestingFor);
  const player = isCoach ? testingFor : null;

  return (
    <div className="space-y-4">
      {isCoach && <TestingForSelect value={player} onChange={setTestingFor} />}
      <CombineTestPicker
        category={category}
        onCategoryChange={onCategoryChange}
        hrefFor={player ? (href) => combineHrefForPlayer(href, player.id) : undefined}
      />
    </div>
  );
}
