"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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

interface StatsContextType {
  rounds: RoundData[];
  loading: boolean;
  refreshRounds: () => void;
  calculateStats: () => { handicap: string; totalRounds: number };
}

const StatsContext = createContext<StatsContextType | undefined>(undefined);

export function StatsProvider({ children }: { children: ReactNode }) {
  // Set rounds to empty array
  const [rounds, setRounds] = useState<RoundData[]>([]);
  // Set loading to true initially
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useAuth();

  // Load rounds from database
  // Check Dashboard Fetch: Don't require user.id - fetch ALL rounds even if user is not logged in
  // Profile Mapping: Rounds with user_id that doesn't exist in profiles will still show (with 'Unknown User')
  const loadRounds = async () => {
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
      
      // Profile Join: Fetch all rounds and join with profiles table to get full_name
      // Verify Join: Using left join (profiles without !inner) so rounds without profiles are NOT discarded
      // Check for Null Profiles: Rounds missing profiles will show as 'Unknown User' instead of disappearing
      // Search Academy Page: Removed .eq('user_id', user.id) so leaderboard shows all users' rounds
      // Foreign key relationship: rounds.user_id -> profiles.id (Supabase auto-detects this)
      const { data, error } = await supabase
        .from('rounds')
        .select(`
          *,
          profiles (
            full_name,
            profile_icon
          )
        `)
        .order('created_at', { ascending: false });
      
      // Debug: Log the query - now fetching ALL rounds with left join (default)
      console.log('StatsContext: Query - fetching ALL rounds (no user_id filter, left join with profiles)');

      if (error) {
        console.error('StatsContext: Error loading rounds from database:', error);
        console.error('StatsContext: Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setRounds([]);
        setLoading(false);
        return;
      }

      console.log('StatsContext: Raw data from database:', data);
      console.log('StatsContext: Number of rounds fetched:', data?.length || 0);
      
      // Debug: Check user_id and full_name in fetched rounds
      if (data && data.length > 0) {
        console.log('StatsContext: Sample rounds with profiles:', data.slice(0, 5).map((r: any) => ({
          round_id: r.id,
          user_id: r.user_id,
          full_name: r.profiles?.full_name || 'No profile found',
          profile_icon: r.profiles?.profile_icon || null,
          date: r.date,
          score: r.score
        })));
        // Debug Logs: Keep console.log to see if Stuart's round is in the raw data
        console.log('StatsContext: All rounds user_ids:', data.map((r: any) => r.user_id));
        console.log('StatsContext: All rounds full_names:', data.map((r: any) => r.profiles?.full_name || 'No name'));
        // Check for Null Profiles: Log rounds with missing profiles
        const roundsWithoutProfiles = data.filter((r: any) => !r.profiles || !r.profiles.full_name);
        if (roundsWithoutProfiles.length > 0) {
          console.log('StatsContext: Rounds without profiles (will show as "Unknown User"):', roundsWithoutProfiles.length);
          console.log('StatsContext: Sample rounds without profiles:', roundsWithoutProfiles.slice(0, 3).map((r: any) => ({
            round_id: r.id,
            user_id: r.user_id,
            date: r.date
          })));
        }
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
        // Profile Join: Include user_id and profile data for leaderboard
        // Check for Null Profiles: If profile is missing, show 'Unknown User' instead of discarding the round
        user_id: round.user_id,
        full_name: round.profiles?.full_name || 'Unknown User', // Check for Null Profiles: Show 'Unknown User' if profile missing
        profile_icon: round.profiles?.profile_icon || null, // Get profile_icon from joined profiles table
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
      
      setLoading(false);
    } catch (error) {
      // Silent Errors: Modify the data fetch so it simply returns an empty array [] on error instead of throwing
      console.error('StatsContext: Error loading rounds from database:', error);
      console.error('StatsContext: Returning empty array to prevent UI freeze');
      // Silent Errors: Return empty array instead of throwing exception
      setRounds([]);
      setLoading(false);
      // Silent Errors: Don't re-throw error - just return empty array
    }
  };

  const refreshRounds = () => {
    loadRounds();
  };

  // Make calculateStats return only { handicap: 'N/A', totalRounds: 0 }
  const calculateStats = () => ({ handicap: 'N/A', totalRounds: 0 });

  // Load rounds on mount and listen for updates
  useEffect(() => {
    if (user?.id) {
      loadRounds();
    } else {
      setRounds([]);
      setLoading(false);
    }

    // Listen for roundsUpdated event
    const handleRoundsUpdate = () => {
      console.log('StatsContext: Received roundsUpdated event, refreshing from database...');
      if (user?.id) {
        loadRounds();
      }
    };

    window.addEventListener('roundsUpdated', handleRoundsUpdate);

    return () => {
      window.removeEventListener('roundsUpdated', handleRoundsUpdate);
    };
  }, [user?.id]);

  return (
    <StatsContext.Provider value={{ rounds, loading, refreshRounds, calculateStats }}>
      {children}
    </StatsContext.Provider>
  );
}

export function useStats() {
  const context = useContext(StatsContext);
  if (context === undefined) {
    // Silent Errors: Don't throw - return empty context to prevent UI freeze
    console.error('useStats must be used within a StatsProvider - returning empty context');
    return { rounds: [], loading: false, refreshRounds: () => {}, calculateStats: () => ({ handicap: 'N/A', totalRounds: 0 }) };
  }
  return context;
}
