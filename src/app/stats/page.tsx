"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { AdvancedApproachStatsPanel } from "@/components/stats/AdvancedApproachStatsPanel";
import { CoachDeepDiveProfileHero } from "@/components/coach/CoachDeepDiveProfileHero";
import type { AcademyTrophyDbRow } from "@/components/AcademyTrophyCasePanel";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { motion, useSpring, useTransform } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  BarChart3,
  Bird,
  CircleDot,
  Minus,
  Navigation2,
  Percent,
  PieChart,
  Shuffle,
  Table2,
  Target,
} from "lucide-react";
import {
  computeDeepDiveRoundMetrics,
  computeStrokeOpportunityTop3,
  sortMetricMatrix,
} from "@/lib/deepDiveRoundMetrics";
import { TROPHY_LIST } from "@/lib/academyTrophies";
import { fetchTrophyCollectionRankForUser } from "@/lib/trophyCollectionLeaderboard";
import { fetchUserTrophiesForUser } from "@/lib/userTrophiesDb";


function AnimatedNumber({ value, isPercentage = false }: { value: number; isPercentage?: boolean }) {
  const spring = useSpring(value >= 0 ? value : 0, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (current) => value === -1 ? '--' : `${current.toFixed(1)}${isPercentage ? '%' : ''}`);

  useEffect(() => {
    spring.set(value >= 0 ? value : 0);
  }, [value, spring]);

  return <motion.span>{display}</motion.span>;
}

