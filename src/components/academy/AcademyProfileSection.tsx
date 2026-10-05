"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  fetchUserTrophiesForUser,
  formatInsertUserTrophyRowError,
  insertUserTrophyRow,
  updateUserTrophyEarnedAt,
} from "@/lib/userTrophiesDb";
import { trophyQualifiedAt } from "@/lib/trophyEarnedDates";
import {
  practiceSessionMinutesFromRow,
  practiceSessionsForUser,
} from "@/lib/practiceSessionDuration";
import { fetchMyLibraryCompletions, type LibraryCompletionRow } from "@/lib/libraryCompletions";
import { buildPracticeActivity, localDayKey, type DrillCatalogEntry } from "@/lib/practiceActivity";
import { logActivity } from "@/lib/activity";

type AcademyDbTrophyRow = {
  achievement_id: string;
  earned_at?: string;
  trophy_name: string;
  trophy_icon?: string;
  description?: string;
  id?: string;
};

const STARTING_HANDICAP = 12.0;
const EMPTY_CATALOG: ReadonlyMap<string, DrillCatalogEntry> = new Map();

/** Trophy case + goal setting previously on the Academy page. */
export function AcademyProfileSection() {
  const { rounds, practiceSessions, practiceLogs, loading: statsLoading } = useStats();
  const { user } = useAuth();

  const [selectedTrophy, setSelectedTrophy] = useState<AcademySelectedTrophy | null>(null);
  const [dbTrophies, setDbTrophies] = useState<AcademyDbTrophyRow[]>([]);
  const [dbTrophiesLoaded, setDbTrophiesLoaded] = useState(false);
  const [showLocked, setShowLocked] = useState(true);
  const [userAchievementRows, setUserAchievementRows] = useState<UserAchievementRow[]>([]);
  const [roundStatsPlayedAt, setRoundStatsPlayedAt] = useState<string[]>([]);
  const [libraryCompletions, setLibraryCompletions] = useState<LibraryCompletionRow[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const awardingRef = useRef(false);
  const datesCheckedRef = useRef(false);

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

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void fetchMyLibraryCompletions(user.id).then((rows) => {
      if (cancelled) return;
      setLibraryCompletions(rows);
      setLibraryLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const activity = useMemo(
    () =>
      user?.id
        ? buildPracticeActivity({
            userId: user.id,
            practiceSessions,
            practiceLogs,
            libraryCompletions,
            drillCatalog: EMPTY_CATALOG,
          })
        : [],
    [user?.id, practiceSessions, practiceLogs, libraryCompletions],
  );

  const academyTrophyStats = useMemo(() => {
    const myPracticeSessions = practiceSessionsForUser(practiceSessions, user?.id);
    const practiceHours = myPracticeSessions.reduce(
      (sum: number, s: { duration_minutes?: unknown; duration?: unknown; estimatedMinutes?: unknown }) =>
        sum + practiceSessionMinutesFromRow(s) / 60,
      0,
    );

    // Local-noon timestamps keep streak days on the player's calendar day when converted to UTC.
    let practiceHistory: unknown[] = activity
      .filter((item) => item.kind !== "video")
      .map((item) => ({ timestamp: `${localDayKey(item.at)}T12:00:00`, duration: item.minutes, xp: 0 }));

    const drillCategories: Record<string, number> = {};
    for (const item of activity) {
      if (item.kind !== "drill" || !item.area) continue;
      const key = item.area === "Wedges" ? "Wedge Play" : item.area;
      drillCategories[key] = (drillCategories[key] || 0) + 1;
    }

    let libraryCategories: Record<string, number> = { ...drillCategories };
    if (typeof window !== "undefined") {
      try {
        if (practiceHistory.length === 0) {
          practiceHistory = JSON.parse(localStorage.getItem("practiceActivityHistory") || "[]");
        }
        for (const [key, n] of Object.entries(buildLibraryCategoryCountsFromStorage())) {
          libraryCategories[key] = Math.max(libraryCategories[key] || 0, n);
        }
      } catch {
        libraryCategories = { ...drillCategories };
      }
    }

    return {
      totalXP: user?.totalXP || 0,
      completedLessons: libraryCompletions.length,
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
  }, [user?.id, user?.totalXP, rounds, practiceSessions, practiceLogs, currentHandicap, libraryCompletions, activity]);

  const qualifiedAt = useCallback(
    (trophyId: string) =>
      trophyQualifiedAt(trophyId, {
        activity,
        practiceSessions: academyTrophyStats.practiceSessions,
        roundsData: academyTrophyStats.roundsData,
      }),
    [activity, academyTrophyStats],
  );

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
        // One entry per catalog trophy: repeat rows and retired ids would inflate the earned count.
        const byId = new Map<string, AcademyDbTrophyRow>();
        for (const trophy of raw) {
          const def = TROPHY_LIST.find((t) => t.id === trophy.achievement_id);
          if (!def) continue;
          const prev = byId.get(def.id);
          const earnedAt = trophy.earned_at ?? undefined;
          if (prev?.earned_at && (!earnedAt || prev.earned_at <= earnedAt)) continue;
          byId.set(def.id, {
            achievement_id: def.id,
            earned_at: earnedAt,
            trophy_name: def.name,
            trophy_icon: trophy.trophy_icon ?? undefined,
            description: trophy.description ?? undefined,
            id: def.id,
          });
        }
        setDbTrophies([...byId.values()]);
        setDbTrophiesLoaded(true);
      } catch (err) {
        console.error("Error fetching profile trophies:", err);
      }
    };
    fetchTrophies();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || statsLoading || !libraryLoaded || !dbTrophiesLoaded || awardingRef.current) return;
    const owned = new Set(dbTrophies.map((t) => t.achievement_id));
    const newlyEarned = TROPHY_LIST.filter((t) => !owned.has(t.id) && t.checkUnlocked(academyTrophyStats));
    if (newlyEarned.length === 0) return;
    awardingRef.current = true;
    const userId = user.id;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const added: AcademyDbTrophyRow[] = [];
        for (const trophy of newlyEarned) {
          const earnedAt = qualifiedAt(trophy.id) ?? new Date().toISOString();
          const { error } = await insertUserTrophyRow(supabase, {
            userId,
            achievementId: trophy.id,
            description: trophy.requirement,
            earnedAt,
          });
          if (error) {
            console.error(`[trophy-insert] ${trophy.name}: ${formatInsertUserTrophyRowError(error)}`);
            continue;
          }
          added.push({
            achievement_id: trophy.id,
            earned_at: earnedAt,
            trophy_name: trophy.name,
            description: trophy.requirement,
            id: trophy.id,
          });
          await logActivity(userId, "achievement", `Unlocked the ${trophy.name} trophy`);
        }
        if (added.length > 0) setDbTrophies((prev) => [...prev, ...added]);
      } finally {
        awardingRef.current = false;
      }
    })();
  }, [user?.id, statsLoading, libraryLoaded, dbTrophiesLoaded, dbTrophies, academyTrophyStats, qualifiedAt]);

  useEffect(() => {
    if (!user?.id || statsLoading || !libraryLoaded || !dbTrophiesLoaded || datesCheckedRef.current) return;
    datesCheckedRef.current = true;
    const fixes = dbTrophies
      .map((t) => ({ id: t.achievement_id, stored: t.earned_at, actual: qualifiedAt(t.achievement_id) }))
      .filter(
        (f): f is { id: string; stored: string; actual: string } =>
          !!f.stored &&
          !!f.actual &&
          new Date(f.actual).getTime() < new Date(f.stored).getTime() &&
          localDayKey(f.actual) !== localDayKey(f.stored),
      );
    if (fixes.length === 0) return;
    const actualById = new Map(fixes.map((f) => [f.id, f.actual]));
    setDbTrophies((prev) =>
      prev.map((t) => (actualById.has(t.achievement_id) ? { ...t, earned_at: actualById.get(t.achievement_id) } : t)),
    );
    const userId = user.id;
    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      for (const fix of fixes) {
        if (!(await updateUserTrophyEarnedAt(supabase, userId, fix.id, fix.actual))) {
          console.warn(`[trophy-date] Could not save corrected date for ${fix.id}; user_trophies may need an update policy.`);
        }
      }
    })();
  }, [user?.id, statsLoading, libraryLoaded, dbTrophiesLoaded, dbTrophies, qualifiedAt]);

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
