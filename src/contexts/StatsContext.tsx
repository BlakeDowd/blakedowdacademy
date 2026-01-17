"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useAuth } from "./AuthContext";

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
  missed6ftAndIn: number;
  puttsUnder6ftAttempts: number;
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

interface StatsContextType {
  rounds: RoundData[];
  drills: DrillData[];
  practiceSessions: PracticeSessionData[];
  loading: boolean;
  refreshRounds: () => void;
  refreshDrills: () => void;
  refreshPracticeSessions: () => void;
  calculateStats: () => { handicap: string; totalRounds: number };
  currentStreak?: number; // Export the Value: Ensure currentStreak is included in the StatsContext.Provider value
}

const StatsContext = createContext<StatsContextType | undefined>(undefined);

export function StatsProvider({ children }: { children: ReactNode }) {
  // Set rounds to empty array
  const [rounds, setRounds] = useState<RoundData[]>([]);
  // Check Fetch Logic: Add state for drills and practice_sessions
  const [drills, setDrills] = useState<DrillData[]>([]);
  const [practiceSessions, setPracticeSessions] = useState<PracticeSessionData[]>([]);
  // Set loading to true initially
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useAuth();
  
  // Export the Value: Get currentStreak from AuthContext user object
  const currentStreak = user?.currentStreak;
  
  // Add Fetch Guard: At the top of the StatsProvider component, add const hasAttemptedFetch = useRef(false);
  const hasAttemptedFetch = useRef(false);
  // Add Fetch Guard: At the top of StatsProvider, add const roundsFetched = useRef(false);
  const roundsFetched = useRef(false);
  // Check Fetch Logic: Add fetch guards for drills and practice_sessions
  const drillsFetched = useRef(false);
  const practiceSessionsFetched = useRef(false);

  // Load rounds from database
  // Check Dashboard Fetch: Don't require user.id - fetch ALL rounds even if user is not logged in
  // Profile Mapping: Rounds with user_id that doesn't exist in profiles will still show (with 'Unknown User')
  const loadRounds = async () => {
    // Block Infinite Retries: In the loadRounds function, add if (hasAttemptedFetch.current) return; at the very top
    if (hasAttemptedFetch.current) return;
    // Prevent Retries: In loadRounds, add if (roundsFetched.current) return; at the very start
    if (roundsFetched.current) return;
    
    // Verify App State: Don't block fetching if user.id is missing - fetch all rounds anyway
    // This ensures rounds show up even if user state is temporarily unavailable
    if (!user?.id) {
      console.warn('StatsContext: No user.id, but attempting to fetch rounds anyway (for leaderboard)');
      // Don't return early - continue to fetch all rounds
    }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      console.log('StatsContext: Fetching ALL rounds for leaderboard (not filtering by user_id)');
      console.log('StatsContext: User object:', user ? { id: user.id, email: user.email, fullName: user.fullName } : 'No user (fetching all rounds anyway)');
      
      // Modify loadRounds: Remove any .eq('user_id', ...) filters from the query used for the global leaderboard
      // Ensure Select All: Confirm the query is .from('rounds').select('*') so it pulls every round in the database
      // Verify Sorting: Keep the .order('created_at', { ascending: false }) so the most recent rounds are still at the top
      // Why: We already have the user profile in AuthContext, so we don't need to join it here to get the leaderboard data to appear
      const { data, error } = await supabase
        .from('rounds')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Debug: Log the query - now fetching ALL rounds without profile join
      console.log('StatsContext: Query - fetching ALL rounds (no user_id filter, no profile join)');

      if (error) {
        // Set the Guard: Inside the if (error) block (line 100), add hasAttemptedFetch.current = true; before the console error
        hasAttemptedFetch.current = true;
        console.error('StatsContext: Error loading rounds from database:', error);
        console.error('StatsContext: Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        // Safe Fallback: If an error occurs, set setRounds([]) so the rest of the app doesn't stay 'loading' forever
        setRounds([]);
        // Set Guard on Error: Inside the if (error) block (line 100), add roundsFetched.current = true;. This stops the console from spamming errors and freezing the CPU.
        roundsFetched.current = true;
        setLoading(false); // Ensure loading state is cleared on error
        return;
      }

      console.log('StatsContext: Raw data from database:', data);
      console.log('StatsContext: Number of rounds fetched:', data?.length || 0);
      
      // Debug: Check user_id in fetched rounds
      if (data && data.length > 0) {
        console.log('StatsContext: Sample rounds:', data.slice(0, 5).map((r: any) => ({
          round_id: r.id,
          user_id: r.user_id,
          date: r.date,
          score: r.score
        })));
        // Debug Logs: Keep console.log to see if Stuart's round is in the raw data
        console.log('StatsContext: All rounds user_ids:', data.map((r: any) => r.user_id));
      } else {
        console.warn('StatsContext: No rounds found in database');
        console.warn('StatsContext: This could mean:');
        console.warn('  1. No rounds exist in database');
        console.warn('  2. RLS policies are blocking access');
      }

      // Transform database columns (snake_case) to camelCase for RoundData interface
      // Profile Join: Include user_id and profile data (full_name, profile_icon) from joined profiles table
      const transformedRounds: (RoundData & { user_id?: string; full_name?: string; profile_icon?: string })[] = (data || []).map((round: any) => ({
        date: round.date,
        created_at: round.created_at, // Include created_at for time filtering
        course: round.course_name || round.course, // Handle both course_name and course for compatibility
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
        chipInside6ft: round.inside_6ft || round.chip_inside_6ft || 0, // Handle both column names
        doubleChips: round.double_chips || round.chip_ins || 0, // Handle both column names
        totalPutts: round.total_putts,
        threePutts: round.three_putts,
        missed6ftAndIn: round.missed_6ft_and_in,
        puttsUnder6ftAttempts: round.putts_under_6ft_attempts,
        // Include user_id for leaderboard (profile data available from AuthContext)
        user_id: round.user_id,
        // Profile data is available from AuthContext, so we don't need to join it here
        full_name: undefined, // Profile data available from AuthContext
        profile_icon: undefined, // Profile data available from AuthContext
      }));

      setRounds(transformedRounds);
      console.log('StatsContext: Loaded rounds from database:', transformedRounds.length);
      console.log('StatsContext: Transformed rounds data:', transformedRounds);
      
      // Verify App State: Log if rounds.length === 0 (no UI alerts in context provider)
      // Remove Browser Alerts: Context providers shouldn't show alerts - logged to console only
      if (transformedRounds.length === 0) {
        console.warn('⚠️ StatsContext: transformedRounds.length === 0 - No rounds data from Supabase');
        console.warn('⚠️ This could mean:');
        console.warn('  1. No rounds exist in database');
        console.warn('  2. RLS policies are blocking access');
        console.warn('  3. Query is failing silently');
        // Remove Browser Alerts: No alert() in context provider - UI components handle notifications
      } else {
        console.log('✅ StatsContext: Rounds data loaded successfully:', transformedRounds.length, 'rounds');
        // Clear flags if rounds are found
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('statsContextRoundsToastShown');
          sessionStorage.removeItem('roundsToastShown');
        }
      }
      
      // Set guard after successful fetch
      roundsFetched.current = true;
      hasAttemptedFetch.current = true;
    } catch (error) {
      // Silent Errors: Modify the data fetch so it simply returns an empty array [] on error instead of throwing
      console.error('StatsContext: Error loading rounds from database:', error);
      console.error('StatsContext: Returning empty array to prevent UI freeze');
      // Safe Fallback: If an error occurs, set setRounds([]) so the rest of the app doesn't stay 'loading' forever
      setRounds([]);
      // Set Guard on Error: Even if there is an error, set roundsFetched.current = true;. This prevents the app from DDoS-ing the database when a request fails.
      roundsFetched.current = true;
      hasAttemptedFetch.current = true;
    } finally {
      // Clear Loading State: Ensure setLoading(false) is called in the finally block so the UI doesn't stay frozen
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
      // Fetch Everything: Select ALL rows - no user_id filter
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
      setPracticeSessions((data || []) as PracticeSessionData[]);
      practiceSessionsFetched.current = true;
    } catch (error) {
      console.error('StatsContext: Error loading practice sessions:', error);
      setPracticeSessions([]);
      practiceSessionsFetched.current = true;
    }
  };

  const refreshRounds = () => {
    loadRounds();
  };

  const refreshDrills = () => {
    drillsFetched.current = false;
    loadDrills();
  };

  const refreshPracticeSessions = () => {
    practiceSessionsFetched.current = false;
    loadPracticeSessions();
  };

  // Make calculateStats return only { handicap: 'N/A', totalRounds: 0 }
  const calculateStats = () => ({ handicap: 'N/A', totalRounds: 0 });

  // Check Fetch Logic: Ensure the loadStats function is fetching data from the drills and practice_sessions tables as well as rounds
  // Load rounds, drills, and practice_sessions on mount and listen for updates
  // Modify loadRounds: Remove any .eq('user_id', ...) filters from the query used for the global leaderboard
  // Ensure Select All: Confirm the query is .from('rounds').select('*') so it pulls every round in the database
  // Verify Sorting: Keep the .order('created_at', { ascending: false }) so the most recent rounds are still at the top
  useEffect(() => {
    // Always fetch all rounds for the global leaderboard, regardless of user.id
    // This ensures the leaderboard shows all users' rounds, not just the current user's
    loadRounds();
    
    // Check Fetch Logic: Fetch drills and practice_sessions from database tables
    // Update Table Name: Practice table is now created - fetch from it
    loadDrills();
    loadPracticeSessions();

    // Listen for roundsUpdated event
    const handleRoundsUpdate = () => {
      console.log('StatsContext: Received roundsUpdated event, refreshing from database...');
      // Always refresh all rounds for the global leaderboard
      loadRounds();
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

  return (
    <StatsContext.Provider value={{ rounds, drills, practiceSessions, loading, refreshRounds, refreshDrills, refreshPracticeSessions, calculateStats, currentStreak }}>
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
      drills: [], 
      practiceSessions: [], 
      loading: false, 
      refreshRounds: () => {}, 
      refreshDrills: () => {}, 
      refreshPracticeSessions: () => {}, 
      calculateStats: () => ({ handicap: 'N/A', totalRounds: 0 }),
      currentStreak: undefined
    };
  }
  return context;
}