const StatDisplay = ({
  label,
  tooltip,
  current,
  goal,
  isPercentage = false,
  inverse = false,
  isAdjustingGoal
}: {
  label: string;
  tooltip?: string;
  current: number;
  goal: number;
  isPercentage?: boolean;
  inverse?: boolean;
  isAdjustingGoal: boolean;
}) => {
  const noData = current === -1;
  const diff = goal - (noData ? 0 : current);
  const gap = inverse ? -diff : diff;
  const needsImprovement = gap > 0;
  const gapText = noData ? 'No Data' : needsImprovement ? `${inverse ? '-' : '+'}${Math.abs(gap).toFixed(1)}${isPercentage ? '%' : ''}` : `Target Met`;
  
  const isMeetingGoal = noData ? false : inverse ? current <= goal : current >= goal;
  const goalColor = noData ? 'text-gray-400' : isMeetingGoal ? 'text-green-500' : 'text-red-500';

  return (
    <div className="flex items-center justify-between py-2">
      {tooltip ? (
        <div className="flex items-center gap-1 group relative">
          <div className="text-sm text-gray-700">{label}</div>
          <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[10px] font-bold cursor-help border border-gray-200 transition-colors hover:bg-gray-200">i</div>
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-48 max-w-[200px] bg-gray-900 text-white text-xs rounded-lg p-2 shadow-xl z-10 whitespace-normal break-words">
            {tooltip}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-700">{label}</div>
      )}
      
      <div className="flex items-center gap-3">
        {isAdjustingGoal && (
          <div className="flex items-center gap-2 animate-in fade-in duration-300">
            <span className="text-[10px] font-bold text-[#FF9800] uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
              Gap: {gapText}
            </span>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold transition-colors duration-300 text-[#FF9800]">
            <AnimatedNumber value={current} isPercentage={isPercentage} />
          </div>
          <div className="flex flex-col items-end justify-center">
            <span className="text-[9px] leading-none text-gray-400 font-bold uppercase tracking-wider mb-0.5">Goal</span>
            <div className={`text-sm leading-none font-bold transition-all duration-300 ${isAdjustingGoal ? 'text-[#FF9800] scale-110 drop-shadow-sm' : goalColor}`}>
              <AnimatedNumber value={goal} isPercentage={isPercentage} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Linear scaling function: Maps handicap from 54 to +5 to goal percentages
export const getBenchmarkGoals = (handicap: number) => {
  const clampedHandicap = Math.max(-5, Math.min(54, handicap));
  const normalized = (54 - clampedHandicap) / (54 - (-5));
  
  const gir = 8 + (70 - 8) * normalized;
  const fir = 15 + (75 - 15) * normalized;
  const upAndDown = 10 + (65 - 10) * normalized;
  // Putts per round: realistic benchmarks (54→41.5, 15→34.2, 5→31.7, 0→30.1)
  const getPuttsGoal = (h: number) => {
    if (h >= 54) return 41.5;
    if (h <= 0) return 30.1;
    if (h >= 15) return 34.2 + (41.5 - 34.2) * (54 - h) / (54 - 15);
    if (h >= 5) return 31.7 + (34.2 - 31.7) * (15 - h) / (15 - 5);
    return 30.1 + (31.7 - 30.1) * (5 - h) / 5;
  };
  const putts = getPuttsGoal(clampedHandicap);
  const bunkerSaves = 10 + (50 - 10) * normalized;
  const within8ft = 3 + (15 - 3) * normalized;
  const within20ft = 15 + (50 - 15) * normalized;
  const chipsInside6ft = 30 + (70 - 30) * normalized;
  const puttMake6ft = 60 + (95 - 60) * normalized;
  const score = clampedHandicap + 72;
  const birdies = 0 + (3.5 - 0) * normalized;
  const pars = 5 + (13.5 - 5) * normalized;
  const bogeys = 10 - (10 - 3) * normalized;
  const doubleBogeys = 10 - (10 - 0) * normalized;
  const teePenalties = 2 - (2 - 0) * normalized;
  const approachPenalties = 2 - (2 - 0) * normalized;
  const totalPenalties = teePenalties + approachPenalties;
  
  return {
    score: Math.round(score),
    gir: Math.round(gir),
    fir: Math.round(fir),
    upAndDown: Math.round(upAndDown),
    putts: Math.round(putts * 10) / 10,
    bunkerSaves: Math.round(bunkerSaves),
    within8ft: Math.round(within8ft),
    within20ft: Math.round(within20ft),
    chipsInside6ft: Math.round(chipsInside6ft),
    puttMake6ft: Math.round(puttMake6ft),
    birdies: Math.round(birdies * 10) / 10,
    pars: Math.round(pars * 10) / 10,
    eagles: 0,
    bogeys: Math.round(bogeys * 10) / 10,
    doubleBogeys: Math.round(doubleBogeys * 10) / 10,
    teePenalties: Math.round(teePenalties * 10) / 10,
    approachPenalties: Math.round(approachPenalties * 10) / 10,
    totalPenalties: Math.round(totalPenalties * 10) / 10
  };
};

/** Whole-number handicap for the Target Goal slider (-5 … 54). */
function clampTargetGoalHandicap(raw: number): number {
  const r = Math.round(Number(raw));
  if (!Number.isFinite(r)) return 9;
  return Math.min(54, Math.max(-5, r));
}

export default function StatsPage() {
  // ============================================
  // ALL HOOKS MUST BE AT THE TOP - NO EXCEPTIONS
  // ============================================
  
  // Context hooks
  const { rounds, practiceSessions, loading: statsLoading, refreshRounds } = useStats();
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
  
  // Ensure rounds is always an array (use personalRounds for stats page)
  const safeRounds = personalRounds || [];

  /** Min/max round dates for loading `performance_stats` rows (same source as coach deep dive matrix extras). */
  const roundsPerfDateSpan = useMemo(() => {
    if (!safeRounds.length) return null;
    const days = safeRounds
      .map((r) => (typeof r.date === "string" ? r.date.slice(0, 10) : ""))
      .filter((d) => d.length >= 8)
      .sort();
    if (!days.length) return null;
    return { start: days[0]!, end: days[days.length - 1]! };
  }, [safeRounds]);

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
  const [isAdjustingGoal, setIsAdjustingGoal] = useState<boolean>(false);
  const adjustTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newGoal = clampTargetGoalHandicap(parseInt(e.target.value, 10));
    setSelectedGoal(newGoal);
    setIsAdjustingGoal(true);
    
    if (adjustTimeoutRef.current) {
      clearTimeout(adjustTimeoutRef.current);
    }
    
    // Debounce the Supabase update
    adjustTimeoutRef.current = setTimeout(async () => {
      setIsAdjustingGoal(false);
      
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
        } catch (err) {
          console.error('Failed to update goal handicap:', err);
        }
      }
    }, 1000); // 1 second debounce for the DB update
  };
  
  // Update selectedGoal when user's initialHandicap changes
  useEffect(() => {
    if (user?.initialHandicap !== undefined) {
      setSelectedGoal(clampTargetGoalHandicap(user.initialHandicap));
    }
  }, [user?.initialHandicap]);
  const [selectedMetric, setSelectedMetric] = useState<'nettScore' | 'gross' | 'birdies' | 'pars' | 'bogeys' | 'totalPutts' | 'doubleBogeys' | 'eagles' | 'threePutts' | 'fairwaysHit' | 'gir' | 'gir8ft' | 'gir20ft' | 'upAndDown' | 'bunkerSaves' | 'chipInside6ft' | 'doubleChips' | 'totalPenalties'>('nettScore');
  const [activeHistory, setActiveHistory] = useState<'LAST 5' | 'LAST 10' | 'LAST 20' | 'ALL'>('LAST 10');
  const [holeFilter, setHoleFilter] = useState<'9' | '18'>('18');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [forceLoaded, setForceLoaded] = useState(false);
  const [skillAssessmentFilter, setSkillAssessmentFilter] = useState<'WEEK' | 'MONTH' | 'ALL'>('ALL');
  const [metricMatrixWorstFirst, setMetricMatrixWorstFirst] = useState(false);
  const [perfStatsForMatrix, setPerfStatsForMatrix] = useState<Record<string, unknown>[]>([]);
  const [statsProfileTrophies, setStatsProfileTrophies] = useState<AcademyTrophyDbRow[]>([]);
  const [statsTrophySummary, setStatsTrophySummary] = useState<{ total: number; rank: number | null }>({
    total: 0,
    rank: null,
  });

  // Safety Net Mock Data
  const safetyNetData: {val: number, date: string}[] = [
    { val: 92, date: 'Round 1' }, { val: 88, date: 'Round 2' }, { val: 85, date: 'Round 3' },
    { val: 90, date: 'Round 4' }, { val: 87, date: 'Round 5' }, { val: 83, date: 'Round 6' },
    { val: 80, date: 'Round 7' }, { val: 78, date: 'Round 8' }, { val: 82, date: 'Round 9' },
    { val: 79, date: 'Round 10' },
  ];

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

  // Get benchmark goals based on selected goal handicap
  const goals = getBenchmarkGoals(selectedGoal);

  const { bigSix, penaltyStats, metricMatrix } = useMemo(() => {
    const g = getBenchmarkGoals(selectedGoal);
    return computeDeepDiveRoundMetrics(safeRounds as unknown as Record<string, unknown>[], g, {
      perfStatsData: perfStatsForMatrix,
    });
  }, [safeRounds, selectedGoal, perfStatsForMatrix]);

  const strokeOpportunityRows = useMemo(
    () => computeStrokeOpportunityTop3(metricMatrix),
    [metricMatrix],
  );

  const sortedMetricMatrix = useMemo(
    () => sortMetricMatrix(metricMatrix, metricMatrixWorstFirst),
    [metricMatrix, metricMatrixWorstFirst],
  );

  const hasRoundData = safeRounds.length > 0;

  const statsProfileDisplayName = useMemo(() => {
    if (user?.fullName?.trim()) return user.fullName.trim();
    const em = user?.email?.trim();
    if (em && em.includes("@")) return em.split("@")[0] ?? "Player";
    return "Player";
  }, [user?.fullName, user?.email]);

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
    if (safeRounds.length === 0) {
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
      };
    }

    // DRIVING: FIR percentage and shot breakdown
    const totalFir = safeRounds.reduce((sum, r) => sum + (r.firHit || 0) + (r.firLeft || 0) + (r.firRight || 0), 0);
    const firHit = safeRounds.reduce((sum, r) => sum + (r.firHit || 0), 0);
    const firLeft = safeRounds.reduce((sum, r) => sum + (r.firLeft || 0), 0);
    const firRight = safeRounds.reduce((sum, r) => sum + (r.firRight || 0), 0);
    const firMissed = firLeft + firRight;
    const firPercent = totalFir > 0 ? (firHit / totalFir) * 100 : 0;
    const missedLeft = totalFir > 0 ? (firLeft / totalFir) * 100 : 0;
    const missedRight = totalFir > 0 ? (firRight / totalFir) * 100 : 0;

    // APPROACH: GIR percentage
    const totalGir = safeRounds.reduce((sum, r) => sum + (r.totalGir || 0), 0);
    const totalHoles = safeRounds.reduce((sum, r) => sum + (r.holes || 18), 0);
    const girPercent = totalHoles > 0 ? (totalGir / totalHoles) * 100 : 0;

    // APPROACH: GIR from distances - % of holes (18) hit within 8ft/20ft
    const totalGir8ft = safeRounds.reduce((sum, r) => sum + (r.gir8ft || 0), 0);
    const totalGir20ft = safeRounds.reduce((sum, r) => sum + (r.gir20ft || 0), 0);
    const gir8ft = totalHoles > 0 ? (totalGir8ft / totalHoles) * 100 : 0;
    const gir20ft = totalHoles > 0 ? (totalGir20ft / totalHoles) * 100 : 0;

    // SHORT GAME: Up & Down percentage
    const totalUpDownAttempts = safeRounds.reduce((sum, r) => sum + (r.upAndDownConversions || 0) + (r.missed || 0), 0);
    const upDownSuccess = safeRounds.reduce((sum, r) => sum + (r.upAndDownConversions || 0), 0);
    const upAndDownPercent = totalUpDownAttempts > 0 ? (upDownSuccess / totalUpDownAttempts) * 100 : 0;

    // SHORT GAME: Bunker Saves percentage
    const totalBunkerAttempts = safeRounds.reduce((sum, r) => sum + (r.bunkerAttempts || 0) + (r.bunkerSaves || 0), 0);
    const bunkerSavesCount = safeRounds.reduce((sum, r) => sum + (r.bunkerSaves || 0), 0);
    const bunkerSaves = totalBunkerAttempts > 0 ? (bunkerSavesCount / totalBunkerAttempts) * 100 : 0;

    // SHORT GAME: Chip Inside 6ft (Scrambling %)
    const totalChips = safeRounds.reduce((sum, r) => sum + (r.chipInside6ft || 0) + (r.doubleChips || 0), 0); // Need to know total chips, using doubleChips as missed for now or just standardizing based on up&down attempts
    // Better way for Chip Inside 6ft percentage: It's usually chip inside 6ft / total chips
    // Let's use totalUpDownAttempts as the denominator since that's roughly total short game shots
    const chipInside6ft = totalUpDownAttempts > 0 ? (safeRounds.reduce((sum, r) => sum + (r.chipInside6ft || 0), 0) / totalUpDownAttempts) * 100 : 0;

    // PUTTING: Average Putts per round
    const totalPutts = safeRounds.reduce((sum, r) => sum + (r.totalPutts || 0), 0);
    const avgPutts = safeRounds.length > 0 ? totalPutts / safeRounds.length : 0;

    // PUTTING: < 6ft Make percentage (made_under_6ft / putts_under_6ft_attempts)
    const totalPuttsUnder6ft = safeRounds.reduce((sum, r) => sum + (r.puttsUnder6ftAttempts || 0), 0);
    const puttsMadeUnder6ft = safeRounds.reduce((sum, r) => sum + (r.made6ftAndIn || 0), 0);
    const puttsUnder6ftMake = totalPuttsUnder6ft > 0 ? Math.round((puttsMadeUnder6ft / totalPuttsUnder6ft) * 100) : 0;

    // PUTTING: 3-Putts (average per round)
    const totalThreePutts = safeRounds.reduce((sum, r) => sum + (r.threePutts || 0), 0);
    const avgThreePutts = safeRounds.length > 0 ? totalThreePutts / safeRounds.length : 0;

    // PENALTIES: All penalty types
    const totalTeePenalties = safeRounds.reduce((sum, r) => sum + (r.teePenalties || 0), 0);
    const teePenalties = safeRounds.length > 0 ? totalTeePenalties / safeRounds.length : 0;
    const totalApproachPenalties = safeRounds.reduce((sum, r) => sum + (r.approachPenalties || 0), 0);
    const approachPenalties = safeRounds.length > 0 ? totalApproachPenalties / safeRounds.length : 0;
    const totalPenaltiesCount = safeRounds.reduce((sum, r) => sum + (r.totalPenalties || 0), 0);
    const totalPenalties = safeRounds.length > 0 ? totalPenaltiesCount / safeRounds.length : 0;

    return {
      // DRIVING
      firPercent: Math.round(firPercent * 10) / 10,
      missedLeft: Math.round(missedLeft * 10) / 10,
      missedRight: Math.round(missedRight * 10) / 10,
      totalFirShots: totalFir,
      firHit: firHit,
      firMissed: firMissed,
      // APPROACH
      girPercent: Math.round(girPercent * 10) / 10,
      gir8ft: Math.round(gir8ft * 10) / 10,
      gir20ft: Math.round(gir20ft * 10) / 10,
      // SHORT GAME
      upAndDownPercent: Math.round(upAndDownPercent * 10) / 10,
      bunkerSaves: Math.round(bunkerSaves * 10) / 10,
      chipInside6ft: Math.round(chipInside6ft * 10) / 10,
      // PUTTING
      avgPutts: Math.round(avgPutts * 10) / 10,
      puttsUnder6ftMake: Math.round(puttsUnder6ftMake * 10) / 10,
      avgThreePutts: Math.round(avgThreePutts * 10) / 10,
      // PENALTIES
      teePenalties: Math.round(teePenalties * 10) / 10,
      approachPenalties: Math.round(approachPenalties * 10) / 10,
      totalPenalties: Math.round(totalPenalties * 10) / 10,
    };
  }, [safeRounds]);

  // Full data collection for trend graph
  const fullData: Record<string, {val: number, date: string}[]> = useMemo(() => {
    const filteredRounds = holeFilter === '9' 
      ? safeRounds.filter(r => r.holes === 9)
      : safeRounds.filter(r => r.holes === 18);

    if (!filteredRounds || filteredRounds.length === 0) {
      return {
        'NETT SCORE': safetyNetData,
        'GROSS SCORE': safetyNetData,
        'BIRDIES': safetyNetData.map(d => ({ ...d, val: 0 })),
        'PARS': safetyNetData.map(d => ({ ...d, val: 8 })),
        'BOGEYS': safetyNetData.map(d => ({ ...d, val: 6 })),
        'DOUBLE BOGEYS': safetyNetData.map(d => ({ ...d, val: 2 })),
        'EAGLES': safetyNetData.map(d => ({ ...d, val: 0 })),
        'TOTAL PUTTS': safetyNetData.map(d => ({ ...d, val: 32 })),
        'THREE PUTTS': safetyNetData.map(d => ({ ...d, val: 1 })),
        'FAIRWAYS HIT': safetyNetData.map(d => ({ ...d, val: 10 })),
        'GIR': safetyNetData.map(d => ({ ...d, val: 8 })),
        'GIR 8FT': safetyNetData.map(d => ({ ...d, val: 2 })),
        'GIR 20FT': safetyNetData.map(d => ({ ...d, val: 5 })),
        'UP AND DOWN': safetyNetData.map(d => ({ ...d, val: 3 })),
        'BUNKER SAVES': safetyNetData.map(d => ({ ...d, val: 2 })),
        'CHIP INSIDE 6FT': safetyNetData.map(d => ({ ...d, val: 4 })),
        'DOUBLE CHIPS': safetyNetData.map(d => ({ ...d, val: 1 })),
        'TOTAL PENALTIES': safetyNetData.map(d => ({ ...d, val: 1 })),
        'TEE PENALTIES': safetyNetData.map(d => ({ ...d, val: 0 })),
        'APPROACH PENALTIES': safetyNetData.map(d => ({ ...d, val: 1 })),
        'MADE 6FT AND IN': safetyNetData.map(d => ({ ...d, val: 2 })),
      };
    }

    const data: Record<string, {val: number, date: string}[]> = {
      'NETT SCORE': [],
      'GROSS SCORE': [],
      'BIRDIES': [],
      'PARS': [],
      'BOGEYS': [],
      'DOUBLE BOGEYS': [],
      'EAGLES': [],
      'TOTAL PUTTS': [],
      'THREE PUTTS': [],
      'FAIRWAYS HIT': [],
      'FAIRWAYS LEFT': [],
      'FAIRWAYS RIGHT': [],
      'GIR': [],
      'GIR 8FT': [],
      'GIR 20FT': [],
      'UP AND DOWN': [],
      'BUNKER SAVES': [],
      'CHIP INSIDE 6FT': [],
      'DOUBLE CHIPS': [],
      'TOTAL PENALTIES': [],
      'TEE PENALTIES': [],
      'APPROACH PENALTIES': [],
      'MADE 6FT AND IN': [],
    };

    filteredRounds.forEach((round, index) => {
      const roundDate = round.date ? new Date(round.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : `Round ${index + 1}`;
      
      data['NETT SCORE'].push({ val: round.nett || 0, date: roundDate });
      data['GROSS SCORE'].push({ val: round.score || 0, date: roundDate });
      data['BIRDIES'].push({ val: round.birdies || 0, date: roundDate });
      data['PARS'].push({ val: round.pars || 0, date: roundDate });
      data['BOGEYS'].push({ val: round.bogeys || 0, date: roundDate });
      data['DOUBLE BOGEYS'].push({ val: round.doubleBogeys || 0, date: roundDate });
      data['EAGLES'].push({ val: round.eagles || 0, date: roundDate });
      data['TOTAL PUTTS'].push({ val: round.totalPutts || 0, date: roundDate });
      data['THREE PUTTS'].push({ val: round.threePutts || 0, date: roundDate });
      data['FAIRWAYS HIT'].push({ val: round.firHit || 0, date: roundDate });
      data['FAIRWAYS LEFT'].push({ val: round.firLeft || 0, date: roundDate });
      data['FAIRWAYS RIGHT'].push({ val: round.firRight || 0, date: roundDate });
      data['GIR'].push({ val: round.totalGir || 0, date: roundDate });
      data['GIR 8FT'].push({ val: round.gir8ft || 0, date: roundDate });
      data['GIR 20FT'].push({ val: round.gir20ft || 0, date: roundDate });
      data['UP AND DOWN'].push({ val: round.upAndDownConversions || 0, date: roundDate });
      data['BUNKER SAVES'].push({ val: round.bunkerSaves || 0, date: roundDate });
      data['CHIP INSIDE 6FT'].push({ val: round.chipInside6ft || 0, date: roundDate });
      data['DOUBLE CHIPS'].push({ val: round.doubleChips || 0, date: roundDate });
      data['TOTAL PENALTIES'].push({ val: round.totalPenalties || 0, date: roundDate });
      data['TEE PENALTIES'].push({ val: round.teePenalties || 0, date: roundDate });
      data['APPROACH PENALTIES'].push({ val: round.approachPenalties || 0, date: roundDate });
      data['MADE 6FT AND IN'].push({ val: round.made6ftAndIn || 0, date: roundDate });
    });

    return data;
  }, [safeRounds, holeFilter]);

  // Universal Key Mapper
  const metricKeyMap: Record<string, string> = {
    'nettScore': 'NETT SCORE', 'nett_score': 'NETT SCORE',
    'gross': 'GROSS SCORE', 'gross_score': 'GROSS SCORE',
    'birdies': 'BIRDIES',
    'pars': 'PARS',
    'bogeys': 'BOGEYS',
    'doubleBogeys': 'DOUBLE BOGEYS', 'double_bogeys': 'DOUBLE BOGEYS',
    'eagles': 'EAGLES',
    'totalPutts': 'TOTAL PUTTS', 'total_putts': 'TOTAL PUTTS',
    'threePutts': 'THREE PUTTS', 'three_putts': 'THREE PUTTS',
    'fairwaysHit': 'FAIRWAYS HIT', 'fairways_hit': 'FAIRWAYS HIT', 'firHit': 'FAIRWAYS HIT',
    'gir': 'GIR', 'totalGir': 'GIR', 'total_gir': 'GIR',
    'gir8ft': 'GIR 8FT', 'gir_8ft': 'GIR 8FT',
    'gir20ft': 'GIR 20FT', 'gir_20ft': 'GIR 20FT',
    'upAndDown': 'UP AND DOWN', 'up_and_down': 'UP AND DOWN',
    'bunkerSaves': 'BUNKER SAVES', 'bunker_saves': 'BUNKER SAVES',
    'chipInside6ft': 'CHIP INSIDE 6FT', 'chip_inside_6ft': 'CHIP INSIDE 6FT',
    'doubleChips': 'DOUBLE CHIPS', 'double_chips': 'DOUBLE CHIPS',
    'totalPenalties': 'TOTAL PENALTIES', 'total_penalties': 'TOTAL PENALTIES',
  };

  const resolveMetricKey = (metric: string): string => {
    const lowerMetric = metric.toLowerCase();
    for (const [key, value] of Object.entries(metricKeyMap)) {
      if (key.toLowerCase() === lowerMetric) {
        return value;
      }
    }
    return 'NETT SCORE';
  };

  // Active dataset for trend graph
  const activeDataset = useMemo(() => {
    const mappedKey = resolveMetricKey(selectedMetric);
    let dataFromDB = (fullData[mappedKey] && Array.isArray(fullData[mappedKey])) ? fullData[mappedKey] : [];
    
    if (!dataFromDB || dataFromDB.length === 0) {
      dataFromDB = (fullData['NETT SCORE'] && Array.isArray(fullData['NETT SCORE'])) ? fullData['NETT SCORE'] : [];
    }
    
    if (!dataFromDB || dataFromDB.length === 0) {
      dataFromDB = safetyNetData;
    }

    let limit: number;
    if (activeHistory === 'LAST 5') limit = 5;
    else if (activeHistory === 'LAST 10') limit = 10;
    else if (activeHistory === 'LAST 20') limit = 20;
    else limit = dataFromDB.length;

    const finalData = dataFromDB.length > 0 
      ? dataFromDB.slice(-Math.min(limit, dataFromDB.length))
      : [];

    return finalData;
  }, [selectedMetric, activeHistory, fullData]);

  // Calculate goal value for the selected metric
  const getGoalValueForMetric = (metric: string): number => {
    const metricLower = metric.toLowerCase();
    if (metricLower === 'nettscore' || metricLower === 'nett_score') {
      return goals.score - selectedGoal;
    } else if (metricLower === 'gross' || metricLower === 'gross_score') {
      return goals.score;
    } else if (metricLower === 'birdies') {
      return goals.birdies;
    } else if (metricLower === 'pars') {
      return goals.pars;
    } else if (metricLower === 'bogeys') {
      return goals.bogeys;
    } else if (metricLower === 'doublebogeys' || metricLower === 'double_bogeys') {
      return goals.doubleBogeys;
    } else if (metricLower === 'eagles') {
      return goals.eagles;
    } else if (metricLower === 'totalputts' || metricLower === 'total_putts') {
      return goals.putts;
    } else if (metricLower === 'threeputts' || metricLower === 'three_putts') {
      return Math.max(0, goals.putts / 18 - 1);
    } else if (metricLower === 'fairwayshit' || metricLower === 'fairways_hit' || metricLower === 'firhit') {
      return goals.fir;
    } else if (metricLower === 'gir' || metricLower === 'totalgir' || metricLower === 'total_gir') {
      return goals.gir;
    } else if (metricLower === 'gir8ft' || metricLower === 'gir_8ft') {
      return goals.within8ft;
    } else if (metricLower === 'gir20ft' || metricLower === 'gir_20ft') {
      return goals.within20ft;
    } else if (metricLower === 'upanddown' || metricLower === 'up_and_down') {
      return goals.upAndDown;
    } else if (metricLower === 'bunkersaves' || metricLower === 'bunker_saves') {
      return goals.bunkerSaves;
    } else if (metricLower === 'chipinside6ft' || metricLower === 'chip_inside_6ft') {
      return goals.chipsInside6ft;
    } else if (metricLower === 'totalpenalties' || metricLower === 'total_penalties') {
      return goals.totalPenalties;
    } else if (metricLower === 'teepenalties' || metricLower === 'tee_penalties') {
      return goals.teePenalties;
    } else if (metricLower === 'approachpenalties' || metricLower === 'approach_penalties') {
      return goals.approachPenalties;
    }
    return goals.score - selectedGoal;
  };
  
  const goalValue = getGoalValueForMetric(selectedMetric);

  // Y-Axis configuration
  const yAxisConfig = useMemo(() => {
    if (!activeDataset || activeDataset.length === 0) {
      return { yMin: 0, yMax: 100, labels: [100.0, 66.7, 33.3, 0.0] };
    }

    const numericValues = activeDataset.map(d => d?.val ?? 0).filter(v => !isNaN(v) && isFinite(v));
    if (numericValues.length === 0) {
      return { yMin: 0, yMax: 100, labels: [100.0, 66.7, 33.3, 0.0] };
    }

    const dataMin = Math.min(...numericValues, goalValue);
    const dataMax = Math.max(...numericValues, goalValue);
    const range = dataMax - dataMin;

    let yMin: number, yMax: number;
    if (range === 0) {
      if (dataMin === 0) {
        yMin = 0;
        yMax = 4;
      } else {
        yMin = Math.max(0, dataMin - 1);
        yMax = dataMax + 1;
      }
    } else {
      const isLowNumberStat = dataMax < 20;
      const padding = isLowNumberStat ? Math.max(0.2, range * 0.15) : range * 0.1;
      yMin = Math.max(0, dataMin - padding);
      yMax = dataMax + padding;
    }

    const numLabels = 4;
    const step = (yMax - yMin) / (numLabels - 1);
    const labels = Array.from({ length: numLabels }, (_, i) => {
      return Number((yMin + (step * i)).toFixed(1));
    }).reverse();

    return { yMin, yMax, labels };
  }, [activeDataset, goalValue]);

  // SVG dimensions - Define ONCE
  const viewBoxWidth = 400;
  const viewBoxHeight = 380;
  const graphWidth = 340;
  const graphHeight = 240;
  const graphStartX = 40;
  const graphStartY = 20;
  const xAxisY = 280;

  // Coordinate functions - Define ONCE
  const getX = (index: number, totalPoints: number) => {
    if (totalPoints <= 1) return graphStartX + graphWidth / 2;
    return (index / (totalPoints - 1)) * graphWidth + graphStartX;
  };

  const getY = (val: number) => {
    if (yAxisConfig.yMax === yAxisConfig.yMin) {
      return graphStartY + graphHeight / 2;
    }
    const range = yAxisConfig.yMax - yAxisConfig.yMin;
    if (range === 0) {
      return graphStartY + graphHeight / 2;
    }
    const normalized = (val - yAxisConfig.yMin) / range;
    const calculatedY = graphStartY + graphHeight - (normalized * graphHeight);
    return Math.max(graphStartY, Math.min(graphStartY + graphHeight, calculatedY));
  };

  // Calculate Practice Allocation Chart values (7 categories)
  const practiceAllocationData = useMemo(() => {
    // Filter practice sessions based on selected timeframe
    const now = new Date();
    let startDate = new Date(0); // ALL
    if (skillAssessmentFilter === 'WEEK') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    } else if (skillAssessmentFilter === 'MONTH') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    const filteredPractice = personalPractice.filter((p: any) => {
      const pDate = new Date(p.created_at || p.practice_date || new Date());
      return pDate >= startDate;
    });

    const getMinutes = (category: string) => {
      return filteredPractice
        .filter((p: any) => p.type === category)
        .reduce((sum: number, p: any) => sum + (p.duration_minutes || 0), 0);
    };

    return {
      driving: getMinutes('Driving'),
      irons: getMinutes('Irons'),
      wedges: getMinutes('Wedges'),
      chipping: getMinutes('Chipping'),
      bunkers: getMinutes('Bunkers'),
      putting: getMinutes('Putting'),
      mentalStrategy: getMinutes('Mental/Strategy'),
      onCourse: getMinutes('On-Course'),
    };
  }, [personalPractice, skillAssessmentFilter]);

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

  return (
    <div className="coach-deepdive-root w-full max-w-3xl overflow-x-hidden bg-[#f4f6f4] min-w-0 mx-auto">
      <header className="w-full bg-[#014421] px-4 pb-4 pt-3 text-white">
        <h1 className="text-xl font-bold tracking-tight">Game Overview</h1>
        <p className="mt-1 text-xs font-medium text-white/80">Track your performance metrics</p>
        {user?.initialHandicap !== undefined ? (
          <p className="mt-2 text-sm font-semibold text-white/95">
            Profile handicap:{" "}
            {user.initialHandicap >= 0
              ? user.initialHandicap.toFixed(1)
              : `+${Math.abs(user.initialHandicap).toFixed(1)}`}{" "}
            {user.initialHandicap <= 0 ? "Pro" : "HCP"}
          </p>
        ) : null}
      </header>

      {/* Single column scroll lives on AppFrame <main>; avoid nested overflow-y here or the bottom of the page never scrolls into view. */}
      <div className="overflow-x-hidden px-4 pb-32 pt-4 min-w-0">
        <CoachDeepDiveProfileHero
          playerName={statsProfileDisplayName}
          playerHandicap={clampTargetGoalHandicap(selectedGoal)}
          totalXp={user?.totalXP ?? null}
          roundsInRange={safeRounds.length}
          practiceSessionsInRange={personalPractice.length}
          unlockedTrophies={statsProfileTrophies}
          heroCompact={statsProfileHeroCompact}
          showPerformanceSnapshot={false}
          allEnteredData
          academyTrophyDistinctTotal={statsTrophySummary.total}
          academyTrophyLeaderboardRank={statsTrophySummary.rank}
        />

        {/* Target goal — same card pattern as coach deep dive benchmark handicap */}
        <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#014421]/10 text-[#014421]">
              <Target className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-stone-900">Target Goal</h2>
              <p className="text-xs text-stone-500">
                Sets benchmark targets for stats below (GIR, FIR, putting, and more).
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-4">
            <input
              type="range"
              min={-5}
              max={54}
              step={1}
              value={selectedGoal}
              onChange={handleGoalChange}
              className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-stone-200 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#014421] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white"
              style={{
                background: `linear-gradient(to right, #014421 0%, #014421 ${((selectedGoal + 5) / 59) * 100}%, #e7e5e4 ${((selectedGoal + 5) / 59) * 100}%, #e7e5e4 100%)`,
              }}
            />
            <div className="min-w-[3.75rem] shrink-0 text-right text-lg font-semibold tabular-nums text-stone-900">
              {(selectedGoal ?? 0) >= 0 ? `${Math.round(selectedGoal ?? 0)}` : `+${Math.abs(Math.round(selectedGoal ?? 0))}`}{" "}
              <span className="text-sm font-medium text-stone-500">
                {(selectedGoal ?? 0) <= 0 ? "Pro" : "HCP"}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-stone-600">
            GIR: {goals.gir}% · FIR: {goals.fir}% · Up &amp; down: {goals.upAndDown}% · Putts: {goals.putts} · Bunker:{" "}
            {goals.bunkerSaves}%
          </p>
        </section>

        {penaltyStats ? (
          <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
            <div className="mb-5 flex items-center gap-3 border-b border-stone-100 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
                <AlertTriangle className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-stone-900">Scoring Leaks</h2>
                <p className="text-xs text-stone-500">Penalties, three-putts, and doubles or worse · per round</p>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-stone-100 rounded-2xl border border-stone-100 bg-stone-50/50">
              {(
                [
                  { label: "Penalties", value: penaltyStats.penaltiesPerRound },
                  { label: "3-putts", value: penaltyStats.threePuttsPerRound },
                  { label: "Double+", value: penaltyStats.doublesPerRound },
                ] as const
              ).map((row) => (
                <div key={row.label} className="px-3 py-4 text-center sm:px-4">
                  <p className="text-[11px] font-medium text-stone-500">{row.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{row.value}</p>
                  <p className="mt-0.5 text-[10px] text-stone-400">per round</p>
                </div>
              ))}
            </div>
            <p className="mt-4 border-l-2 border-amber-200 pl-3 text-xs leading-relaxed text-stone-600">
              Tightening these three areas is often the fastest path to lower scores without changing swing technique.
            </p>
          </section>
        ) : null}

        {strokeOpportunityRows.length > 0 ? (
          <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
            <div className="mb-4 flex items-center gap-3 border-b border-stone-100 pb-4">
              <div className="h-8 w-1 shrink-0 rounded-full bg-[#FF9800]" aria-hidden />
              <div>
                <h2 className="text-base font-semibold tracking-tight text-stone-900">Top 3 Stroke Opportunities</h2>
                <p className="text-xs text-stone-500">Estimated strokes per round if you closed the gap to your target benchmarks</p>
              </div>
            </div>
            <div className="space-y-3">
              {strokeOpportunityRows.map((row, idx) => (
                <div
                  key={`${row.name}-${idx}`}
                  className="rounded-2xl border border-stone-100 bg-stone-50/40 p-4 transition-colors hover:border-stone-200 hover:bg-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900">{row.name}</p>
                      <p className="text-xs text-stone-500">{row.category} focus</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold tabular-nums text-[#014421]">-{row.estimatedGain.toFixed(2)}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">strokes / round</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    Current: {row.current} · Goal: {row.goal} ({row.unit})
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* TREND ANALYSIS — unchanged block; lives on stats only */}
        <section className="mb-8 min-w-0" aria-labelledby="stats-trend-analysis-heading">
          <h2 id="stats-trend-analysis-heading" className="sr-only">
            Trend Analysis
          </h2>
          <div className="min-w-0 overflow-hidden">
          <div className="bg-[#05412B] rounded-2xl sm:rounded-[32px] p-3 sm:p-6 text-white shadow-2xl overflow-hidden">
            <h2 className="text-center font-bold text-base sm:text-lg mb-4 tracking-wider italic" style={{ color: '#FFFFFF', textDecoration: 'underline', textDecorationColor: '#FF9800', textDecorationThickness: '2px', textUnderlineOffset: '8px' }}>
              Trend Analysis
            </h2>
            
            {/* Controls */}
            <div className="bg-white/5 rounded-2xl p-3 sm:p-5 mb-4 border border-white/10 space-y-3">
              {/* Metric Selection */}
              <div className="flex justify-between items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold text-white/50 uppercase shrink-0">Metric:</span>
                <select 
                  value={selectedMetric} 
                  onChange={(e) => setSelectedMetric(e.target.value as typeof selectedMetric)} 
                  className="bg-white text-[#05412B] text-xs font-bold py-2 px-3 rounded-xl outline-none max-h-48 overflow-y-auto flex-1 min-w-0"
                  style={{ maxHeight: '200px' }}
                >
                  <option value="nettScore">NETT SCORE</option>
                  <option value="gross">GROSS SCORE</option>
                  <option value="birdies">BIRDIES</option>
                  <option value="pars">PARS</option>
                  <option value="bogeys">BOGEYS</option>
                  <option value="doubleBogeys">DOUBLE BOGEYS</option>
                  <option value="eagles">EAGLES</option>
                  <option value="totalPutts">TOTAL PUTTS</option>
                  <option value="threePutts">THREE PUTTS</option>
                  <option value="fairwaysHit">FAIRWAYS HIT</option>
                  <option value="gir">GIR</option>
                  <option value="gir8ft">GIR 8FT</option>
                  <option value="gir20ft">GIR 20FT</option>
                  <option value="upAndDown">UP & DOWN</option>
                  <option value="bunkerSaves">BUNKER SAVES</option>
                  <option value="chipInside6ft">CHIP INSIDE 6FT</option>
                  <option value="doubleChips">DOUBLE CHIPS</option>
                  <option value="totalPenalties">TOTAL PENALTIES</option>
                </select>
              </div>

              {/* Hole Filter */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-t border-white/10 pt-4">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight shrink-0">Filter:</span>
                <div className="flex gap-1 flex-wrap">
                  <button 
                    onClick={() => setHoleFilter('9')} 
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${
                      holeFilter === '9' 
                        ? 'bg-white text-[#05412B] border-2 border-white' 
                        : 'bg-white/10 text-white/40'
                    }`}
                  >
                    9 HOLES
                  </button>
                  <button 
                    onClick={() => setHoleFilter('18')} 
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${
                      holeFilter === '18' 
                        ? 'bg-white text-[#05412B] border-2 border-white' 
                        : 'bg-white/10 text-white/40'
                    }`}
                  >
                    18 HOLES
                  </button>
                </div>
              </div>

              {/* History Filter */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-t border-white/10 pt-4">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight shrink-0">History:</span>
                <div className="flex gap-1 flex-wrap">
                  {(['LAST 5', 'LAST 10', 'LAST 20', 'ALL'] as const).map(h => (
                    <button 
                      key={h} 
                      onClick={() => setActiveHistory(h)} 
                      className={`px-2 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${
                        activeHistory === h 
                          ? 'bg-white text-[#05412B] border-2 border-white' 
                          : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SVG Graph */}
            <div className="relative w-full min-w-0 bg-[#05412B] rounded-2xl p-3 border border-white/5 overflow-hidden" style={{ height: '340px', minHeight: '340px' }}>
              <div className="w-full h-full min-w-0 overflow-visible" style={{ minHeight: '300px' }}>
                <svg 
                  key={`${selectedMetric}-${activeHistory}-${yAxisConfig.yMin}-${yAxisConfig.yMax}-${selectedGoal}`}
                  viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} 
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-full block max-w-full"
                  overflow="visible"
                >
                  <defs>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#FF9800" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#FF9800" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid lines */}
                  {yAxisConfig.labels.map((label: number, idx: number) => {
                    const totalLabels = yAxisConfig.labels.length;
                    const yPos = totalLabels > 1 
                      ? graphStartY + (idx / (totalLabels - 1)) * graphHeight
                      : graphStartY + graphHeight / 2;
                    return (
                      <line
                        key={`grid-${idx}`}
                        x1={graphStartX}
                        y1={yPos}
                        x2={graphStartX + graphWidth}
                        y2={yPos}
                        stroke="#FFFFFF"
                        strokeWidth="1"
                        strokeOpacity="0.1"
                        strokeDasharray="4 4"
                      />
                    );
                  })}
                  
                  {/* Y-Axis Numbers */}
                  {yAxisConfig.labels.map((label: number, idx: number) => {
                    const totalLabels = yAxisConfig.labels.length;
                    const yPos = totalLabels > 1 
                      ? graphStartY + (idx / (totalLabels - 1)) * graphHeight
                      : graphStartY + graphHeight / 2;
                    
                    // Find the closest label to the goal value
                    const distances = yAxisConfig.labels.map(l => Math.abs(l - goalValue));
                    const minDistance = Math.min(...distances);
                    const isClosest = isAdjustingGoal && Math.abs(label - goalValue) === minDistance;
                    
                    return (
                      <text
                        key={`y-label-${idx}`}
                        x={35}
                        y={yPos}
                        textAnchor="end"
                        fill={isClosest ? "#FF9800" : "#FFFFFF"}
                        fontWeight="bold"
                        opacity={isClosest ? "1" : "0.7"}
                        fontSize={isClosest ? "12" : "10"}
                        dominantBaseline="middle"
                        className="transition-all duration-300"
                      >
                        {label.toFixed(1)}
                      </text>
                    );
                  })}
                  
                  {/* Y-axis line */}
                  <line 
                    x1={graphStartX} 
                    y1={graphStartY} 
                    x2={graphStartX} 
                    y2={graphStartY + graphHeight} 
                    stroke="#FFFFFF" 
                    strokeWidth="1" 
                  />
                  
                  {/* X-axis line */}
                  <line 
                    x1={graphStartX} 
                    y1={xAxisY} 
                    x2={graphStartX + graphWidth} 
                    y2={xAxisY} 
                    stroke="#FFFFFF" 
                    strokeWidth="1" 
                  />
                  
                  {/* Goal Trend Line - Dashed Orange Line synced with slider */}
                  {(() => {
                    const goalY = getY(goalValue);
                    return (
                      <g className="transition-all duration-300">
                        <line
                          x1={graphStartX}
                          y1={goalY}
                          x2={graphStartX + graphWidth}
                          y2={goalY}
                          stroke="#FF9800"
                          strokeWidth="2"
                          strokeDasharray="5,5"
                          opacity={isAdjustingGoal ? "1" : "0.7"}
                        />
                        <rect
                          x={graphStartX + graphWidth - 65}
                          y={goalY - 10}
                          width="65"
                          height="20"
                          rx="4"
                          fill="#FF9800"
                          opacity={isAdjustingGoal ? "1" : "0.9"}
                        />
                        <text
                          x={graphStartX + graphWidth - 5}
                          y={goalY + 4}
                          textAnchor="end"
                          fill="#FFFFFF"
                          fontWeight="bold"
                          fontSize="10"
                        >
                          GOAL: {goalValue.toFixed(1)}
                        </text>
                      </g>
                    );
                  })()}
                  
                  {/* Area fill */}
                  {activeDataset && activeDataset.length > 0 && (
                    <path
                      fill="url(#areaGradient)"
                      d={`M ${activeDataset.map((d, i) => {
                        const x = getX(i, activeDataset.length);
                        const y = getY(d?.val ?? 0);
                        return `${x},${y}`;
                      }).join(' L ')} L ${getX(activeDataset.length - 1, activeDataset.length)},${xAxisY} L ${getX(0, activeDataset.length)},${xAxisY} Z`}
                    />
                  )}
                  
                  {/* Trend Line - Orange #FF9800, stroke width 5 */}
                  {activeDataset && activeDataset.length > 0 && (
                    <polyline
                      fill="none"
                      stroke="#FF9800"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={activeDataset.map((d, i) => {
                        const x = getX(i, activeDataset.length);
                        const y = getY(d?.val ?? 0);
                        return `${x},${y}`;
                      }).join(' ')}
                    />
                  )}
                  
                  {/* Nodes - Hollow white circles, radius 6, rendered last */}
                  {activeDataset && activeDataset.length > 0 && activeDataset.map((d, i) => {
                    const nodeX = getX(i, activeDataset.length);
                    const nodeY = getY(d?.val ?? 0);
                    const isHovered = hoveredIndex === i;
                    return (
                      <g key={`node-${i}`}>
                        {/* Invisible larger hitbox for easier hovering */}
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r={24}
                          fill="transparent"
                          onMouseEnter={() => setHoveredIndex(i)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          style={{ cursor: 'pointer' }}
                        />
                        {/* Visible node */}
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r={isHovered ? 8 : 6}
                          fill={isHovered ? "#FF9800" : "#014421"}
                          stroke="#FFFFFF"
                          strokeWidth="2"
                          style={{ pointerEvents: 'none' }}
                        />
                        
                        {isHovered && (
                          <g transform={`translate(${nodeX - 55}, ${nodeY - 55})`} style={{ pointerEvents: 'none' }}>
                            <rect width="110" height="50" rx="10" fill="white" stroke="#05412B" strokeWidth="2" />
                            <text x="55" y="18" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0F172A" opacity="1">{d?.date || ''}</text>
                            <text x="55" y="38" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#0F172A" opacity="1">{(d?.val ?? 0).toFixed(1)}</text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                  
                  {/* Round labels */}
                  {activeDataset && activeDataset.length > 0 && activeDataset.map((d, i) => {
                    const nodeX = getX(i, activeDataset.length);
                    return (
                      <text
                        key={`x-label-${i}`}
                        x={nodeX}
                        y={290}
                        textAnchor="end"
                        fill="#FFFFFF"
                        fontWeight="bold"
                        opacity="1"
                        fontSize="10"
                        dominantBaseline="hanging"
                        className="fill-white text-[10px]"
                        transform={`rotate(-45 ${nodeX} 290)`}
                        style={{ pointerEvents: 'none' }}
                      >
                        Round {i + 1}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>
        </div>
        </section>

        {/* Core scoring metrics — above the matrix so it stays visible (matrix can be very long) */}
        <section
          id="stats-core-scoring-metrics"
          className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6"
          aria-labelledby="stats-core-scoring-heading"
        >
          <div className="mb-5 flex items-center gap-3 border-b border-stone-100 pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
              <BarChart3 className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h3 id="stats-core-scoring-heading" className="text-base font-semibold tracking-tight text-stone-900">
                Core Scoring Metrics
              </h3>
              <p className="text-xs text-stone-500">
                Recent form · scoring average from your last five rounds; other metrics roll up from every round you
                have logged
              </p>
            </div>
          </div>
          {bigSix ? (
            <div
              id="coach-deepdive-big-six-grid"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
            >
              {(
                [
                  {
                    label: "Scoring average",
                    statValue: bigSix.scoringAvg,
                    unit: "",
                    Icon: BarChart3,
                  },
                  { label: "GIR", statValue: bigSix.girPct, unit: "%", Icon: Percent },
                  { label: "Fairways", statValue: bigSix.firPct, unit: "%", Icon: Navigation2 },
                  { label: "Scrambling", statValue: bigSix.scramblePct, unit: "%", Icon: Shuffle },
                  { label: "Putts / 18", statValue: bigSix.puttsPer18, unit: "", Icon: CircleDot },
                  { label: "Birdies / 18", statValue: bigSix.birdiesPer18, unit: "", Icon: Bird },
                ] as const
              ).map((stat, i) => {
                const val = stat.statValue ?? 0;
                const Icon = stat.Icon;
                return (
                  <div
                    key={i}
                    className="coach-deepdive-stat-card group rounded-2xl border border-stone-100 bg-stone-50/40 p-4 transition-colors hover:border-stone-200 hover:bg-white"
                  >
                    <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-stone-600 shadow-sm ring-1 ring-stone-100 group-hover:text-[#014421]">
                      <Icon className="h-4 w-4" aria-hidden />
                    </div>
                    <p className="text-[11px] font-medium leading-tight text-stone-500">{stat.label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-stone-900">
                      {val}
                      {stat.unit}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-stone-500">
              Log at least one round with scores to see scoring average, GIR, fairways, scrambling, putts per 18, and
              birdies per 18.
            </p>
          )}
        </section>

        {/* Full metric matrix — below core scoring; same card as coach deep dive */}
        <section
          id="full-metric-matrix"
          className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6"
          aria-labelledby="stats-full-metric-matrix-heading"
        >
          <div className="mb-5 flex flex-col gap-4 border-b border-stone-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#014421]/10 text-[#014421]">
                <Table2 className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h3 id="stats-full-metric-matrix-heading" className="text-base font-semibold tracking-tight text-stone-900">
                  Full Metric Matrix
                </h3>
                <p className="text-xs text-stone-500">
                  {metricMatrixWorstFirst
                    ? "Largest benchmark gaps first — flip to review strengths."
                    : "Strongest vs benchmark first — flip to prioritize improvement opportunities."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMetricMatrixWorstFirst((v) => !v)}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 shadow-sm transition-colors hover:border-stone-300 hover:bg-white sm:self-auto"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-stone-500" aria-hidden />
              {metricMatrixWorstFirst ? "Show strongest first" : "Show largest gaps first"}
            </button>
          </div>
          {metricMatrix.length > 0 ? (
            <div className="divide-y divide-stone-100">
              {sortedMetricMatrix.map((stat, i) => {
                const val = stat.current;
                const goalVal = stat.goal;
                const gapVal = stat.gap;
                const isMeetingGoal = stat.isLowerBetter ? val <= goalVal : val >= goalVal;
                const isPositive = gapVal > 0;
                const name = stat.name;

                return (
                  <div
                    key={`${name}-${i}`}
                    className="coach-deepdive-stat-card flex items-center justify-between gap-3 py-3.5 first:pt-0 transition-colors hover:bg-stone-50/80 sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                        <span className="truncate">{name}</span>
                        {stat.trend === "up" && (
                          <ArrowUpRight
                            className={`h-3.5 w-3.5 shrink-0 ${stat.isLowerBetter ? "text-rose-500" : "text-emerald-600"}`}
                            aria-hidden
                          />
                        )}
                        {stat.trend === "down" && (
                          <ArrowDownRight
                            className={`h-3.5 w-3.5 shrink-0 ${stat.isLowerBetter ? "text-emerald-600" : "text-rose-500"}`}
                            aria-hidden
                          />
                        )}
                        {stat.trend === "neutral" && (
                          <Minus className="h-3.5 w-3.5 shrink-0 text-stone-300" aria-hidden />
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] font-medium text-stone-500">
                        Target {goalVal} · Gap {isPositive ? "+" : ""}
                        {gapVal}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                      <span className="text-lg font-semibold tabular-nums text-stone-900">{val}</span>
                      <span
                        className={`min-w-[5.25rem] rounded-full px-2.5 py-1 text-center text-[10px] font-semibold uppercase tracking-wide ${
                          isMeetingGoal
                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                            : "bg-rose-50 text-rose-800 ring-1 ring-rose-100"
                        }`}
                      >
                        {isMeetingGoal ? "ON TARGET" : `${isPositive ? "+" : ""}${gapVal}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-stone-500">
              Log at least one round with scores to see every benchmark row vs your averages (same view as coach deep dive).
            </p>
          )}
        </section>

        <div className="mb-8 min-w-0 space-y-6">
            {/* DRIVING Section */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
              <div className="mb-4 flex items-center gap-3 border-b border-stone-100 pb-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                  <Navigation2 className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-stone-900">Driving</h3>
                  <p className="text-xs text-stone-500">Fairways and miss pattern vs your goal benchmarks</p>
                </div>
              </div>

              {/* Top Level FIR % */}
              <StatDisplay 
                label="FIR %"
                current={performanceMetrics.firPercent}
                goal={goals.fir}
                isPercentage={true}
                isAdjustingGoal={isAdjustingGoal}
              />
              
              {hasRoundData ? (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                {/* FIR % Progress Bar */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-700">Fairways Hit (FIR %)</span>
                    <span className="text-xs font-bold" style={{ color: '#FF9800' }}>{Math.max(0, performanceMetrics.firPercent).toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${Math.min(100, Math.max(0, performanceMetrics.firPercent))}%`,
                        backgroundColor: '#FF9800'
                      }}
                    />
                  </div>
                </div>

                {/* Left Miss % Progress Bar */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-700">Left Miss %</span>
                    <span className="text-xs font-bold" style={{ color: '#FF9800' }}>{Math.max(0, performanceMetrics.missedLeft).toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${Math.min(100, Math.max(0, performanceMetrics.missedLeft))}%`,
                        backgroundColor: '#FF9800'
                      }}
                    />
                  </div>
                </div>

                {/* Right Miss % Progress Bar */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-700">Right Miss %</span>
                    <span className="text-xs font-bold" style={{ color: '#FF9800' }}>{Math.max(0, performanceMetrics.missedRight).toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${Math.min(100, Math.max(0, performanceMetrics.missedRight))}%`,
                        backgroundColor: '#FF9800'
                      }}
                    />
                  </div>
                </div>

                {/* Shot Breakdown */}
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-900">Total Shots</span>
                    <span className="text-sm font-bold text-gray-900">{performanceMetrics.totalFirShots}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-bold text-gray-900">Hit</span>
                    <span className="text-sm font-bold text-gray-900">{performanceMetrics.firHit}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-bold text-gray-900">Missed</span>
                    <span className="text-sm font-bold text-gray-900">{performanceMetrics.firMissed}</span>
                  </div>
                </div>
              </div>
              ) : (
              <div className="pt-3 border-t border-gray-100 text-center py-4">
                <p className="text-xs text-gray-400">No rounds logged yet</p>
              </div>
              )}
            </section>

            {/* APPROACH Section */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
              <div className="mb-4 flex items-center gap-3 border-b border-stone-100 pb-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                  <BarChart3 className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-stone-900">Approach</h3>
                  <p className="text-xs text-stone-500">GIR and proximity benchmarks</p>
                </div>
              </div>
              <div className="space-y-0">
                <StatDisplay 
                  label="GIR %"
                  current={performanceMetrics.girPercent}
                  goal={goals.gir}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="GIR 8ft"
                  tooltip="Approximately 2.4 metres"
                  current={performanceMetrics.gir8ft}
                  goal={goals.within8ft}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="GIR 20ft"
                  tooltip="Approximately 6.1 metres"
                  current={performanceMetrics.gir20ft}
                  goal={goals.within20ft}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
              </div>
            </section>

            <section
              id="stats-advanced-approach"
              className="min-w-0 print:break-inside-avoid print:shadow-none"
            >
              <AdvancedApproachStatsPanel
                rounds={safeRounds}
                holeFilter={holeFilter}
                className="border-stone-200 shadow-md print:border-stone-400 sm:p-6"
                headerEnd={
                  <div className="flex gap-0.5 rounded-xl border border-stone-200 bg-stone-50/90 p-0.5">
                    <button
                      type="button"
                      onClick={() => setHoleFilter("9")}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase transition-colors ${
                        holeFilter === "9"
                          ? "bg-[#014421] text-white shadow-sm"
                          : "text-stone-600 hover:bg-white"
                      }`}
                    >
                      9
                    </button>
                    <button
                      type="button"
                      onClick={() => setHoleFilter("18")}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase transition-colors ${
                        holeFilter === "18"
                          ? "bg-[#014421] text-white shadow-sm"
                          : "text-stone-600 hover:bg-white"
                      }`}
                    >
                      18
                    </button>
                  </div>
                }
              />
            </section>

            {/* SHORT GAME Section */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
              <div className="mb-4 flex items-center gap-3 border-b border-stone-100 pb-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                  <Shuffle className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-stone-900">Short Game</h3>
                  <p className="text-xs text-stone-500">Scrambling, bunkers, and chips inside 6 ft</p>
                </div>
              </div>
              <div className="space-y-0">
                <StatDisplay 
                  label="Up & Down %"
                  current={performanceMetrics.upAndDownPercent}
                  goal={goals.upAndDown}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="Bunker Saves"
                  current={performanceMetrics.bunkerSaves}
                  goal={goals.bunkerSaves}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="Scrambling % (< 6ft)"
                  tooltip="Approximately 1.8 metres. Chip shots ending inside 6ft."
                  current={performanceMetrics.chipInside6ft}
                  goal={goals.chipsInside6ft}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
              </div>
            </section>

            {/* PUTTING PRECISION Section */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
              <div className="mb-4 flex items-center gap-3 border-b border-stone-100 pb-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                  <CircleDot className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-stone-900">Putting</h3>
                  <p className="text-xs text-stone-500">Putts per round, short putt makes, and three-putts</p>
                </div>
              </div>
              <div className="space-y-0">
                <StatDisplay 
                  label="Total Putts"
                  current={performanceMetrics.avgPutts}
                  goal={goals.putts}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="< 6ft Make %"
                  tooltip="Approximately 1.8 metres"
                  current={performanceMetrics.puttsUnder6ftMake}
                  goal={goals.puttMake6ft}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="3-Putts (Avg)"
                  current={performanceMetrics.avgThreePutts}
                  goal={Math.max(0, goals.putts / 18 - 1)}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
              </div>
            </section>

            {/* PENALTIES Section */}
            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
              <div className="mb-4 flex items-center gap-3 border-b border-stone-100 pb-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-stone-900">Penalties</h3>
                  <p className="text-xs text-stone-500">Tee, approach, and total penalties per round</p>
                </div>
              </div>
              <div className="space-y-0">
                <StatDisplay 
                  label="Tee Penalties"
                  current={performanceMetrics.teePenalties}
                  goal={goals.teePenalties}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="Approach Penalties"
                  current={performanceMetrics.approachPenalties}
                  goal={goals.approachPenalties}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="Total Penalties"
                  current={performanceMetrics.totalPenalties}
                  goal={goals.totalPenalties}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
              </div>
            </section>
        </div>

        {/* Practice by area — coach-style section */}
        <section className="mb-8 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6 min-w-0">
            <div className="mb-4 flex flex-col gap-4 border-b border-stone-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                  <PieChart className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 pr-2">
                  <h2 className="text-base font-semibold tracking-tight text-stone-900 sm:text-lg">
                    Practice by Area
                  </h2>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Bars match the share of your time in each area (same % as below).
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['WEEK', 'MONTH', 'ALL'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setSkillAssessmentFilter(filter)}
                    className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-bold uppercase transition-all sm:px-3 sm:text-xs ${
                      skillAssessmentFilter === filter
                        ? "border-[#014421] bg-[#014421] text-white shadow-sm"
                        : "border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:bg-white"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:gap-4">
              {(() => {
                const activityRows = [
                  { category: 'Driving', minutes: Number(practiceAllocationData.driving ?? 0) },
                  { category: 'Irons', minutes: Number(practiceAllocationData.irons ?? 0) },
                  { category: 'Wedges', minutes: Number(practiceAllocationData.wedges ?? 0) },
                  { category: 'Chipping', minutes: Number(practiceAllocationData.chipping ?? 0) },
                  { category: 'Bunkers', minutes: Number(practiceAllocationData.bunkers ?? 0) },
                  { category: 'Putting', minutes: Number(practiceAllocationData.putting ?? 0) },
                  { category: 'On-Course', minutes: Number(practiceAllocationData.onCourse ?? 0) },
                  { category: 'Mental/Strategy', minutes: Number(practiceAllocationData.mentalStrategy ?? 0) },
                ];
                const weeklyRecommended: Record<string, { min: number; max: number }> = {
                  'Putting': { min: 90, max: 120 },
                  'Chipping': { min: 60, max: 90 },
                  'Bunkers': { min: 30, max: 45 },
                  'Irons': { min: 60, max: 90 },
                  'Wedges': { min: 45, max: 75 },
                  'Driving': { min: 60, max: 90 },
                  'Mental/Strategy': { min: 30, max: 45 },
                  'On-Course': { min: 120, max: 240 },
                };
                const totalMinutes = activityRows.reduce((sum, row) => sum + row.minutes, 0);
                const rangeMultiplier = skillAssessmentFilter === 'MONTH' ? 4 : skillAssessmentFilter === 'ALL' ? 8 : 1;
                const rangeLabel = skillAssessmentFilter === 'MONTH' ? 'this month' : skillAssessmentFilter === 'ALL' ? 'this period' : 'this week';
                const isAllTimeView = skillAssessmentFilter === 'ALL';

                return (
                  <>
                    {totalMinutes > 0 ? (
                      <p className="mb-2 text-sm font-semibold text-stone-800">
                        {totalMinutes} min total <span className="font-normal text-stone-500">· all areas</span>
                      </p>
                    ) : (
                      <p className="mb-2 text-sm text-stone-500">No practice logged {rangeLabel} yet.</p>
                    )}
                    {activityRows.map((row) => {
                  const rec = weeklyRecommended[row.category] || { min: 0, max: 0 };
                  const recMin = rec.min * rangeMultiplier;
                  const recMax = rec.max * rangeMultiplier;
                  const practiceShare = totalMinutes > 0 ? Math.round((row.minutes / totalMinutes) * 100) : 0;
                  /** Bar width = share of total time (must match practiceShare, not vs. single busiest category). */
                  const barWidth = totalMinutes > 0 ? Math.round((row.minutes / totalMinutes) * 100) : 0;
                  const status =
                    row.minutes < recMin ? 'Needs attention' :
                    row.minutes > recMax ? 'Strong focus' :
                    'On track';
                  return (
                    <div
                      key={row.category}
                      className="rounded-2xl border border-stone-100 bg-stone-50/40 p-4 transition-colors hover:border-stone-200 hover:bg-white sm:px-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-stone-900">{row.category}</h3>
                        <span className="text-sm font-semibold tabular-nums text-stone-800">{row.minutes}m</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200/90">
                        <div
                          className="h-full rounded-full bg-[#014421] transition-all duration-500"
                          style={{ width: `${Math.max(0, Math.min(100, barWidth))}%` }}
                        />
                      </div>
                      <div className="mt-2 text-xs font-medium text-stone-500">
                        {row.minutes} min logged {rangeLabel}
                      </div>
                      <div className="mt-1 text-base font-bold tabular-nums text-[#014421]">
                        {totalMinutes > 0 ? `${practiceShare}%` : "—"}
                        <span className="ml-1 text-xs font-semibold text-stone-600">
                          of your practice {rangeLabel}
                        </span>
                      </div>
                      {!isAllTimeView ? (
                        <>
                          <div className="mt-1 text-xs text-gray-600">Recommended: {recMin}-{recMax} min</div>
                          <div className={`mt-1 text-xs font-semibold ${
                            status === 'Needs attention'
                              ? 'text-red-600'
                              : status === 'Strong focus'
                                ? 'text-[#014421]'
                                : 'text-amber-600'
                          }`}>
                            {status}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
                  </>
                );
              })()}
            </div>
        </section>
      </div>
    </div>
  );
}
