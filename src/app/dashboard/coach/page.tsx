"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { initials } from "@/components/coach/CoachReportParts";

interface PlayerProfile {
  id: string;
  full_name: string;
  email?: string;
  total_xp: number;
  current_level: number;
  currentStreak: number;
  last_login_date: string;
  handicap: number;
  starting_handicap: number;
}

function nameKey(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function playerMeta(player: PlayerProfile): string {
  const parts: string[] = [];
  const hcp = Number(player.handicap);
  if (player.handicap != null && Number.isFinite(hcp)) parts.push(`Hcp ${hcp >= 0 ? hcp : `+${Math.abs(hcp)}`}`);
  parts.push(`${(Number(player.total_xp) || 0).toLocaleString()} XP`);
  if (player.last_login_date) {
    const d = new Date(player.last_login_date);
    if (!Number.isNaN(d.getTime())) {
      parts.push(`Active ${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`);
    }
  }
  return parts.join(" · ");
}

export default function CoachesDashboard() {
  const router = useRouter();
  const { user, loading, profileLoading } = useAuth();
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || profileLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    fetchPlayers();
  }, [user, loading, profileLoading, router]);

  const fetchPlayers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          total_xp,
          current_level,
          "currentStreak",
          last_login_date,
          handicap,
          starting_handicap
        `)
        .order("full_name", { ascending: true });

      if (error) throw error;
      setPlayers(data || []);
    } catch (err) {
      console.error("Error fetching players:", err);
      setError(err instanceof Error ? err.message : "Failed to load players");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPlayers = players.filter((player) => {
    if (!player.id) return false;
    if (!searchQuery) return true;
    const term = searchQuery.toLowerCase();
    return (
      (player.full_name && player.full_name.toLowerCase().includes(term)) ||
      (player.email && player.email.toLowerCase().includes(term))
    );
  });

  const nameCounts = new Map<string, number>();
  for (const p of players) {
    const key = nameKey(p.full_name);
    if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const duplicateNames = new Set([...nameCounts].filter(([, n]) => n > 1).map(([k]) => k));
  const busy = loading || profileLoading || isLoading;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-md flex-col overflow-x-hidden bg-stone-50">
      <header className="shrink-0 px-4 pt-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 py-1.5 pr-2 text-sm font-semibold text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Home
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">Player reports</h1>
        <p className="mt-0.5 text-sm text-stone-500">
          {busy ? "Loading players…" : `${players.length} ${players.length === 1 ? "player" : "players"} · tap one for their full report`}
        </p>
      </header>

      <div className="w-full flex-1 px-4 pb-32 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            type="search"
            placeholder="Search players"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm text-stone-900 shadow-sm outline-none focus:border-[#014421]"
          />
        </div>

        {error && (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</p>
        )}

        <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {busy ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading players…
            </p>
          ) : filteredPlayers.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-500">
              {searchQuery ? "No players match that search." : "No players yet."}
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {filteredPlayers.map((player) => {
                const name = player.full_name || "Unknown player";
                return (
                  <li key={player.id}>
                    <Link
                      href={`/dashboard/coach/player/${player.id}`}
                      className="flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-stone-50"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#014421]/10 text-sm font-bold text-[#014421]"
                        aria-hidden
                      >
                        {initials(name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-stone-900">{name}</span>
                        {player.email && <span className="block truncate text-xs text-stone-500">{player.email}</span>}
                        <span className="block truncate text-xs text-stone-500">{playerMeta(player)}</span>
                        {duplicateNames.has(nameKey(player.full_name)) && (
                          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            Same name as another account
                          </span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
