"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Search, ChevronRight } from "lucide-react";
import Link from "next/link";

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

export default function CoachesDashboard() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    // Protection Check
    if (!user) {
      router.push("/login");
      return;
    }

    const authorizedEmails = ["bdowd@pgamember.org.au", "allendowd86@gmail.com"];
    const userEmail = (user.email || "").toLowerCase().trim();
    if (!userEmail || !authorizedEmails.includes(userEmail)) {
      router.push("/");
      return;
    }

    fetchPlayers();
  }, [user, loading, router]);

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
    } catch (err: any) {
      console.error("Error fetching players:", err);
      setError(err.message || "Failed to load players");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPlayers = players.filter(player => {
    if (!searchQuery) return true;
    const term = searchQuery.toLowerCase();
    return (
      (player.full_name && player.full_name.toLowerCase().includes(term)) ||
      (player.email && player.email.toLowerCase().includes(term))
    );
  });

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-16 h-16 border-4 border-[#014421] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const userEmail = (user?.email || "").toLowerCase().trim();

  return (
    <div className="w-full max-w-md mx-auto min-w-0 flex flex-col bg-gray-50 overflow-x-hidden">
      {/* Header: Shrink-0 ensures it never loses its size */}
      <header className="shrink-0 w-full bg-[#014421] text-white p-4 shadow-md">
        <Link href="/" className="inline-flex items-center text-green-100 hover:text-white mb-2 transition-colors text-sm truncate min-w-0 flex-shrink">
          <ArrowLeft className="w-4 h-4 mr-2 shrink-0" />
          Back to Home
        </Link>
        <h1 className="text-xl font-bold truncate min-w-0 flex-shrink">Coach Dashboard</h1>
        <p className="text-xs opacity-80 mt-1 truncate min-w-0">Authorized Access: {userEmail}</p>
      </header>

      {/* Scroll Zone: Search bar down - pb-32 is massive safe zone for nav bar */}
      <div className="flex-1 w-full px-4 pt-4 pb-32">
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 shrink-0" />
            <input
              type="text"
              placeholder="Search players by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#014421] focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Player List Cards - truncate + min-w-0 on text to prevent stretch */}
          {filteredPlayers.length > 0 ? (
            filteredPlayers
              .filter((player) => player.id)
              .map((player) => (
              <Link
                key={player.id}
                href={`/dashboard/coach/player/${player.id}`}
                className="flex w-full bg-white rounded-xl border border-gray-200 p-4 items-center justify-between shadow-sm hover:bg-gray-50 transition-colors min-w-0"
              >
                <div className="flex flex-col min-w-0 flex-1 pr-3">
                  <span className="text-lg font-bold text-gray-900 truncate min-w-0">
                    {player.full_name || "Unknown Player"}
                  </span>
                  {player.email && (
                    <span className="text-sm text-gray-500 truncate min-w-0">
                      {player.email}
                    </span>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
              </Link>
              ))
          ) : (
            <div className="w-full bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
              {searchQuery ? "No players found." : "No players yet."}
            </div>
          )}
        </div>
      </div>

      {/* Nav Bar: Rendered by app/layout.tsx via ConditionalNavbar - stays at bottom of viewport */}
    </div>
  );
}
