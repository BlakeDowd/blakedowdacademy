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
  calculateStats: () => { handicap: string; totalRounds: number };
}

const StatsContext = createContext<StatsContextType | undefined>(undefined);

export function StatsProvider({ children }: { children: ReactNode }) {
  // Set rounds to empty array
  const [rounds, setRounds] = useState<RoundData[]>([]);
  // Set loading to true initially
  const [loading, setLoading] = useState<boolean>(true);

  // Load rounds from localStorage
  const loadRounds = () => {
    if (typeof window !== 'undefined') {
      try {
        const storedRounds = localStorage.getItem('rounds');
        if (storedRounds) {
          const parsedRounds = JSON.parse(storedRounds);
          setRounds(Array.isArray(parsedRounds) ? parsedRounds : []);
          console.log('StatsContext: Loaded rounds from localStorage:', parsedRounds.length);
        } else {
          setRounds([]);
          console.log('StatsContext: No rounds found in localStorage');
        }
      } catch (error) {
        console.error('StatsContext: Error loading rounds from localStorage:', error);
        setRounds([]);
      }
    }
    setLoading(false);
  };

  const refreshRounds = () => {
    loadRounds();
  };

  // Make calculateStats return only { handicap: 'N/A', totalRounds: 0 }
  const calculateStats = () => ({ handicap: 'N/A', totalRounds: 0 });

  // Load rounds on mount and listen for updates
  useEffect(() => {
    loadRounds();

    // Listen for roundsUpdated event
    const handleRoundsUpdate = () => {
      console.log('StatsContext: Received roundsUpdated event, refreshing...');
      loadRounds();
    };

    window.addEventListener('roundsUpdated', handleRoundsUpdate);

    return () => {
      window.removeEventListener('roundsUpdated', handleRoundsUpdate);
    };
  }, []);

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
