"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import type { CoachingSpaceSummary } from "@/lib/coachingFeed";
import { Avatar, timeAgo } from "@/components/coaching/coachingUi";

type Sort = "recent" | "name";

function activeLabel(iso: string): string {
  const label = timeAgo(iso);
  return /^\d+ (min|h|d)$/.test(label) ? `${label} ago` : label;
}

export function CoachingSpacesGrid({
  spaces,
  loading,
  onOpen,
}: {
  spaces: CoachingSpaceSummary[];
  loading: boolean;
  onOpen: (studentId: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [showQuiet, setShowQuiet] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = spaces.filter((s) => !q || s.name.toLowerCase().includes(q));
    return list.sort((a, b) => {
      if (sort === "recent") {
        if (a.unread !== b.unread) return a.unread ? -1 : 1;
        const diff = (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
        if (diff) return diff;
      }
      return a.name.localeCompare(b.name);
    });
  }, [spaces, query, sort]);

  const searching = query.trim().length > 0;
  const active = searching ? filtered : filtered.filter((s) => s.lastActivityAt);
  const quiet = searching ? [] : filtered.filter((s) => !s.lastActivityAt);

  const tile = (s: CoachingSpaceSummary) => (
    <li key={s.studentId}>
      <button
        type="button"
        onClick={() => onOpen(s.studentId, s.name)}
        className="flex w-full flex-col items-center gap-2 rounded-2xl px-1 py-2 text-center hover:bg-stone-50"
      >
        <span className="relative">
          <Avatar name={s.name} size="lg" ring={s.unread} />
          {s.unread && (
            <span className="absolute -right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#FFA500]" />
          )}
        </span>
        <span className="w-full">
          <span className={`block truncate text-sm ${s.unread ? "font-bold text-stone-900" : "font-medium text-stone-800"}`}>
            {s.name}
          </span>
          <span className="block text-[11px] text-stone-500">
            {s.lastActivityAt ? activeLabel(s.lastActivityAt) : "Golf"}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 focus-within:border-[#014421]">
          <Search className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            aria-label="Search spaces"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-xl border border-stone-200 bg-white px-2 py-2 text-xs font-semibold text-stone-700"
          aria-label="Sort spaces"
        >
          <option value="recent">Recent</option>
          <option value="name">A–Z</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading spaces…
        </div>
      ) : (
        <>
          <ul className="mt-4 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4">
            {quiet.length > 0 && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowQuiet(true)}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl px-1 py-2 text-center hover:bg-stone-50"
                >
                  <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-stone-300 text-stone-400">
                    <Plus className="h-7 w-7" aria-hidden />
                  </span>
                  <span className="block text-sm font-medium text-stone-800">New</span>
                </button>
              </li>
            )}
            {active.map(tile)}
          </ul>
          {searching && filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-500">No students match “{query.trim()}”.</p>
          )}
          {quiet.length > 0 && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <button
                type="button"
                onClick={() => setShowQuiet((v) => !v)}
                className="text-xs font-semibold text-stone-500 hover:text-stone-800"
                aria-expanded={showQuiet}
              >
                {showQuiet ? "Hide" : "Show"} {quiet.length} student{quiet.length === 1 ? "" : "s"} with no posts yet
              </button>
              {showQuiet && <ul className="mt-3 grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-4">{quiet.map(tile)}</ul>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
