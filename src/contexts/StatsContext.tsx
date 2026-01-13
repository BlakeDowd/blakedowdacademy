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
  const loadRounds = async () => {
    if (!user?.id) {
      setRounds([]);
      setLoading(false);
      return;
    }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      console.log('StatsContext: Fetching ALL rounds for leaderboard (not filtering by user_id)');
      console.log('StatsContext: User object:', { id: user.id, email: user.email, fullName: user.fullName });
      
      // Profile Join: Fetch all rounds and join with profiles table to get full_name
      // Search Academy Page: Removed .eq('user_id', user.id) so leaderboard shows all users' rounds
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
      
      // Debug: Log the query - now fetching ALL rounds
      console.log('StatsContext: Query - fetching ALL rounds (no user_id filter)');

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
        user_id: round.user_id,
        full_name: round.profiles?.full_name || null, // Get full_name from joined profiles table
        profile_icon: round.profiles?.profile_icon || null, // Get profile_icon from joined profiles table
      }));

      setRounds(transformedRounds);
      console.log('StatsContext: Loaded rounds from database:', transformedRounds.length);
      console.log('StatsContext: Transformed rounds data:', transformedRounds);
      setLoading(false);
    } catch (error) {
      console.error('StatsContext: Error loading rounds from database:', error);
      setRounds([]);
      setLoading(false);
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
    throw new Error('useStats must be used within a StatsProvider');
  }
  return context;
}
