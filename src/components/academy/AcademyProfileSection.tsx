"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
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

const STARTING_HANDICAP = 12.0;

/** Trophy case + goal setting previously on the Academy page. */
export function AcademyProfileSection() {
  const { rounds, practiceSessions, practiceLogs } = useStats();
  const { user } = useAuth();

  const [selectedTrophy, setSelectedTrophy] = useState<AcademySelectedTrophy | null>(null);
  const [dbTrophies, setDbTrophies] = useState<AcademyDbTrophyRow[]>([]);
  const [showLocked, setShowLocked] = useState(false);
  const [userAchievementRows, setUserAchievementRows] = useState<UserAchievementRow[]>([]);
  const [roundStatsPlayedAt, setRoundStatsPlayedAt] = useState<string[]>([]);

  const achievementCountByKey = useMemo(
    () => achievementCountsFromRows(userAchievementRows),
    [userAchievementRows],
  );

  const currentHandicap = useMemo(() => {
    if (!rounds || rounds.length === 0) return STARTING_HANDICAP;
    const lastRound = rounds[rounds.length - 1];
    return lastRound.handicap !== null && lastRound.handicap !== undefined
      ? lastRound.handicap
      : STARTING_HANDICAP;
  }, [rounds]);

  const academyTrophyStats = useMemo(() => {
    const myPracticeSessions = practiceSessionsForUser(practiceSessions, user?.id);
    const practiceHours = myPracticeSessions.reduce(
      (sum: number, s: { duration_minutes?: unknown; duration?: unknown; estimatedMinutes?: unknown }) =>
        sum + practiceSessionMinutesFromRow(s) / 60,
      0,
    );
    let completedLessons = 0;
    let practiceHistory: unknown[] = [];
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
  }, [user?.id, user?.totalXP, rounds, practiceSessions, practiceLogs, currentHandicap]);

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
        if (!cancelled) setRoundStatsPlayedAt([]);
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

  useEffect(() => {
    const fetchTrophies = async () => {
      if (!user?.id) return;
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { rows: raw, error } = await fetchUserTrophiesForUser(supabase, user.id);
        if (error) {
          console.error("Profile trophy fetch error:", error);
          return;
        }
        setDbTrophies(
          raw.map((trophy) => {
            const def = TROPHY_LIST.find((t) => t.id === trophy.achievement_id);
            return {
              achievement_id: trophy.achievement_id,
              earned_at: trophy.earned_at ?? undefined,
              trophy_name: def?.name ?? trophy.achievement_id,
              trophy_icon: trophy.trophy_icon ?? undefined,
              description: trophy.description ?? undefined,
              id: trophy.achievement_id,
            };
          }),
        );
      } catch (err) {
        console.error("Error fetching profile trophies:", err);
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
          dbTrophies.map((t) => ({
            achievement_id: t.achievement_id,
            earned_at: t.earned_at ?? null,
          })),
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

  return (
    <div className="mb-6 space-y-4">
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
  );
}
