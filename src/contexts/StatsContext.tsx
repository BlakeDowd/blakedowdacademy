"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

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
}

const StatsContext = createContext<StatsContextType | undefined>(undefined);

export function StatsProvider({ children }: { children: ReactNode }) {
  // Always initialize rounds as empty array, never null or undefined
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshRounds = async () => {
    if (typeof window === 'undefined') {
      setLoading(false);
      setRounds([]);
      return;
    }
    
    try {
      setLoading(true);
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      
      // Get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('Error getting user:', userError);
        setRounds([]);
        // Don't return here - let finally block set loading to false
      } else {
        // Fetch rounds from Supabase for the authenticated user
        const { data, error } = await supabase
          .from('rounds')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false });

        if (error) {
          console.error('Error fetching rounds:', error);
          setRounds([]); // Ensure empty array, never null
          // Don't return here - let finally block set loading to false
        } else {
          // Log what we received from the database
          console.log('Rounds data from database:', data);
          
          // If data is null or empty, set empty array immediately and stop loading
          if (!data || data.length === 0) {
            console.log('No rounds found in database, setting empty array');
            setRounds([]); // Ensure empty array, never null
            setLoading(false); // Set loading to false immediately for empty array
            return; // Return early since we have empty data
          } else {
            // Transform Supabase data to RoundData format
            const transformedRounds: RoundData[] = data.map((round: any) => ({
              date: round.date,
              course: round.course,
              handicap: round.handicap,
              holes: round.holes,
              score: round.score,
              nett: round.nett,
              eagles: round.eagles || 0,
              birdies: round.birdies || 0,
              pars: round.pars || 0,
              bogeys: round.bogeys || 0,
              doubleBogeys: round.double_bogeys || 0,
              firLeft: round.fir_left || 0,
              firHit: round.fir_hit || 0,
              firRight: round.fir_right || 0,
              totalGir: round.total_gir || 0,
              totalPenalties: round.total_penalties || 0,
              teePenalties: round.tee_penalties || 0,
              approachPenalties: round.approach_penalties || 0,
              goingForGreen: round.going_for_green || 0,
              gir8ft: round.gir_8ft || 0,
              gir20ft: round.gir_20ft || 0,
              upAndDownConversions: round.up_and_down_conversions || 0,
              missed: round.missed || 0,
              bunkerAttempts: round.bunker_attempts || 0,
              bunkerSaves: round.bunker_saves || 0,
              chipInside6ft: round.chip_inside_6ft || 0,
              doubleChips: round.double_chips || 0,
              totalPutts: round.total_putts || 0,
              threePutts: round.three_putts || 0,
              missed6ftAndIn: round.missed_6ft_and_in || 0,
              puttsUnder6ftAttempts: round.putts_under_6ft_attempts || 0,
            }));

            setRounds(transformedRounds);
            console.log('Transformed rounds:', transformedRounds);
          }
        }
      }
    } catch (error) {
      console.error('Error refreshing rounds:', error);
      setRounds([]); // Ensure empty array, never null
    } finally {
      // Always set loading to false, even if database returns empty list
      setLoading(false);
      console.log('Loading set to false');
    }
  };

  useEffect(() => {
    refreshRounds();

    // Listen for auth state changes to refresh rounds when user logs in/out
    let subscription: { unsubscribe: () => void } | null = null;

    const setupAuthListener = async () => {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange(() => {
        refreshRounds();
      });

      subscription = sub;
    };

    setupAuthListener();

    // Poll for changes as backup (every 5 seconds)
    const interval = setInterval(refreshRounds, 5000);

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      clearInterval(interval);
    };
  }, []);

  // Ensure rounds is always an array, never null or undefined
  const safeRounds = rounds || [];
  
  return (
    <StatsContext.Provider value={{ rounds: safeRounds, loading, refreshRounds }}>
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

