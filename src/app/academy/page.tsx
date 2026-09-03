"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { GOLF_ICONS } from "@/components/IconPicker";
import { getTrophyMultiplierContributions } from "@/lib/trophyMultiplierContributions";
import { TROPHY_LIST, buildLibraryCategoryCountsFromStorage } from "@/lib/academyTrophies";
import {
  achievementCountsFromRows,
  ensureAchievementsForEarnedTrophies,
  fetchUserAchievementRows,
  type UserAchievementRow,
} from "@/lib/userAchievements";
import AcademyTrophyCasePanel, {
  type AcademySelectedTrophy,
} from "@/components/AcademyTrophyCasePanel";
import { GoalAccountabilityModule } from "@/components/Dashboard";
import { runBackfillMyAchievementsFromTrophies } from "@/lib/trophyCollectionLeaderboard";
import { fetchUserTrophiesForUser } from "@/lib/userTrophiesDb";
import { getTimeframeDates } from "@/lib/academyLeaderboard";
import {
  practiceSessionMinutesFromRow,
  practiceSessionsForUser,
} from "@/lib/practiceSessionDuration";

type AcademyDbTrophyRow = {
  achievement_id: string;
  earned_at?: string;
  trophy_name: string;
  trophy_icon?: string;
  description?: string;
  id?: string;
};

interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  handicap: number;
  tier: "Bronze" | "Silver" | "Gold" | "Platinum";
  previousRank?: number; // For trend arrows
  avatar?: string; // Avatar initial or emoji
  lowRound?: number | null; // Lowest gross score (18-hole)
  lowNett?: number | null; // Lowest nett score (18-hole)
  birdieCount?: number; // Total birdies
  eagleCount?: number; // Total eagles
}

interface WeeklyPlan {
  [key: number]: {
    dayIndex: number;
    dayName: string;
    selected: boolean;
    availableTime: number;
    selectedFacilities: string[];
    roundType: string | null;
    drills: Array<{
      id: string;
      title: string;
      category: string;
      estimatedMinutes: number;
      completed?: boolean;
      isRound?: boolean;
      [key: string]: any;
    }>;
    date?: string;
  };
}

// Leaderboard data is now generated dynamically - no mock data

// Goal handicap
const GOAL_HANDICAP = 8.7;
const STARTING_HANDICAP = 12.0;

// XP per round
const XP_PER_ROUND = 500;
const XP_PER_DRILL = 100;

// Tier thresholds
const TIER_THRESHOLDS = {
  Bronze: { xp: 0, handicap: 15.0 },
  Silver: { xp: 3000, handicap: 12.0 },
  Gold: { xp: 6000, handicap: 10.0 },
  Platinum: { xp: 10000, handicap: 8.7 },
};

// Level mapping (based on tier)
const getLevel = (tier: "Bronze" | "Silver" | "Gold" | "Platinum"): string => {
  switch (tier) {
    case "Platinum":
      return "Level 4: Elite";
    case "Gold":
      return "Level 3: Elite";
    case "Silver":
      return "Level 2: Advanced";
    case "Bronze":
      return "Level 1: Foundation";
  }
};



// Calculate total XP filtered by timeframe
function calculateTotalXPByTimeframe(
  rounds: any[],
  userProgress: { totalXP: number; completedDrills: string[] },
  timeFilter: "week" | "month" | "year" | "allTime",
) {
  const { startDate } = getTimeframeDates(timeFilter);

  // Filter rounds by timeframe
  const filteredRounds = rounds.filter((round) => {
    if (timeFilter === "allTime") return true;
    const roundDate = new Date(round.date);
    return roundDate >= startDate;
  });

  const roundsXP = filteredRounds.length * XP_PER_ROUND;

  // Filter drill XP by timeframe using practice activity history
  let drillsXP = 0;
  if (typeof window !== "undefined") {
    try {
      const practiceHistory = JSON.parse(
        localStorage.getItem("practiceActivityHistory") || "[]",
      );
      const filteredHistory = practiceHistory.filter((entry: any) => {
        if (timeFilter === "allTime") return true;
        const entryDate = new Date(entry.timestamp || entry.date);
        return entryDate >= startDate;
      });

      // Sum XP from filtered practice history
      drillsXP = filteredHistory.reduce((sum: number, entry: any) => {
        return sum + (entry.xp || 0);
      }, 0);
    } catch (error) {
      // Fallback: use totalXP if filtering fails
      drillsXP = timeFilter === "allTime" ? userProgress.totalXP : 0;
    }
  }

  return roundsXP + drillsXP;
}

