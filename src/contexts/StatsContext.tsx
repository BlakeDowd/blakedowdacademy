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
  refreshRounds: () => void;
}

const StatsContext = createContext<StatsContextType | undefined>(undefined);

// Sample rounds data for demonstration
const sampleRounds: RoundData[] = [
  {
    date: '2024-01-15',
    course: 'Pebble Beach',
    handicap: 10.2,
    holes: 18,
    score: 82,
    nett: 71.8,
    eagles: 0,
    birdies: 1,
    pars: 8,
    bogeys: 7,
    doubleBogeys: 2,
    firLeft: 3,
    firHit: 6,
    firRight: 5,
    totalGir: 9, // 50% of 18 holes
    totalPenalties: 1,
    teePenalties: 1,
    approachPenalties: 0,
    goingForGreen: 2,
    gir8ft: 2,
    gir20ft: 4,
    upAndDownConversions: 3,
    missed: 4,
    bunkerAttempts: 2,
    bunkerSaves: 0,
    chipInside6ft: 5,
    doubleChips: 0,
    totalPutts: 34,
    threePutts: 2,
    missed6ftAndIn: 3,
    puttsUnder6ftAttempts: 10,
  },
  {
    date: '2024-01-22',
    course: 'Augusta National',
    handicap: 9.8,
    holes: 18,
    score: 79,
    nett: 69.2,
    eagles: 0,
    birdies: 2,
    pars: 10,
    bogeys: 5,
    doubleBogeys: 1,
    firLeft: 2,
    firHit: 8,
    firRight: 4,
    totalGir: 12, // 65% of 18 holes
    totalPenalties: 0,
    teePenalties: 0,
    approachPenalties: 0,
    goingForGreen: 3,
    gir8ft: 3,
    gir20ft: 5,
    upAndDownConversions: 4,
    missed: 2,
    bunkerAttempts: 1,
    bunkerSaves: 1,
    chipInside6ft: 6,
    doubleChips: 0,
    totalPutts: 31,
    threePutts: 1,
    missed6ftAndIn: 2,
    puttsUnder6ftAttempts: 12,
  },
  {
    date: '2024-01-29',
    course: 'St. Andrews',
    handicap: 9.5,
    holes: 18,
    score: 78,
    nett: 68.5,
    eagles: 0,
    birdies: 3,
    pars: 9,
    bogeys: 5,
    doubleBogeys: 1,
    firLeft: 1,
    firHit: 9,
    firRight: 4,
    totalGir: 11, // 61% of 18 holes
    totalPenalties: 1,
    teePenalties: 1,
    approachPenalties: 0,
    goingForGreen: 4,
    gir8ft: 4,
    gir20ft: 4,
    upAndDownConversions: 5,
    missed: 2,
    bunkerAttempts: 2,
    bunkerSaves: 1,
    chipInside6ft: 7,
    doubleChips: 0,
    totalPutts: 30,
    threePutts: 0,
    missed6ftAndIn: 2,
    puttsUnder6ftAttempts: 11,
  },
  {
    date: '2024-02-05',
    course: 'Pinehurst',
    handicap: 9.1,
    holes: 18,
    score: 77,
    nett: 67.9,
    eagles: 0,
    birdies: 2,
    pars: 11,
    bogeys: 4,
    doubleBogeys: 1,
    firLeft: 2,
    firHit: 10,
    firRight: 2,
    totalGir: 13, // 72% of 18 holes
    totalPenalties: 0,
    teePenalties: 0,
    approachPenalties: 0,
    goingForGreen: 5,
    gir8ft: 5,
    gir20ft: 5,
    upAndDownConversions: 4,
    missed: 1,
    bunkerAttempts: 1,
    bunkerSaves: 1,
    chipInside6ft: 8,
    doubleChips: 0,
    totalPutts: 29,
    threePutts: 0,
    missed6ftAndIn: 1,
    puttsUnder6ftAttempts: 10,
  },
  {
    date: '2024-02-12',
    course: 'Torrey Pines',
    handicap: 8.7,
    holes: 18,
    score: 76,
    nett: 67.3,
    eagles: 0,
    birdies: 3,
    pars: 12,
    bogeys: 3,
    doubleBogeys: 0,
    firLeft: 1,
    firHit: 11,
    firRight: 2,
    totalGir: 14, // 78% of 18 holes
    totalPenalties: 0,
    teePenalties: 0,
    approachPenalties: 0,
    goingForGreen: 6,
    gir8ft: 6,
    gir20ft: 5,
    upAndDownConversions: 3,
    missed: 1,
    bunkerAttempts: 0,
    bunkerSaves: 0,
    chipInside6ft: 9,
    doubleChips: 0,
    totalPutts: 28,
    threePutts: 0,
    missed6ftAndIn: 3, // High missed putts to trigger alert
    puttsUnder6ftAttempts: 12,
  },
];

export function StatsProvider({ children }: { children: ReactNode }) {
  const [rounds, setRounds] = useState<RoundData[]>([]);

  const refreshRounds = () => {
    if (typeof window === 'undefined') return;
    
    const savedRounds = localStorage.getItem('rounds');
    if (savedRounds) {
      try {
        const parsedRounds = JSON.parse(savedRounds);
        setRounds(parsedRounds.length > 0 ? parsedRounds : sampleRounds);
      } catch (e) {
        console.error('Error parsing rounds:', e);
        setRounds(sampleRounds);
      }
    } else {
      // Use sample data when no real data exists
      setRounds(sampleRounds);
    }
  };

  useEffect(() => {
    refreshRounds();

    // Listen for storage changes (cross-tab)
    const handleStorageChange = () => {
      refreshRounds();
    };

    // Listen for custom event (same-tab immediate updates)
    const handleRoundsUpdated = () => {
      refreshRounds();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('roundsUpdated', handleRoundsUpdated);
    
    // Poll for changes as backup
    const interval = setInterval(refreshRounds, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('roundsUpdated', handleRoundsUpdated);
      clearInterval(interval);
    };
  }, []);

  return (
    <StatsContext.Provider value={{ rounds, refreshRounds }}>
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

