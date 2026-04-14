"use client";

import React, { useEffect, useState, useMemo, useRef, Component, ErrorInfo, ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import {
  ArrowLeft,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FileText,
  BarChart3,
  Percent,
  Navigation2,
  Shuffle,
  CircleDot,
  Bird,
  AlertTriangle,
  ArrowUpDown,
  Table2,
  PieChart,
  Clock,
} from "lucide-react";
import { getBenchmarkGoals } from "@/app/stats/page";
import type { PlayerGoalRow, GoalFocusArea } from "@/types/playerGoals";
import type { PracticeLogAccountabilityRow } from "@/types/playerGoals";
import {
  computeGoalAccountabilityState,
  minutesFromPracticeRows,
  startOfWeekMondayLocal,
  endOfWeekSundayLocal,
  DEFAULT_PLAYER_GOAL,
  normalizeFocusArea,
} from "@/lib/goalAccountability";
import { parsePracticeAllocationFromDb } from "@/lib/practiceAllocation";
import type { PracticeHoursMap } from "@/lib/practiceAllocation";
import { weeklyHoursToPreset, weeklyHoursPresetToStoredHours } from "@/lib/goalPresetConstants";
import { buildCoachPlayerCombineSnapshot } from "@/lib/coachPlayerCombineSnapshot";
import { TROPHY_LIST } from "@/lib/academyTrophies";
import { fetchUserTrophiesForUser } from "@/lib/userTrophiesDb";
import type { AcademyTrophyDbRow } from "@/components/AcademyTrophyCasePanel";
import { AdvancedApproachStatsPanel } from "@/components/stats/AdvancedApproachStatsPanel";
import { CoachDeepDiveProfilePanels } from "@/components/coach/CoachDeepDiveProfilePanels";
import { CoachDeepDiveRoundTrendCharts } from "@/components/coach/CoachDeepDiveRoundTrendCharts";
import type { RoundTrendPoint } from "@/components/coach/CoachDeepDiveRoundTrendCharts";

class CoachDeepDiveErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Deep Dive error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
          <p className="text-gray-600 mb-6 text-center">Something went wrong loading this player.</p>
          <Link
            href="/dashboard/coach"
            className="inline-flex items-center px-6 py-3 bg-[#014421] text-white font-semibold rounded-lg hover:bg-[#01331a] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Coach Dashboard
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}

function getDefaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

/** Readable minutes/hours for parent/committee-facing copy */
function formatReportMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 min";
  const roundedMin = Math.round(min * 10) / 10;
  if (roundedMin >= 60) {
    const h = Math.round((roundedMin / 60) * 10) / 10;
    return `${h} hr`;
  }
  return Number.isInteger(roundedMin) ? `${roundedMin} min` : `${roundedMin} min`;
}

