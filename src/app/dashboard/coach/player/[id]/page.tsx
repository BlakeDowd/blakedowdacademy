"use client";

import React, { useEffect, useState, useMemo, useRef, Component, ErrorInfo, ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Download, Loader2 } from "lucide-react";
import {
  initials,
  ReportEmpty,
  ReportSection,
  ReportSubLabel,
  ReportTile,
} from "@/components/coach/CoachReportParts";
import { Segmented } from "@/components/profile/ProfileStatsParts";
import { getBenchmarkGoals } from "@/lib/benchmarkGoals";
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
import { TestPlayerButton } from "@/components/coaching/TestPlayerButton";
import { PlayerEmail } from "@/components/coaching/PlayerEmail";
import { GamePlanCard } from "@/components/coaching/GamePlanCard";
import { CoachDeepDiveRoundTrendCharts } from "@/components/coach/CoachDeepDiveRoundTrendCharts";
import { PracticeVsGoalsSection } from "@/components/stats/PracticeVsGoalsSection";
import type { PracticeVsGoalsRow } from "@/lib/practiceVsGoalsModel";
import type { RoundTrendPoint } from "@/components/coach/CoachDeepDiveRoundTrendCharts";
import {
  computeDeepDiveRoundMetrics,
  computeStrokeOpportunityTop3,
  sortMetricMatrix,
} from "@/lib/deepDiveRoundMetrics";
import { fairwaysPossibleFor, onlyEighteenHoleRounds, roundTracksStat } from "@/lib/roundStatTracking";

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

function rangeForDays(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function getDefaultRange() {
  return rangeForDays(30);
}

type RangePreset = "30" | "90" | "365" | "custom";

const RANGE_PRESETS: readonly { id: RangePreset; label: string; days: number }[] = [
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "365", label: "1 year", days: 365 },
];

