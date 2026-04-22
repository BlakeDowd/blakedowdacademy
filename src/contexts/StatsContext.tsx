"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { COMBINE_PRACTICE_LOG_TYPE_VALUES } from "@/lib/combineCompletionDetection";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { refreshAuthSessionIfPossible } from "@/lib/supabasePersistSession";

interface RoundData {
  date: string;
  created_at?: string; // ISO timestamp from database
  course: string;
  handicap: number | null;
  holes: number;
  score: number | null;
  nett: number | null;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  firLeft: number;
  firHit: number;
  firRight: number;
  totalGir: number;
  totalPenalties: number;
  teePenalties: number;
  approachPenalties: number;
  goingForGreen: number;
  gir8ft: number;
  gir20ft: number;
  upAndDownConversions: number;
  missed: number;
  bunkerAttempts: number;
  bunkerSaves: number;
  chipInside6ft: number;
  doubleChips: number;
  totalPutts: number;
  threePutts: number;
  made6ftAndIn: number;
  puttsUnder6ftAttempts: number;
  /** JSON array from `rounds.approach_directional_shots` (optional). */
  approachDirectionalShots?: unknown[];
}

interface DrillData {
  id: string;
  user_id: string;
  drill_id?: string;
  drill_title?: string;
  category?: string;
  completed_at?: string;
  created_at?: string;
}

interface PracticeSessionData {
  id: string;
  user_id: string;
  duration_minutes?: number;
  facility_type?: string;
  practice_date?: string;
  created_at?: string;
}

/** practice_logs rows (combine protocol sessions) for Academy leaderboards */
interface PracticeLogRow {
  id: string;
  user_id: string;
  log_type?: string;
  created_at?: string;
  matrix_score_average?: number | null;
  perfect_putt_count?: number | null;
  triple_failure_rate?: number | null;
  score?: number | null;
  total_points?: number | null;
  sub_type?: string | null;
  /** Used to recompute iron protocol session totals when `total_points` is missing. */
  strike_data?: unknown;
}

interface StatsContextType {
  /** Rounds for the signed-in user only (used by My Rounds, scores, stats). */
  rounds: RoundData[];
  /** All users' rounds for community leaderboards (Academy, dashboard Community tab). */
  communityRounds: RoundData[];
  /** True after the first community (all-users) rounds fetch attempt has finished. */
  communityRoundsHydrated: boolean;
  drills: DrillData[];
  practiceSessions: PracticeSessionData[];
  practiceLogs: PracticeLogRow[];
  loading: boolean;
  refreshRounds: () => void;
  refreshCommunityRounds: () => void;
  refreshDrills: () => void;
  refreshPracticeSessions: () => void;
  refreshPracticeLogs: () => void;
  calculateStats: () => { handicap: string; totalRounds: number };
  currentStreak?: number; // Export the Value: Ensure currentStreak is included in the StatsContext.Provider value
}

const StatsContext = createContext<StatsContextType | undefined>(undefined);

export function calculatePuttingAccuracy(made6ftAndIn: number, puttsUnder6ftAttempts: number): number {
  if (!puttsUnder6ftAttempts || puttsUnder6ftAttempts === 0) return 0;
  return Math.round((made6ftAndIn / puttsUnder6ftAttempts) * 100);
}

