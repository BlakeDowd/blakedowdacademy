"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { AdvancedApproachStatsPanel } from "@/components/stats/AdvancedApproachStatsPanel";
import type { AcademyTrophyDbRow } from "@/components/AcademyTrophyCasePanel";
import {
  TourPlayerProfileHero,
  ProfileSegmentedTabs,
  type ProfileTab,
} from "@/components/profile/TourPlayerProfileHero";
import CoachingTab from "@/components/coaching/CoachingTab";
import { fetchUnreadCount } from "@/lib/coachingFeed";
import { APP_VIDEO_COACH_NAME } from "@/lib/bunnyStream";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  HeadlineStatTile,
  Segmented,
  StatsCard,
  TargetStatRow,
  fmtStat,
} from "@/components/profile/ProfileStatsParts";
import { StatTrendChart, TREND_METRICS, type TrendMetricId } from "@/components/profile/StatTrendChart";
import {
  computeDeepDiveRoundMetrics,
  computeStrokeOpportunityTop3,
  sortMetricMatrix,
} from "@/lib/deepDiveRoundMetrics";
import { TROPHY_LIST } from "@/lib/academyTrophies";
import { fetchTrophyCollectionRankForUser } from "@/lib/trophyCollectionLeaderboard";
import { fetchUserTrophiesForUser } from "@/lib/userTrophiesDb";
import { resolveAuthUserId } from "@/lib/resolveAuthUserId";
import type { PlayerGoalRow } from "@/types/playerGoals";
import { AcademyProfileSection } from "@/components/academy/AcademyProfileSection";
import { ProfilePracticeOverview } from "@/components/profile/ProfilePracticeOverview";
import { getBenchmarkGoals } from "@/lib/benchmarkGoals";
import {
  SCORE_DISTRIBUTION_COLORS,
  fairwaysPossibleFor,
  roundsTrackingStat,
  sandSaveAttempts,
  upAndDownAttempts,
} from "@/lib/roundStatTracking";
import { countUserCombineCompletions } from "@/lib/combineCompletionDetection";
import { practiceSessionMinutesFromRow, practiceSessionsForUser } from "@/lib/practiceSessionDuration";
import { buildDummyRoundsForUser } from "@/lib/seedDummyRounds";

function clampTargetGoalHandicap(raw: number): number {
  const r = Math.round(Number(raw));
  if (!Number.isFinite(r)) return 9;
  return Math.min(54, Math.max(-5, r));
}

function pairText(made: number, total: number): string {
  return `${fmtStat(made)} / ${fmtStat(total)}`;
}