export default function AcademyPage() {
  console.log("Academy: Component rendering...");

  // ALL HOOKS MUST BE AT THE TOP - NO EXCEPTIONS (Rules of Hooks)
  // Check Fetch Logic: Ensure the loadStats function is fetching data from the drills and practice_sessions tables as well as rounds
  const { rounds, practiceSessions, practiceLogs } = useStats();
  const { user, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  const hasFetchedProgress = useRef(false);

  const [userProgress, setUserProgress] = useState<{
    totalXP: number;
    completedDrills: string[];
  }>({
    totalXP: 0,
    completedDrills: [],
  });
  const [selectedTrophy, setSelectedTrophy] = useState<AcademySelectedTrophy | null>(null);

  // Database-First Academy: Fetch trophies from user_trophies table instead of calculating from live scores
  const [dbTrophies, setDbTrophies] = useState<AcademyDbTrophyRow[]>([]);

  // Toggle State: Add a showLocked boolean state (defaulting to true)
  const [showLocked, setShowLocked] = useState<boolean>(false);

  const [userAchievementRows, setUserAchievementRows] = useState<UserAchievementRow[]>([]);
  const achievementCountByKey = useMemo(
    () => achievementCountsFromRows(userAchievementRows),
    [userAchievementRows],
  );

  // Fix the 'Hooks called in change of order' error
  // Move Hooks Up: Move all useMemo, useCallback, useState, and useEffect calls to the very top of the AcademyPage function, immediately after useContext and useRef calls
  // No Early Returns: Ensure there are no if (loading) return ... or if (!user) return ... statements appearing before any Hook

  // Kill the Wait: Ensure loading is forced to false in a finally block pattern
  // Circuit Breaker: Add timeout to prevent infinite loading
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  const totalXP = useMemo(() => {
    if (!rounds || !userProgress) return 0;
    return calculateTotalXPByTimeframe(rounds, userProgress, "allTime");
  }, [rounds, userProgress]);

  // Get current handicap (latest round or default) - wrap in useMemo
  const currentHandicap = useMemo(() => {
    if (!rounds || rounds.length === 0) return STARTING_HANDICAP;
    const lastRound = rounds[rounds.length - 1];
    return lastRound.handicap !== null && lastRound.handicap !== undefined
      ? lastRound.handicap
      : STARTING_HANDICAP;
  }, [rounds]);

  /** Stats object passed to `TROPHY_LIST` getProgress / checks â€” mirrors HomeDashboard trophy logic. */
  const academyTrophyStats = useMemo(() => {
    const myPracticeSessions = practiceSessionsForUser(practiceSessions, user?.id);
    const practiceHours = myPracticeSessions.reduce(
      (sum: number, s: { duration_minutes?: unknown; duration?: unknown; estimatedMinutes?: unknown }) =>
        sum + practiceSessionMinutesFromRow(s) / 60,
      0,
    );
    let completedLessons = 0;
    let practiceHistory: any[] = [];
    let libraryCategories: Record<string, number> = {};
    if (typeof window !== "undefined") {
      try {
        const progress = JSON.parse(localStorage.getItem("userProgress") || "{}");
        completedLessons = (progress.completedDrills || []).length;
        practiceHistory = JSON.parse(localStorage.getItem("practiceActivityHistory") || "[]");
        libraryCategories = buildLibraryCategoryCountsFromStorage();
      } catch {
        /* ignore */
      }
    }
    return {
      totalXP: user?.totalXP || 0,
      completedLessons,
      practiceHours,
      rounds: rounds?.length || 0,
      handicap: currentHandicap,
      roundsData: rounds || [],
      practiceHistory,
      libraryCategories,
      userId: user?.id,
      practiceSessions: myPracticeSessions,
      practiceLogs: practiceLogs || [],
    };
  }, [
    user?.id,
    user?.totalXP,
    rounds,
    practiceSessions,
    practiceLogs,
    currentHandicap,
    userProgress.completedDrills,
  ]);

  const [roundStatsPlayedAt, setRoundStatsPlayedAt] = useState<string[]>([]);
  useEffect(() => {
    if (!user?.id) {
      setRoundStatsPlayedAt([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data, error } = await supabase
          .from("round_stats")
          .select("played_at")
          .eq("user_id", user.id)
          .order("played_at", { ascending: false })
          .limit(200);
        if (cancelled) return;
        if (error) {
          setRoundStatsPlayedAt([]);
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        setRoundStatsPlayedAt(
          rows.map((r: { played_at?: string | null }) => r.played_at).filter((x): x is string => !!x),
        );
      } catch {
        if (!cancelled) {
          setRoundStatsPlayedAt([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const trophyMultiplierById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getTrophyMultiplierContributions>>();
    for (const t of TROPHY_LIST) {
      m.set(
        t.id,
        getTrophyMultiplierContributions(t.id, academyTrophyStats, practiceLogs || [], roundStatsPlayedAt),
      );
    }
    return m;
  }, [academyTrophyStats, practiceLogs, roundStatsPlayedAt]);

  // Calculate scholarship progress (handicap improvement toward goal) - wrap in useMemo
  const scholarshipProgress = useMemo(() => {
    const handicapRange = STARTING_HANDICAP - GOAL_HANDICAP; // 12.0 - 8.7 = 3.3
    const handicapImprovement = STARTING_HANDICAP - currentHandicap; // How much improved
    return Math.min(
      100,
      Math.max(0, (handicapImprovement / handicapRange) * 100),
    );
  }, [currentHandicap]);

  // Determine tier based on XP and handicap - wrap in useMemo
  const userTier = useMemo((): "Bronze" | "Silver" | "Gold" | "Platinum" => {
    // Platinum requires hitting the goal handicap
    if (currentHandicap <= GOAL_HANDICAP) {
      return "Platinum";
    }

    // Check by handicap first, then XP
    if (
      currentHandicap <= TIER_THRESHOLDS.Gold.handicap ||
      totalXP >= TIER_THRESHOLDS.Gold.xp
    ) {
      return "Gold";
    }
    if (
      currentHandicap <= TIER_THRESHOLDS.Silver.handicap ||
      totalXP >= TIER_THRESHOLDS.Silver.xp
    ) {
      return "Silver";
    }
    return "Bronze";
  }, [currentHandicap, totalXP]);

  const userLevel = useMemo(() => getLevel(userTier), [userTier]);

  // Get user name - wrap in useMemo to prevent recreation
  // Safe Logic: Do the check inside the useMemo rather than skipping the Hook entirely
  const userName = useMemo(() => {
    if (user?.fullName) {
      console.log("Academy: Displaying full_name from profile:", user.fullName);
      console.log("Academy: User ID:", user.id);
      return user.fullName;
    }
    if (user?.email) {
      console.log(
        "Academy: No full_name found, using email fallback:",
        user.email,
      );
      return user.email;
    }
    console.log("Academy: No full_name or email found");
    return "";
  }, [user?.fullName, user?.email]);

  // Automatic redirect if not authenticated (only after loading is complete)
  // Stable Dependencies: Ensure the useEffect dependency array is either empty [] or only contains [user?.id]
  useEffect(() => {
    try {
      if (!loading && !isAuthenticated && user === null) {
        console.log(
          "Academy: No authentication detected, redirecting to login...",
        );
        router.push("/login");
      }
    } catch (error) {
      console.error("Academy: Error in auth redirect:", error);
    } finally {
      // Force Loading Off: Ensure setLoading(false) is called inside a finally block to prevent the page from hanging if a fetch fails
      // Note: loading state is managed by AuthContext
    }
  }, [user?.id, loading, isAuthenticated, router]); // Stable Dependencies: Only contains [user?.id]

  // Database-First Academy: Fetch trophies from user_trophies table instead of calculating from live scores
  useEffect(() => {
    const fetchTrophies = async () => {
      if (!user?.id) return;

      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        const { rows: raw, error } = await fetchUserTrophiesForUser(supabase, user.id);

        if (error) {
          console.error("Academy Trophy Fetch Error:", error);
          return;
        }

        const trophiesWithIds: AcademyDbTrophyRow[] = raw.map((trophy) => {
          const def = TROPHY_LIST.find((t) => t.id === trophy.achievement_id);
          return {
            achievement_id: trophy.achievement_id,
            earned_at: trophy.earned_at ?? undefined,
            trophy_name: def?.name ?? trophy.achievement_id,
            trophy_icon: trophy.trophy_icon ?? undefined,
            description: trophy.description ?? undefined,
            id: trophy.achievement_id,
          };
        });

        setDbTrophies(trophiesWithIds);
      } catch (err) {
        console.error("Error fetching Academy trophies:", err);
      }
    };

    fetchTrophies();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setUserAchievementRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        await runBackfillMyAchievementsFromTrophies(supabase);
        await ensureAchievementsForEarnedTrophies(
          supabase,
          user.id,
          dbTrophies.map((t) => ({ achievement_id: t.achievement_id, earned_at: t.earned_at ?? null })),
        );
        const rows = await fetchUserAchievementRows(supabase, user.id);
        if (!cancelled) setUserAchievementRows(rows);
      } catch {
        if (!cancelled) setUserAchievementRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, dbTrophies]);

  // Identify the Loop: Locate the useEffect that fetches leaderboard data or user stats
  // Add Fetch Guard: Create a ref called hasFetched = useRef(false). Wrap the fetch logic in if (hasFetched.current) return; and set hasFetched.current = true;
  // Load user progress and set up event listeners
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Add Fetch Guard: Wrap the fetch logic in if (hasFetchedProgress.current) return;
    if (hasFetchedProgress.current) return;

    try {
      const loadProgress = () => {
        const savedProgress = localStorage.getItem("userProgress");
        // Circuit Breaker: Only set if data exists and it's different from current state
        // Check for State Syncing: Don't call setUserProgress if it would cause a loop
        if (savedProgress) {
          try {
            const progress = JSON.parse(savedProgress);
            // Only update if the data actually changed to prevent infinite loops
            setUserProgress((prev) => {
              if (JSON.stringify(prev) === JSON.stringify(progress)) {
                return prev; // Return same reference if unchanged
              }
              return progress;
            });
          } catch (error) {
            console.error("Academy: Error parsing user progress:", error);
          }
        }
      };

      loadProgress();

      // Add Fetch Guard: Set hasFetchedProgress.current = true; inside the useEffect
      hasFetchedProgress.current = true;

      // Listen for rounds updates to refresh leaderboard
      const handleRoundsUpdate = () => {
        // The rounds from useStats() will automatically update via StatsContext
        // No need to force state update - just log
        console.log(
          "Academy: Received roundsUpdated event, leaderboard will refresh",
        );
      };

      // Listen for Academy-specific leaderboard refresh
      const handleLeaderboardRefresh = () => {
        console.log("Academy: Received academyLeaderboardRefresh event");
        // Don't trigger state update - let the natural re-render from StatsContext handle it
      };

      window.addEventListener("roundsUpdated", handleRoundsUpdate);
      window.addEventListener(
        "academyLeaderboardRefresh",
        handleLeaderboardRefresh,
      );
      window.addEventListener("userProgressUpdated", loadProgress);
      window.addEventListener("storage", loadProgress);

      return () => {
        window.removeEventListener("roundsUpdated", handleRoundsUpdate);
        window.removeEventListener(
          "academyLeaderboardRefresh",
          handleLeaderboardRefresh,
        );
        window.removeEventListener("userProgressUpdated", loadProgress);
        window.removeEventListener("storage", loadProgress);
      };
    } catch (error) {
      console.error("Academy: Error loading progress:", error);
    } finally {
      // Force Loading Off: Ensure setLoading(false) is called inside a finally block to prevent the page from hanging if a fetch fails
      // Note: loading state is managed by AuthContext
    }
  }, []); // Stable Dependencies: Empty array - run once on mount

  // Kill the Wait: Ensure loading is forced to false in a finally block pattern
  // Circuit Breaker: Add timeout to prevent infinite loading
  useEffect(() => {
    // Force loading to false after 10 seconds to prevent infinite spinner
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("Academy: Loading timeout - forcing render");
        setLoadingTimeout(true);
      }
    }, 10000);
    return () => clearTimeout(timeout);
  }, [loading]);

  // Fix the Hook Order error
  // Move All Hooks to the Top: Take every useState, useMemo, and useEffect (including the new ones on line 1323) and move them to the very top of the AcademyPage function
  // Check for Early Returns: Look for any line that says if (loading) return ... or if (!user) return .... These must be moved below all your hooks
  // Clean Up: If a useMemo or useEffect needs the user to exist, put the if (!user) return; check inside the hook's callback function, not around the hook itself
  // No Early Returns: Ensure there are no if (loading) return ... or if (!user) return ... statements appearing before any Hook
  // Now that all hooks are called, we can safely do early returns
  console.log(
    "Academy: Auth state - loading:",
    loading,
    "isAuthenticated:",
    isAuthenticated,
    "user:",
    user?.id,
  );

  if (loading && !loadingTimeout) {
    console.log("Academy: Showing loading spinner");
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  console.log("Academy: Fetching data...");

  // Circular avatar component - displays profile icon or initials
  const CircularAvatar = ({
    initial,
    iconId,
    size = 60,
    bgColor = "#FFA500",
  }: {
    initial: string;
    iconId?: string;
    size?: number;
    bgColor?: string;
  }) => {
    // Check if avatar is an icon ID (golf icon) or initials
    const selectedIcon = iconId
      ? GOLF_ICONS.find((icon: any) => icon.id === iconId)
      : null;
    const isIconId =
      iconId && GOLF_ICONS.some((icon: any) => icon.id === iconId);

    return (
      <div
        className="rounded-full flex items-center justify-center overflow-hidden"
        style={{
          width: size,
          height: size,
          backgroundColor: bgColor,
          fontSize: size * 0.4,
        }}
      >
        {/* Icon Alignment: Ensure the user-selected icons (like the golf flags) are centered perfectly inside the circles */}
        {isIconId ? (
          <div
            className="w-full h-full flex items-center justify-center p-2"
          >
            {(() => {
              const { GOLF_ICONS } = require("@/components/IconPicker");
              const iconData = GOLF_ICONS.find((i: any) => i.id === iconId);
              if (iconData && iconData.icon) {
                const IconComponent = iconData.icon;
                return <IconComponent className="w-8 h-8 text-white" />;
              }
              return initial;
            })()}
          </div>
        ) : (
          <span
            className="text-white font-bold"
            style={{ fontSize: size * 0.4 }}
          >
            {initial}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 w-full flex flex-col bg-gray-50">
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-32">
        <div className="max-w-md mx-auto">
          {/* Modern Profile Header - Centered */}
          <div className="pb-4 bg-white rounded-2xl p-4 shadow-sm mb-6">
          <div className="flex flex-col items-center gap-3">
            {/* Large Circular Avatar */}
            <CircularAvatar
              initial={
                userName
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("") || "J"
              }
              iconId={user?.preferredIconId}
              size={64}
              bgColor="#FFA500"
            />
            {/* Identity Text - Centered */}
            <div className="text-center">
              <p className="text-lg text-gray-600 mb-1">Welcome back,</p>
              <h1 className="text-2xl font-bold text-gray-900">{userName}</h1>
              <p
                className="text-sm font-semibold mt-1"
                style={{ color: "#16a34a" }}
              >
                {userLevel}
              </p>
            </div>
          </div>
        </div>

        <AcademyTrophyCasePanel
          dbTrophies={dbTrophies}
          showLocked={showLocked}
          onShowLockedChange={setShowLocked}
          selectedTrophy={selectedTrophy}
          onSelectTrophy={setSelectedTrophy}
          academyTrophyStats={academyTrophyStats}
          trophyMultiplierById={trophyMultiplierById}
          achievementRows={userAchievementRows}
          achievementCountByKey={achievementCountByKey}
        />

        <GoalAccountabilityModule />

        </div>
      </div>
    </div>
  );
}