const DATE_INPUT =
  "mt-1 block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-900 outline-none focus:border-[#014421] focus:bg-white";

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

      setRoundsData(onlyEighteenHoleRounds(roundsRows || []));

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
          if (!roundTracksStat(r, "fairways") && !roundTracksStat(r, "gir")) return;
          const firTotal = fairwaysPossibleFor(
            r.fir_hit || 0,
            r.fir_left || 0,
            r.fir_right || 0,
            r.fairways_possible,
          );
          const firPct = firTotal > 0 ? ((r.fir_hit || 0) / firTotal) * 100 : 0;
          const holes = r.holes || 18;
          const totalGir = r.total_gir ?? r.totalGir ?? 0;
          const girPct = (totalGir / holes) * 100;
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

  const hasDirectionalShots = useMemo(
    () =>
      roundsData.some(
        (r) => Array.isArray(r.approach_directional_shots) && r.approach_directional_shots.length > 0,
      ),
    [roundsData],
  );

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

  if (error) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Couldn&apos;t load this player: {error}
        </p>
        <Link href="/dashboard/coach" className="text-sm font-semibold text-[#014421] hover:underline">
          Back to players
        </Link>
      </div>
    );
  }

  if (!user || !playerName || isLoading || !playerId || playerId === "undefined") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading player report…
      </div>
    );
  }

  const downloadPlayerReport = () => window.print();
  const name = playerName || "Player";
  const activePreset: RangePreset =
    RANGE_PRESETS.find((p) => {
      const r = rangeForDays(p.days);
      return r.start === dateRange.start && r.end === dateRange.end;
    })?.id ?? "custom";
  const fmt = (v: number, unit = "") => (v < 0 ? null : `${v}${unit}`);

  return (
    <CoachDeepDiveErrorBoundary>
    <div className="coach-deepdive-root mx-auto flex w-full min-w-0 max-w-3xl flex-col overflow-x-hidden bg-stone-50">
      <header className="coach-deepdive-no-print shrink-0 px-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard/coach"
            className="inline-flex items-center gap-1.5 py-1.5 pr-2 text-sm font-semibold text-stone-600 hover:text-stone-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Players
          </Link>
          <button
            type="button"
            onClick={downloadPlayerReport}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Save PDF
          </button>
        </div>

        <div className="mt-3 flex items-start gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#014421] text-base font-bold text-white"
            aria-hidden
          >
            {initials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-stone-900">{name}</h1>
            <PlayerEmail key={playerId} playerId={playerId} playerName={name} />
          </div>
        </div>
        <TestPlayerButton playerId={playerId} playerName={name} className="mt-3 w-full" />

        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#014421]">Date range</span>
            <Segmented
              label="Date range"
              value={activePreset}
              onChange={(id) => {
                const preset = RANGE_PRESETS.find((p) => p.id === id);
                if (preset) setDateRange(rangeForDays(preset.days));
              }}
              options={RANGE_PRESETS}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-stone-500">
              From
              <input
                type="date"
                value={dateRange.start}
                max={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                className={DATE_INPUT}
              />
            </label>
            <label className="text-[11px] font-medium text-stone-500">
              To
              <input
                type="date"
                value={dateRange.end}
                min={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                className={DATE_INPUT}
              />
            </label>
          </div>
        </div>
      </header>

      <div id="coach-deepdive-scroll" className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-32 pt-3">
        <div className="w-full min-w-0 space-y-3" id="coach-deepdive-pdf-content">
          <div className="hidden border-b border-gray-200 pb-2 text-sm font-bold text-gray-900 print:block">
            Player Report — {name} ({dateRange.start} to {dateRange.end})
          </div>

          <CoachDeepDiveProfilePanels
            playerName={name}
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

          {user?.id && (
            <GamePlanCard
              key={`plan-${playerId}`}
              studentId={playerId}
              studentName={name}
              viewerId={user.id}
              viewerIsCoach
            />
          )}

          <ReportSection title="Scoring" subtitle="Averages over the rounds in this range">
            {bigSix ? (
              <>
                <div id="coach-deepdive-big-six-grid" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <ReportTile label="Scoring average" value={fmt(bigSix.scoringAvg)} />
                  <ReportTile label="Greens in regulation" value={fmt(bigSix.girPct, "%")} />
                  <ReportTile label="Fairways hit" value={fmt(bigSix.firPct, "%")} />
                  <ReportTile label="Scrambling" value={fmt(bigSix.scramblePct, "%")} />
                  <ReportTile label="Putts per round" value={fmt(bigSix.puttsPer18)} />
                  <ReportTile label="Birdies per round" value={fmt(bigSix.birdiesPer18)} />
                </div>
                {penaltyStats && (
                  <>
                    <ReportSubLabel>Shots leaking · per round</ReportSubLabel>
                    <div className="grid grid-cols-3 gap-2">
                      <ReportTile label="Penalties" value={fmt(penaltyStats.penaltiesPerRound)} />
                      <ReportTile label="3-putts" value={fmt(penaltyStats.threePuttsPerRound)} />
                      <ReportTile label="Double+" value={fmt(penaltyStats.doublesPerRound)} />
                    </div>
                  </>
                )}
              </>
            ) : (
              <ReportEmpty>No rounds logged in this range.</ReportEmpty>
            )}
          </ReportSection>

          {strokeOpportunityRows.length > 0 && (
            <ReportSection title="Biggest stroke savers" subtitle="Where reaching the target saves the most shots">
              <ol className="divide-y divide-stone-100">
                {strokeOpportunityRows.map((row, idx) => (
                  <li key={`${row.name}-${idx}`} className="coach-deepdive-stat-card flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#014421]/10 text-xs font-bold text-[#014421]">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-800">{row.name}</p>
                      <p className="mt-0.5 text-[11px] text-stone-500">
                        Now {row.current} · Target {row.goal} {row.unit}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-semibold tabular-nums text-[#014421]">−{row.estimatedGain.toFixed(2)}</p>
                      <p className="text-[10px] text-stone-400">shots / round</p>
                    </div>
                  </li>
                ))}
              </ol>
            </ReportSection>
          )}

          {metricMatrix.length > 0 && (
            <ReportSection
              title="Every stat vs target"
              subtitle={`Targets for a ${playerHandicap >= 0 ? playerHandicap : `+${Math.abs(playerHandicap)}`} handicap`}
              aside={
                <Segmented
                  label="Sort stats"
                  value={metricMatrixWorstFirst ? "gaps" : "strengths"}
                  onChange={(id) => setMetricMatrixWorstFirst(id === "gaps")}
                  options={[
                    { id: "strengths", label: "Strengths" },
                    { id: "gaps", label: "Gaps" },
                  ]}
                />
              }
            >
              <div className="coach-deepdive-no-print mb-3 flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5">
                <span className="shrink-0 text-[11px] font-medium text-stone-500">Compare to</span>
                <input
                  type="range"
                  min="-5"
                  max="54"
                  step={1}
                  value={playerHandicap}
                  aria-label="Benchmark handicap"
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setPlayerHandicap(Number.isFinite(v) ? Math.min(54, Math.max(-5, v)) : 54);
                  }}
                  className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#014421] [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white"
                  style={{
                    background: `linear-gradient(to right, #014421 0%, #014421 ${((playerHandicap + 5) / 59) * 100}%, #e7e5e4 ${((playerHandicap + 5) / 59) * 100}%, #e7e5e4 100%)`,
                  }}
                />
                <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-stone-900">
                  {playerHandicap >= 0 ? playerHandicap : `+${Math.abs(playerHandicap)}`}
                </span>
              </div>
              <div className="divide-y divide-stone-100">
                {sortedMetricMatrix.map((stat, i) => {
                  const met = stat.isLowerBetter ? stat.current <= stat.goal : stat.current >= stat.goal;
                  const TrendIcon = stat.trend === "up" ? ArrowUpRight : stat.trend === "down" ? ArrowDownRight : null;
                  const trendGood = stat.trend === "up" ? !stat.isLowerBetter : stat.isLowerBetter;
                  return (
                    <div
                      key={`${stat.name}-${i}`}
                      className="coach-deepdive-stat-card flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-stone-800">
                          <span className="truncate">{stat.name}</span>
                          {TrendIcon && (
                            <TrendIcon
                              className={`h-3.5 w-3.5 shrink-0 ${trendGood ? "text-emerald-600" : "text-rose-500"}`}
                              aria-label={trendGood ? "Improving" : "Getting worse"}
                            />
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] text-stone-500">
                          Target {stat.goal}
                          <span className={`font-semibold ${met ? "text-emerald-700" : "text-orange-600"}`}>
                            {" "}
                            · {met ? "On target" : `${stat.gap > 0 ? "+" : ""}${stat.gap}`}
                          </span>
                        </p>
                      </div>
                      <p className="shrink-0 text-lg font-semibold tabular-nums text-stone-900">{stat.current}</p>
                    </div>
                  );
                })}
              </div>
            </ReportSection>
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
            rangeCaption={dateRangeLabel}
          />

          {hasDirectionalShots && (
            <ReportSection
              id="coach-deepdive-advanced-approach"
              title="Approach detail"
              subtitle="Misses and greens from Add Directional Misses on their rounds"
            >
              <AdvancedApproachStatsPanel
                rounds={roundsData}
                showHeader={false}
                className="border-0! p-0! shadow-none! sm:p-0!"
              />
            </ReportSection>
          )}

          <div className="mt-8 hidden border-t border-gray-200 pt-4 text-center text-xs text-gray-500 print:block">
            Blake Dowd Golf — blakedowdgolf.com
          </div>
        </div>
      </div>
    </div>
    </CoachDeepDiveErrorBoundary>
  );
}