export function StatsProvider({ children }: { children: ReactNode }) {
  // Set rounds to empty array
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [communityRounds, setCommunityRounds] = useState<RoundData[]>([]);
  const [communityRoundsHydrated, setCommunityRoundsHydrated] = useState(false);
  // Check Fetch Logic: Add state for drills and practice_sessions
  const [drills, setDrills] = useState<DrillData[]>([]);
  const [practiceSessions, setPracticeSessions] = useState<PracticeSessionData[]>([]);
  const [practiceLogs, setPracticeLogs] = useState<PracticeLogRow[]>([]);
  // Set loading to true initially
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useAuth();
  
  // Export the Value: Get currentStreak from AuthContext user object
  const currentStreak = user?.currentStreak;
  
  /** Prevents duplicate global (leaderboard) round fetches unless explicitly refreshed. */
  const communityRoundsFetched = useRef(false);
  // Check Fetch Logic: Add fetch guards for drills and practice_sessions
  const drillsFetched = useRef(false);
  const practiceSessionsFetched = useRef(false);
  const practiceLogsFetched = useRef(false);

  const mapRoundRow = (round: any): RoundData & { user_id?: string; full_name?: string; profile_icon?: string } => ({
    date: round.date,
    created_at: round.created_at,
    course: round.course_name || round.course,
    handicap: round.handicap,
    holes: round.holes,
    score: round.score,
    nett: round.nett,
    eagles: round.eagles,
    birdies: round.birdies,
    pars: round.pars,
    bogeys: round.bogeys,
    doubleBogeys: round.double_bogeys,
    firLeft: round.fir_left,
    firHit: round.fir_hit,
    firRight: round.fir_right,
    totalGir: round.total_gir,
    totalPenalties: round.total_penalties,
    teePenalties: round.tee_penalties,
    approachPenalties: round.approach_penalties,
    goingForGreen: round.going_for_green,
    gir8ft: round.gir_8ft || 0,
    gir20ft: round.gir_20ft || 0,
    upAndDownConversions: round.up_and_down_conversions || round.conversions || 0,
    missed: round.missed || round.up_and_down_missed || 0,
    bunkerAttempts: round.bunker_attempts || 0,
    bunkerSaves: round.bunker_saves || 0,
    chipInside6ft: round.chip_inside_6ft ?? round.inside_6ft ?? 0,
    doubleChips: round.double_chips || round.chip_ins || 0,
    totalPutts: round.total_putts,
    threePutts: round.three_putts,
    made6ftAndIn: round.made_under_6ft ?? 0,
    puttsUnder6ftAttempts: round.putts_under_6ft_attempts ?? 0,
    approachDirectionalShots: Array.isArray(round.approach_directional_shots)
      ? round.approach_directional_shots
      : [],
    user_id: round.user_id,
    full_name: undefined,
    profile_icon: undefined,
  });

  /** Leaderboards / community: all users' rounds (RLS permitting). */
  const loadCommunityRounds = async () => {
    if (communityRoundsFetched.current) return;

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const { data, error } = await supabase
        .from("rounds")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        const err = error as { message?: string; code?: string; details?: string };
        const errMsg =
          err?.message ??
          err?.details ??
          (typeof error === "object" && Object.keys(error as object).length > 0
            ? JSON.stringify(error)
            : "Failed to load community rounds");
        console.error("StatsContext: Error loading community rounds:", errMsg, err?.code ? `(code: ${err.code})` : "");
        setCommunityRounds([]);
        communityRoundsFetched.current = true;
        return;
      }

      const transformed = (data || []).map(mapRoundRow);
      setCommunityRounds(transformed);
      communityRoundsFetched.current = true;
      if (transformed.length > 0 && typeof window !== "undefined") {
        sessionStorage.removeItem("statsContextRoundsToastShown");
        sessionStorage.removeItem("roundsToastShown");
      }
    } catch (error) {
      const errMsg =
        error instanceof Error
          ? error.message
          : (error as { message?: string })?.message ?? JSON.stringify(error);
      console.error("StatsContext: Error loading community rounds:", errMsg);
      setCommunityRounds([]);
      communityRoundsFetched.current = true;
    } finally {
      setCommunityRoundsHydrated(true);
    }
  };

  /** My Rounds / scores: only the authenticated user's rows. */
  const loadMyRounds = async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser?.id) {
        setRounds([]);
        return;
      }

      const { data, error } = await supabase
        .from("rounds")
        .select("*")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        const err = error as { message?: string; code?: string; details?: string };
        const errMsg =
          err?.message ??
          err?.details ??
          (typeof error === "object" && Object.keys(error as object).length > 0
            ? JSON.stringify(error)
            : "Failed to load your rounds");
        console.error("StatsContext: Error loading my rounds:", errMsg, err?.code ? `(code: ${err.code})` : "");
        setRounds([]);
        return;
      }

      const transformed = (data || []).map(mapRoundRow);
      setRounds(transformed);
      if (transformed.length > 0 && typeof window !== "undefined") {
        sessionStorage.removeItem("statsContextRoundsToastShown");
        sessionStorage.removeItem("roundsToastShown");
      }
    } catch (error) {
      const errMsg =
        error instanceof Error
          ? error.message
          : (error as { message?: string })?.message ?? JSON.stringify(error);
      console.error("StatsContext: Error loading my rounds:", errMsg);
      setRounds([]);
    } finally {
      setLoading(false);
    }
  };

  // The Practice sync is working perfectly! Now apply the same logic to Drills
  // Check the Fetch: Ensure loadDrills is definitely fetching from drill_scores
  // Global Fetch: Ensure the loadDrills function fetches all records from the drill_scores table without a user_id filter
  // Table Verification: The SQL policy already exists, so the table is ready - fetch from drill_scores
  const loadDrills = async () => {
    if (drillsFetched.current) return;
    
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      // Check the Fetch: Ensure loadDrills is definitely fetching from drill_scores
      // Global Fetch: Fetch all records from the drill_scores table without a user_id filter
      console.log('StatsContext: Fetching ALL drills from drill_scores table (not filtering by user_id)');
      
      // Check the Fetch: Explicitly fetch from drill_scores table (table is ready with SQL policy)
      const { data: scoreData, error: scoreError } = await supabase
        .from('drill_scores')
        .select('*')
        .order('created_at', { ascending: false });

      // Console Log: Add console.log('Drill Score Found:', data) so I can see if the row I just logged is actually being downloaded by the app
      if (scoreData && scoreData.length > 0) {
        console.log('Drill Score Found:', scoreData);
        console.log('StatsContext: Successfully fetched', scoreData.length, 'drill scores from drill_scores table');
      }

      if (scoreError) {
        // If drill_scores doesn't exist or has an error, try drills table as fallback
        if (scoreError.code === '42P01' || scoreError.message?.includes('does not exist')) {
          console.warn('StatsContext: drill_scores table not found, trying drills table as fallback...');
          const drillsResult = await supabase
            .from('drills')
            .select('*')
            .order('created_at', { ascending: false });
          
          if (drillsResult.data && drillsResult.data.length > 0) {
            console.log('Drill Score Found (from drills table):', drillsResult.data);
          }
          
          if (drillsResult.error) {
            // Verify Row-Level Security: Log RLS errors specifically
            if (drillsResult.error.code === 'PGRST116' || drillsResult.error.message?.includes('permission denied') || drillsResult.error.message?.includes('RLS')) {
              console.warn('StatsContext: RLS may be blocking drills access. You may need to run SQL to enable RLS for the drills table.');
              console.warn('StatsContext: Error details:', { code: drillsResult.error.code, message: drillsResult.error.message });
            } else {
              console.error('StatsContext: Error loading drills from drills table:', drillsResult.error);
            }
            setDrills([]);
            drillsFetched.current = true;
            return;
          }
          
          const transformedData = (drillsResult.data || []).map((item: any) => ({
            ...item,
            drill_title: item.drill_title || item.drill_name, // Ensure drill_title exists
          }));
          
          setDrills(transformedData as DrillData[]);
          drillsFetched.current = true;
          return;
        } else {
          // Other error (not table missing)
          console.error('StatsContext: Error loading drill_scores from database:', scoreError);
          // Verify Row-Level Security: Log RLS errors specifically
          if (scoreError.code === 'PGRST116' || scoreError.message?.includes('permission denied') || scoreError.message?.includes('RLS')) {
            console.warn('StatsContext: RLS may be blocking drill_scores access. Check SQL policies.');
            console.warn('StatsContext: Error details:', { code: scoreError.code, message: scoreError.message });
          }
          setDrills([]);
          drillsFetched.current = true;
          return;
        }
      }

      // Transform drill_scores data to match DrillData interface if needed
      let transformedData = scoreData || [];
      if (transformedData.length > 0 && transformedData[0].drill_name && !transformedData[0].drill_title) {
        transformedData = transformedData.map((item: any) => ({
          ...item,
          drill_title: item.drill_name, // Map drill_name to drill_title for compatibility
        }));
      }

      // Fix the 0 Count: Ensure the leaderboard component is listening for this specific data so it doesn't stay at zero
      console.log('StatsContext: Loaded drills from database:', transformedData?.length || 0);
      if (transformedData && transformedData.length > 0) {
        console.log('StatsContext: Sample drills:', transformedData.slice(0, 3).map((d: any) => ({ 
          id: d.id, 
          user_id: d.user_id, 
          drill_title: d.drill_title || d.drill_name,
          drill_name: d.drill_name,
          score: d.score,
          created_at: d.created_at
        })));
        console.log('StatsContext: All drill user_ids:', Array.from(new Set(transformedData.map((d: any) => d.user_id).filter(Boolean))));
        // Check the Mapping: Log user_ids to verify mapping will work
        console.log('StatsContext: Drill user_ids for profile mapping:', transformedData.map((d: any) => ({ 
          user_id: d.user_id, 
          drill_name: d.drill_name || d.drill_title 
        })));
      } else {
        console.warn('StatsContext: No drills found. This could mean:');
        console.warn('  1. No drills have been logged yet');
        console.warn('  2. The drill_scores table is empty');
        console.warn('  3. RLS policies are blocking access');
      }
      
      setDrills(transformedData as DrillData[]);
      drillsFetched.current = true;
    } catch (error) {
      console.error('StatsContext: Error loading drills:', error);
      setDrills([]);
      drillsFetched.current = true;
    }
  };

  const loadPracticeSessions = async () => {
    // Update Table Name: Ensure the loadStats function fetches from the practice table (not practice_sessions)
    // The practice table is now created in Supabase
    if (practiceSessionsFetched.current) return;
    
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      // Fetch Everything: In the loadStats function, change the fetch for practice so it selects ALL rows from the table, not just rows where user_id === user.id
      // Stop filtering the practice data!
      console.log('StatsContext: Fetching ALL practice sessions for leaderboard (not filtering by user_id)');
      
      // Update Table Name: Ensure the loadStats function fetches from the practice table (not practice_sessions)
      // All rows (leaderboards). Trophy / personal totals must filter by `user_id` in the consumer (see `practiceSessionsForUser`).
      const { data, error } = await supabase
        .from('practice')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Verify Row-Level Security: Log RLS errors specifically
        if (error.code === 'PGRST116' || error.message?.includes('permission denied') || error.message?.includes('RLS')) {
          console.warn('StatsContext: RLS may be blocking practice access. You may need to run SQL to enable RLS for the practice table.');
          console.warn('StatsContext: Error details:', { code: error.code, message: error.message });
        } else {
          console.error('StatsContext: Error loading practice from database:', error);
        }
        setPracticeSessions([]);
        practiceSessionsFetched.current = true;
        return;
      }

      console.log('StatsContext: Loaded practice sessions from database:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('StatsContext: Sample practice sessions:', data.slice(0, 3).map((p: any) => ({ id: p.id, user_id: p.user_id, duration_minutes: p.duration_minutes })));
      }
      
      // Data Mapping: Map old categories to new ones so old data doesn't disappear from charts
      const mappedData = (data || []).map((session: any) => {
        let mappedType = session.type;
        if (!mappedType) return session;
        
        const lowerType = mappedType.toLowerCase();
        
        if (
          lowerType === 'short game' ||
          lowerType === 'chipping-green' ||
          lowerType === 'chipping' ||
          lowerType === 'chipping_combine_9'
        )
          mappedType = 'Chipping';
        else if (lowerType === 'approach' || lowerType === 'range-grass' || lowerType === 'irons') mappedType = 'Irons';
        else if (lowerType === 'mental game' || lowerType === 'mental' || lowerType === 'home' || lowerType === 'mental/strategy') mappedType = 'Mental/Strategy';
        else if (
          lowerType === 'range-mat' ||
          lowerType === 'driving' ||
          lowerType === 'tee_shot_dispersion_combine'
        )
          mappedType = 'Driving';
        else if (lowerType === 'bunker_9_hole_challenge') mappedType = 'Bunkers';
        else if (lowerType === 'bunker' || lowerType === 'bunkers') mappedType = 'Bunkers';
        else if (lowerType === 'putting-green' || lowerType === 'putting') mappedType = 'Putting';
        else if (
          lowerType === 'wedges' ||
          lowerType === 'wedge play' ||
          lowerType === 'wedge_lateral_9'
        )
          mappedType = 'Wedges';
        
        return {
          ...session,
          type: mappedType
        };
      });
      
      setPracticeSessions(mappedData as PracticeSessionData[]);
      practiceSessionsFetched.current = true;
    } catch (error) {
      console.error('StatsContext: Error loading practice sessions:', error);
      setPracticeSessions([]);
      practiceSessionsFetched.current = true;
    }
  };

  const loadPracticeLogs = async () => {
    if (practiceLogsFetched.current) return;

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      await refreshAuthSessionIfPossible(supabase);
      let {
        data: { session },
      } = await supabase.auth.getSession();
      // AuthContext can have `user` before the Supabase client session is hydrated; retry briefly
      // so practice_logs (iron / gauntlet leaderboards) do not stay empty after login.
      if (!session?.user?.id) {
        await new Promise((r) => setTimeout(r, 200));
        ({
          data: { session },
        } = await supabase.auth.getSession());
      }
      if (!session?.user?.id) {
        await new Promise((r) => setTimeout(r, 500));
        ({
          data: { session },
        } = await supabase.auth.getSession());
      }
      // RLS on practice_logs is TO authenticated only; querying before session is ready
      // produces a PostgREST error that often prints as "{}" in the browser console.
      if (!session?.user?.id) {
        console.warn(
          "StatsContext: practice_logs fetch skipped — no Supabase session after refresh/waits (will retry on auth events).",
        );
        return;
      }

      const selectVariants: string[] = [
        // Full payload (preferred when schema is up-to-date).
        "id,user_id,log_type,created_at,matrix_score_average,perfect_putt_count,triple_failure_rate,score,total_points,sub_type,strike_data",
        // Fallback for deployments missing newer columns.
        "id,user_id,log_type,created_at,matrix_score_average,score,total_points,sub_type,strike_data",
        // Fallback when `score` is absent on practice_logs.
        "id,user_id,log_type,created_at,matrix_score_average,total_points,sub_type,strike_data",
        // Minimal fallback to keep core combine leaderboards available.
        "id,user_id,log_type,created_at,matrix_score_average,score,total_points,strike_data",
        // Minimal fallback when `score` is absent.
        "id,user_id,log_type,created_at,matrix_score_average,total_points,strike_data",
        // Minimal fallback when JSON payload columns are absent.
        "id,user_id,log_type,created_at,matrix_score_average,score,total_points",
        // Minimal fallback when `score` is absent.
        "id,user_id,log_type,created_at,matrix_score_average,total_points",
        // Last-resort fallback for very old schemas.
        "id,user_id,log_type,created_at,score,total_points",
        // Last-resort fallback when `score` is absent.
        "id,user_id,log_type,created_at,total_points",
      ];

      let data: PracticeLogRow[] | null = null;
      let error: any = null;
      let ironRows: PracticeLogRow[] = [];

      for (const select of selectVariants) {
        const [mainRes, ironRes] = await Promise.all([
          supabase
            .from("practice_logs")
            .select(select as string)
            .order("created_at", { ascending: false })
            .limit(10000),
          supabase
            .from("practice_logs")
            .select(select as string)
            .eq("log_type", ironPrecisionProtocolConfig.practiceLogType)
            .order("created_at", { ascending: false })
            .limit(4000),
        ]);

        error = mainRes.error;
        if (!error) {
          data = (mainRes.data || []) as unknown as PracticeLogRow[];
          ironRows = (ironRes.data || []) as unknown as PracticeLogRow[];
          if (ironRes.error) {
            console.warn(
              "StatsContext: iron-only practice_logs fetch failed (leaderboard may miss older iron rows):",
              ironRes.error.message ?? JSON.stringify(ironRes.error),
            );
          }
          break;
        }
      }

      if (error) {
        const err = error as {
          message?: string;
          code?: string;
          details?: string;
          hint?: string;
        };
        const summary =
          err.message ||
          err.details ||
          (Object.keys(error as object).length ? JSON.stringify(error) : "Unknown error");
        const summaryLower = summary.toLowerCase();
        const tableMissing =
          err.code === "PGRST205" ||
          summaryLower.includes("could not find the table");
        const columnMissing =
          err.code === "PGRST204" ||
          err.code === "42703" ||
          (summaryLower.includes("practice_logs") && summaryLower.includes("does not exist")) ||
          (summaryLower.includes("schema cache") &&
            summaryLower.includes("could not find the") &&
            summaryLower.includes("column"));
        if (tableMissing) {
          console.warn(
            "StatsContext: practice_logs is not in the database yet (PGRST205). Run `supabase db push` or paste supabase/migrations/20260420140000_practice_logs_bootstrap_pgrst205.sql in the SQL Editor, then reload the API schema (Dashboard → Settings → API → Reload schema).",
            summary,
            err.hint ? `PostgREST hint: ${err.hint}` : ""
          );
        } else if (columnMissing) {
          console.warn(
            "StatsContext: practice_logs is missing columns (PGRST204 / 42703). Run `supabase db push`, or paste 20260420150000_practice_logs_missing_columns_pgrst204.sql (and if needed 20260420160000_practice_logs_log_type_created_at.sql) in the SQL Editor, then Dashboard → Settings → API → Reload schema.",
            summary,
            err.hint ? `PostgREST hint: ${err.hint}` : ""
          );
        } else if (
          err.code === "PGRST116" ||
          summary.includes("permission denied") ||
          summary.includes("RLS") ||
          summary.includes("JWT")
        ) {
          console.warn(
            "StatsContext: practice_logs may be blocked by RLS, missing table, or no session:",
            summary,
            err.code ? `(code: ${err.code})` : ""
          );
        } else {
          console.error(
            "StatsContext: Error loading practice_logs:",
            summary,
            err.code ? `(code: ${err.code})` : "",
            err.hint ? `hint: ${err.hint}` : ""
          );
        }
        setPracticeLogs([]);
        practiceLogsFetched.current = true;
        return;
      }

      const mainRows = (data || []) as PracticeLogRow[];
      const byId = new Map<string, PracticeLogRow>();
      for (const row of ironRows) {
        if (row?.id) byId.set(row.id, row);
      }
      for (const row of mainRows) {
        if (row?.id) byId.set(row.id, row);
      }
      const merged = Array.from(byId.values());
      merged.sort((a, b) => {
        const ta = new Date(String(a.created_at ?? 0)).getTime();
        const tb = new Date(String(b.created_at ?? 0)).getTime();
        return tb - ta;
      });
      setPracticeLogs(merged);
      practiceLogsFetched.current = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e);
      console.error("StatsContext: practice_logs load failed:", msg, e);
      setPracticeLogs([]);
      practiceLogsFetched.current = true;
    }
  };

  const refreshRounds = () => {
    void loadMyRounds();
  };

  const refreshCommunityRounds = () => {
    communityRoundsFetched.current = false;
    setCommunityRoundsHydrated(false);
    void loadCommunityRounds();
  };

  const refreshDrills = () => {
    drillsFetched.current = false;
    loadDrills();
  };

  const refreshPracticeSessions = () => {
    practiceSessionsFetched.current = false;
    loadPracticeSessions();
  };

  const refreshPracticeLogs = () => {
    practiceLogsFetched.current = false;
    loadPracticeLogs();
  };

  // Make calculateStats return only { handicap: 'N/A', totalRounds: 0 }
  const calculateStats = () => ({ handicap: 'N/A', totalRounds: 0 });

  // Load community rounds + drills/practice on mount; my rounds follow auth user id (separate effect).
  useEffect(() => {
    void loadCommunityRounds();

    // Check Fetch Logic: Fetch drills and practice_sessions from database tables
    // Update Table Name: Practice table is now created - fetch from it
    loadDrills();
    loadPracticeSessions();
    // practice_logs: fetched only when authenticated (see loadPracticeLogs + user?.id effect)

    // Listen for roundsUpdated event
    const handleRoundsUpdate = () => {
      console.log("StatsContext: Received roundsUpdated event, refreshing rounds...");
      communityRoundsFetched.current = false;
      setCommunityRoundsHydrated(false);
      void loadCommunityRounds();
      void loadMyRounds();
    };
    
    // Live Sync: Set up the same event listener (drillsUpdated) so when someone logs a new drill score, the leaderboard refreshes for everyone immediately
    const handleDrillsUpdate = () => {
      console.log('StatsContext: Received drillsUpdated event, refreshing from database...');
      drillsFetched.current = false;
      loadDrills();
    };
    
    // Update Table Name: Practice table is now created - enable event listeners
    const handlePracticeSessionsUpdate = () => {
      console.log('StatsContext: Received practiceSessionsUpdated event, refreshing from database...');
      practiceSessionsFetched.current = false;
      loadPracticeSessions();
      practiceLogsFetched.current = false;
      loadPracticeLogs();
    };

    window.addEventListener('roundsUpdated', handleRoundsUpdate);
    window.addEventListener('drillsUpdated', handleDrillsUpdate);
    window.addEventListener('practiceSessionsUpdated', handlePracticeSessionsUpdate);

    return () => {
      window.removeEventListener('roundsUpdated', handleRoundsUpdate);
      window.removeEventListener('drillsUpdated', handleDrillsUpdate);
      window.removeEventListener('practiceSessionsUpdated', handlePracticeSessionsUpdate);
    };
  }, []); // Empty dependency array - fetch once on mount, then listen for updates

  useEffect(() => {
    void loadMyRounds();
  }, [user?.id]);

  // First stats fetch can run before Supabase session is ready (RLS returns []). Reload when user id appears.
  useEffect(() => {
    if (!user?.id) {
      setPracticeLogs([]);
      practiceLogsFetched.current = false;
      return;
    }
    drillsFetched.current = false;
    practiceSessionsFetched.current = false;
    practiceLogsFetched.current = false;
    loadDrills();
    loadPracticeSessions();
    loadPracticeLogs();
  }, [user?.id]);

  // If the first practice_logs fetch ran before JWT hydration, refetch when Supabase auth settles.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (cancelled) return;
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          practiceLogsFetched.current = false;
          void loadPracticeLogs();
        }
      });
      subscription = data.subscription;
    })();
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [user?.id]);

  return (
    <StatsContext.Provider
      value={{
        rounds,
        communityRounds,
        communityRoundsHydrated,
        drills,
        practiceSessions,
        practiceLogs,
        loading,
        refreshRounds,
        refreshCommunityRounds,
        refreshDrills,
        refreshPracticeSessions,
        refreshPracticeLogs,
        calculateStats,
        currentStreak,
      }}
    >
      {children}
    </StatsContext.Provider>
  );
}

export function useStats() {
  const context = useContext(StatsContext);
  if (context === undefined) {
    // Silent Errors: Don't throw - return empty context to prevent UI freeze
    console.error('useStats must be used within a StatsProvider - returning empty context');
    return { 
      rounds: [], 
      communityRounds: [],
      communityRoundsHydrated: false,
      drills: [], 
      practiceSessions: [], 
      practiceLogs: [],
      loading: false, 
      refreshRounds: () => {}, 
      refreshCommunityRounds: () => {},
      refreshDrills: () => {}, 
      refreshPracticeSessions: () => {}, 
      refreshPracticeLogs: () => {},
      calculateStats: () => ({ handicap: 'N/A', totalRounds: 0 }),
      currentStreak: undefined
    };
  }
  return context;
}
