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
} from "lucide-react";
import { getBenchmarkGoals } from "@/app/stats/page";
import type { PlayerGoalRow } from "@/types/playerGoals";
import type { PracticeLogAccountabilityRow } from "@/types/playerGoals";
import {
  computeGoalAccountabilityState,
  minutesFromPracticeRows,
  startOfWeekMondayLocal,
  endOfWeekSundayLocal,
  DEFAULT_PLAYER_GOAL,
} from "@/lib/goalAccountability";
import { buildCoachPlayerCombineSnapshot } from "@/lib/coachPlayerCombineSnapshot";
import { TROPHY_LIST } from "@/lib/academyTrophies";
import { fetchUserTrophiesForUser } from "@/lib/userTrophiesDb";
import type { AcademyTrophyDbRow } from "@/components/AcademyTrophyCasePanel";
import { AdvancedApproachStatsPanel } from "@/components/stats/AdvancedApproachStatsPanel";
import { CoachDeepDiveProfilePanels } from "@/components/coach/CoachDeepDiveProfilePanels";
import { CoachDeepDiveRoundTrendCharts } from "@/components/coach/CoachDeepDiveRoundTrendCharts";
import { PracticeVsGoalsSection } from "@/components/stats/PracticeVsGoalsSection";
import type { PracticeVsGoalsRow } from "@/lib/practiceVsGoalsModel";
import type { RoundTrendPoint } from "@/components/coach/CoachDeepDiveRoundTrendCharts";
import {
  computeDeepDiveRoundMetrics,
  computeStrokeOpportunityTop3,
  sortMetricMatrix,
} from "@/lib/deepDiveRoundMetrics";

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

  /** Rolling week/month/all buckets: merge date-range drill/practice rows with recent `practice` table rows (deduped). */
  const practiceRowsForGoals = useMemo((): PracticeVsGoalsRow[] => {
    const m = new Map<string, PracticeVsGoalsRow>();
    const add = (r: { type?: string; duration_minutes?: number; created_at?: string; practice_date?: string }) => {
      if (!r) return;
      const k = `${String(r.created_at || "")}|${String(r.type || "")}|${Number(r.duration_minutes || 0)}`;
      if (!m.has(k)) {
        m.set(k, {
          type: r.type,
          duration_minutes: r.duration_minutes,
          created_at: r.created_at,
          practice_date: r.practice_date,
        });
      }
    };
    (practiceRawData || []).forEach((r) => add(r));
    (playerPracticeAll || []).forEach((r) => add(r));
    return Array.from(m.values());
  }, [playerPracticeAll, practiceRawData]);

  // --- DERIVED METRICS (shared with stats page) ---
  const benchmarkGoalsForMatrix = useMemo(
    () => getBenchmarkGoals(playerHandicap),
    [playerHandicap],
  );

  const { bigSix, penaltyStats, metricMatrix } = useMemo(
    () =>
      computeDeepDiveRoundMetrics(roundsData as Record<string, unknown>[], benchmarkGoalsForMatrix, {
        perfStatsData,
      }),
    [roundsData, benchmarkGoalsForMatrix, perfStatsData],
  );

  const strokeOpportunityRows = useMemo(() => computeStrokeOpportunityTop3(metricMatrix), [metricMatrix]);

  const sortedMetricMatrix = useMemo(
    () => sortMetricMatrix(metricMatrix, metricMatrixWorstFirst),
    [metricMatrix, metricMatrixWorstFirst],
  );

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
            <h2 className="text-lg font-black text-gray-900 mb-5 flex items-center gap-2 tracking-tighter">
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

        <PracticeVsGoalsSection
          practiceRows={practiceRowsForGoals}
          playerGoalRow={playerGoal}
          playerGoalsLoaded={!isLoading}
          variant="coach"
          typeMatch="coach"
        />

        <CoachDeepDiveRoundTrendCharts
          grossPoints={roundTrendChartPoints.gross}
          handicapPoints={roundTrendChartPoints.handicap}
          rangeCaption={`Same date range as this report · ${dateRangeLabel}`}
        />

        <section
          id="coach-deepdive-advanced-approach"
          className="mb-8 mt-2 print:mt-0 print:break-inside-avoid print:shadow-none"
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
