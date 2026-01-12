"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./AuthContext";

interface RoundData {
  date: string;
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

      console.log('StatsContext: Fetching rounds for user_id:', user.id);
      console.log('StatsContext: User object:', { id: user.id, email: user.email, fullName: user.fullName });
      
      const { data, error } = await supabase
        .from('rounds')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
      
      // Debug: Log the query filter being used
      console.log('StatsContext: Query filter - user_id =', user.id);

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
      
      // Debug: Check user_id in fetched rounds
      if (data && data.length > 0) {
        console.log('StatsContext: Sample round user_ids:', data.slice(0, 3).map((r: any) => ({
          round_id: r.id,
          user_id: r.user_id,
          matches_current_user: r.user_id === user.id,
          date: r.date
        })));
      } else {
        console.warn('StatsContext: No rounds found for user_id:', user.id);
        console.warn('StatsContext: This could mean:');
        console.warn('  1. No rounds exist in database for this user_id');
        console.warn('  2. RLS policies are blocking access');
        console.warn('  3. user_id mismatch between rounds table and auth.users');
      }

      // Transform database columns (snake_case) to camelCase for RoundData interface
      const transformedRounds: RoundData[] = (data || []).map((round: any) => ({
        date: round.date,
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