function roundSortTimeMs(r: { created_at?: string; date?: string }): number {
  const raw = r.created_at || r.date;
  const ms = new Date(raw || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export default function ProfilePage() {
  // ============================================
  // ALL HOOKS MUST BE AT THE TOP - NO EXCEPTIONS
  // ============================================
  
  // Context hooks
  const { rounds, practiceSessions, practiceLogs, loading: statsLoading, refreshRounds } = useStats();
  const { user, loading: authLoading } = useAuth();
  
  // Filter by User ID: StatsContext `rounds` are already loaded with `.eq("user_id", authUser.id)`.
  // Still filter when `user_id` is present (e.g. if context ever merges sources). If `user_id` is missing
  // or does not match profile id but rows exist, keep those rounds so the matrix / tiles stay in sync.
  const personalRounds = useMemo(() => {
    if (!rounds?.length) return [];
    // Do not require `user?.id` here: `loadMyRounds` is session-scoped and can finish before
    // AuthContext profile hydrates `user.id`, which would zero out rounds and hide the matrix.
    if (!user?.id) return rounds;
    const mine = rounds.filter((r: any) => {
      const uid = (r as any).user_id;
      return uid == null || uid === user.id;
    });
    return mine.length > 0 ? mine : rounds;
  }, [rounds, user?.id]);
  
  const personalPractice = useMemo(() => {
    if (!practiceSessions || !user?.id) return [];
    return practiceSessions.filter((p: any) => p.user_id === user.id);
  }, [practiceSessions, user?.id]);

  const practiceHoursTotal = useMemo(() => {
    const mine = practiceSessionsForUser(practiceSessions, user?.id);
    if (!mine.length) return 0;
    const totalMinutes = mine.reduce(
      (sum: number, session: { duration_minutes?: unknown; duration?: unknown; estimatedMinutes?: unknown }) =>
        sum + practiceSessionMinutesFromRow(session),
      0,
    );
    return Math.round((totalMinutes / 60) * 10) / 10;
  }, [practiceSessions, user?.id]);

  const bestScore = useMemo(() => {
    if (!personalRounds.length) return null;
    const validScores = personalRounds
      .map((r: { score?: unknown }) => r.score)
      .filter((s): s is number => s !== null && s !== undefined && Number.isFinite(Number(s)))
      .map((s) => Number(s));
    if (!validScores.length) return null;
    return Math.min(...validScores);
  }, [personalRounds]);

  const combinesCompleted = useMemo(
    () =>
      countUserCombineCompletions({
        userId: user?.id,
        practiceSessions: practiceSessionsForUser(practiceSessions, user?.id),
        practiceLogs: practiceLogs || [],
      }),
    [user?.id, practiceSessions, practiceLogs],
  );
  
  // Ensure rounds is always an array (use personalRounds for stats page)
  const safeRounds = personalRounds || [];

  // Debug: Log rounds data
  useEffect(() => {
    console.log('StatsPage: Rounds Data:', rounds);
    console.log('StatsPage: Rounds Length:', rounds?.length || 0);
    console.log('StatsPage: Stats Loading:', statsLoading);
  }, [rounds, statsLoading]);

  // Force refresh when roundsUpdated event is fired
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRoundsUpdate = () => {
      console.log('StatsPage: Received roundsUpdated event, calling refreshRounds...');
      // Use the context's refreshRounds function to reload data
      if (refreshRounds) {
        refreshRounds();
      }
    };

    window.addEventListener('roundsUpdated', handleRoundsUpdate);

    return () => {
      window.removeEventListener('roundsUpdated', handleRoundsUpdate);
    };
  }, [refreshRounds]);
  
  // State hooks - MUST be before any conditional returns
  // Whole-number handicap for benchmarks (slider step 1)
  const [selectedGoal, setSelectedGoal] = useState<number>(() =>
    clampTargetGoalHandicap(user?.initialHandicap ?? 9),
  );
  const [profileTab, setProfileTab] = useState<ProfileTab>("coaching");
  const [coachingUnread, setCoachingUnread] = useState(0);
  const refreshCoachingUnread = useCallback(() => {
    if (!user?.id) return;
    const viewerIsCoach = isCoachEmail(user.email) || user.role === "coach";
    void fetchUnreadCount(createBrowserSupabase(), user.id, viewerIsCoach).then(setCoachingUnread);
  }, [user?.id, user?.email, user?.role]);
  useEffect(() => {
    refreshCoachingUnread();
  }, [refreshCoachingUnread]);
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "stats" || tab === "practice" || tab === "coaching") setProfileTab(tab);
  }, []);
  const adjustTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [seedingSampleRounds, setSeedingSampleRounds] = useState(false);
  const [seedSampleError, setSeedSampleError] = useState("");
  
  const handleGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newGoal = clampTargetGoalHandicap(parseInt(e.target.value, 10));
    setSelectedGoal(newGoal);
    
    if (adjustTimeoutRef.current) {
      clearTimeout(adjustTimeoutRef.current);
    }
    
    // Debounce the Supabase update
    adjustTimeoutRef.current = setTimeout(async () => {
      if (user?.id) {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { error } = await supabase
            .from('profiles')
            .update({ initial_handicap: newGoal })
            .eq('id', user.id);
            
          if (error) {
            console.error('Error updating goal handicap:', error);
          }

          // Keep Goal Setting + Stats in sync so the target slider remembers the user's chosen goal.
          const uid = await resolveAuthUserId(supabase);
          if (uid) {
            const { error: goalSyncError } = await supabase
              .from("player_goals")
              .update({
                current_handicap: newGoal,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", uid);
            if (goalSyncError) {
              console.warn("[StatsPage] player_goals handicap sync failed:", goalSyncError.message);
            }
          }
        } catch (err) {
          console.error('Failed to update goal handicap:', err);
        }
      }
    }, 1000); // 1 second debounce for the DB update
  };

  const handleSeedSampleRounds = async () => {
    setSeedingSampleRounds(true);
    setSeedSampleError("");
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const uid = user?.id ?? (await resolveAuthUserId(supabase));
      if (!uid) {
        throw new Error("Sign in to load sample rounds.");
      }

      const rows = buildDummyRoundsForUser(uid);
      const { data, error } = await supabase
        .from("rounds")
        .insert(rows)
        .select("id, date, course_name, score, holes");

      if (error) {
        throw new Error(error.message || "Failed to load sample rounds.");
      }

      if (!data?.length) {
        throw new Error("No sample rounds were inserted.");
      }

      refreshRounds?.();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("roundsUpdated"));
      }
    } catch (err) {
      setSeedSampleError(err instanceof Error ? err.message : "Failed to load sample rounds.");
    } finally {
      setSeedingSampleRounds(false);
    }
  };
  
  const [selectedMetric, setSelectedMetric] = useState<TrendMetricId>('nettScore');
  /** Rounds window for every player-stats section below Trend Analysis (not the trend chart itself). */
  const [playerStatsScope, setPlayerStatsScope] = useState<"LAST 5" | "LAST 10" | "LAST 20" | "ALL">("ALL");
  const [forceLoaded, setForceLoaded] = useState(false);
  const [metricMatrixWorstFirst, setMetricMatrixWorstFirst] = useState(false);
  const [playerGoalRow, setPlayerGoalRow] = useState<PlayerGoalRow | null>(null);
  const [, setPlayerGoalsLoaded] = useState(false);
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({
    trendAnalysis: false,
    coreScoring: false,
    scoring: false,
    distribution: false,
    fullMatrix: true,
    strokeOpportunities: false,
    driving: false,
    approach: false,
    advancedApproach: true,
    shortGame: false,
    putting: false,
    penalties: false,
  });
  const [perfStatsForMatrix, setPerfStatsForMatrix] = useState<Record<string, unknown>[]>([]);
  const [statsProfileTrophies, setStatsProfileTrophies] = useState<AcademyTrophyDbRow[]>([]);
  const [statsTrophySummary, setStatsTrophySummary] = useState<{ total: number; rank: number | null }>({
    total: 0,
    rank: null,
  });

  const toggleCard = useCallback((key: string) => {
    setCollapsedCards((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Prefer Goal Setting's saved handicap, fallback to profile handicap.
  useEffect(() => {
    const goalHandicapRaw = playerGoalRow?.current_handicap;
    const hasGoalHandicap =
      goalHandicapRaw !== null &&
      goalHandicapRaw !== undefined &&
      String(goalHandicapRaw).trim() !== "";

    if (hasGoalHandicap) {
      const parsed = Number(goalHandicapRaw);
      if (Number.isFinite(parsed)) {
        setSelectedGoal(clampTargetGoalHandicap(parsed));
        return;
      }
    }

    if (user?.initialHandicap !== undefined) {
      setSelectedGoal(clampTargetGoalHandicap(user.initialHandicap));
    }
  }, [playerGoalRow?.current_handicap, user?.initialHandicap]);

  const scopedPlayerStatsRounds = useMemo(() => {
    if (!safeRounds.length) return [];
    const chronological = [...safeRounds].sort((a, b) => roundSortTimeMs(a) - roundSortTimeMs(b));
    if (playerStatsScope === "ALL") return chronological;
    const cap = playerStatsScope === "LAST 5" ? 5 : playerStatsScope === "LAST 10" ? 10 : 20;
    return chronological.slice(-Math.min(cap, chronological.length));
  }, [safeRounds, playerStatsScope]);

  /** Min/max round dates for loading `performance_stats` rows — matches scoped rounds below Trend Analysis. */
  const roundsPerfDateSpan = useMemo(() => {
    if (!scopedPlayerStatsRounds.length) return null;
    const days = scopedPlayerStatsRounds
      .map((r) => (typeof r.date === "string" ? r.date.slice(0, 10) : ""))
      .filter((d) => d.length >= 8)
      .sort();
    if (!days.length) return null;
    return { start: days[0]!, end: days[days.length - 1]! };
  }, [scopedPlayerStatsRounds]);

  // Emergency Timeout: Force setForceLoaded(true) after 3 seconds only if still loading
  useEffect(() => {
    // Don't set timeout if data has already loaded
    if (!statsLoading && rounds !== undefined) {
      setForceLoaded(true);
      return;
    }
    
    const timeout = setTimeout(() => {
      if (statsLoading) {
        setForceLoaded(true);
        console.log('Emergency timeout: Forcing Stats component to render after 3 seconds');
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [statsLoading, rounds]);

  // Performance_stats in your round date span — extra matrix rows match coach deep dive
  useEffect(() => {
    if (!user?.id || !roundsPerfDateSpan) {
      setPerfStatsForMatrix([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { start, end } = roundsPerfDateSpan;
        const { data, error } = await supabase
          .from("performance_stats")
          .select("*")
          .eq("user_id", user.id)
          .gte("date", start)
          .lte("date", end)
          .order("date", { ascending: true });
        if (!cancelled) {
          if (error || !data?.length) setPerfStatsForMatrix([]);
          else setPerfStatsForMatrix(data as Record<string, unknown>[]);
        }
      } catch {
        if (!cancelled) setPerfStatsForMatrix([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, roundsPerfDateSpan?.start, roundsPerfDateSpan?.end]);

  const fetchPlayerGoals = useCallback(async () => {
    if (!user?.id) {
      setPlayerGoalRow(null);
      setPlayerGoalsLoaded(true);
      return;
    }
    setPlayerGoalsLoaded(false);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const uid = await resolveAuthUserId(supabase);
      if (!uid) {
        console.warn("[StatsPage] player_goals: no Supabase auth user (JWT not ready for RLS).");
        setPlayerGoalRow(null);
        return;
      }
      const { data, error } = await supabase
        .from("player_goals")
        .select(
          "user_id, scoring_milestone, focus_area, weekly_hour_commitment, practice_allocation, lowest_score, current_handicap, updated_at",
        )
        .eq("user_id", uid)
        .maybeSingle();

      if (error) {
        console.warn("[StatsPage] player_goals:", error.message, error.code);
        setPlayerGoalRow(null);
      } else {
        setPlayerGoalRow((data ?? null) as PlayerGoalRow | null);
      }
    } catch (e) {
      console.warn("[StatsPage] player_goals fetch failed", e);
      setPlayerGoalRow(null);
    } finally {
      setPlayerGoalsLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchPlayerGoals();
  }, [fetchPlayerGoals]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onGoalsUpdated = () => void fetchPlayerGoals();
    window.addEventListener("playerGoalsUpdated", onGoalsUpdated);
    return () => window.removeEventListener("playerGoalsUpdated", onGoalsUpdated);
  }, [fetchPlayerGoals]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof window !== "undefined" && !window.location.pathname.includes("stats")) return;
      void fetchPlayerGoals();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchPlayerGoals]);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        if (cancelled) return;
        const supabase = createClient();
        const {
          data: { subscription: sub },
        } = supabase.auth.onAuthStateChange((event, session) => {
          if (
            (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
            session?.user
          ) {
            void fetchPlayerGoals();
          }
        });
        subscription = sub;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [fetchPlayerGoals]);

  // Get benchmark goals based on selected goal handicap
  const goals = getBenchmarkGoals(selectedGoal);

  const { bigSix, metricMatrix } = useMemo(() => {
    const g = getBenchmarkGoals(selectedGoal);
    return computeDeepDiveRoundMetrics(scopedPlayerStatsRounds as unknown as Record<string, unknown>[], g, {
      perfStatsData: perfStatsForMatrix,
    });
  }, [scopedPlayerStatsRounds, selectedGoal, perfStatsForMatrix]);

  const strokeOpportunityRows = useMemo(
    () => computeStrokeOpportunityTop3(metricMatrix.filter((row) => row.name !== "Scoring Avg")),
    [metricMatrix],
  );

  const sortedMetricMatrix = useMemo(
    () => sortMetricMatrix(metricMatrix, metricMatrixWorstFirst),
    [metricMatrix, metricMatrixWorstFirst],
  );

  const matrixSummary = useMemo(
    () => ({
      met: metricMatrix.filter((r) => (r.isLowerBetter ? r.current <= r.goal : r.current >= r.goal)).length,
      total: metricMatrix.length,
    }),
    [metricMatrix],
  );

  const hasRoundData = scopedPlayerStatsRounds.length > 0;
  const hasDirectionalShots = scopedPlayerStatsRounds.some(
    (r) => Array.isArray(r.approachDirectionalShots) && r.approachDirectionalShots.length > 0,
  );

  const statsProfileDisplayName = useMemo(() => {
    if (user?.fullName?.trim()) return user.fullName.trim();
    const em = user?.email?.trim();
    if (em && em.includes("@")) return em.split("@")[0] ?? APP_VIDEO_COACH_NAME;
    return APP_VIDEO_COACH_NAME;
  }, [user?.fullName, user?.email]);

  const heroHandicap = useMemo(() => {
    if (user?.initialHandicap != null && Number.isFinite(user.initialHandicap)) {
      return user.initialHandicap;
    }
    return selectedGoal;
  }, [user?.initialHandicap, selectedGoal]);

  const statsProfileHeroCompact = useMemo(() => {
    const noRange = safeRounds.length === 0 && personalPractice.length === 0;
    const noXp = user?.totalXP == null || user.totalXP <= 0;
    return noRange && noXp;
  }, [safeRounds.length, personalPractice.length, user?.totalXP]);

  useEffect(() => {
    if (!user?.id) {
      setStatsProfileTrophies([]);
      setStatsTrophySummary({ total: 0, rank: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { rows, error } = await fetchUserTrophiesForUser(supabase, user.id);
        if (cancelled) return;
        if (error) {
          setStatsProfileTrophies([]);
          setStatsTrophySummary({ total: 0, rank: null });
          return;
        }
        const enriched: AcademyTrophyDbRow[] = rows.map((r) => {
          const def = TROPHY_LIST.find((t) => t.id === r.achievement_id);
          return {
            achievement_id: r.achievement_id,
            earned_at: r.earned_at,
            id: r.achievement_id,
            trophy_name: def?.name ?? r.achievement_id,
            description: r.description,
            trophy_icon: r.trophy_icon,
          };
        });
        setStatsProfileTrophies(enriched);

        const deduped = new Set(
          enriched.map((e) => (e.achievement_id || "").trim().toLowerCase()).filter(Boolean),
        ).size;
        let totalMerged = deduped;
        let rank: number | null = null;
        try {
          const vr = await fetchTrophyCollectionRankForUser(supabase, user.id);
          rank = vr.rank;
          const rpcTotal = Number.isFinite(vr.totalDbEvents) ? vr.totalDbEvents : 0;
          totalMerged = Math.max(deduped, rpcTotal);
        } catch {
          // RPC missing or not authorized — keep distinct count from rows only
        }
        if (!cancelled) setStatsTrophySummary({ total: totalMerged, rank });
      } catch {
        if (!cancelled) {
          setStatsProfileTrophies([]);
          setStatsTrophySummary({ total: 0, rank: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Calculate ALL performance metrics for tiles (-1 = no data sentinel for AnimatedNumber)
  const performanceMetrics = useMemo(() => {
    if (scopedPlayerStatsRounds.length === 0) {
      return {
        // DRIVING
        firPercent: -1,
        missedLeft: -1,
        missedRight: -1,
        totalFirShots: 0,
        firHit: 0,
        firMissed: 0,
        // APPROACH
        girPercent: -1,
        gir8ft: -1,
        gir20ft: -1,
        // SHORT GAME
        upAndDownPercent: -1,
        bunkerSaves: -1,
        chipInside6ft: -1,
        // PUTTING
        avgPutts: -1,
        puttsUnder6ftMake: -1,
        avgThreePutts: -1,
        // PENALTIES
        teePenalties: -1,
        approachPenalties: -1,
        totalPenalties: -1,
        doublesPerRound: -1,
      };
    }

    type StatsRound = (typeof scopedPlayerStatsRounds)[number];
    const rs = scopedPlayerStatsRounds;
    const sum = (list: StatsRound[], value: (r: StatsRound) => number | null | undefined) =>
      list.reduce((s, r) => s + (value(r) || 0), 0);
    const holesIn = (list: StatsRound[]) => sum(list, (r) => r.holes || 18);
    // -1 = no data: only rounds where the player tracked a stat count towards it.
    const pct = (made: number, total: number) => (total > 0 ? (made / total) * 100 : -1);
    const per18 = (list: StatsRound[], value: (r: StatsRound) => number | null | undefined) => {
      const holes = holesIn(list);
      return list.length > 0 && holes > 0 ? (sum(list, value) / holes) * 18 : -1;
    };
    const oneDp = (v: number) => (v < 0 ? -1 : Math.round(v * 10) / 10);
    const upDownAttempts = (r: StatsRound) =>
      upAndDownAttempts(r.upAndDownConversions || 0, r.missed || 0, r.created_at ?? r.date);

    // DRIVING: FIR percentage and shot breakdown
    const fairwayRounds = roundsTrackingStat(rs, "fairways");
    const totalFir = sum(fairwayRounds, (r) =>
      fairwaysPossibleFor(r.firHit || 0, r.firLeft || 0, r.firRight || 0, r.fairwaysPossible),
    );
    const firHit = sum(fairwayRounds, (r) => r.firHit);
    const firLeft = sum(fairwayRounds, (r) => r.firLeft);
    const firRight = sum(fairwayRounds, (r) => r.firRight);

    // APPROACH: GIR and proximity as % of holes
    const girRounds = roundsTrackingStat(rs, "gir");
    const proximityRounds = roundsTrackingStat(rs, "gir_proximity");

    // SHORT GAME: made / attempts
    const scrambleRounds = roundsTrackingStat(rs, "scrambling");
    const sandRounds = roundsTrackingStat(rs, "sand_saves");
    const chipRounds = roundsTrackingStat(rs, "chipping", "scrambling");

    // PUTTING
    const shortPuttRounds = roundsTrackingStat(rs, "short_putts");
    const shortPuttMake = pct(sum(shortPuttRounds, (r) => r.made6ftAndIn), sum(shortPuttRounds, (r) => r.puttsUnder6ftAttempts));

    const penaltyRounds = roundsTrackingStat(rs, "penalties");

    return {
      // DRIVING
      firPercent: oneDp(pct(firHit, totalFir)),
      missedLeft: oneDp(pct(firLeft, totalFir)),
      missedRight: oneDp(pct(firRight, totalFir)),
      totalFirShots: totalFir,
      firHit: firHit,
      firMissed: firLeft + firRight,
      // APPROACH
      girPercent: oneDp(pct(sum(girRounds, (r) => r.totalGir), holesIn(girRounds))),
      gir8ft: oneDp(pct(sum(proximityRounds, (r) => r.gir8ft), holesIn(proximityRounds))),
      gir20ft: oneDp(pct(sum(proximityRounds, (r) => r.gir20ft), holesIn(proximityRounds))),
      // SHORT GAME
      upAndDownPercent: oneDp(
        pct(sum(scrambleRounds, (r) => r.upAndDownConversions), sum(scrambleRounds, upDownAttempts)),
      ),
      bunkerSaves: oneDp(
        pct(
          sum(sandRounds, (r) => r.bunkerSaves),
          sum(sandRounds, (r) => sandSaveAttempts(r.bunkerSaves || 0, r.bunkerAttempts || 0)),
        ),
      ),
      chipInside6ft: oneDp(pct(sum(chipRounds, (r) => r.chipInside6ft), sum(chipRounds, upDownAttempts))),
      // PUTTING
      avgPutts: oneDp(per18(roundsTrackingStat(rs, "putts"), (r) => r.totalPutts)),
      puttsUnder6ftMake: shortPuttMake < 0 ? -1 : Math.round(shortPuttMake),
      avgThreePutts: oneDp(per18(roundsTrackingStat(rs, "three_putts"), (r) => r.threePutts)),
      // PENALTIES
      teePenalties: oneDp(per18(penaltyRounds, (r) => r.teePenalties)),
      approachPenalties: oneDp(per18(penaltyRounds, (r) => r.approachPenalties)),
      totalPenalties: oneDp(per18(penaltyRounds, (r) => r.totalPenalties)),
      doublesPerRound: oneDp(per18(roundsTrackingStat(rs, "distribution"), (r) => r.doubleBogeys)),
    };
  }, [scopedPlayerStatsRounds]);

  /** Averages laid out like the MiScore post-round summary (-1 = no data). */
  const roundSummary = useMemo(() => {
    type StatsRound = (typeof scopedPlayerStatsRounds)[number];
    const rs = scopedPlayerStatsRounds;
    const finite = (list: StatsRound[], value: (r: StatsRound) => number | null | undefined) =>
      list.map(value).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : -1);
    const per18 = (list: StatsRound[], value: (r: StatsRound) => number | null | undefined) => {
      const holes = list.reduce((s, r) => s + (r.holes || 18), 0);
      return list.length > 0 && holes > 0 ? (list.reduce((s, r) => s + (value(r) || 0), 0) / holes) * 18 : -1;
    };

    const ninesRounds = roundsTrackingStat(rs, "front_back");
    const fairwayRounds = roundsTrackingStat(rs, "fairways");
    const girRounds = roundsTrackingStat(rs, "gir");
    const scrambleRounds = roundsTrackingStat(rs, "scrambling");
    const sandRounds = roundsTrackingStat(rs, "sand_saves");
    const distRounds = roundsTrackingStat(rs, "distribution");
    const tripleRounds = distRounds.filter((r) => r.tripleBogeys != null);

    return {
      grossAvg: avg(finite(rs, (r) => r.score)),
      nettAvg: avg(finite(rs, (r) => r.nett)),
      stableford: per18(
        roundsTrackingStat(rs, "stableford").filter((r) => r.stableford != null),
        (r) => r.stableford,
      ),
      frontNine: avg(finite(ninesRounds, (r) => r.frontNine)),
      backNine: avg(finite(ninesRounds, (r) => r.backNine)),
      fairwaysHit: per18(fairwayRounds, (r) => r.firHit),
      fairwaysPossible: per18(fairwayRounds, (r) =>
        fairwaysPossibleFor(r.firHit || 0, r.firLeft || 0, r.firRight || 0, r.fairwaysPossible),
      ),
      girPerRound: per18(girRounds, (r) => r.totalGir),
      puttsPerGir: avg(finite(roundsTrackingStat(rs, "putts_per_gir"), (r) => r.puttsPerGir)),
      upDownsMade: per18(scrambleRounds, (r) => r.upAndDownConversions),
      upDownsAttempts: per18(scrambleRounds, (r) =>
        upAndDownAttempts(r.upAndDownConversions || 0, r.missed || 0, r.created_at ?? r.date),
      ),
      sandSaves: per18(sandRounds, (r) => r.bunkerSaves),
      sandAttempts: per18(sandRounds, (r) => sandSaveAttempts(r.bunkerSaves || 0, r.bunkerAttempts || 0)),
      distribution: {
        eagles: per18(distRounds, (r) => r.eagles),
        birdies: per18(distRounds, (r) => r.birdies),
        pars: per18(distRounds, (r) => r.pars),
        bogeys: per18(distRounds, (r) => r.bogeys),
        doubleBogeys: per18(distRounds, (r) => (r.doubleBogeys || 0) - (r.tripleBogeys ?? 0)),
        tripleBogeys: per18(tripleRounds, (r) => r.tripleBogeys),
      },
    };
  }, [scopedPlayerStatsRounds]);

  // ============================================
  // NOW WE CAN DO CONDITIONAL RETURNS
  // ============================================
  
  // Show loading state (with emergency timeout bypass)
  if ((authLoading || statsLoading) && !forceLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f4]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-stone-600">Loading...</p>
        </div>
      </div>
    );
  }

  const distributionRows: {
    key: keyof typeof roundSummary.distribution;
    label: string;
    goal?: number;
    lowerIsBetter?: boolean;
  }[] = [
    { key: "eagles", label: "Eagles or better" },
    { key: "birdies", label: "Birdies", goal: goals.birdies },
    { key: "pars", label: "Pars", goal: goals.pars },
    { key: "bogeys", label: "Bogeys", goal: goals.bogeys, lowerIsBetter: true },
    { key: "doubleBogeys", label: "Double bogeys" },
    { key: "tripleBogeys", label: "Triple bogey+" },
  ];

  return (
    <div className="coach-deepdive-root w-full max-w-3xl overflow-x-hidden bg-[#f4f6f4] min-w-0 mx-auto">
      {/* Single column scroll lives on AppFrame <main>; avoid nested overflow-y here or the bottom of the page never scrolls into view. */}
      <div className="overflow-x-hidden px-4 pb-32 pt-4 min-w-0">
        <TourPlayerProfileHero
          playerName={statsProfileDisplayName}
          rank={statsTrophySummary.rank}
          handicap={heroHandicap}
          trophies={statsTrophySummary.total}
          practiceHours={practiceHoursTotal}
          preferredIconId={user?.preferredIconId}
        />

        <div className="mt-4 mb-5">
          <ProfileSegmentedTabs
            value={profileTab}
            onChange={setProfileTab}
            badges={{ coaching: coachingUnread }}
          />
        </div>

        {profileTab === "stats" ? (
          <div className="mb-8 min-w-0 space-y-4">
            {user?.id && safeRounds.length === 0 ? (
              <section className="rounded-3xl border border-dashed border-[#FFA500]/50 bg-orange-50/80 p-5">
                <p className="text-sm font-semibold text-stone-800">No rounds logged yet</p>
                <p className="mt-1 text-xs text-stone-600">
                  Load three sample rounds with full stats to preview this page.
                </p>
                <button
                  type="button"
                  onClick={handleSeedSampleRounds}
                  disabled={seedingSampleRounds}
                  className="mt-3 rounded-full bg-[#FFA500] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e69500] disabled:opacity-60"
                >
                  {seedingSampleRounds ? "Loading sample rounds…" : "Load sample rounds"}
                </button>
                {seedSampleError ? <p className="mt-2 text-xs font-medium text-red-600">{seedSampleError}</p> : null}
              </section>
            ) : null}

            <section className="rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[#014421]">Your benchmark</h2>
                  <p className="text-xs text-stone-500">Every target on this page is set for this handicap.</p>
                </div>
                <p className="shrink-0 text-right">
                  <span className="block text-2xl font-bold tabular-nums text-[#014421]">
                    {selectedGoal < 0 ? `+${Math.abs(selectedGoal)}` : selectedGoal}
                  </span>
                  <span className="block text-[11px] font-medium text-stone-500">
                    {selectedGoal <= 0 ? "Pro level" : "Handicap"}
                  </span>
                </p>
              </div>
              <input
                type="range"
                min={-5}
                max={54}
                step={1}
                value={selectedGoal}
                onChange={handleGoalChange}
                aria-label="Target handicap"
                className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-stone-200 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#FFA500] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white"
                style={{
                  background: `linear-gradient(to right, #014421 0%, #014421 ${((selectedGoal + 5) / 59) * 100}%, #e7e5e4 ${((selectedGoal + 5) / 59) * 100}%, #e7e5e4 100%)`,
                }}
              />
              <div className="mt-1 flex justify-between text-[10px] font-medium text-stone-400">
                <span>+5 (pro)</span>
                <span>54</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-800">Rounds to include</p>
                  <p className="text-[11px] text-stone-500">
                    Using {scopedPlayerStatsRounds.length} of {safeRounds.length} logged rounds
                  </p>
                </div>
                <Segmented
                  label="Rounds to include"
                  value={playerStatsScope}
                  onChange={setPlayerStatsScope}
                  options={[
                    { id: "LAST 5", label: "Last 5" },
                    { id: "LAST 10", label: "10" },
                    { id: "LAST 20", label: "20" },
                    { id: "ALL", label: "All" },
                  ]}
                />
              </div>
            </section>

            <StatsCard
              id="stats-core-scoring-metrics"
              title="At a glance"
              subtitle="Your averages against the benchmark"
              open={!collapsedCards.coreScoring}
              onToggle={() => toggleCard("coreScoring")}
            >
              {bigSix ? (
                <>
                  {matrixSummary.total > 0 && (
                    <div className="mb-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-800">
                          {matrixSummary.met} of {matrixSummary.total} stats on target
                        </p>
                        <span className="text-xs font-medium text-stone-500">
                          {Math.round((matrixSummary.met / matrixSummary.total) * 100)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-[#014421]"
                          style={{ width: `${(matrixSummary.met / matrixSummary.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <HeadlineStatTile
                      label="Scoring average"
                      value={roundSummary.grossAvg}
                      goal={goals.score}
                      lowerIsBetter
                    />
                    <HeadlineStatTile label="Greens in regulation" value={bigSix.girPct} goal={goals.gir} unit="%" />
                    <HeadlineStatTile label="Fairways hit" value={bigSix.firPct} goal={goals.fir} unit="%" />
                    <HeadlineStatTile label="Scrambling" value={bigSix.scramblePct} goal={goals.upAndDown} unit="%" />
                    <HeadlineStatTile label="Putts per round" value={bigSix.puttsPer18} goal={goals.putts} lowerIsBetter />
                    <HeadlineStatTile label="Birdies per round" value={bigSix.birdiesPer18} goal={goals.birdies} />
                  </div>
                </>
              ) : (
                <p className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                  Log a round with a score to see your averages.
                </p>
              )}
            </StatsCard>

            <StatsCard
              title="Where you're losing shots"
              subtitle="Biggest gaps to your benchmark"
              open={!collapsedCards.strokeOpportunities}
              onToggle={() => toggleCard("strokeOpportunities")}
            >
              {strokeOpportunityRows.length > 0 ? (
                <ol className="space-y-2">
                  {strokeOpportunityRows.map((row, idx) => {
                    const unit = row.name.includes("%") ? "%" : "";
                    return (
                      <li key={`${row.name}-${idx}`} className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#014421] text-xs font-bold text-white">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-stone-900">{row.name}</p>
                          <p className="text-[11px] text-stone-500">
                            Now {fmtStat(row.current)}
                            {unit} · target {fmtStat(row.goal)}
                            {unit}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-base font-bold tabular-nums text-orange-600">
                            {fmtStat(row.estimatedGain, row.estimatedGain < 0.1 ? 2 : 1)}
                          </p>
                          <p className="text-[10px] text-stone-500">shots a round</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="rounded-2xl bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
                  {hasRoundData ? "No big gaps. You're on target across the board." : "Log a round to see where shots go."}
                </p>
              )}
              {hasRoundData && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-stone-500">Scoring leaks per round</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { label: "Penalties", value: performanceMetrics.totalPenalties },
                        { label: "3-putts", value: performanceMetrics.avgThreePutts },
                        { label: "Double or worse", value: performanceMetrics.doublesPerRound },
                      ] as const
                    ).map((leak) => (
                      <div key={leak.label} className="rounded-2xl bg-stone-50 px-2 py-3 text-center">
                        <p className="text-xl font-bold tabular-nums text-stone-900">{leak.value < 0 ? "–" : fmtStat(leak.value)}</p>
                        <p className="text-[11px] text-stone-500">{leak.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </StatsCard>

            <StatsCard
              title="Trends"
              subtitle="How your stats are moving over time"
              open={!collapsedCards.trendAnalysis}
              onToggle={() => toggleCard("trendAnalysis")}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedMetric}
                    onChange={(e) => setSelectedMetric(e.target.value as TrendMetricId)}
                    aria-label="Stat to chart"
                    className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-[#014421]"
                  >
                    {TREND_METRICS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <StatTrendChart rounds={safeRounds} metricId={selectedMetric} goals={goals} />
              </div>
            </StatsCard>

            {hasRoundData && (
              <div className="px-1 pt-2">
                <h2 className="text-sm font-bold text-stone-900">Round stats</h2>
                <p className="text-xs text-stone-500">
                  Grouped like your MiScore summary. Stats you don&apos;t track are left out.
                </p>
              </div>
            )}

            {roundSummary.grossAvg >= 0 && (
              <StatsCard
                title="Scoring"
                subtitle="Averages per round"
                open={!collapsedCards.scoring}
                onToggle={() => toggleCard("scoring")}
              >
                <div className="divide-y divide-stone-100">
                  <TargetStatRow
                    label="Gross"
                    value={roundSummary.grossAvg}
                    goal={goals.score}
                    lowerIsBetter
                  />
                  <TargetStatRow label="Nett" value={roundSummary.nettAvg} />
                  {roundSummary.stableford >= 0 && (
                    <TargetStatRow
                      label="Stableford"
                      value={roundSummary.stableford}
                      sub="Points a round · 36 is playing to your handicap"
                    />
                  )}
                  {roundSummary.frontNine >= 0 && <TargetStatRow label="Front 9" value={roundSummary.frontNine} />}
                  {roundSummary.backNine >= 0 && <TargetStatRow label="Back 9" value={roundSummary.backNine} />}
                </div>
              </StatsCard>
            )}

            {performanceMetrics.firPercent >= 0 && (
              <StatsCard
                title="Driving"
                subtitle="Fairways and where you miss"
                open={!collapsedCards.driving}
                onToggle={() => toggleCard("driving")}
              >
                <div className="divide-y divide-stone-100">
                  <TargetStatRow label="Fairways hit" value={performanceMetrics.firPercent} goal={goals.fir} unit="%" />
                  <TargetStatRow
                    label="Fairways a round"
                    value={roundSummary.fairwaysHit}
                    display={pairText(roundSummary.fairwaysHit, roundSummary.fairwaysPossible)}
                    sub="Hit / possible (par 3s left out)"
                  />
                </div>
                {performanceMetrics.totalFirShots > 0 && (
                  <div className="mt-3 rounded-xl bg-stone-50 p-3">
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-stone-200">
                      <div className="bg-stone-400" style={{ width: `${performanceMetrics.missedLeft}%` }} />
                      <div className="bg-[#014421]" style={{ width: `${performanceMetrics.firPercent}%` }} />
                      <div className="bg-[#FFA500]" style={{ width: `${performanceMetrics.missedRight}%` }} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 text-[11px] text-stone-600">
                      {(
                        [
                          { label: "Missed left", value: performanceMetrics.missedLeft, dot: "bg-stone-400", align: "text-left" },
                          { label: "Hit", value: performanceMetrics.firPercent, dot: "bg-[#014421]", align: "text-center" },
                          { label: "Missed right", value: performanceMetrics.missedRight, dot: "bg-[#FFA500]", align: "text-right" },
                        ] as const
                      ).map((part) => (
                        <span key={part.label} className={part.align}>
                          <span className="block text-sm font-bold tabular-nums text-stone-900">{fmtStat(part.value)}%</span>
                          <span className="inline-flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${part.dot}`} aria-hidden />
                            {part.label}
                          </span>
                        </span>
                      ))}
                    </div>
                    {performanceMetrics.firMissed > 0 && (
                      <p className="mt-2 border-t border-stone-200 pt-2 text-center text-[11px] text-stone-500">
                        {performanceMetrics.missedLeft > performanceMetrics.missedRight
                          ? "Most misses go left"
                          : performanceMetrics.missedRight > performanceMetrics.missedLeft
                            ? "Most misses go right"
                            : "Misses split evenly"}
                      </p>
                    )}
                  </div>
                )}
              </StatsCard>
            )}

            {(performanceMetrics.girPercent >= 0 || performanceMetrics.gir8ft >= 0) && (
              <StatsCard
                title="Approach"
                subtitle="Greens hit and how close you finish"
                open={!collapsedCards.approach}
                onToggle={() => toggleCard("approach")}
              >
                <div className="divide-y divide-stone-100">
                  {performanceMetrics.girPercent >= 0 && (
                    <>
                      <TargetStatRow
                        label="Greens in regulation"
                        value={performanceMetrics.girPercent}
                        goal={goals.gir}
                        unit="%"
                      />
                      <TargetStatRow
                        label="Greens a round"
                        value={roundSummary.girPerRound}
                        display={pairText(roundSummary.girPerRound, 18)}
                        sub="Hit / holes"
                      />
                    </>
                  )}
                  {performanceMetrics.gir8ft >= 0 && (
                    <>
                      <TargetStatRow
                        label="Green inside 8 ft"
                        hint="(2.4 m)"
                        value={performanceMetrics.gir8ft}
                        goal={goals.within8ft}
                        unit="%"
                      />
                      <TargetStatRow
                        label="Green inside 20 ft"
                        hint="(6.1 m)"
                        value={performanceMetrics.gir20ft}
                        goal={goals.within20ft}
                        unit="%"
                      />
                    </>
                  )}
                </div>
              </StatsCard>
            )}

            {(performanceMetrics.avgPutts >= 0 ||
              roundSummary.puttsPerGir >= 0 ||
              performanceMetrics.avgThreePutts >= 0 ||
              performanceMetrics.puttsUnder6ftMake >= 0) && (
              <StatsCard
                title="Putting"
                subtitle="Putts, putts per GIR and 3-putts"
                open={!collapsedCards.putting}
                onToggle={() => toggleCard("putting")}
              >
                <div className="divide-y divide-stone-100">
                  {performanceMetrics.avgPutts >= 0 && (
                    <TargetStatRow
                      label="Putts a round"
                      value={performanceMetrics.avgPutts}
                      goal={goals.putts}
                      lowerIsBetter
                    />
                  )}
                  {roundSummary.puttsPerGir >= 0 && (
                    <TargetStatRow
                      label="Putts per GIR"
                      value={roundSummary.puttsPerGir}
                      display={roundSummary.puttsPerGir.toFixed(2)}
                    />
                  )}
                  {performanceMetrics.avgThreePutts >= 0 && (
                    <TargetStatRow
                      label="3-putts a round"
                      value={performanceMetrics.avgThreePutts}
                      goal={Math.max(0, goals.putts / 18 - 1)}
                      lowerIsBetter
                    />
                  )}
                  {performanceMetrics.puttsUnder6ftMake >= 0 && (
                    <TargetStatRow
                      label="Makes inside 6 ft"
                      hint="(1.8 m)"
                      value={performanceMetrics.puttsUnder6ftMake}
                      goal={goals.puttMake6ft}
                      unit="%"
                    />
                  )}
                </div>
              </StatsCard>
            )}

            {(performanceMetrics.upAndDownPercent >= 0 ||
              performanceMetrics.bunkerSaves >= 0 ||
              performanceMetrics.chipInside6ft >= 0) && (
              <StatsCard
                title="Short game"
                subtitle="Getting up and down"
                open={!collapsedCards.shortGame}
                onToggle={() => toggleCard("shortGame")}
              >
                <div className="divide-y divide-stone-100">
                  {performanceMetrics.upAndDownPercent >= 0 && (
                    <>
                      <TargetStatRow
                        label="Scrambling"
                        value={performanceMetrics.upAndDownPercent}
                        goal={goals.upAndDown}
                        unit="%"
                      />
                      <TargetStatRow
                        label="Up & downs a round"
                        value={roundSummary.upDownsMade}
                        display={pairText(roundSummary.upDownsMade, roundSummary.upDownsAttempts)}
                        sub="Converted / attempts"
                      />
                    </>
                  )}
                  {performanceMetrics.bunkerSaves >= 0 && (
                    <TargetStatRow
                      label="Sand saves"
                      value={performanceMetrics.bunkerSaves}
                      goal={goals.bunkerSaves}
                      unit="%"
                    />
                  )}
                  {performanceMetrics.chipInside6ft >= 0 && (
                    <TargetStatRow
                      label="Chips inside 6 ft"
                      hint="(1.8 m)"
                      value={performanceMetrics.chipInside6ft}
                      goal={goals.chipsInside6ft}
                      unit="%"
                    />
                  )}
                </div>
              </StatsCard>
            )}

            {roundSummary.distribution.pars >= 0 && (
              <StatsCard
                title="Scoring distribution"
                subtitle="Holes a round by score"
                open={!collapsedCards.distribution}
                onToggle={() => toggleCard("distribution")}
              >
                <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                  {distributionRows.map((row) =>
                    roundSummary.distribution[row.key] > 0 ? (
                      <div
                        key={row.key}
                        style={{
                          flexGrow: roundSummary.distribution[row.key],
                          backgroundColor: SCORE_DISTRIBUTION_COLORS[row.key],
                        }}
                      />
                    ) : null,
                  )}
                </div>
                <div className="divide-y divide-stone-100">
                  {distributionRows.map((row) => (
                    <TargetStatRow
                      key={row.key}
                      label={row.label}
                      dot={SCORE_DISTRIBUTION_COLORS[row.key]}
                      value={roundSummary.distribution[row.key]}
                      goal={row.goal}
                      lowerIsBetter={row.lowerIsBetter}
                    />
                  ))}
                </div>
              </StatsCard>
            )}

            {performanceMetrics.totalPenalties >= 0 && (
              <StatsCard
                title="Penalties"
                subtitle="Shots given away a round"
                open={!collapsedCards.penalties}
                onToggle={() => toggleCard("penalties")}
              >
                <div className="divide-y divide-stone-100">
                  <TargetStatRow
                    label="Off the tee"
                    value={performanceMetrics.teePenalties}
                    goal={goals.teePenalties}
                    lowerIsBetter
                  />
                  <TargetStatRow
                    label="On approach"
                    value={performanceMetrics.approachPenalties}
                    goal={goals.approachPenalties}
                    lowerIsBetter
                  />
                  <TargetStatRow
                    label="Total"
                    value={performanceMetrics.totalPenalties}
                    goal={goals.totalPenalties}
                    lowerIsBetter
                  />
                </div>
              </StatsCard>
            )}

            {hasDirectionalShots && (
              <StatsCard
                id="stats-advanced-approach"
                title="Approach detail"
                subtitle="Misses and GIR map from Add Directional Misses"
                open={!collapsedCards.advancedApproach}
                onToggle={() => toggleCard("advancedApproach")}
              >
                <AdvancedApproachStatsPanel
                  rounds={scopedPlayerStatsRounds}
                  showHeader={false}
                  className="border-0! p-0! shadow-none! sm:p-0!"
                />
              </StatsCard>
            )}

            <StatsCard
              id="full-metric-matrix"
              title="Every stat"
              subtitle={
                matrixSummary.total > 0
                  ? `${matrixSummary.met} of ${matrixSummary.total} on target`
                  : "All your numbers against the benchmark"
              }
              open={!collapsedCards.fullMatrix}
              onToggle={() => toggleCard("fullMatrix")}
            >
              {metricMatrix.length > 0 ? (
                <>
                  <div className="mb-3">
                    <Segmented
                      label="Sort stats"
                      value={metricMatrixWorstFirst ? "gaps" : "best"}
                      onChange={(v) => setMetricMatrixWorstFirst(v === "gaps")}
                      options={[
                        { id: "best", label: "Strongest first" },
                        { id: "gaps", label: "Biggest gaps first" },
                      ]}
                    />
                  </div>
                  <ul className="divide-y divide-stone-100">
                    {sortedMetricMatrix.map((stat, i) => {
                      const met = stat.isLowerBetter ? stat.current <= stat.goal : stat.current >= stat.goal;
                      const improving = stat.trend === (stat.isLowerBetter ? "down" : "up");
                      const slipping = stat.trend === (stat.isLowerBetter ? "up" : "down");
                      return (
                        <li key={`${stat.name}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
                              <span className="truncate">{stat.name}</span>
                              {improving && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Improving" />}
                              {slipping && <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="Slipping" />}
                            </p>
                            <p className="text-[11px] text-stone-500">Target {fmtStat(stat.goal)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-base font-bold tabular-nums text-stone-900">{fmtStat(stat.current)}</span>
                            <span
                              className={`w-[4.5rem] rounded-full py-0.5 text-center text-[11px] font-semibold ${
                                met ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"
                              }`}
                            >
                              {met ? "On target" : `${fmtStat(Math.abs(stat.current - stat.goal))} off`}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="rounded-2xl bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                  Log a round with a score to see every stat.
                </p>
              )}
            </StatsCard>
          </div>
        ) : null}

        {profileTab === "practice" ? (
          <div className="mb-6 space-y-4">
            <ProfilePracticeOverview playerGoalRow={playerGoalRow} />
            <AcademyProfileSection />
          </div>
        ) : null}

        {profileTab === "coaching" ? (
          <div className="mb-6" id="coaching">
            <CoachingTab onUnreadChange={refreshCoachingUnread} unreadCount={coachingUnread} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