export default function PlayerDeepDivePage() {
  const router = useRouter();
  const params = useParams();
  const playerId = (params?.id as string) ?? "";
  const { user, loading: authLoading, profileLoading } = useAuth();
  // ROLE CHECK: Temporarily commented out for debugging - let page load for everyone
  const role = (user as any)?.role;

  const [playerName, setPlayerName] = useState<string>("");
  const [playerHandicap, setPlayerHandicap] = useState<number>(54);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(getDefaultRange);
  const [practiceData, setPracticeData] = useState<any[]>([]);
  const [practiceRawData, setPracticeRawData] = useState<any[]>([]);
  const [practiceConsistencyData, setPracticeConsistencyData] = useState<any[]>([]);
  const [skillTrendData, setSkillTrendData] = useState<any[]>([]);
  const [roundsData, setRoundsData] = useState<any[]>([]);
  /** Handicap updates in range (if RLS allows coach read); else charts fall back to per-round handicap. */
  const [handicapHistoryForChart, setHandicapHistoryForChart] = useState<any[]>([]);
  const [perfStatsData, setPerfStatsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerGoal, setPlayerGoal] = useState<PlayerGoalRow | null>(null);
  const [playerPracticeLogs, setPlayerPracticeLogs] = useState<any[]>([]);
  const [playerPracticeAll, setPlayerPracticeAll] = useState<any[]>([]);
  const [playerTotalXp, setPlayerTotalXp] = useState<number | null>(null);
  const [playerUnlockedTrophies, setPlayerUnlockedTrophies] = useState<AcademyTrophyDbRow[]>([]);
  /** false = strongest vs benchmark first; true = largest benchmark gaps first */
  const [metricMatrixWorstFirst, setMetricMatrixWorstFirst] = useState(false);
  /** false = most minutes in range first; true = least first */
  const [practiceAllocLeastFirst, setPracticeAllocLeastFirst] = useState(false);
  /** Advanced approach matrix aggregates: match 9- vs 18-hole rounds */
  const [deepDiveApproachHoleFilter, setDeepDiveApproachHoleFilter] = useState<"9" | "18">("18");

  /** After first successful profile load for this player, date-range refetches skip the full-screen loader. */
  const coachDeepDiveBlockingLoadDoneRef = useRef(false);

  useEffect(() => {
    coachDeepDiveBlockingLoadDoneRef.current = false;
    setPlayerName("");
    setPlayerUnlockedTrophies([]);
  }, [playerId]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    // REDIRECT: Temporarily disabled - let page render to see errors instead of bouncing
    // if (!user) { router.push("/login"); return; }
    // if (!playerId || playerId === "undefined") { router.push("/dashboard/coach"); return; }
    if (user && playerId && playerId !== "undefined") {
      fetchAllData();
    }
  }, [user, authLoading, profileLoading, router, playerId, dateRange]);

  const fetchAllData = async () => {
    try {
      // Date-range changes should refresh in place; only initial / player switch uses full-screen loading.
      if (!coachDeepDiveBlockingLoadDoneRef.current) {
        setIsLoading(true);
      }
      setError(null);
      const supabase = createClient();

      const startDate = new Date(dateRange.start + "T12:00:00");
      const endDate = new Date(dateRange.end + "T23:59:59");
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      // Fetch player profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, initial_handicap, total_xp")
        .eq("id", playerId)
        .single();
      console.log("Supabase Response:", { data: profile, error: profileError });
      if (profileError) {
        setPlayerUnlockedTrophies([]);
        setError(profileError.message);
        setIsLoading(false);
        return;
      }
      if (!profile) {
        setPlayerUnlockedTrophies([]);
        setError("Profile not found");
        setIsLoading(false);
        return;
      }
      setPlayerName(profile?.full_name || "Player");
      coachDeepDiveBlockingLoadDoneRef.current = true;
      const hcapRaw = profile?.initial_handicap ?? 54;
      const hcapNum = typeof hcapRaw === "number" ? hcapRaw : Number(hcapRaw);
      const hcapInt = Math.min(54, Math.max(-5, Math.round(Number.isFinite(hcapNum) ? hcapNum : 54)));
      setPlayerHandicap(hcapInt);
      const xpRaw = (profile as { total_xp?: unknown })?.total_xp;
      const xpNum = typeof xpRaw === "number" ? xpRaw : Number(xpRaw);
      setPlayerTotalXp(Number.isFinite(xpNum) ? xpNum : null);

      const [goalRes, logsCombineRes, practiceAllRes] = await Promise.all([
        supabase
          .from("player_goals")
          .select(
            "user_id, scoring_milestone, focus_area, weekly_hour_commitment, practice_allocation, lowest_score, current_handicap, updated_at",
          )
          .eq("user_id", playerId)
          .maybeSingle(),
        supabase
          .from("practice_logs")
          .select(
            "id, user_id, log_type, created_at, duration_minutes, total_points, matrix_score_average, perfect_putt_count, strike_data",
          )
          .eq("user_id", playerId)
          .order("created_at", { ascending: false })
          .limit(900),
        supabase
          .from("practice")
          .select("*")
          .eq("user_id", playerId)
          .order("created_at", { ascending: false })
          .limit(1600),
      ]);

      const { rows: trophyRows, error: trophiesErr } = await fetchUserTrophiesForUser(supabase, playerId);
      if (trophiesErr) {
        console.warn("[CoachDeepDive] user_trophies:", trophiesErr.message);
        setPlayerUnlockedTrophies([]);
      } else {
        const enriched: AcademyTrophyDbRow[] = trophyRows.map((r) => {
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
        setPlayerUnlockedTrophies(enriched);
      }

      if (goalRes.error && goalRes.error.code !== "PGRST116") {
        console.warn("[CoachDeepDive] player_goals:", goalRes.error.message);
      }
      setPlayerGoal((goalRes.data as PlayerGoalRow | null) ?? null);

      let logRows: any[] = [];
      if (logsCombineRes.error) {
        const msg = (logsCombineRes.error.message || "").toLowerCase();
        if (msg.includes("duration_minutes") || msg.includes("column")) {
          const fallback = await supabase
            .from("practice_logs")
            .select("id, user_id, log_type, created_at")
            .eq("user_id", playerId)
            .order("created_at", { ascending: false })
            .limit(900);
          if (!fallback.error && fallback.data) {
            logRows = fallback.data.map((r) => ({ ...r, duration_minutes: null }));
          } else {
            console.warn("[CoachDeepDive] practice_logs:", logsCombineRes.error.message);
          }
        } else {
          console.warn("[CoachDeepDive] practice_logs:", logsCombineRes.error.message);
        }
      } else {
        logRows = logsCombineRes.data || [];
      }
      setPlayerPracticeLogs(logRows);
      setPlayerPracticeAll(practiceAllRes.error ? [] : practiceAllRes.data || []);

      // Practice data: try drill_logs first, fallback to practice table
      let practiceRows: any[] = [];
      const { data: drillLogsData, error: drillLogsErr } = await supabase
        .from("drill_logs")
        .select("created_at, duration_minutes, type")
        .eq("user_id", playerId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: true });
      if (!drillLogsErr && drillLogsData?.length) {
        practiceRows = drillLogsData;
      } else {
        const { data: practiceData } = await supabase
          .from("practice")
          .select("created_at, duration_minutes, type")
          .eq("user_id", playerId)
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: true });
        practiceRows = practiceData || [];
      }
      setPracticeRawData(practiceRows);

      // Aggregate practice by date
      const practiceByDate: Record<string, { date: string; count: number; minutes: number }> = {};
      practiceRows.forEach((row: any) => {
        const date = (row.created_at || "").split("T")[0];
        if (!date) return;
        if (!practiceByDate[date]) {
          practiceByDate[date] = { date, count: 0, minutes: 0 };
        }
        practiceByDate[date].count += 1;
        practiceByDate[date].minutes += row.duration_minutes || 0;
      });
      const practiceChartData = Object.values(practiceByDate)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date: new Date(d.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          sessions: d.count,
          minutes: d.minutes,
        }));
      setPracticeData(practiceChartData);

      // Practice Consistency: days active vs total days per week
      const weekBlocks: Record<string, { activeDays: Set<string>; totalDays: number }> = {};
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const weekStart = new Date(d);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const key = weekStart.toISOString().split("T")[0];
        if (!weekBlocks[key]) {
          weekBlocks[key] = { activeDays: new Set(), totalDays: 0 };
        }
        const inRange = d >= startDate && d <= endDate;
        if (inRange) weekBlocks[key].totalDays += 1;
      }
      Object.keys(practiceByDate).forEach((dateStr) => {
        const d = new Date(dateStr);
        const weekStart = new Date(d);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const key = weekStart.toISOString().split("T")[0];
        if (weekBlocks[key]) weekBlocks[key].activeDays.add(dateStr);
      });
      const consistencyData = Object.entries(weekBlocks)
        .filter(([, v]) => v.totalDays > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekKey, v]) => ({
          week: new Date(weekKey + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          consistencyPct: Math.round((v.activeDays.size / v.totalDays) * 100),
          daysActive: v.activeDays.size,
          totalDays: v.totalDays,
        }));
      setPracticeConsistencyData(consistencyData);

      // Shot quality / success rate from drill_scores and rounds
      const { data: drillScores } = await supabase
        .from("drill_scores")
        .select("created_at, score")
        .eq("user_id", playerId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: true });

      const startDateStr = startDate.toISOString().split("T")[0];
      const endDateStr = endDate.toISOString().split("T")[0];

      // Rounds and performance_stats
      const { data: roundsRows } = await supabase
        .from("rounds")
        .select("*")
        .eq("user_id", playerId)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .order("date", { ascending: true });

      setRoundsData(roundsRows || []);

      let handicapHistInRange: any[] = [];
      const hcpHistRes = await supabase
        .from("handicap_history")
        .select("created_at, new_handicap")
        .eq("user_id", playerId)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: true });
      if (!hcpHistRes.error && Array.isArray(hcpHistRes.data) && hcpHistRes.data.length > 0) {
        handicapHistInRange = hcpHistRes.data;
      }
      setHandicapHistoryForChart(handicapHistInRange);

      let perfStatsRows: any[] = [];
      const { data: perfStatsData, error: perfStatsErr } = await supabase
        .from("performance_stats")
        .select("*")
        .eq("user_id", playerId)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .order("date", { ascending: true });
      if (!perfStatsErr && perfStatsData?.length) {
        perfStatsRows = perfStatsData;
        setPerfStatsData(perfStatsData);
      } else {
        setPerfStatsData([]);
      }

      // Build Skill Trend chart: Fairways hit %, Green contact (GIR) % from performance_stats or rounds
      const skillByDate: Record<string, { date: string; firPct: number; girPct: number }> = {};

      if (perfStatsRows.length > 0) {
        perfStatsRows.forEach((r: any) => {
          const date = r.date || (r.created_at || "").split("T")[0];
          if (!date) return;
          skillByDate[date] = {
            date,
            firPct: Number(r.fairways_pct ?? r.fir_pct ?? r.fairways_hit_pct ?? 0) || 0,
            girPct: Number(r.gir_pct ?? r.green_contact_pct ?? 0) || 0,
          };
        });
      } else if (roundsRows && roundsRows.length > 0) {
        (roundsRows as any[]).forEach((r) => {
          const date = r.date || (r.created_at || "").split("T")[0];
          if (!date) return;
          const firTotal = (r.fir_left || 0) + (r.fir_hit || 0) + (r.fir_right || 0);
          const firPct = firTotal > 0 ? ((r.fir_hit || 0) / firTotal) * 100 : 0;
          const goingForGreen = r.going_for_green ?? r.goingForGreen ?? 18;
          const totalGir = r.total_gir ?? r.totalGir ?? 0;
          const girPct = goingForGreen > 0 ? (totalGir / goingForGreen) * 100 : 0;
          skillByDate[date] = {
            date,
            firPct: Math.round(firPct * 10) / 10,
            girPct: Math.round(girPct * 10) / 10,
          };
        });
      } else if (drillScores && drillScores.length > 0) {
        const byDate: Record<string, number[]> = {};
        drillScores.forEach((row: any) => {
          const date = (row.created_at || "").split("T")[0];
          if (!date) return;
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(Number(row.score) || 0);
        });
        Object.entries(byDate).forEach(([date, scores]) => {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          skillByDate[date] = {
            date,
            firPct: 0,
            girPct: Math.min(100, Math.round(avg * 10)),
          };
        });
      }

      const skillChartData = Object.values(skillByDate)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          date: new Date(d.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          "Fairways Hit %": d.firPct,
          "Green Contact %": d.girPct,
        }));
      setSkillTrendData(skillChartData);

    } catch (err: any) {
      setError(err?.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const practiceAllocationData = useMemo(() => {
    if (!practiceRawData || practiceRawData.length === 0) {
      return {
        driving: 0, irons: 0, wedges: 0, chipping: 0, bunkers: 0, putting: 0, mentalStrategy: 0, onCourse: 0,
      };
    }
    
    const getMinutes = (category: string, altTypes?: string[]) => {
      const types = [category, ...(altTypes || [])];
      return practiceRawData
        .filter((p: any) => types.some(t => (p.type || '').toLowerCase() === t.toLowerCase()))
        .reduce((sum: number, p: any) => sum + (p.duration_minutes || 0), 0);
    };

    return {
      driving: getMinutes('Driving', ['Range Mat', 'Tee']),
      irons: getMinutes('Irons', ['Approach', 'Range Grass', 'Full Swing']),
      wedges: getMinutes('Wedges', ['Wedge Play']),
      chipping: getMinutes('Chipping', ['Short Game', 'Chipping Green']),
      bunkers: getMinutes('Bunkers', ['Bunker', 'Sand Play']),
      putting: getMinutes('Putting', ['Putting Green']),
      mentalStrategy: getMinutes('Mental/Strategy', ['Mental Game', 'Mental', 'Strategy']),
      onCourse: getMinutes('On-Course', ['On Course']),
    };
  }, [practiceRawData]);

  const practiceAllocationDisplay = useMemo(() => {
    const start = new Date(`${dateRange.start}T00:00:00`);
    const end = new Date(`${dateRange.end}T23:59:59`);
    const rangeDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const weeksInRange = Math.max(1 / 7, rangeDays / 7);
    const monthsInRange = Math.max(1 / 30, rangeDays / 30.44);

    let targets: PracticeHoursMap | null = null;
    if (playerGoal) {
      const budget = weeklyHoursPresetToStoredHours(
        weeklyHoursToPreset(Number(playerGoal.weekly_hour_commitment)),
      );
      targets = parsePracticeAllocationFromDb(
        playerGoal.practice_allocation,
        budget,
        normalizeFocusArea(playerGoal.focus_area),
      );
    }

    const rows: {
      focus: GoalFocusArea;
      label: string;
      minutes: number;
      goalHoursWeek: number;
    }[] = [
      { focus: "Driving", label: "Driving", minutes: Number(practiceAllocationData.driving ?? 0), goalHoursWeek: 0 },
      { focus: "Irons", label: "Irons", minutes: Number(practiceAllocationData.irons ?? 0), goalHoursWeek: 0 },
      { focus: "Wedges", label: "Wedges", minutes: Number(practiceAllocationData.wedges ?? 0), goalHoursWeek: 0 },
      { focus: "Chipping", label: "Chipping", minutes: Number(practiceAllocationData.chipping ?? 0), goalHoursWeek: 0 },
      { focus: "Bunkers", label: "Bunkers", minutes: Number(practiceAllocationData.bunkers ?? 0), goalHoursWeek: 0 },
      { focus: "Putting", label: "Putting", minutes: Number(practiceAllocationData.putting ?? 0), goalHoursWeek: 0 },
      {
        focus: "On-Course",
        label: "On-course",
        minutes: Number(practiceAllocationData.onCourse ?? 0),
        goalHoursWeek: 0,
      },
      {
        focus: "Mental/Strategy",
        label: "Mental / strategy",
        minutes: Number(practiceAllocationData.mentalStrategy ?? 0),
        goalHoursWeek: 0,
      },
    ];

    for (const r of rows) {
      r.goalHoursWeek = targets ? Math.max(0, Number(targets[r.focus] ?? 0)) : 0;
    }

    const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);
    const sorted = [...rows].sort((a, b) => {
      const d = b.minutes - a.minutes;
      if (d !== 0) return practiceAllocLeastFirst ? -d : d;
      return a.label.localeCompare(b.label);
    });

    const withTime = sorted.filter((r) => r.minutes > 0);
    const zeroTime = sorted.filter((r) => r.minutes <= 0);

    const avgTotalPerDay = Math.round((totalMinutes / rangeDays) * 10) / 10;
    const avgTotalPerWeek = Math.round((totalMinutes / weeksInRange) * 10) / 10;
    const avgTotalPerMonth = Math.round((totalMinutes / monthsInRange) * 10) / 10;

    return {
      sorted,
      withTime,
      zeroTime,
      totalMinutes,
      rangeDays,
      weeksInRange,
      monthsInRange,
      avgTotalPerDay,
      avgTotalPerWeek,
      avgTotalPerMonth,
      hasTargets: targets != null,
    };
  }, [practiceAllocationData, dateRange, playerGoal, practiceAllocLeastFirst]);

  // --- DERIVED METRICS ---
  const { bigSix, penaltyStats, metricMatrix } = useMemo(() => {
    const getNum = (val: any, fallback = 0) => {
      if (val === undefined || val === null || val === '') return fallback;
      const n = Number(val);
      return isNaN(n) ? fallback : n;
    };

    // Normalize rounds: ensure chip + up/down fields exist (handle all DB column variants)
    const normalizedRounds = roundsData.map((r: any) => ({
      ...r,
      _chipInside6ft: getNum(r.chip_inside_6ft ?? r.inside_6ft ?? r.chipInside6ft ?? r.inside6ft),
      _upDownAttempts: getNum(r.up_and_down_conversions ?? r.conversions) + getNum(r.missed ?? r.up_and_down_missed),
    }));

    const sortedRounds = [...normalizedRounds].sort((a: any, b: any) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const nRounds = sortedRounds.length;
    const goals = getBenchmarkGoals(playerHandicap);

    if (nRounds === 0) {
      return { bigSix: null, penaltyStats: null, metricMatrix: [] };
    }

    const getChipInside6ft = (r: any) => r._chipInside6ft ?? getNum(r.chip_inside_6ft ?? r.inside_6ft);
    const getUpDownAttempts = (r: any) => r._upDownAttempts ?? (getNum(r.up_and_down_conversions) + getNum(r.missed, getNum(r.up_and_down_missed, 0)));

    // 1. BIG SIX
    const last5 = sortedRounds.slice(-5);
    const scoringAvg = last5.reduce((s: number, r: any) => s + getNum(r.score), 0) / Math.max(1, last5.length);
    
    const totalGir = sortedRounds.reduce((s: number, r: any) => s + getNum(r.total_gir), 0);
    const totalHolesForGir = sortedRounds.reduce((s: number, r: any) => s + getNum(r.holes, 18), 0);
    const girPct = totalHolesForGir > 0 ? (totalGir / totalHolesForGir) * 100 : 0;

    const totalFirHit = sortedRounds.reduce((s: number, r: any) => s + getNum(r.fir_hit), 0);
    const totalFirShots = sortedRounds.reduce((s: number, r: any) => s + getNum(r.fir_hit) + getNum(r.fir_left) + getNum(r.fir_right), 0);
    const firPct = totalFirShots > 0 ? (totalFirHit / totalFirShots) * 100 : 0;

    const totalScrambleSuccess = sortedRounds.reduce((s: number, r: any) => s + getNum(r.up_and_down_conversions), 0);
    const totalScrambleAttempts = sortedRounds.reduce((s: number, r: any) => s + getNum(r.up_and_down_conversions) + getNum(r.missed), 0);
    const scramblePct = totalScrambleAttempts > 0 ? (totalScrambleSuccess / totalScrambleAttempts) * 100 : 0;

    const totalPutts = sortedRounds.reduce((s: number, r: any) => s + getNum(r.total_putts), 0);
    const totalHoles = sortedRounds.reduce((s: number, r: any) => s + getNum(r.holes, 18), 0);
    const puttsPer18 = totalHoles > 0 ? (totalPutts / totalHoles) * 18 : 0;

    const totalBirdies = sortedRounds.reduce((s: number, r: any) => s + getNum(r.birdies), 0);
    const birdiesPer18 = totalHoles > 0 ? (totalBirdies / totalHoles) * 18 : 0;

    const bigSixResult = {
      scoringAvg: Math.round(scoringAvg * 10) / 10,
      girPct: Math.round(girPct * 10) / 10,
      firPct: Math.round(firPct * 10) / 10,
      scramblePct: Math.round(scramblePct * 10) / 10,
      puttsPer18: Math.round(puttsPer18 * 10) / 10,
      birdiesPer18: Math.round(birdiesPer18 * 10) / 10,
    };

    // 2. PENALTY & ERROR TRACKER
    const totalPenalties = sortedRounds.reduce((s: number, r: any) => s + getNum(r.tee_penalties) + getNum(r.approach_penalties), 0);
    const total3Putts = sortedRounds.reduce((s: number, r: any) => s + getNum(r.three_putts), 0);
    const totalDoublePlus = sortedRounds.reduce((s: number, r: any) => s + getNum(r.double_bogeys), 0);

    const penaltyStatsResult = {
      penaltiesPerRound: Math.round((totalPenalties / nRounds) * 10) / 10,
      threePuttsPerRound: Math.round((total3Putts / nRounds) * 10) / 10,
      doublesPerRound: Math.round((totalDoublePlus / nRounds) * 10) / 10,
    };

        const calculateMetric = (name: string, rounds: any[], extractor: (r: any) => number, goal: number, isLowerBetter = false) => {
      if (!rounds || rounds.length === 0) {
        return { name, current: 0, goal: Math.round(goal * 10) / 10, gap: 0, isLowerBetter, trend: "neutral" as const };
      }
      // Sum the extracted values rather than taking an average of percentages
      if (name.includes("%") && name !== "Scoring Avg") {
        let totalNumerator = 0;
        let totalDenominator = 0;
        
        rounds.forEach(r => {
          if (name === "GIR %") {
            totalNumerator += getNum(r.total_gir);
            totalDenominator += getNum(r.holes, 18);
          } else if (name === "FIR %") {
            totalNumerator += getNum(r.fir_hit);
            totalDenominator += getNum(r.fir_hit) + getNum(r.fir_left) + getNum(r.fir_right);
          } else if (name === "Scrambling %") {
            totalNumerator += getNum(r.up_and_down_conversions);
            totalDenominator += getNum(r.up_and_down_conversions) + getNum(r.missed);
          } else if (name === "Bunker Save %") {
            totalNumerator += getNum(r.bunker_saves);
            totalDenominator += getNum(r.bunker_attempts) + getNum(r.bunker_saves);
          } else if (name === "GIR 8ft %") {
            totalNumerator += getNum(r.gir_8ft);
            totalDenominator += getNum(r.holes, 18);
          } else if (name === "GIR 20ft %") {
            totalNumerator += getNum(r.gir_20ft);
            totalDenominator += getNum(r.holes, 18);
          } else if (name === "Chips Inside 6ft %") {
            totalNumerator += getChipInside6ft(r);
            totalDenominator += getUpDownAttempts(r);
          } else if (name === "Putts Under 6ft %") {
            const attempts = getNum(r.putts_under_6ft_attempts);
            totalNumerator += getNum(r.made_under_6ft, getNum(r.made6ftAndIn, attempts > 0 ? attempts - getNum(r.missed_6ft_and_in) : 0));
            totalDenominator += attempts;
          }
        });
        
        const current = totalDenominator > 0 ? (totalNumerator / totalDenominator) * 100 : 0;
        const gap = isLowerBetter ? goal - current : current - goal;
        
        let trend: "up" | "down" | "neutral" = "neutral";
        if (rounds.length > 1) {
          const latestVal = extractor(rounds[rounds.length - 1]);
          if (latestVal > current * 1.05) trend = "up";
          else if (latestVal < current * 0.95) trend = "down";
        }
        
        return { name, current: Math.round(current * 10) / 10, goal: Math.round(goal * 10) / 10, gap: Math.round(gap * 10) / 10, isLowerBetter, trend };
      }
      
      const current = rounds.reduce((s: number, r: any) => s + extractor(r), 0) / Math.max(1, rounds.length);
      const gap = isLowerBetter ? goal - current : current - goal;
      
      let trend: "up" | "down" | "neutral" = "neutral";
      if (rounds.length > 1) {
        const latest = extractor(rounds[rounds.length - 1]);
        const prevAvg = rounds.slice(0, -1).reduce((s: number, r: any) => s + extractor(r), 0) / (rounds.length - 1);
        if (latest > prevAvg * 1.05) trend = "up";
        else if (latest < prevAvg * 0.95) trend = "down";
      }
      
      return { name, current: Math.round(current * 10) / 10, goal: Math.round(goal * 10) / 10, gap: Math.round(gap * 10) / 10, isLowerBetter, trend };
    };

    const matrix = [
      calculateMetric("Scoring Avg", sortedRounds, (r: any) => getNum(r.score), goals.score, true),
      calculateMetric("GIR %", sortedRounds, (r: any) => (getNum(r.total_gir) / getNum(r.holes, 18)) * 100, goals.gir),
      calculateMetric("FIR %", sortedRounds, (r: any) => {
        const tot = getNum(r.fir_hit) + getNum(r.fir_left) + getNum(r.fir_right);
        return tot > 0 ? (getNum(r.fir_hit) / tot) * 100 : 0;
      }, goals.fir),
      calculateMetric("Scrambling %", sortedRounds, (r: any) => {
        const tot = getNum(r.up_and_down_conversions) + getNum(r.missed);
        return tot > 0 ? (getNum(r.up_and_down_conversions) / tot) * 100 : 0;
      }, goals.upAndDown),
      calculateMetric("Putts Per 18", sortedRounds, (r: any) => (getNum(r.total_putts) / getNum(r.holes, 18)) * 18, goals.putts, true),
      calculateMetric("Bunker Save %", sortedRounds, (r: any) => {
        const tot = getNum(r.bunker_attempts) + getNum(r.bunker_saves);
        return tot > 0 ? (getNum(r.bunker_saves) / tot) * 100 : 0;
      }, goals.bunkerSaves),
      calculateMetric("GIR 8ft %", sortedRounds, (r: any) => {
        const holes = getNum(r.holes, 18);
        return holes > 0 ? (getNum(r.gir_8ft) / holes) * 100 : 0;
      }, goals.within8ft),
      calculateMetric("GIR 20ft %", sortedRounds, (r: any) => {
        const holes = getNum(r.holes, 18);
        return holes > 0 ? (getNum(r.gir_20ft) / holes) * 100 : 0;
      }, goals.within20ft),
      calculateMetric("Chips Inside 6ft %", sortedRounds, (r: any) => {
        if (!r) return 0;
        const denominator = getUpDownAttempts(r);
        const numerator = getChipInside6ft(r);
        if (denominator <= 0) return 0;
        return (Number(numerator) / Number(denominator)) * 100;
      }, goals.chipsInside6ft),
      calculateMetric("Putts Under 6ft %", sortedRounds, (r: any) => {
        const tot = getNum(r.putts_under_6ft_attempts);
        // Account for different app versions saving the 'made' count to different columns
        const made = Math.max(getNum(r.made_under_6ft), getNum(r.missed_6ft_and_in), getNum(r.made6ftAndIn));
        return tot > 0 ? (made / tot) * 100 : 0;
      }, goals.puttMake6ft),
      calculateMetric("3-Putts / Round", sortedRounds, (r: any) => (getNum(r.three_putts) / getNum(r.holes, 18)) * 18, Math.max(0, goals.putts / 18 - 1), true),
      calculateMetric("Tee Penalties", sortedRounds, (r: any) => (getNum(r.tee_penalties) / getNum(r.holes, 18)) * 18, goals.teePenalties, true),
      calculateMetric("Approach Penalties", sortedRounds, (r: any) => (getNum(r.approach_penalties) / getNum(r.holes, 18)) * 18, goals.approachPenalties, true),
      calculateMetric("Total Penalties", sortedRounds, (r: any) => ((getNum(r.tee_penalties) + getNum(r.approach_penalties)) / getNum(r.holes, 18)) * 18, goals.totalPenalties, true),
      calculateMetric("Birdies / Round", sortedRounds, (r: any) => (getNum(r.birdies) / getNum(r.holes, 18)) * 18, goals.birdies),
      calculateMetric("Pars / Round", sortedRounds, (r: any) => (getNum(r.pars) / getNum(r.holes, 18)) * 18, goals.pars),
      calculateMetric("Bogeys / Round", sortedRounds, (r: any) => (getNum(r.bogeys) / getNum(r.holes, 18)) * 18, goals.bogeys, true),
      calculateMetric("Double Bogeys+ / Round", sortedRounds, (r: any) => (getNum(r.double_bogeys) / getNum(r.holes, 18)) * 18, goals.doubleBogeys, true),
    ];

    if (perfStatsData && perfStatsData.length > 0) {
      const latestStats = perfStatsData[perfStatsData.length - 1];
      const standardKeys = [
        "id", "user_id", "date", "created_at", "updated_at",
        "fairways_pct", "fir_pct", "fairways_hit_pct", 
        "gir_pct", "green_contact_pct"
      ];
      
      Object.keys(latestStats).forEach(key => {
        if (!standardKeys.includes(key) && typeof latestStats[key] === "number") {
          const label = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
          const current = latestStats[key];
          const goal = (goals as any)[key] || 0;
          
          matrix.push({ 
            name: label, 
            current: Math.round(current * 10) / 10, 
            goal: Math.round(goal * 10) / 10, 
            gap: Math.round((current - goal) * 10) / 10, 
            isLowerBetter: key.includes("penalties") || key.includes("score") || key.includes("putts"), 
            trend: "neutral" 
          });
        }
      });
    }

    return { bigSix: bigSixResult, penaltyStats: penaltyStatsResult, metricMatrix: matrix };
  }, [roundsData, perfStatsData, playerHandicap]);

  const strokeOpportunityRows = useMemo(() => {
    if (!metricMatrix || metricMatrix.length === 0) return [];

    const impactConfig: Record<string, { strokesPerUnit: number; unit: string; category: string }> = {
      "Total Penalties": { strokesPerUnit: 1.0, unit: "strokes/penalty", category: "Driving + Approach" },
      "3-Putts / Round": { strokesPerUnit: 1.0, unit: "strokes/3-putt", category: "Putting" },
      "Double Bogeys+ / Round": { strokesPerUnit: 1.0, unit: "strokes/double+", category: "Course Management" },
      "Putts Per 18": { strokesPerUnit: 0.8, unit: "strokes/putt", category: "Putting" },
      "Tee Penalties": { strokesPerUnit: 1.0, unit: "strokes/penalty", category: "Driving" },
      "Approach Penalties": { strokesPerUnit: 1.0, unit: "strokes/penalty", category: "Approach" },
      "Scrambling %": { strokesPerUnit: 0.05, unit: "strokes/%", category: "Short Game" },
      "Bunker Save %": { strokesPerUnit: 0.035, unit: "strokes/%", category: "Bunkers" },
      "Chips Inside 6ft %": { strokesPerUnit: 0.03, unit: "strokes/%", category: "Chipping" },
      "Putts Under 6ft %": { strokesPerUnit: 0.035, unit: "strokes/%", category: "Putting" },
      "GIR %": { strokesPerUnit: 0.02, unit: "strokes/%", category: "Approach" },
      "FIR %": { strokesPerUnit: 0.01, unit: "strokes/%", category: "Driving" },
      "GIR 8ft %": { strokesPerUnit: 0.01, unit: "strokes/%", category: "Approach" },
      "GIR 20ft %": { strokesPerUnit: 0.008, unit: "strokes/%", category: "Approach" },
      "Scoring Avg": { strokesPerUnit: 1.0, unit: "strokes", category: "Overall" },
    };

    return metricMatrix
      .map((stat: any) => {
        const name = String(stat?.name ?? "");
        const current = Number(stat?.current ?? stat?.value ?? 0);
        const goal = Number(stat?.goal ?? 0);
        const isLowerBetter = Boolean(stat?.isLowerBetter);
        const config = impactConfig[name];

        if (!config) return null;

        const improvementUnits = isLowerBetter
          ? Math.max(0, current - goal)
          : Math.max(0, goal - current);
        const estimatedGain = improvementUnits * config.strokesPerUnit;

        if (estimatedGain <= 0) return null;

        return {
          name,
          current: Math.round(current * 10) / 10,
          goal: Math.round(goal * 10) / 10,
          category: config.category,
          estimatedGain: Math.round(estimatedGain * 100) / 100,
          unit: config.unit,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.estimatedGain - a.estimatedGain)
      .slice(0, 3);
  }, [metricMatrix]);

  /** Gap is defined so higher = better vs benchmark; default sort is strongest vs benchmark first. */
  const sortedMetricMatrix = useMemo(() => {
    const gapNum = (row: any) => {
      const n = Number(row?.gap);
      return Number.isFinite(n) ? n : 0;
    };
    const rows = [...metricMatrix];
    rows.sort((a: any, b: any) => {
      const bestFirst = gapNum(b) - gapNum(a);
      if (bestFirst !== 0) return metricMatrixWorstFirst ? -bestFirst : bestFirst;
      return String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
    });
    return rows;
  }, [metricMatrix, metricMatrixWorstFirst]);

  const coachGoalMerged = useMemo((): PlayerGoalRow => {
    return (
      playerGoal ??
      ({
        user_id: playerId,
        ...DEFAULT_PLAYER_GOAL,
      } as PlayerGoalRow)
    );
  }, [playerGoal, playerId]);

  const coachAccountability = useMemo(() => {
    if (!playerId) return null;
    const weekStart = startOfWeekMondayLocal();
    const weekEnd = endOfWeekSundayLocal(weekStart);
    const ws = weekStart.getTime();
    const we = weekEnd.getTime();
    const weekLogs = (playerPracticeLogs || []).filter((r) => {
      const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
      return Number.isFinite(t) && t >= ws && t < we;
    }) as PracticeLogAccountabilityRow[];
    const supplemental = minutesFromPracticeRows(playerPracticeAll || [], playerId, weekStart, weekEnd);
    return computeGoalAccountabilityState(coachGoalMerged, weekLogs, supplemental, playerId);
  }, [playerId, coachGoalMerged, playerPracticeLogs, playerPracticeAll]);

  const coachCombineSnapshot = useMemo(
    () =>
      buildCoachPlayerCombineSnapshot(
        playerId,
        playerName || "Player",
        playerPracticeAll,
        playerPracticeLogs,
      ),
    [playerId, playerName, playerPracticeAll, playerPracticeLogs],
  );

  const dateRangeLabel = useMemo(
    () =>
      `${new Date(dateRange.start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${new Date(dateRange.end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    [dateRange.start, dateRange.end],
  );

  const roundTrendChartPoints = useMemo(() => {
    const parseRoundDayMs = (dateVal: unknown) => {
      const s = typeof dateVal === "string" ? dateVal.slice(0, 10) : "";
      if (!s) return NaN;
      return new Date(`${s}T12:00:00`).getTime();
    };

    const gross: RoundTrendPoint[] = (roundsData as any[])
      .filter((r) => Number.isFinite(Number(r?.score)) && Number.isFinite(parseRoundDayMs(r?.date)))
      .map((r) => ({ sortAt: parseRoundDayMs(r.date), y: Number(r.score) }))
      .sort((a, b) => a.sortAt - b.sortAt);

    const fromHist: RoundTrendPoint[] = handicapHistoryForChart
      .filter((h: any) => h?.created_at && Number.isFinite(Number(h?.new_handicap)))
      .map((h: any) => ({
        sortAt: new Date(h.created_at).getTime(),
        y: Number(h.new_handicap),
      }))
      .sort((a, b) => a.sortAt - b.sortAt);

    const fromRounds: RoundTrendPoint[] = (roundsData as any[])
      .filter((r) => Number.isFinite(Number(r?.handicap)) && Number.isFinite(parseRoundDayMs(r?.date)))
      .map((r) => ({ sortAt: parseRoundDayMs(r.date), y: Number(r.handicap) }))
      .sort((a, b) => a.sortAt - b.sortAt);

    const handicap = fromHist.length > 0 ? fromHist : fromRounds;

    return { gross, handicap };
  }, [roundsData, handicapHistoryForChart]);

  // Role check removed - app stays on page even if user isn't a coach
  if (!role) console.log("REDIRECTION BLOCKED");

  // Show database error instead of redirecting (e.g. RLS denial)
  if (error) {
    return (
      <div className="p-20 text-white bg-red-600 min-h-screen flex flex-col items-center justify-center text-center">
        DATABASE ERROR: {error}
      </div>
    );
  }

  if (!user || !playerName || isLoading) {
    return (
      <div className="p-20 h-screen flex flex-col items-center justify-center text-center text-orange-600 bg-white">
        Loading Player Stats...
      </div>
    );
  }

  // Defensive: ensure we have minimal data before rendering full UI
  if (!playerId || playerId === "undefined") {
    return (
      <div className="p-20 h-screen flex flex-col items-center justify-center text-center text-orange-600 bg-white">
        Loading Player Stats...
      </div>
    );
  }

  const downloadPlayerReport = () => window.print();

  return (
    <CoachDeepDiveErrorBoundary>
    <div className="coach-deepdive-root w-full max-w-3xl mx-auto min-w-0 flex flex-col bg-[#f4f6f4] overflow-x-hidden">
      {/* Header */}
      <header className="coach-deepdive-no-print shrink-0 w-full bg-[#014421] text-white pt-3 pb-4 px-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <Link
            href="/dashboard/coach"
            className="inline-flex items-center text-green-100 hover:text-white transition-colors text-sm min-w-0 truncate"
          >
            <ArrowLeft className="w-4 h-4 mr-2 shrink-0" />
            Back to Coach Dashboard
          </Link>
          <button
            type="button"
            onClick={downloadPlayerReport}
            className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-white/50 bg-white/10 text-white hover:bg-white/20 transition-colors text-xs font-semibold"
            aria-label="Generate Report"
          >
            <FileText className="w-4 h-4" />
            Generate Report
          </button>
        </div>
        <h1 className="text-xl font-bold tracking-tight truncate min-w-0 mb-1">
          {playerName || "Player"}
        </h1>
        <p className="text-xs text-white/80 font-medium">Coach deep dive · Player profile & performance</p>
        <div className="flex flex-col gap-3 w-full max-w-sm mt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-white/90">
              <span>From</span>
              <input
                type="date"
                value={dateRange.start}
                max={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                className="px-2 py-1 rounded bg-white/20 text-white border border-white/30 focus:outline-none focus:ring-1 focus:ring-white/50 [color-scheme:dark] [&::-webkit-datetime-edit]:text-white [&::-webkit-datetime-edit-fields-wrapper]:text-white [&::-webkit-datetime-edit-text]:text-white/80 [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:invert"
              />
            </label>
            <label className="flex items-center gap-1.5 text-white/90">
              <span>To</span>
              <input
                type="date"
                value={dateRange.end}
                min={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                className="px-2 py-1 rounded bg-white/20 text-white border border-white/30 focus:outline-none focus:ring-1 focus:ring-white/50 [color-scheme:dark] [&::-webkit-datetime-edit]:text-white [&::-webkit-datetime-edit-fields-wrapper]:text-white [&::-webkit-datetime-edit-text]:text-white/80 [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:invert"
              />
            </label>
          </div>
        </div>
      </header>

      <div id="coach-deepdive-scroll" className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-32">
        <div className="w-full min-w-0" id="coach-deepdive-pdf-content">
          {/* Print-only header */}
          <div className="hidden print:block text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">
            Player Report — {playerName || "Player"} ({dateRange.start} to {dateRange.end})
          </div>

        <div className="mb-6">
          <CoachDeepDiveProfilePanels
            playerName={playerName || "Player"}
            playerHandicap={playerHandicap}
            totalXp={playerTotalXp}
            playerGoal={playerGoal}
            goalsNotSaved={!playerGoal}
            accountability={coachAccountability}
            combineRows={coachCombineSnapshot}
            roundsInRange={roundsData.length}
            practiceSessionsInRange={practiceRawData.length}
            dateRangeLabel={dateRangeLabel}
            unlockedTrophies={playerUnlockedTrophies}
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Benchmark handicap (coaching slider) */}
        <div className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#014421]/10 text-[#014421]">
              <Target className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-stone-900">Benchmark handicap</h3>
              <p className="text-xs text-stone-500">Used for on-page targets vs tour benchmarks</p>
            </div>
          </div>
          <div className="flex items-center gap-4 min-w-0">
            <input
              type="range"
              min="-5"
              max="54"
              step={1}
              value={playerHandicap}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setPlayerHandicap(Number.isFinite(v) ? Math.min(54, Math.max(-5, v)) : 54);
              }}
              className="flex-1 min-w-0 h-2 bg-stone-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#014421] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white"
              style={{
                background: `linear-gradient(to right, #014421 0%, #014421 ${((playerHandicap + 5) / 59) * 100}%, #e7e5e4 ${((playerHandicap + 5) / 59) * 100}%, #e7e5e4 100%)`,
              }}
            />
            <div className="min-w-[3.5rem] text-right text-lg font-semibold tabular-nums text-stone-900">
              {playerHandicap >= 0 ? `${playerHandicap}` : `+${Math.abs(playerHandicap)}`}
            </div>
          </div>
        </div>

        {/* Core scoring metrics (last 5 rounds aggregate) */}
        {bigSix && (
          <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
            <div className="mb-5 flex items-center gap-3 border-b border-stone-100 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                <BarChart3 className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-stone-900">Core scoring metrics</h3>
                <p className="text-xs text-stone-500">Recent form · rolling view in selected date range</p>
              </div>
            </div>
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
          </section>
        )}

        {/* Scoring leaks (penalties & errors per round) */}
        {penaltyStats && (
          <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
            <div className="mb-5 flex items-center gap-3 border-b border-stone-100 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
                <AlertTriangle className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-stone-900">Scoring leaks</h3>
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
                <div key={row.label} className="coach-deepdive-stat-card px-3 py-4 text-center sm:px-4">
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
        )}

        {strokeOpportunityRows.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6 mb-6">
            <h2 className="text-lg font-black text-gray-900 mb-5 flex items-center gap-2 uppercase tracking-tighter">
              <span className="w-2 h-6 bg-[#FF9800] rounded-full" />
              Top 3 Stroke Opportunities
            </h2>
            <div className="space-y-3">
              {strokeOpportunityRows.map((row: any, idx: number) => (
                <div key={`${row.name}-${idx}`} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-gray-900">{row.name}</div>
                      <div className="text-xs text-gray-500">{row.category} focus</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black text-[#014421]">-{row.estimatedGain.toFixed(2)}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">strokes / round</div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    Current: {row.current} | Goal: {row.goal} ({row.unit})
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full metric matrix — ranked vs benchmark; toggle sort */}
        {metricMatrix.length > 0 && (
          <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-stone-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#014421]/10 text-[#014421]">
                  <Table2 className="h-4 w-4" aria-hidden />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight text-stone-900">Full metric matrix</h3>
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
            <div className="divide-y divide-stone-100">
              {sortedMetricMatrix.map((stat: any, i) => {
                const val = (stat as any)?.statValue ?? (stat as any)?.value ?? (stat as any)?.current ?? 0;
                const goalVal = (stat as any)?.goal ?? 0;
                const gapVal = (stat as any)?.gap ?? 0;
                const isMeetingGoal = (stat as any)?.isLowerBetter ? val <= goalVal : val >= goalVal;
                const isPositive = gapVal > 0;
                const name = String((stat as any)?.name ?? "");

                return (
                  <div
                    key={`${name}-${i}`}
                    className="coach-deepdive-stat-card flex items-center justify-between gap-3 py-3.5 first:pt-0 transition-colors hover:bg-stone-50/80 sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                        <span className="truncate">{name}</span>
                        {(stat as any)?.trend === "up" && (
                          <ArrowUpRight
                            className={`h-3.5 w-3.5 shrink-0 ${(stat as any)?.isLowerBetter ? "text-rose-500" : "text-emerald-600"}`}
                            aria-hidden
                          />
                        )}
                        {(stat as any)?.trend === "down" && (
                          <ArrowDownRight
                            className={`h-3.5 w-3.5 shrink-0 ${(stat as any)?.isLowerBetter ? "text-emerald-600" : "text-rose-500"}`}
                            aria-hidden
                          />
                        )}
                        {(stat as any)?.trend === "neutral" && (
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
                        {isMeetingGoal ? "On target" : `${isPositive ? "+" : ""}${gapVal}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Practice allocation — time by focus vs saved weekly plan */}
        <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
          <div className="mb-4 flex flex-col gap-4 border-b border-stone-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                <PieChart className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-stone-900">Practice allocation</h3>
                <p className="text-xs text-stone-500">
                  Totals and daily/weekly/monthly averages for the selected period (suitable for player / parent /
                  committee reports) · sorted by{" "}
                  {practiceAllocLeastFirst ? "least time first" : "most time first"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPracticeAllocLeastFirst((v) => !v)}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 shadow-sm transition-colors hover:border-stone-300 hover:bg-white sm:self-auto"
            >
              <Clock className="h-3.5 w-3.5 text-stone-500" aria-hidden />
              {practiceAllocLeastFirst ? "Most time first" : "Least time first"}
            </button>
          </div>

          <div className="mb-4 space-y-3 rounded-2xl border border-stone-100 bg-stone-50/80 p-4 text-xs leading-relaxed text-stone-600 print:break-inside-avoid">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Selected date range</p>
              <p className="mt-0.5 font-semibold text-stone-900">{dateRangeLabel}</p>
              <p className="mt-2">
                <span className="font-semibold text-stone-800">{practiceAllocationDisplay.totalMinutes} min</span>{" "}
                logged across{" "}
                <span className="font-medium text-stone-800">{practiceAllocationDisplay.rangeDays} calendar days</span>
                {practiceAllocationDisplay.hasTargets
                  ? ". Badges compare each category to the player’s saved weekly plan, scaled to this window."
                  : ". Bar width shows each category’s share of time in this window."}
              </p>
            </div>
            {practiceAllocationDisplay.totalMinutes > 0 ? (
              <div className="border-t border-stone-200/80 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500">
                  All practice combined — averaged over this period
                </p>
                <p className="mt-2 text-stone-700">
                  About{" "}
                  <span className="font-semibold text-stone-900">
                    {formatReportMinutes(practiceAllocationDisplay.avgTotalPerDay)}
                  </span>{" "}
                  per day ·{" "}
                  <span className="font-semibold text-stone-900">
                    {formatReportMinutes(practiceAllocationDisplay.avgTotalPerWeek)}
                  </span>{" "}
                  per week ·{" "}
                  <span className="font-semibold text-stone-900">
                    {formatReportMinutes(practiceAllocationDisplay.avgTotalPerMonth)}
                  </span>{" "}
                  per month
                </p>
                <p className="mt-1.5 text-[11px] text-stone-500">
                  Averages spread totals evenly across every day in the range (including days with no session), so they
                  reflect overall pace rather than only days with practice logged.
                </p>
              </div>
            ) : (
              <p className="border-t border-stone-200/80 pt-3 text-[11px] text-stone-500">
                No minutes in this window — period averages are not shown.
              </p>
            )}
          </div>

          <div className="divide-y divide-stone-100 rounded-2xl border border-stone-100 bg-stone-50/40">
            {practiceAllocationDisplay.sorted.map((row) => {
              const isZero = row.minutes <= 0;
              const total = practiceAllocationDisplay.totalMinutes;
              const sharePct = total > 0 ? Math.round((row.minutes / total) * 1000) / 10 : 0;
              const avgDailyMin = Math.round((row.minutes / practiceAllocationDisplay.rangeDays) * 10) / 10;
              const avgWeeklyMin = Math.round((row.minutes / practiceAllocationDisplay.weeksInRange) * 10) / 10;
              const avgMonthlyMin = Math.round((row.minutes / practiceAllocationDisplay.monthsInRange) * 10) / 10;
              const planMinutesThisWindow =
                row.goalHoursWeek > 0
                  ? (row.goalHoursWeek / 7) * practiceAllocationDisplay.rangeDays * 60
                  : 0;
              const actualBarPct = total > 0 ? Math.min(100, sharePct) : 0;
              const planVsActual =
                planMinutesThisWindow > 0 && row.minutes > 0
                  ? Math.round((row.minutes / planMinutesThisWindow) * 100)
                  : null;
              const planMissed = planMinutesThisWindow > 0 && isZero;

              return (
                <div
                  key={row.focus}
                  className={`coach-deepdive-stat-card px-3 transition-colors hover:bg-white/90 sm:px-4 ${isZero ? "py-2.5" : "py-3.5"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900">{row.label}</p>
                      {!isZero ? (
                        <p className="mt-0.5 text-[11px] text-stone-500">
                          {sharePct}% of all practice time in this window
                        </p>
                      ) : row.goalHoursWeek > 0 ? (
                        <p className="mt-0.5 text-[11px] text-stone-500">
                          Plan {row.goalHoursWeek.toFixed(1)}h/wk · ~{Math.round(planMinutesThisWindow)}m this window
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-stone-400">No time logged</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-baseline gap-2">
                      {planVsActual != null ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            planVsActual >= 100
                              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                              : "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
                          }`}
                        >
                          {planVsActual}% of plan
                        </span>
                      ) : planMissed ? (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600 ring-1 ring-stone-200">
                          0% of plan
                        </span>
                      ) : null}
                      <div className="text-right">
                        <span className="block text-sm font-semibold tabular-nums text-stone-900">
                          {row.minutes} min
                        </span>
                        {!isZero ? (
                          <span className="mt-0.5 block text-[10px] font-medium leading-tight text-stone-500">
                            Avg {formatReportMinutes(avgDailyMin)}/day · {formatReportMinutes(avgWeeklyMin)}/wk ·{" "}
                            {formatReportMinutes(avgMonthlyMin)}/mo
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-200/90">
                    <div className="h-full rounded-full bg-[#014421]" style={{ width: `${actualBarPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {practiceAllocationDisplay.zeroTime.length > 0 && practiceAllocationDisplay.totalMinutes === 0 ? (
            <p className="mt-3 text-center text-[11px] text-stone-500">
              No practice tagged in this window. Expand the dates or confirm sessions are logging with facility type.
            </p>
          ) : null}
        </section>

        <CoachDeepDiveRoundTrendCharts
          grossPoints={roundTrendChartPoints.gross}
          handicapPoints={roundTrendChartPoints.handicap}
          rangeCaption={`Same date range as this report · ${dateRangeLabel}`}
        />

        <section
          id="coach-deepdive-advanced-approach"
          className="mb-6 print:break-inside-avoid print:shadow-none"
        >
          <AdvancedApproachStatsPanel
            rounds={roundsData}
            holeFilter={deepDiveApproachHoleFilter}
            className="border-stone-200 shadow-md print:border-stone-400"
            description={`Rounds in this report (${dateRangeLabel}). Only ${deepDiveApproachHoleFilter}-hole rounds with directional logs are included.`}
            headerEnd={
              <div className="flex gap-0.5 rounded-xl border border-stone-200 bg-stone-50/90 p-0.5">
                <button
                  type="button"
                  onClick={() => setDeepDiveApproachHoleFilter("9")}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase transition-colors ${
                    deepDiveApproachHoleFilter === "9"
                      ? "bg-[#014421] text-white shadow-sm"
                      : "text-stone-600 hover:bg-white"
                  }`}
                >
                  9
                </button>
                <button
                  type="button"
                  onClick={() => setDeepDiveApproachHoleFilter("18")}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase transition-colors ${
                    deepDiveApproachHoleFilter === "18"
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

          {/* Print-only footer */}
          <div className="hidden print:block mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
            Blake Dowd Golf — blakedowdgolf.com
          </div>
        </div>
      </div>
    </div>
    </CoachDeepDiveErrorBoundary>
  );
}
