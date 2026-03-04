"use client";

import React, { useEffect, useState, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { ArrowLeft, Sparkles, Loader2, Target, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { getBenchmarkGoals } from "@/app/stats/page";

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

  const [playerName, setPlayerName] = useState<string>("");
  const [playerHandicap, setPlayerHandicap] = useState<number>(54);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(getDefaultRange);
  const [practiceData, setPracticeData] = useState<any[]>([]);
  const [practiceRawData, setPracticeRawData] = useState<any[]>([]);
  const [practiceConsistencyData, setPracticeConsistencyData] = useState<any[]>([]);
  const [skillTrendData, setSkillTrendData] = useState<any[]>([]);
  const [roundsData, setRoundsData] = useState<any[]>([]);
  const [perfStatsData, setPerfStatsData] = useState<any[]>([]);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string[] | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!playerId || playerId === "undefined") {
      router.push("/dashboard/coach");
      return;
    }
    fetchAllData();
  }, [user, authLoading, profileLoading, router, playerId, dateRange]);

  const fetchAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const supabase = createClient();

      const startDate = new Date(dateRange.start + "T12:00:00");
      const endDate = new Date(dateRange.end + "T23:59:59");
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      // Fetch player profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, initial_handicap")
        .eq("id", playerId)
        .single();
      setPlayerName(profile?.full_name || "Player");
      const hcap = profile?.initial_handicap ?? 54;
      setPlayerHandicap(typeof hcap === "number" ? hcap : Number(hcap) || 54);

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

  const generateAIAnalysis = async () => {
    setIsGeneratingAi(true);
    setAiSummary(null);

    // Rule-based analysis from practice + rounds data (no external AI API)
    const bullets: string[] = [];
    const totalSessions = practiceData.reduce((a, d) => a + (d.sessions || 0), 0);
    const totalMinutes = practiceData.reduce((a, d) => a + (d.minutes || 0), 0);
    const avgFir = skillTrendData.length > 0
      ? skillTrendData.reduce((a, d) => a + (d["Fairways Hit %"] || 0), 0) / skillTrendData.length
      : 0;
    const avgGir = skillTrendData.length > 0
      ? skillTrendData.reduce((a, d) => a + (d["Green Contact %"] || 0), 0) / skillTrendData.length
      : 0;
    const avgSuccess = (avgFir + avgGir) / 2;
    const hasRounds = roundsData.length > 0;

    if (totalSessions === 0 && !hasRounds) {
      bullets.push(
        "No practice or round data in this period. Encourage the player to log practice sessions and rounds to unlock personalized insights."
      );
    } else {
      const startD = new Date(dateRange.start);
      const endD = new Date(dateRange.end);
      const rangeDays = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)));
      if (totalSessions < 3 && rangeDays >= 30) {
        bullets.push(
          `Practice frequency is low (${totalSessions} session${totalSessions !== 1 ? "s" : ""} in ${rangeDays} days). Recommend at least 3 practice sessions per week to see measurable improvement.`
        );
      } else if (totalMinutes > 0) {
        const avgPerWeek = (totalMinutes / rangeDays) * 7;
        bullets.push(
          `Averaging ${Math.round(avgPerWeek)} minutes of practice per week. ${avgPerWeek >= 90 ? "Solid consistency—maintain this volume." : "Consider increasing to 90+ minutes per week for faster progress."}`
        );
      }

      if (skillTrendData.length > 0) {
        if (avgSuccess >= 70) {
          bullets.push(
            "Shot quality trend is strong. Focus on maintaining consistency and addressing any remaining weak spots (e.g., bunkers or long putts)."
          );
        } else if (avgSuccess >= 50) {
          bullets.push(
            "Shot quality is improving. Prioritize drills that target the lowest-performing areas from recent rounds or practice logs."
          );
        } else {
          bullets.push(
            "Shot quality has room to grow. Recommend more deliberate practice with specific drills and clear success criteria rather than unstructured range time."
          );
        }
      }

      if (hasRounds && bullets.length < 3) {
        const avgScore =
          roundsData.reduce((a: number, r: any) => a + (r.score || 0), 0) /
          roundsData.length;
        bullets.push(
          `Rounds logged: ${roundsData.length}. ${avgScore < 95 ? "Scoring is trending well." : "Focus on course management and short game to lower scores."}`
        );
      }
    }

    while (bullets.length < 3) {
      bullets.push(
        "Review progress again after more data is logged in the selected date range."
      );
    }
    setAiSummary(bullets.slice(0, 3));
    setIsGeneratingAi(false);
  };

  if (authLoading || profileLoading || (isLoading && !playerName)) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="p-10 text-center">Verifying Coach Access...</div>
      </div>
    );
  }

  return (
    <CoachDeepDiveErrorBoundary>
    <div className="w-full max-w-md mx-auto min-w-0 flex flex-col bg-gray-50 overflow-x-hidden">
      {/* Header */}
      <header className="shrink-0 w-full bg-[#014421] text-white pt-3 pb-4 px-4">
        <Link
          href="/dashboard/coach"
          className="inline-flex items-center text-green-100 hover:text-white mb-2 transition-colors text-sm min-w-0 truncate"
        >
          <ArrowLeft className="w-4 h-4 mr-2 shrink-0" />
          Back to Coach Dashboard
        </Link>
        <h1 className="text-lg font-bold truncate min-w-0 mb-3">
          {playerName || "Player"} — Deep Dive
        </h1>
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

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-32">
        <div className="w-full min-w-0">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Target Goal Slider - Moved above Big 6 */}
        <div className="mb-6 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider flex items-center gap-2">
            <Target className="w-4 h-4 text-[#014421]" />
            Target Goal Handicap
          </div>
          <div className="flex items-center gap-4 min-w-0">
            <input
              type="range"
              min="-5"
              max="54"
              step="0.1"
              value={playerHandicap}
              onChange={(e) => setPlayerHandicap(parseFloat(e.target.value))}
              className="flex-1 min-w-0 h-2.5 bg-gray-200 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#014421] [&::-webkit-slider-thumb]:shadow-md"
              style={{
                background: `linear-gradient(to right, #014421 0%, #014421 ${((playerHandicap + 5) / 59) * 100}%, #E5E7EB ${((playerHandicap + 5) / 59) * 100}%, #E5E7EB 100%)`
              }}
            />
            <div className="text-lg font-black text-gray-900 whitespace-nowrap shrink-0 w-16 text-right">
              {playerHandicap >= 0 ? `${playerHandicap.toFixed(1)}` : `+${Math.abs(playerHandicap).toFixed(1)}`}
            </div>
          </div>
        </div>

        {/* 1. "Big Six" Scorecard */}
        {bigSix && (
          <div className="mb-6 w-full overflow-hidden">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-[#014421]" />
              The Big Six Scorecard
            </h2>
            <div className="grid grid-cols-2 gap-3 pb-4">
              {[
                { label: "Scoring Avg", statValue: bigSix.scoringAvg, unit: "", icon: "🎯", color: "text-blue-600" },
                { label: "GIR %", statValue: bigSix.girPct, unit: "%", icon: "⛳", color: "text-green-600" },
                { label: "Fairway %", statValue: bigSix.firPct, unit: "%", icon: "🛣️", color: "text-[#014421]" },
                { label: "Scrambling %", statValue: bigSix.scramblePct, unit: "%", icon: "🪄", color: "text-purple-600" },
                { label: "Putts / Round", statValue: bigSix.puttsPer18, unit: "", icon: "🧤", color: "text-orange-600" },
                { label: "Birdies / Round", statValue: bigSix.birdiesPer18, unit: "", icon: "🐦", color: "text-red-500" },
              ].map((stat, i) => {
                const statValue = (stat?.statValue ?? stat?.value ?? 0);
                return (
                <div key={i} className="bg-white rounded-2xl shadow-md border border-gray-100 p-3 sm:p-4">
                  <div className="text-xl mb-1">{stat.icon}</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter truncate">{stat.label}</div>
                  <div className={`text-2xl font-black ${stat.color}`}>
                    {statValue}{stat.unit}
                  </div>
                </div>
              );})}
            </div>
          </div>
        )}

        {/* 2. Penalty & Error Tracker - dedicated card */}
        {penaltyStats && (
          <div className="bg-[#1a1a1a] rounded-3xl p-6 mb-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Target className="w-24 h-24 text-white" />
            </div>
            <div className="relative z-10">
              <h2 className="text-sm font-black text-[#FF4444] uppercase tracking-widest mb-4 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Strokes Lost Tracker
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="text-white/50 text-[10px] uppercase font-bold mb-1">Penalties</div>
                  <div className="text-2xl font-bold text-white leading-none">{penaltyStats.penaltiesPerRound}</div>
                  <div className="text-white/30 text-[9px] mt-1 italic">/ Round</div>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="text-white/50 text-[10px] uppercase font-bold mb-1">3-Putts</div>
                  <div className="text-2xl font-bold text-white leading-none">{penaltyStats.threePuttsPerRound}</div>
                  <div className="text-white/30 text-[9px] mt-1 italic">/ Round</div>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="text-white/50 text-[10px] uppercase font-bold mb-1">DBL+</div>
                  <div className="text-2xl font-bold text-white leading-none">{penaltyStats.doublesPerRound}</div>
                  <div className="text-white/30 text-[9px] mt-1 italic">/ Round</div>
                </div>
              </div>
              <p className="mt-4 text-xs text-white/40 leading-relaxed italic border-l border-white/20 pl-3">
                "Eliminating these 3 areas is the fastest way to drop 5 shots."
              </p>
            </div>
          </div>
        )}

        {/* 3. "Full Metric Matrix" - Data Grid */}
        {metricMatrix.length > 0 && (
          <div className="bg-white rounded-3xl shadow-lg border border-gray-100 p-6 mb-6">
            <h2 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2 uppercase tracking-tighter">
              <span className="w-2 h-6 bg-[#014421] rounded-full" />
              Full Metric Matrix
            </h2>
            <div className="space-y-4">
              {metricMatrix.map((stat, i) => {
                const currentAvg = (stat?.statValue ?? stat?.value ?? stat?.current ?? 0);
                const goalVal = stat?.goal ?? 0;
                const gapVal = stat?.gap ?? 0;
                const isMeetingGoal = stat?.isLowerBetter ? currentAvg <= goalVal : currentAvg >= goalVal;
                const isPositive = gapVal > 0;
                
                return (
                  <div key={i} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0 group hover:bg-gray-50 transition-colors px-2 -mx-2 rounded-lg">
                    <div className="flex-1">
                      <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        {stat?.name ?? ""}
                        {stat?.trend === "up" && <ArrowUpRight className={`w-3 h-3 ${stat?.isLowerBetter ? "text-red-500" : "text-green-500"}`} />}
                        {stat?.trend === "down" && <ArrowDownRight className={`w-3 h-3 ${stat?.isLowerBetter ? "text-green-500" : "text-red-500"}`} />}
                        {stat?.trend === "neutral" && <Minus className="w-3 h-3 text-gray-300" />}
                      </div>
                      <div className="text-[10px] text-gray-400 font-medium tracking-tight">
                        Target: {goalVal} | Gap: {isPositive ? "+" : ""}{gapVal}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div className="text-lg font-black text-gray-900">{currentAvg}</div>
                      <div className={`w-20 text-center py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                        isMeetingGoal 
                        ? "bg-green-100 text-green-700" 
                        : "bg-red-100 text-red-700"
                      }`}>
                        {isMeetingGoal ? "Target Met" : `${isPositive ? "+" : ""}${gapVal}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Practice Allocation Chart */}
        <div className="flex flex-col gap-4 mb-6 w-full min-w-0">
          <div className="bg-white rounded-xl p-6 shadow-sm mb-8 w-full overflow-hidden">
            <h2 className="font-bold text-lg uppercase tracking-wider italic text-gray-900 mb-4 text-center" style={{ textDecoration: 'underline', textDecorationColor: '#FF9800', textDecorationThickness: '2px', textUnderlineOffset: '8px' }}>
              PRACTICE ALLOCATION
            </h2>
            <div className="w-full aspect-square flex justify-center items-center relative overflow-hidden">
              <svg 
                viewBox="-80 -80 660 660" 
                className="w-full h-full max-w-full max-h-full"
                preserveAspectRatio="xMidYMid meet"
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <defs>
                  <linearGradient id="practiceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FF9800" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#FF9800" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                
                {/* Grid polygons (Octagons - 8 categories) */}
                {[42, 84, 126, 168, 210].map((radius, idx) => {
                  const points = [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                    // Mental/Strategy at top (12 o'clock), clockwise
                    const angle = (i * (360/8) - 90) * (Math.PI / 180);
                    const x = 250 + radius * Math.cos(angle);
                    const y = 250 + radius * Math.sin(angle);
                    return `${x},${y}`;
                  }).join(' ');
                  return (
                    <polygon
                      key={`grid-${idx}`}
                      points={points}
                      fill="none"
                      stroke="#4B5563"
                      strokeWidth="1"
                      strokeOpacity="0.4"
                    />
                  );
                })}
                
                {/* Grid lines (8 axes) */}
                {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
                  const angle = (idx * (360/8) - 90) * (Math.PI / 180);
                  const x = 250 + 210 * Math.cos(angle);
                  const y = 250 + 210 * Math.sin(angle);
                  return (
                    <line
                      key={`axis-${idx}`}
                      x1="250"
                      y1="250"
                      x2={x}
                      y2={y}
                      stroke="#4B5563"
                      strokeWidth="1"
                      strokeOpacity="0.4"
                    />
                  );
                })}
                
                {/* Practice Allocation Area - 8 categories, Mental/Strategy at top */}
                {(() => {
                  const categories = ['Mental/Strategy', 'Driving', 'Irons', 'Wedges', 'Chipping', 'Bunkers', 'Putting', 'On-Course'];
                  const values = [
                    practiceAllocationData.mentalStrategy ?? 0,
                    practiceAllocationData.driving ?? 0,
                    practiceAllocationData.irons ?? 0,
                    practiceAllocationData.wedges ?? 0,
                    practiceAllocationData.chipping ?? 0,
                    practiceAllocationData.bunkers ?? 0,
                    practiceAllocationData.putting ?? 0,
                    practiceAllocationData.onCourse ?? 0,
                  ];
                  
                  // Consistent maxDomain (like 120 minutes) across all axes so the data forms a clear 'web' shape.
                  const maxDataValue = Math.max(120, ...values);
                  
                  const dPath = values.map((val, idx) => {
                    const angle = (idx * (360/8) - 90) * (Math.PI / 180);
                    const v = (val ?? 0) as number;
                    const radius = maxDataValue > 0 ? (v / maxDataValue) * 210 : 0;
                    const x = 250 + radius * Math.cos(angle);
                    const y = 250 + radius * Math.sin(angle);
                    return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ') + ' Z';
                  
                  return (
                    <>
                      <path
                        d={dPath}
                        fill="rgba(1, 68, 33, 0.4)"
                        fillOpacity={0.4}
                        stroke="#014421"
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                      {categories.map((category, idx) => {
                        const angle = (idx * (360/8) - 90) * (Math.PI / 180);
                        const minsVal = values[idx] ?? 0;
                        const radius = maxDataValue > 0 ? (minsVal / maxDataValue) * 210 : 0;
                        const labelX = 250 + 235 * Math.cos(angle);
                        const labelY = 250 + 235 * Math.sin(angle);
                        
                        let textAnchor: "start" | "middle" | "end" = "middle";
                        if (Math.cos(angle) > 0.1) textAnchor = "start";
                        else if (Math.cos(angle) < -0.1) textAnchor = "end";
                        
                        const prevAngle = ((idx - 1 + 8) % 8 * (360/8) - 90) * (Math.PI / 180);
                        const nextAngle = ((idx + 1) % 8 * (360/8) - 90) * (Math.PI / 180);
                        const midPrevAngle = (angle + prevAngle) / 2;
                        const midNextAngle = (angle + nextAngle) / 2;
                        const hoverRadius = 210;
                        
                        const hoverPoints = [
                          '250,250',
                          `${250 + hoverRadius * Math.cos(midPrevAngle)},${250 + hoverRadius * Math.sin(midPrevAngle)}`,
                          `${250 + radius * Math.cos(angle)},${250 + radius * Math.sin(angle)}`,
                          `${250 + hoverRadius * Math.cos(midNextAngle)},${250 + hoverRadius * Math.sin(midNextAngle)}`,
                        ].join(' ');
                        
                        const isHovered = hoveredCategory === category;
                        
                        return (
                          <g key={`category-${idx}`}>
                            {/* Invisible hover area */}
                            <polygon
                              points={hoverPoints}
                              fill="transparent"
                              onMouseEnter={() => setHoveredCategory(category)}
                              className="cursor-pointer"
                            />
                            
                            {/* Value point */}
                            <circle
                              cx={250 + radius * Math.cos(angle)}
                              cy={250 + radius * Math.sin(angle)}
                              r={isHovered ? "6" : "4"}
                              fill="#FF9800"
                              stroke="#374151"
                              strokeWidth="2"
                              className="transition-all duration-300 pointer-events-none"
                            />
                            
                            {/* Category Label - high-contrast gray-900, legible on mobile */}
                            {category === 'Mental/Strategy' ? (
                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor={textAnchor}
                                dominantBaseline="middle"
                                fill={isHovered ? "#FF9800" : "#111827"}
                                fontSize="15"
                                fontWeight="bold"
                                className="transition-all duration-300 pointer-events-none uppercase tracking-wider"
                              >
                                <tspan x={labelX} dy="-0.6em">Mental</tspan>
                                <tspan x={labelX} dy="1.2em">Strategy</tspan>
                              </text>
                            ) : (
                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor={textAnchor}
                                dominantBaseline="middle"
                                fill={isHovered ? "#FF9800" : "#111827"}
                                fontSize="15"
                                fontWeight="bold"
                                className="transition-all duration-300 pointer-events-none uppercase tracking-wider"
                              >
                                {category}
                              </text>
                            )}
                            
                            {/* Tooltip (only show if hovered) */}
                            {isHovered && (
                              <g className="pointer-events-none transition-opacity duration-300">
                                <rect
                                  x="200"
                                  y="220"
                                  width="100"
                                  height="60"
                                  rx="8"
                                  fill="#1e293b"
                                  stroke="#334155"
                                  strokeWidth="1"
                                />
                                <text
                                  x="250"
                                  y="245"
                                  textAnchor="middle"
                                  fill="#94a3b8"
                                  fontSize="12"
                                  fontWeight="bold"
                                  className="uppercase"
                                >
                                  {category}
                                </text>
                                <text
                                  x="250"
                                  y="265"
                                  textAnchor="middle"
                                  fill="white"
                                  fontSize="16"
                                  fontWeight="black"
                                >
                                  {(minsVal ?? 0)}m
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
          
          {/* Practice Breakdown - Below Spider Chart */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-md">
            <h2 className="text-sm font-black text-gray-900 mb-6 uppercase tracking-wider">
              PRACTICE BREAKDOWN
            </h2>
            <div className="space-y-4">
              {[
                { category: 'Driving', minutes: practiceAllocationData.driving },
                { category: 'Irons', minutes: practiceAllocationData.irons },
                { category: 'Wedges', minutes: practiceAllocationData.wedges },
                { category: 'Chipping', minutes: practiceAllocationData.chipping },
                { category: 'Bunkers', minutes: practiceAllocationData.bunkers },
                { category: 'Putting', minutes: practiceAllocationData.putting },
                { category: 'Mental/Strategy', minutes: practiceAllocationData.mentalStrategy },
                { category: 'On-Course', minutes: practiceAllocationData.onCourse },
              ].map((item) => {
                const minsDisplay = Number(item.minutes ?? 0);
                const totalMinutes = (practiceAllocationData.driving ?? 0) + (practiceAllocationData.irons ?? 0) + (practiceAllocationData.wedges ?? 0) +
                  (practiceAllocationData.chipping ?? 0) + (practiceAllocationData.bunkers ?? 0) + (practiceAllocationData.putting ?? 0) +
                  (practiceAllocationData.mentalStrategy ?? 0) + (practiceAllocationData.onCourse ?? 0);
                const pct = totalMinutes > 0 ? Math.round((minsDisplay / totalMinutes) * 100) : 0;
                
                return (
                  <div key={item.category} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="text-sm font-medium text-gray-900">{item.category}</div>
                    <div className="flex items-center gap-4 text-right">
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-[#FF9800]">{minsDisplay}</span>
                        <span className="text-[10px] text-gray-400 font-medium">mins</span>
                      </div>
                      <div className="w-12 text-sm font-bold text-gray-400">{pct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 5. AI Coaching Summary */}
        <div className="bg-[#f8fafc] rounded-3xl p-6 mb-6 border border-gray-200">
          <h2 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2 uppercase tracking-widest">
            <Sparkles className="w-4 h-4 text-[#014421]" />
            AI Coach Review
          </h2>
          {!aiSummary && !isGeneratingAi && (
            <p className="text-gray-400 text-xs mb-4 italic">
              Awaiting data analysis...
            </p>
          )}
          {isGeneratingAi && (
            <div className="flex items-center gap-2 text-xs text-[#014421] mb-4">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing patterns...
            </div>
          )}
          <button
            onClick={generateAIAnalysis}
            disabled={isGeneratingAi}
            className="w-full py-3 bg-[#014421] hover:bg-[#013320] text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
          >
            {isGeneratingAi ? "Processing..." : "Generate Deep Analysis"}
          </button>

          {aiSummary && (
            <div className="mt-6 space-y-3">
              {aiSummary.map((bullet, i) => (
                <div key={i} className="flex gap-3 items-start bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                  <div className="w-5 h-5 rounded-full bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#014421]" />
                  </div>
                  <span className="text-xs text-gray-700 leading-relaxed font-medium">{bullet}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
    </CoachDeepDiveErrorBoundary>
  );
}
