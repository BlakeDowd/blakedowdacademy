"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, Award, Medal, Crown, TrendingUp, TrendingDown, Search, X, Lock, Target, BookOpen, Clock, Zap, Star, Flame, Pencil, Check, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GOLF_ICONS } from "@/components/IconPicker";

interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  handicap: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  previousRank?: number; // For trend arrows
  avatar?: string; // Avatar initial or emoji
  lowRound?: number | null; // Lowest gross score (18-hole)
  lowNett?: number | null; // Lowest nett score (18-hole)
  birdieCount?: number; // Total birdies
  eagleCount?: number; // Total eagles
}

interface WeeklyPlan {
  [key: number]: {
    dayIndex: number;
    dayName: string;
    selected: boolean;
    availableTime: number;
    selectedFacilities: string[];
    roundType: string | null;
    drills: Array<{
      id: string;
      title: string;
      category: string;
      estimatedMinutes: number;
      completed?: boolean;
      isRound?: boolean;
      [key: string]: any;
    }>;
    date?: string;
  };
}

// Leaderboard data is now generated dynamically - no mock data

// Goal handicap
const GOAL_HANDICAP = 8.7;
const STARTING_HANDICAP = 12.0;

// XP per round
const XP_PER_ROUND = 500;
const XP_PER_DRILL = 100;

// Tier thresholds
const TIER_THRESHOLDS = {
  Bronze: { xp: 0, handicap: 15.0 },
  Silver: { xp: 3000, handicap: 12.0 },
  Gold: { xp: 6000, handicap: 10.0 },
  Platinum: { xp: 10000, handicap: 8.7 },
};

// Level mapping (based on tier)
const getLevel = (tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum'): string => {
  switch (tier) {
    case 'Platinum':
      return 'Level 4: Elite';
    case 'Gold':
      return 'Level 3: Elite';
    case 'Silver':
      return 'Level 2: Advanced';
    case 'Bronze':
      return 'Level 1: Foundation';
  }
};

// Trophy/Achievement data structure
interface TrophyData {
  id: string;
  name: string;
  requirement: string;
  category: 'Practice' | 'Knowledge' | 'Performance' | 'Milestone' | 'Scoring Milestones';
  icon: React.ComponentType<{ className?: string }>;
  checkUnlocked: (stats: {
    totalXP: number;
    completedLessons: number;
    practiceHours: number;
    rounds: number;
    handicap: number;
    roundsData?: any[]; // Full rounds data for score/birdie/eagle checking
    practiceHistory?: any[]; // Practice activity history
    libraryCategories?: Record<string, number>; // Completed drills by category
  }) => boolean;
  getProgress: (stats: {
    totalXP: number;
    completedLessons: number;
    practiceHours: number;
    rounds: number;
    handicap: number;
    roundsData?: any[];
    practiceHistory?: any[];
    libraryCategories?: Record<string, number>;
  }) => { current: number; target: number; percentage: number };
  isRare?: boolean; // For special styling (e.g., Eagle Eye)
}

const TROPHY_LIST: TrophyData[] = [
  // Practice Trophies
  {
    id: 'first-steps',
    name: 'First Steps',
    requirement: 'Complete 1 hour of practice',
    category: 'Practice',
    icon: Clock,
    checkUnlocked: (stats) => stats.practiceHours >= 1,
    getProgress: (stats) => ({ current: stats.practiceHours, target: 1, percentage: Math.min(100, (stats.practiceHours / 1) * 100) })
  },
  {
    id: 'dedicated',
    name: 'Dedicated',
    requirement: 'Complete 10 hours of practice',
    category: 'Practice',
    icon: Clock,
    checkUnlocked: (stats) => stats.practiceHours >= 10,
    getProgress: (stats) => ({ current: stats.practiceHours, target: 10, percentage: Math.min(100, (stats.practiceHours / 10) * 100) })
  },
  {
    id: 'practice-master',
    name: 'Practice Master',
    requirement: 'Complete 50 hours of practice',
    category: 'Practice',
    icon: Target,
    checkUnlocked: (stats) => stats.practiceHours >= 50,
    getProgress: (stats) => ({ current: stats.practiceHours, target: 50, percentage: Math.min(100, (stats.practiceHours / 50) * 100) })
  },
  {
    id: 'practice-legend',
    name: 'Practice Legend',
    requirement: 'Complete 100 hours of practice',
    category: 'Practice',
    icon: Flame,
    checkUnlocked: (stats) => stats.practiceHours >= 100,
    getProgress: (stats) => ({ current: stats.practiceHours, target: 100, percentage: Math.min(100, (stats.practiceHours / 100) * 100) })
  },
  // Knowledge Trophies
  {
    id: 'student',
    name: 'Student',
    requirement: 'Complete 5 lessons',
    category: 'Knowledge',
    icon: BookOpen,
    checkUnlocked: (stats) => stats.completedLessons >= 5,
    getProgress: (stats) => ({ current: stats.completedLessons, target: 5, percentage: Math.min(100, (stats.completedLessons / 5) * 100) })
  },
  {
    id: 'scholar',
    name: 'Scholar',
    requirement: 'Complete 20 lessons',
    category: 'Knowledge',
    icon: BookOpen,
    checkUnlocked: (stats) => stats.completedLessons >= 20,
    getProgress: (stats) => ({ current: stats.completedLessons, target: 20, percentage: Math.min(100, (stats.completedLessons / 20) * 100) })
  },
  {
    id: 'expert',
    name: 'Expert',
    requirement: 'Complete 50 lessons',
    category: 'Knowledge',
    icon: BookOpen,
    checkUnlocked: (stats) => stats.completedLessons >= 50,
    getProgress: (stats) => ({ current: stats.completedLessons, target: 50, percentage: Math.min(100, (stats.completedLessons / 50) * 100) })
  },
  // Performance Trophies
  {
    id: 'first-round',
    name: 'First Round',
    requirement: 'Log your first round',
    category: 'Performance',
    icon: Trophy,
    checkUnlocked: (stats) => stats.rounds >= 1,
    getProgress: (stats) => ({ current: stats.rounds, target: 1, percentage: Math.min(100, (stats.rounds / 1) * 100) })
  },
  {
    id: 'consistent',
    name: 'Consistent',
    requirement: 'Log 10 rounds',
    category: 'Performance',
    icon: Trophy,
    checkUnlocked: (stats) => stats.rounds >= 10,
    getProgress: (stats) => ({ current: stats.rounds, target: 10, percentage: Math.min(100, (stats.rounds / 10) * 100) })
  },
  {
    id: 'tracker',
    name: 'Tracker',
    requirement: 'Log 25 rounds',
    category: 'Performance',
    icon: Trophy,
    checkUnlocked: (stats) => stats.rounds >= 25,
    getProgress: (stats) => ({ current: stats.rounds, target: 25, percentage: Math.min(100, (stats.rounds / 25) * 100) })
  },
  // Milestone Trophies
  {
    id: 'rising-star',
    name: 'Rising Star',
    requirement: 'Earn 1,000 XP',
    category: 'Milestone',
    icon: Star,
    checkUnlocked: (stats) => stats.totalXP >= 1000,
    getProgress: (stats) => ({ current: stats.totalXP, target: 1000, percentage: Math.min(100, (stats.totalXP / 1000) * 100) })
  },
  {
    id: 'champion',
    name: 'Champion',
    requirement: 'Earn 5,000 XP',
    category: 'Milestone',
    icon: Zap,
    checkUnlocked: (stats) => stats.totalXP >= 5000,
    getProgress: (stats) => ({ current: stats.totalXP, target: 5000, percentage: Math.min(100, (stats.totalXP / 5000) * 100) })
  },
  {
    id: 'elite',
    name: 'Elite',
    requirement: 'Earn 10,000 XP',
    category: 'Milestone',
    icon: Crown,
    checkUnlocked: (stats) => stats.totalXP >= 10000,
    getProgress: (stats) => ({ current: stats.totalXP, target: 10000, percentage: Math.min(100, (stats.totalXP / 10000) * 100) })
  },
  {
    id: 'goal-achiever',
    name: 'Goal Achiever',
    requirement: 'Reach 8.7 handicap',
    category: 'Milestone',
    icon: Medal,
    checkUnlocked: (stats) => stats.handicap <= 8.7,
    getProgress: (stats) => {
      const startHandicap = 12.0;
      const goalHandicap = 8.7;
      const improvement = startHandicap - stats.handicap;
      const totalNeeded = startHandicap - goalHandicap;
      const percentage = Math.min(100, Math.max(0, (improvement / totalNeeded) * 100));
      return { current: stats.handicap, target: goalHandicap, percentage };
    }
  },
  // Scoring Milestones
  {
    id: 'birdie-hunter',
    name: 'Birdie Hunter',
    requirement: 'Log 1 Birdie in a round',
    category: 'Performance',
    icon: Target,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some((round: any) => (round.birdies || 0) >= 1);
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 0, target: 1, percentage: 0 };
      }
      const hasBirdie = stats.roundsData.some((round: any) => (round.birdies || 0) >= 1);
      return { current: hasBirdie ? 1 : 0, target: 1, percentage: hasBirdie ? 100 : 0 };
    }
  },
  {
    id: 'breaking-90',
    name: 'Breaking 90',
    requirement: 'Score below 90 in a round',
    category: 'Performance',
    icon: Trophy,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some((round: any) => round.score !== null && round.score < 90);
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 90, target: 89, percentage: 0 };
      }
      const bestScore = Math.min(...stats.roundsData.map((r: any) => r.score !== null ? r.score : 999).filter((s: number) => s < 999));
      const target = 89;
      const percentage = bestScore < 90 ? 100 : Math.max(0, ((90 - bestScore) / (90 - target)) * 100);
      return { current: bestScore < 999 ? bestScore : 90, target: target, percentage: Math.min(100, percentage) };
    }
  },
  {
    id: 'breaking-80',
    name: 'Breaking 80',
    requirement: 'Score below 80 in a round',
    category: 'Performance',
    icon: Trophy,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some((round: any) => round.score !== null && round.score < 80);
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 90, target: 79, percentage: 0 };
      }
      const bestScore = Math.min(...stats.roundsData.map((r: any) => r.score !== null ? r.score : 999).filter((s: number) => s < 999));
      const target = 79;
      const percentage = bestScore < 80 ? 100 : Math.max(0, ((80 - bestScore) / (80 - target)) * 100);
      return { current: bestScore < 999 ? bestScore : 90, target: target, percentage: Math.min(100, percentage) };
    }
  },
  {
    id: 'breaking-70',
    name: 'Breaking 70',
    requirement: 'Score below 70 in a round',
    category: 'Scoring Milestones',
    icon: Trophy,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some((round: any) => round.score !== null && round.score < 70);
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 90, target: 69, percentage: 0 };
      }
      const bestScore = Math.min(...stats.roundsData.map((r: any) => r.score !== null ? r.score : 999).filter((s: number) => s < 999));
      const target = 69;
      const percentage = bestScore < 70 ? 100 : Math.max(0, ((70 - bestScore) / (70 - target)) * 100);
      return { current: bestScore < 999 ? bestScore : 90, target: target, percentage: Math.min(100, percentage) };
    }
  },
  {
    id: 'eagle-eye',
    name: 'Eagle Eye',
    requirement: 'Score an Eagle in a round',
    category: 'Scoring Milestones',
    icon: Star,
    isRare: true,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some((round: any) => (round.eagles || 0) >= 1);
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 0, target: 1, percentage: 0 };
      }
      const hasEagle = stats.roundsData.some((round: any) => (round.eagles || 0) >= 1);
      return { current: hasEagle ? 1 : 0, target: 1, percentage: hasEagle ? 100 : 0 };
    }
  },
  {
    id: 'birdie-machine',
    name: 'Birdie Machine',
    requirement: 'Score 5 Birdies in a single round',
    category: 'Scoring Milestones',
    icon: Zap,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some((round: any) => (round.birdies || 0) >= 5);
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 0, target: 5, percentage: 0 };
      }
      const maxBirdies = Math.max(...stats.roundsData.map((r: any) => r.birdies || 0));
      return { current: maxBirdies, target: 5, percentage: Math.min(100, (maxBirdies / 5) * 100) };
    }
  },
  {
    id: 'par-train',
    name: 'Par Train',
    requirement: 'Score 5 consecutive pars in a round',
    category: 'Scoring Milestones',
    icon: Trophy,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      // Check each round for 5 consecutive pars
      return stats.roundsData.some((round: any) => {
        // For now, we'll check if total pars >= 5 (simplified logic)
        // In a full implementation, we'd track hole-by-hole scores
        return (round.pars || 0) >= 5;
      });
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 0, target: 5, percentage: 0 };
      }
      const maxPars = Math.max(...stats.roundsData.map((r: any) => r.pars || 0));
      return { current: maxPars, target: 5, percentage: Math.min(100, (maxPars / 5) * 100) };
    }
  },
  {
    id: 'week-warrior',
    name: 'Week Warrior',
    requirement: 'Practice 3 days in a row',
    category: 'Practice',
    icon: Flame,
    checkUnlocked: (stats) => {
      if (!stats.practiceHistory || stats.practiceHistory.length === 0) return false;
      // Get unique practice dates, sorted
      const practiceDates = [...new Set(stats.practiceHistory.map((entry: any) => {
        const date = new Date(entry.timestamp || entry.date);
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
      }))].sort();
      
      // Check for 3 consecutive days
      for (let i = 0; i < practiceDates.length - 2; i++) {
        const date1 = new Date(practiceDates[i]);
        const date2 = new Date(practiceDates[i + 1]);
        const date3 = new Date(practiceDates[i + 2]);
        
        // Check if dates are consecutive
        date1.setDate(date1.getDate() + 1);
        date2.setDate(date2.getDate() + 1);
        if (date1.toISOString().split('T')[0] === practiceDates[i + 1] &&
            date2.toISOString().split('T')[0] === practiceDates[i + 2]) {
          return true;
        }
      }
      return false;
    },
    getProgress: (stats) => {
      if (!stats.practiceHistory || stats.practiceHistory.length === 0) {
        return { current: 0, target: 3, percentage: 0 };
      }
      const practiceDates = [...new Set(stats.practiceHistory.map((entry: any) => {
        const date = new Date(entry.timestamp || entry.date);
        return date.toISOString().split('T')[0];
      }))].sort();
      
      let maxConsecutive = 0;
      let currentConsecutive = 1;
      for (let i = 1; i < practiceDates.length; i++) {
        const prevDate = new Date(practiceDates[i - 1]);
        const currDate = new Date(practiceDates[i]);
        prevDate.setDate(prevDate.getDate() + 1);
        if (prevDate.toISOString().split('T')[0] === practiceDates[i]) {
          currentConsecutive++;
        } else {
          maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
          currentConsecutive = 1;
        }
      }
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      return { current: maxConsecutive, target: 3, percentage: Math.min(100, (maxConsecutive / 3) * 100) };
    }
  },
  {
    id: 'monthly-legend',
    name: 'Monthly Legend',
    requirement: 'Log 20 total hours in a month',
    category: 'Practice',
    icon: Crown,
    checkUnlocked: (stats) => {
      if (!stats.practiceHistory || stats.practiceHistory.length === 0) return false;
      // Group practice by month
      const monthlyHours: Record<string, number> = {};
      stats.practiceHistory.forEach((entry: any) => {
        const date = new Date(entry.timestamp || entry.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const minutes = entry.duration || entry.estimatedMinutes || (entry.xp / 10) || 0;
        monthlyHours[monthKey] = (monthlyHours[monthKey] || 0) + (minutes / 60);
      });
      return Object.values(monthlyHours).some(hours => hours >= 20);
    },
    getProgress: (stats) => {
      if (!stats.practiceHistory || stats.practiceHistory.length === 0) {
        return { current: 0, target: 20, percentage: 0 };
      }
      const monthlyHours: Record<string, number> = {};
      stats.practiceHistory.forEach((entry: any) => {
        const date = new Date(entry.timestamp || entry.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const minutes = entry.duration || entry.estimatedMinutes || (entry.xp / 10) || 0;
        monthlyHours[monthKey] = (monthlyHours[monthKey] || 0) + (minutes / 60);
      });
      const maxHours = Math.max(...Object.values(monthlyHours), 0);
      return { current: maxHours, target: 20, percentage: Math.min(100, (maxHours / 20) * 100) };
    }
  },
  {
    id: 'putting-professor',
    name: 'Putting Professor',
    requirement: 'Complete all Putting category lessons',
    category: 'Knowledge',
    icon: BookOpen,
    checkUnlocked: (stats) => {
      if (!stats.libraryCategories) return false;
      // Check if user has completed at least 5 Putting category drills (as a proxy for "all")
      return (stats.libraryCategories['Putting'] || 0) >= 5;
    },
    getProgress: (stats) => {
      const puttingCount = stats.libraryCategories?.['Putting'] || 0;
      return { current: puttingCount, target: 5, percentage: Math.min(100, (puttingCount / 5) * 100) };
    }
  },
  {
    id: 'wedge-wizard',
    name: 'Wedge Wizard',
    requirement: 'Complete all Wedge Play category lessons',
    category: 'Knowledge',
    icon: BookOpen,
    checkUnlocked: (stats) => {
      if (!stats.libraryCategories) return false;
      // Check if user has completed at least 5 Wedge Play category drills
      return (stats.libraryCategories['Wedge Play'] || 0) >= 5;
    },
    getProgress: (stats) => {
      const wedgeCount = stats.libraryCategories?.['Wedge Play'] || 0;
      return { current: wedgeCount, target: 5, percentage: Math.min(100, (wedgeCount / 5) * 100) };
    }
  },
  {
    id: 'coachs-pet',
    name: "Coach's Pet",
    requirement: 'Complete a recommended drill from "Most Needed to Improve"',
    category: 'Performance',
    icon: Award,
    checkUnlocked: (stats) => {
      if (typeof window === 'undefined') return false;
      try {
        // Check if user has completed any recommended drills
        // Recommended drills are stored when user clicks the "Most Needed to Improve" card
        const recommendedDrills = JSON.parse(localStorage.getItem('recommendedDrills') || '[]');
        const userProgress = JSON.parse(localStorage.getItem('userProgress') || '{}');
        const completedDrillIds = userProgress.completedDrills || [];
        const drillCompletions = userProgress.drillCompletions || {};
        
        // Check if any recommended drill has been completed
        return recommendedDrills.some((drillId: string) => 
          completedDrillIds.includes(drillId) || (drillCompletions[drillId] && drillCompletions[drillId] > 0)
        );
      } catch (e) {
        return false;
      }
    },
    getProgress: (stats) => {
      if (typeof window === 'undefined') {
        return { current: 0, target: 1, percentage: 0 };
      }
      try {
        const recommendedDrills = JSON.parse(localStorage.getItem('recommendedDrills') || '[]');
        const userProgress = JSON.parse(localStorage.getItem('userProgress') || '{}');
        const completedDrillIds = userProgress.completedDrills || [];
        const drillCompletions = userProgress.drillCompletions || {};
        
        const completedCount = recommendedDrills.filter((drillId: string) => 
          completedDrillIds.includes(drillId) || (drillCompletions[drillId] && drillCompletions[drillId] > 0)
        ).length;
        
        return { current: completedCount, target: 1, percentage: Math.min(100, (completedCount / 1) * 100) };
      } catch (e) {
        return { current: 0, target: 1, percentage: 0 };
      }
    }
  }
];

// Helper function to get timeframe dates
function getTimeframeDates(timeFilter: 'week' | 'month' | 'year' | 'allTime') {
  const now = new Date();
  let startDate: Date;
  
  if (timeFilter === 'week') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
  } else if (timeFilter === 'month') {
    startDate = new Date(now);
    startDate.setMonth(now.getMonth() - 1);
  } else if (timeFilter === 'year') {
    startDate = new Date(now);
    startDate.setFullYear(now.getFullYear() - 1);
  } else {
    startDate = new Date(0); // All time
  }
  
  return { startDate, endDate: now };
}

// Calculate rounds count for a specific user
function calculateUserRounds(rounds: any[], timeFilter: 'week' | 'month' | 'year' | 'allTime', userId?: string) {
  // Verify the Variable: Make sure leaderboardData is being calculated using the rounds from StatsContext and that it isn't being filtered out by a mismatching user_id
  console.log('calculateUserRounds: Input rounds count:', rounds?.length || 0);
  console.log('calculateUserRounds: Filtering for user_id:', userId);
  console.log('calculateUserRounds: TimeFilter:', timeFilter);
  
  if (!rounds || rounds.length === 0) {
    console.log('calculateUserRounds: No rounds provided, returning 0');
    return 0;
  }
  
  const { startDate } = getTimeframeDates(timeFilter);
  // Find the Top 3 Render: Replace placeholder with actual count of rounds for that user
  // Verify StatsContext: Ensure the data coming from StatsContext is being passed into the leaderboard calculation correctly
  const userRounds = rounds.filter(round => {
    // Filter by user_id if provided
    if (userId && round.user_id !== userId) {
      console.log('calculateUserRounds: Round filtered out - user_id mismatch:', round.user_id, 'vs', userId);
      return false;
    }
    // Filter by timeframe
    if (timeFilter === 'allTime') return true;
    const roundDate = new Date(round.date || round.created_at);
    const isInTimeframe = roundDate >= startDate;
    if (!isInTimeframe) {
      console.log('calculateUserRounds: Round filtered out - outside timeframe:', roundDate, 'vs', startDate);
    }
    return isInTimeframe;
  });
  
  console.log('calculateUserRounds: Filtered userRounds count:', userRounds.length);
  return userRounds.length;
}

// Calculate practice time (in hours)
function calculateUserPracticeTime(timeFilter: 'week' | 'month' | 'year' | 'allTime') {
  if (typeof window === 'undefined') return 0;
  try {
    const { startDate } = getTimeframeDates(timeFilter);
    const practiceHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
    
    const filteredHistory = practiceHistory.filter((entry: any) => {
      if (timeFilter === 'allTime') return true;
      const entryDate = new Date(entry.timestamp || entry.date);
      return entryDate >= startDate;
    });
    
    // Sum minutes from practice history
    const totalMinutes = filteredHistory.reduce((sum: number, entry: any) => {
      // Estimate minutes from XP (10 XP per minute for drills)
      return sum + (entry.xp / 10 || 0);
    }, 0);
    
    // Also check totalPracticeMinutes from localStorage
    const savedMinutes = parseInt(localStorage.getItem('totalPracticeMinutes') || '0');
    
    return (totalMinutes + savedMinutes) / 60; // Convert to hours
  } catch (error) {
    return 0;
  }
}

// Calculate drills count
function calculateUserDrills(timeFilter: 'week' | 'month' | 'year' | 'allTime') {
  if (typeof window === 'undefined') return 0;
  try {
    const { startDate } = getTimeframeDates(timeFilter);
    const practiceHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
    
    const filteredHistory = practiceHistory.filter((entry: any) => {
      if (timeFilter === 'allTime') return true;
      const entryDate = new Date(entry.timestamp || entry.date);
      return entryDate >= startDate;
    });
    
    // Count unique drill completions
    const uniqueDrills = new Set(filteredHistory.map((entry: any) => entry.drillTitle || entry.title).filter(Boolean));
    return uniqueDrills.size;
  } catch (error) {
    return 0;
  }
}

// Calculate library lessons count (completed lessons with both video and text)
function calculateUserLibraryLessons(timeFilter: 'week' | 'month' | 'year' | 'allTime') {
  if (typeof window === 'undefined') return 0;
  try {
    const { startDate } = getTimeframeDates(timeFilter);
    const savedProgress = localStorage.getItem('userProgress');
    if (!savedProgress) return 0;
    
    const progress = JSON.parse(savedProgress);
    const completedDrillIds = progress.completedDrills || [];
    
    // Count completed library items (lessons)
    // Filter by timeframe using practice activity history if available
    if (timeFilter === 'allTime') {
      return completedDrillIds.length;
    }
    
    // Try to filter by timeframe using practice activity history
    try {
      const practiceHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
      const filteredHistory = practiceHistory.filter((entry: any) => {
        const entryDate = new Date(entry.timestamp || entry.date);
        return entryDate >= startDate && entry.type === 'practice';
      });
      
      // Count unique drill IDs from filtered history
      const uniqueDrillIds = new Set(filteredHistory.map((entry: any) => entry.drillTitle || entry.id).filter(Boolean));
      return uniqueDrillIds.size;
    } catch (error) {
      // Fallback: return all completed if filtering fails
      return completedDrillIds.length;
    }
  } catch (error) {
    return 0;
  }
}

// Format metric value for display (used in four-pillar cards)
function formatMetricValue(value: number, metric: 'library' | 'practice' | 'rounds' | 'drills') {
  switch (metric) {
    case 'library':
      return `${value} Lesson${value !== 1 ? 's' : ''}`;
    case 'practice':
      return `${value.toFixed(1)} hrs`;
    case 'rounds':
      return `${value} Round${value !== 1 ? 's' : ''}`;
    case 'drills':
      return `${value} Drill${value !== 1 ? 's' : ''}`;
    default:
      return `${value}`;
  }
}

// Create a Name Lookup: Fetch full_name, profile_icon, and xp for each user_id
// Name Mapping: Match the user_id from the practice table (or rounds/drills) to the id in the profiles table to display their real names
// Update fetchUserProfiles to include XP column from profiles table
// Verify Name Fetching: Ensure loadProfiles is fetching every single row from the profiles table
// Debug Log: Add console.log('Available Profiles:', profiles) to the load function so I can see in the browser if Stuart and Sean's names are actually being loaded
async function fetchUserProfiles(userIds: string[]): Promise<Map<string, { full_name?: string; profile_icon?: string; xp?: number }>> {
  const profileMap = new Map<string, { full_name?: string; profile_icon?: string; xp?: number }>();
  
  if (userIds.length === 0) {
    console.warn('fetchUserProfiles: No user IDs provided, returning empty map');
    return profileMap;
  }
  
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    
    // Verify Name Fetching: Log the user IDs we're looking for
    console.log('fetchUserProfiles: Looking for profiles for', userIds.length, 'user IDs:', userIds);
    
    // Name Mapping: Match user_id from practice/rounds/drills tables to id in profiles table
    // Update fetchUserProfiles to include XP column from profiles table
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, profile_icon, xp')
      .in('id', userIds);
    
    if (error) {
      console.error('Error fetching user profiles:', error);
      console.error('Error details:', { code: error.code, message: error.message, details: error.details });
      return profileMap;
    }
    
    // Debug Log: Add console.log('Available Profiles:', profiles) to the load function
    console.log('Available Profiles:', data);
    console.log('fetchUserProfiles: Raw data from Supabase:', data?.map((p: any) => ({ id: p.id, full_name: p.full_name, xp: p.xp })));
    
    // Map IDs to Names: Create a map of user_id -> { full_name, profile_icon, xp }
    // The key is the user_id from practice/rounds/drills, which matches the id in profiles table
    // Update fetchUserProfiles to include XP column from profiles table
    if (data) {
      data.forEach((profile: any) => {
        // Name Mapping: user_id from practice table matches id in profiles table
        profileMap.set(profile.id, {
          full_name: profile.full_name,
          profile_icon: profile.profile_icon,
          xp: profile.xp || 0 // Include XP from profiles table
        });
        console.log(`fetchUserProfiles: Mapped ${profile.id} -> ${profile.full_name || 'NO NAME'}`);
      });
      
      // Check for missing profiles
      const missingIds = userIds.filter(id => !profileMap.has(id));
      if (missingIds.length > 0) {
        console.warn('fetchUserProfiles: Missing profiles for user IDs:', missingIds);
        console.warn('These user IDs were requested but not found in the profiles table');
      }
    } else {
      console.warn('fetchUserProfiles: No data returned from Supabase query');
    }
    
    console.log('Fetched profiles for', profileMap.size, 'users:', Array.from(profileMap.entries()).map(([id, data]) => ({ id, name: data.full_name || 'NO NAME', xp: data.xp })));
  } catch (error) {
    console.error('Error in fetchUserProfiles:', error);
  }
  
  return profileMap;
}

// Generate mock leaderboard data for a specific metric (four-pillar cards)
function getMockLeaderboard(
  metric: 'library' | 'practice' | 'rounds' | 'drills',
  timeFilter: 'week' | 'month' | 'year' | 'allTime',
  rounds: any[],
  userName: string,
  user?: { id?: string; initialHandicap?: number; profileIcon?: string } | null,
  userProfiles?: Map<string, { full_name?: string; profile_icon?: string; xp?: number }>,
  drills?: any[],
  practiceSessions?: any[]
) {
  let userValue: number;
  
  switch (metric) {
    case 'library':
      userValue = calculateUserLibraryLessons(timeFilter);
      break;
    case 'practice':
      userValue = calculateUserPracticeTime(timeFilter);
      break;
    case 'rounds':
      // Find the Top 3 Render: Replace placeholder with actual count of rounds for that user (e.g., userRounds.length)
      userValue = calculateUserRounds(rounds, timeFilter, user?.id);
      break;
    case 'drills':
      userValue = calculateUserDrills(timeFilter);
      break;
    default:
      userValue = 0;
  }
  
  // Remove Mock Data: Find the top3 or leaders array calculation. Remove any code that inserts a 'dummy' or 'mock' user when the database is empty.
  // Use Real Count: Ensure the roundCount displayed is userRounds.length from the actual rounds array.
  // Handle Empty State: If there are no rounds in the database, show a 'No Rounds Logged' message instead of fake leaders.
  
  // Check Fetch Logic: Ensure the loadStats function is fetching data from the drills and practice_sessions tables as well as rounds
  // Remove User Filters: Just like we did for Rounds, remove any .eq('user_id', user.id) from the Drills and Practice fetch calls so the leaderboard can see everyone's progress
  
  // The Practice sync is working perfectly! Now apply the same logic to Drills
  // For drills metric, group all drills by user_id and create leaderboard entries for each user
  if (metric === 'drills') {
    // Global Fetch: Use drills from database (StatsContext) - already fetching all records without user_id filter
    // Remove User Filters: Process ALL drills from all users, not just current user
    const allDrills = drills || [];
    
    // Filter by timeframe if needed
    const { startDate } = getTimeframeDates(timeFilter);
    const filteredDrills = allDrills.filter((drill: any) => {
      if (timeFilter === 'allTime') return true;
      const drillDate = new Date(drill.completed_at || drill.created_at || Date.now());
      return drillDate >= startDate;
    });
    
    // Group drills by user_id to count drills per user
    const drillsByUser = new Map<string, any[]>();
    filteredDrills.forEach((drill: any) => {
      if (!drill.user_id) return; // Skip drills without user_id
      if (!drillsByUser.has(drill.user_id)) {
        drillsByUser.set(drill.user_id, []);
      }
      drillsByUser.get(drill.user_id)!.push(drill);
    });
    
    // Create leaderboard entries for all users
    // Name Mapping: Match the user_id in the drill data to the full_name in the profiles table so we see 'Stuart' instead of a code
    const allEntries: any[] = [];
    drillsByUser.forEach((userDrills, userId) => {
      const drillCount = userDrills.length;
      
      // Map the IDs: Use the profiles data from StatsContext to map every user_id in the leaderboard to a full_name
      // Fallback Logic: If a profile isn't found for an ID, show 'Academy Member' instead of the long code
      const profile = userProfiles?.get(userId);
      const displayName = profile?.full_name || 'Academy Member';
      
      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = 'U';
      if (profile?.full_name) {
        nameForAvatar = profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else if (displayName && displayName.length > 8) {
        nameForAvatar = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || 'U';
      }
      
      const userIcon = profile?.profile_icon || nameForAvatar;
      
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: drillCount,
        isCurrentUser: user?.id === userId
      });
    });
    
    // Sort by drill count descending (most drills first)
    allEntries.sort((a, b) => b.value - a.value);
    
    // If no drills exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0
      };
    }
    
    // Find current user's entry and value
    const currentUserEntry = allEntries.find(entry => entry.isCurrentUser);
    userValue = currentUserEntry?.value || 0;
    
    const userEntryInSorted = allEntries.find(entry => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value || userValue;
    
    console.log('getMockLeaderboard - drills metric (global):', {
      totalDrillsInDatabase: allDrills.length,
      totalUsers: allEntries.length,
      top3Values: allEntries.slice(0, 3).map(e => ({ name: e.name, value: e.value, id: e.id })),
      currentUserValue: finalUserValue
    });
    
    return {
      top3: allEntries.slice(0, 3),
      all: allEntries,
      userRank: userEntryInSorted ? allEntries.findIndex(entry => entry.isCurrentUser) + 1 : 0,
      userValue: finalUserValue
    };
  }
  
  // For practice metric, group all practice_sessions by user_id and create leaderboard entries for each user
  if (metric === 'practice') {
    // Check Fetch Logic: Use practice_sessions from database (StatsContext) instead of localStorage
    // Remove User Filters: Process ALL practice_sessions from all users, not just current user
    const allPracticeSessions = practiceSessions || [];
    
    // Filter by timeframe if needed
    const { startDate } = getTimeframeDates(timeFilter);
    const filteredSessions = allPracticeSessions.filter((session: any) => {
      if (timeFilter === 'allTime') return true;
      const sessionDate = new Date(session.practice_date || session.created_at || Date.now());
      return sessionDate >= startDate;
    });
    
    // Group practice_sessions by user_id to sum hours per user
    const sessionsByUser = new Map<string, any[]>();
    filteredSessions.forEach((session: any) => {
      if (!session.user_id) return; // Skip sessions without user_id
      if (!sessionsByUser.has(session.user_id)) {
        sessionsByUser.set(session.user_id, []);
      }
      sessionsByUser.get(session.user_id)!.push(session);
    });
    
    // Create leaderboard entries for all users
    const allEntries: any[] = [];
    sessionsByUser.forEach((userSessions, userId) => {
      // Sum total practice hours for this user
      const totalMinutes = userSessions.reduce((sum, session) => {
        return sum + (session.duration_minutes || 0);
      }, 0);
      const totalHours = totalMinutes / 60;
      
      // Map the IDs: Use the profiles data from StatsContext to map every user_id in the leaderboard to a full_name
      // Fallback Logic: If a profile isn't found for an ID, show 'Academy Member' instead of the long code
      const profile = userProfiles?.get(userId);
      const displayName = profile?.full_name || 'Academy Member';
      
      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = 'U';
      if (profile?.full_name) {
        nameForAvatar = profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else if (displayName && displayName.length > 8) {
        nameForAvatar = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || 'U';
      }
      
      const userIcon = profile?.profile_icon || nameForAvatar;
      
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: totalHours,
        isCurrentUser: user?.id === userId
      });
    });
    
    // Sort by practice hours descending (most hours first)
    allEntries.sort((a, b) => b.value - a.value);
    
    // If no practice sessions exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0
      };
    }
    
    // Find current user's entry and value
    const currentUserEntry = allEntries.find(entry => entry.isCurrentUser);
    userValue = currentUserEntry?.value || 0;
    
    const userEntryInSorted = allEntries.find(entry => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value || userValue;
    
    console.log('getMockLeaderboard - practice metric (global):', {
      totalPracticeSessionsInDatabase: allPracticeSessions.length,
      totalUsers: allEntries.length,
      top3Values: allEntries.slice(0, 3).map(e => ({ name: e.name, value: e.value, id: e.id })),
      currentUserValue: finalUserValue
    });
    
    return {
      top3: allEntries.slice(0, 3),
      all: allEntries,
      userRank: userEntryInSorted ? allEntries.findIndex(entry => entry.isCurrentUser) + 1 : 0,
      userValue: finalUserValue
    };
  }
  
  // Remove User Filter: For global leaderboard, process ALL rounds from all users, not just current user
  // Connect Top 3: Ensure the 'Top 3 Leaders' card is pulling from this new global array instead of using a hardcoded mock object
  if (metric === 'rounds') {
    // Filter by timeframe first (no user_id filter - get all users' rounds)
    const timeFilteredRounds = rounds.filter(round => {
      if (timeFilter === 'allTime') return true;
      const { startDate } = getTimeframeDates(timeFilter);
      const roundDate = new Date(round.date || round.created_at);
      return roundDate >= startDate;
    });
    
    // Group rounds by user_id to count rounds per user
    const roundsByUser = new Map<string, any[]>();
    timeFilteredRounds.forEach(round => {
      if (!round.user_id) return; // Skip rounds without user_id
      if (!roundsByUser.has(round.user_id)) {
        roundsByUser.set(round.user_id, []);
      }
      roundsByUser.get(round.user_id)!.push(round);
    });
    
    // Create leaderboard entries for all users
    // Create a Name Lookup: Use userProfiles map to get full_name for each user_id
    // Map IDs to Names: Match user IDs to their full_name from profiles table
    const allEntries: any[] = [];
    roundsByUser.forEach((userRounds, userId) => {
      const roundCount = userRounds.length;
      
      // Map the IDs: Use the profiles data from StatsContext to map every user_id in the leaderboard to a full_name
      // Fallback Logic: If a profile isn't found for an ID, show 'Academy Member' instead of the long code
      const profile = userProfiles?.get(userId);
      const displayName = profile?.full_name || 'Academy Member';
      
      // Fix Avatars: Update the avatar circles to show the first letter of their names (e.g., 'B') instead of the first letter of the ID
      let nameForAvatar = 'U';
      if (profile?.full_name) {
        // Use first letter of each word in full_name
        nameForAvatar = profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else if (displayName && displayName.length > 8) {
        // If displayName is a real name (not an ID), use first letters
        nameForAvatar = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else {
        // Fallback: use first letter of displayName
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || 'U';
      }
      
      const userIcon = profile?.profile_icon || nameForAvatar;
      
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: roundCount, // Verify Count: Use rounds.length from database results, not hardcoded 4000
        isCurrentUser: user?.id === userId,
        handicap: user?.id === userId ? user?.initialHandicap : undefined
      });
    });
    
    // Sort by round count descending (most rounds first)
    allEntries.sort((a, b) => b.value - a.value);
    
    // If no rounds exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0
      };
    }
    
    // Find current user's entry and value
    const currentUserEntry = allEntries.find(entry => entry.isCurrentUser);
    userValue = currentUserEntry?.value || 0;
    
    const userEntryInSorted = allEntries.find(entry => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value || userValue;
    
    // Find the top3 calculation: Locate where the leaderboard data is sliced to get the top 3 users
    // Remove Mock Fallbacks: Search for any code that manually creates a user object with '4000' as the value and delete it
    // Sync to Database: Ensure the Top3Leaders component is strictly using the values from the allEntries array we just built, which uses roundsByUser.get(userId).length
    // Update Sub-label: Ensure the text below the name says {entry.value} Rounds instead of a static number
    console.log('getMockLeaderboard - rounds metric (global):', {
      totalRoundsInDatabase: rounds?.length || 0, // Verify Count: Change display variable from hardcoded 4000 to rounds.length
      totalUsers: allEntries.length,
      top3Values: allEntries.slice(0, 3).map(e => ({ name: e.name, value: e.value, id: e.id })),
      currentUserValue: finalUserValue,
      allEntriesValues: allEntries.map(e => ({ name: e.name, value: e.value, id: e.id }))
    });
    
    // Remove Mock Fallbacks: Verify no entry has value 4000
    const has4000 = allEntries.some(e => e.value === 4000);
    if (has4000) {
      console.error('⚠️ Found entry with value 4000 in getMockLeaderboard! This should be replaced with actual roundCount from roundsByUser.get(userId).length');
    }
    
    // Find the top3 calculation: Slice allEntries to get top 3 users
    // Sync to Database: Ensure Top3Leaders uses values from allEntries array (which uses roundsByUser.get(userId).length)
    const top3FromAllEntries = allEntries.slice(0, 3);
    console.log('getMockLeaderboard - top3 from allEntries:', top3FromAllEntries.map(e => ({ name: e.name, value: e.value })));
    
    return {
      top3: top3FromAllEntries, // Find the top3 calculation: Use allEntries.slice(0, 3) - strictly from database
      all: allEntries,
      userRank: userEntryInSorted ? allEntries.findIndex(entry => entry.isCurrentUser) + 1 : 0,
      userValue: finalUserValue
    };
  }
  
  // For other metrics, keep existing logic
  const userEntry = {
    id: 'user',
    name: userName, // Use actual full_name instead of 'You'
    avatar: user?.profileIcon || userName.split(' ').map((n: string) => n[0]).join('') || 'Y', // Use profile_icon if available, else initials
    value: userValue, // Use dynamic userValue from calculateUserRounds (which uses userRounds.length), not hardcoded
    handicap: user?.initialHandicap // Include handicap for sorting rounds by skill level
  };
  
  // Sort by value descending for other metrics
  const sorted = [userEntry].sort((a, b) => b.value - a.value);
  
  // Connect to Real Data: Replace any hardcoded values with userRounds.length or the score property from the actual leaderboardData array
  // Unify Labels: Ensure the top card and Rank section both use the same value from the entry in the leaderboard array
  const userEntryInSorted = sorted.find(entry => entry.id === 'user');
  const finalUserValue = userEntryInSorted?.value || userValue;
  
  return {
    top3: sorted.slice(0, 3),
    all: sorted,
    userRank: sorted.length > 0 ? sorted.findIndex(entry => entry.id === 'user') + 1 : 0,
    // Use the actual value from the user entry in the leaderboard array, not a separate userValue
    userValue: finalUserValue
  };
}

// Format leaderboard value for display (used in main XP leaderboard)
function formatLeaderboardValue(value: number, metric: 'xp' | 'library' | 'practice' | 'rounds' | 'drills' | 'lowGross' | 'lowNett' | 'birdies' | 'eagles') {
  switch (metric) {
    case 'xp':
      return `${value.toLocaleString()} XP`;
    case 'library':
      return `${value} Lesson${value !== 1 ? 's' : ''}`;
    case 'practice':
      return `${value.toFixed(1)} hrs`;
    case 'rounds':
      return `${value} Round${value !== 1 ? 's' : ''}`;
    case 'drills':
      return `${value} Drill${value !== 1 ? 's' : ''}`;
    case 'lowGross':
      return `${value} Gross`;
    case 'lowNett':
      return `${value} Nett`;
    case 'birdies':
      return `${value} Birdie${value !== 1 ? 's' : ''}`;
    case 'eagles':
      return `${value} Eagle${value !== 1 ? 's' : ''}`;
    default:
      return `${value}`;
  }
}

// Get leaderboard data for selected metric (main XP leaderboard)
function getLeaderboardData(
  metric: 'xp' | 'library' | 'practice' | 'rounds' | 'drills' | 'lowGross' | 'lowNett' | 'birdies' | 'eagles',
  timeFilter: 'week' | 'month' | 'year' | 'allTime',
  rounds: any[],
  totalXP: number,
  userName: string,
  user?: { id?: string; profileIcon?: string } | null,
  userProfiles?: Map<string, { full_name?: string; profile_icon?: string; xp?: number }>,
  practiceSessions?: any[],
  drills?: any[]
) {
  // Debug: Log leaderboard calculation inputs
  // Debug Logs: Keep console.log to see if Stuart's round is in the raw data
  console.log('Leaderboard Data Debug:', {
    metric,
    timeFilter,
    roundsCount: rounds?.length || 0,
    rounds: rounds,
    totalXP,
    userName,
  });
  // Debug: Log all rounds with user info to verify Stuart's rounds are included
  // Map Stuart's Data: Ensure the Academy page correctly renders Stuart's round now that the database is allowing us to see it
  // Check for Null Profiles: Verify rounds without profiles are included as 'Unknown User'
  if (rounds && rounds.length > 0) {
    console.log('Leaderboard: All rounds with user info:', rounds.map((r: any) => ({
      user_id: r.user_id,
      full_name: r.full_name || 'Unknown User',
      date: r.date,
      score: r.score
    })));
    // Map Stuart's Data: Check if Stuart's rounds are in the data
    const stuartRounds = rounds.filter((r: any) => 
      r.full_name?.toLowerCase().includes('stuart') || 
      r.user_id?.includes('stuart') ||
      r.full_name === 'Stuart Tibben'
    );
    if (stuartRounds.length > 0) {
      console.log('✅ Leaderboard: Stuart\'s rounds found:', stuartRounds.length);
      console.log('✅ Leaderboard: Stuart\'s rounds data:', stuartRounds.map((r: any) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        date: r.date,
        score: r.score
      })));
    } else {
      console.log('Leaderboard: No Stuart rounds found in data (this is OK if Stuart hasn\'t logged rounds)');
    }
    // Check for Null Profiles: Count rounds with 'Unknown User'
    const unknownUserRounds = rounds.filter((r: any) => !r.full_name || r.full_name === 'Unknown User');
    if (unknownUserRounds.length > 0) {
      console.log('Leaderboard: Rounds with "Unknown User" (missing profiles):', unknownUserRounds.length);
    }
  } else {
    console.warn('⚠️ Leaderboard: No rounds found! Check if rounds are being fetched from database.');
  }
  
  // Filter rounds by timeframe first - use created_at if available, otherwise fall back to date
  const filteredRounds = rounds.filter(round => {
    if (timeFilter === 'allTime') return true;
    const { startDate } = getTimeframeDates(timeFilter);
    // Use created_at for filtering (more accurate for when round was logged)
    const roundTimestamp = round.created_at ? new Date(round.created_at) : new Date(round.date);
    return roundTimestamp >= startDate;
  });
  
  // For Low Gross and Low Nett: Filter to only 18-hole rounds
  const eighteenHoleRounds = filteredRounds.filter(round => round.holes === 18);
  const valid18HoleScores = eighteenHoleRounds
    .map(r => r.score)
    .filter(score => score !== null && score !== undefined && score > 0);
  const lowGross = valid18HoleScores.length > 0 ? Math.min(...valid18HoleScores) : null;
  
  // Calculate Low Nett: Score minus Handicap (only for 18-hole rounds with valid score and handicap)
  const validNettRounds = eighteenHoleRounds.filter(round => 
    round.score !== null && 
    round.score !== undefined && 
    round.score > 0 && 
    round.handicap !== null && 
    round.handicap !== undefined
  );
  const nettScores = validNettRounds.map(round => round.score! - round.handicap!);
  const lowNett = nettScores.length > 0 ? Math.min(...nettScores) : null;
  
  // For Birdies: Sum all birdies from all rounds (not just 18-hole)
  const birdieCount = filteredRounds.reduce((sum, round) => sum + (round.birdies || 0), 0);
  
  // For Eagles: Sum all eagles from all rounds (not just 18-hole)
  const eagleCount = filteredRounds.reduce((sum, round) => sum + (round.eagles || 0), 0);
  
  let userValue: number;
  
  switch (metric) {
    case 'xp':
      userValue = totalXP;
      break;
    case 'library':
      userValue = calculateUserLibraryLessons(timeFilter);
      break;
    case 'practice':
      // For practice metric, we'll calculate from all practice sessions below in the special case
      userValue = 0; // Will be calculated from practice sessions
      break;
    case 'rounds':
      // Find the Top 3 Render: Replace placeholder with actual count of rounds for that user (e.g., userRounds.length)
      userValue = calculateUserRounds(rounds, timeFilter, user?.id);
      break;
    case 'drills':
      userValue = calculateUserDrills(timeFilter);
      break;
    case 'lowGross':
      userValue = lowGross !== null ? lowGross : 0; // Use 0 if no low gross (will be filtered out)
      break;
    case 'lowNett':
      userValue = lowNett !== null ? lowNett : 0; // Use 0 if no low nett (will be filtered out)
      break;
    case 'birdies':
      userValue = birdieCount;
      break;
    case 'eagles':
      userValue = eagleCount;
      break;
    default:
      userValue = 0;
  }
  
  // Remove Mock Data: Find the top3 or leaders array calculation. Remove any code that inserts a 'dummy' or 'mock' user when the database is empty.
  // Use Real Count: Ensure the roundCount displayed is userRounds.length from the actual rounds array.
  // Handle Empty State: If there are no rounds in the database, show a 'No Rounds Logged' message instead of fake leaders.
  
  // Remove User Filter: For global leaderboard, process ALL rounds from all users, not just current user
  // Connect Top 3: Ensure the 'Top 3 Leaders' card is pulling from this new global array instead of using a hardcoded mock object
  // For birdies, eagles, lowGross, and lowNett metrics, group all rounds by user_id and create leaderboard entries for each user
  if (metric === 'birdies' || metric === 'eagles') {
    // Locate getLeaderboardData: Find the logic that calculates stats like Birdies, Eagles
    // Remove the User Filter: Ensure the code iterates through all rounds in the rounds array (the global set) instead of filtering for round.user_id === user.id
    // Group and Sum: For Birdies/Eagles, ensure it sums them up per user ID, then maps them to the allEntries array so Stuart's name and total appear
    // Fix Ranking: Make sure the sorting for these tabs is set to Descending (highest birdies first) so the leaders show up at the top
    
    console.log('Birdies/Eagles: Processing', filteredRounds.length, 'rounds for all users');
    console.log('Birdies/Eagles: All user_ids in filteredRounds:', Array.from(new Set(filteredRounds.map((r: any) => r.user_id).filter(Boolean))));
    
    // Fix Birdie/Eagle Counting: Iterate through all users' rounds to sum up their birdies/eagles, then sort from highest to lowest
    // Group rounds by user_id to calculate totals per user
    // Remove the User Filter: Process ALL rounds, not just current user's rounds
    const roundsByUser = new Map<string, any[]>();
    filteredRounds.forEach(round => {
      // Remove the User Filter: Don't filter by user.id - process all rounds
      if (!round.user_id) return; // Skip rounds without user_id
      if (!roundsByUser.has(round.user_id)) {
        roundsByUser.set(round.user_id, []);
      }
      roundsByUser.get(round.user_id)!.push(round);
    });
    
    console.log('Birdies/Eagles: Grouped into', roundsByUser.size, 'users:', Array.from(roundsByUser.keys()));
    
    // Group and Sum: For Birdies/Eagles, ensure it sums them up per user ID, then maps them to the allEntries array so Stuart's name and total appear
    const allEntries: any[] = [];
    roundsByUser.forEach((userRounds, userId) => {
      // Remove the User Filter: Process all users' rounds, not just current user
      // Group and Sum: Sum birdies/eagles for this user across all their rounds
      const totalBirdies = userRounds.reduce((sum, round) => sum + (round.birdies || 0), 0);
      const totalEagles = userRounds.reduce((sum, round) => sum + (round.eagles || 0), 0);
      
      console.log(`Birdies/Eagles: User ${userId} - ${userRounds.length} rounds, ${totalBirdies} birdies, ${totalEagles} eagles`);
      
      // Map the IDs: Use the profiles data from StatsContext to map every user_id in the leaderboard to a full_name
      // Fallback Logic: If a profile isn't found for an ID, show 'Academy Member' instead of the long code
      const profile = userProfiles?.get(userId);
      const displayName = profile?.full_name || 'Academy Member';
      
      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = 'U';
      if (profile?.full_name) {
        nameForAvatar = profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else if (displayName && displayName.length > 8) {
        nameForAvatar = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || 'U';
      }
      
      const userIcon = profile?.profile_icon || nameForAvatar;
      const value = metric === 'birdies' ? totalBirdies : totalEagles;
      
      // Group and Sum: Map to allEntries array so Stuart's name and total appear
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: value,
        isCurrentUser: user?.id === userId,
        birdieCount: totalBirdies,
        eagleCount: totalEagles
      });
    });
    
    // Fix Ranking: Make sure the sorting for these tabs is set to Descending (highest birdies first) so the leaders show up at the top
    // Fix Birdie/Eagle Counting: Sort from highest to lowest
    allEntries.sort((a, b) => b.value - a.value);
    
    console.log('Birdies/Eagles: Sorted entries:', allEntries.map(e => ({ name: e.name, value: e.value, id: e.id })));
    
    // If no entries exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0
      };
    }
    
    // Calculate rank changes and add ranks
    const withRanks = allEntries.map((entry, index) => {
      const currentRank = index + 1;
      return {
        ...entry,
        rank: currentRank,
        rankChange: 0,
        movedUp: false,
        movedDown: false,
        previousRank: undefined,
        lowRound: undefined,
        lowNett: undefined
      };
    });
    
    const userEntryInRanks = withRanks.find(entry => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || 0;
    
    const result = {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks ? withRanks.findIndex(entry => entry.isCurrentUser) + 1 : 0,
      userValue: finalUserValue
    };
    
    console.log('Leaderboard Result (birdies/eagles metric - global):', result);
    console.log('Birdies/Eagles: Top 3:', result.top3?.map((e: any) => ({ name: e.name, value: e.value, id: e.id })));
    console.log('Birdies/Eagles: All entries count:', result.all?.length);
    return result;
  }
  
  // Fix 'Low Gross' and 'Low Nett': Find the single lowest score among all users' rounds, not just mine
  if (metric === 'lowGross' || metric === 'lowNett') {
    // Locate getLeaderboardData: Find the logic that calculates stats like Low Gross
    // Remove the User Filter: Ensure the code iterates through all rounds in the rounds array (the global set) instead of filtering for round.user_id === user.id
    
    console.log('Low Gross/Nett: Processing', eighteenHoleRounds.length, '18-hole rounds for all users');
    console.log('Low Gross/Nett: All user_ids in eighteenHoleRounds:', Array.from(new Set(eighteenHoleRounds.map((r: any) => r.user_id).filter(Boolean))));
    
    // For lowGross and lowNett, check if they are null (these should return empty if null)
    if ((metric === 'lowGross' && lowGross === null) || 
        (metric === 'lowNett' && lowNett === null)) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0
      };
    }
    
    // Remove the User Filter: Process ALL 18-hole rounds, not just current user's rounds
    // Group 18-hole rounds by user_id to find each user's lowest score
    const roundsByUser = new Map<string, any[]>();
    eighteenHoleRounds.forEach(round => {
      // Remove the User Filter: Don't filter by user.id - process all rounds
      if (!round.user_id) return; // Skip rounds without user_id
      if (!roundsByUser.has(round.user_id)) {
        roundsByUser.set(round.user_id, []);
      }
      roundsByUser.get(round.user_id)!.push(round);
    });
    
    console.log('Low Gross/Nett: Grouped into', roundsByUser.size, 'users:', Array.from(roundsByUser.keys()));
    
    // Group and Sum: Create leaderboard entries for all users
    const allEntries: any[] = [];
    roundsByUser.forEach((userRounds, userId) => {
      // Remove the User Filter: Process all users' rounds, not just current user
      // Fix 'Low Gross': Find the single lowest score among all this user's rounds
      const validScores = userRounds
        .map(r => r.score)
        .filter(score => score !== null && score !== undefined && score > 0);
      const userLowGross = validScores.length > 0 ? Math.min(...validScores) : null;
      
      // Fix 'Low Nett': Find the single lowest nett score among all this user's rounds
      const validNettRounds = userRounds.filter(round => 
        round.score !== null && 
        round.score !== undefined && 
        round.score > 0 && 
        round.handicap !== null && 
        round.handicap !== undefined
      );
      const nettScores = validNettRounds.map(round => round.score! - round.handicap!);
      const userLowNett = nettScores.length > 0 ? Math.min(...nettScores) : null;
      
      console.log(`Low Gross/Nett: User ${userId} - ${userRounds.length} rounds, lowGross: ${userLowGross}, lowNett: ${userLowNett}`);
      
      // Skip users with no valid scores
      if (metric === 'lowGross' && userLowGross === null) return;
      if (metric === 'lowNett' && userLowNett === null) return;
      
      // Map the IDs: Use the profiles data from StatsContext to map every user_id in the leaderboard to a full_name
      // Fallback Logic: If a profile isn't found for an ID, show 'Academy Member' instead of the long code
      const profile = userProfiles?.get(userId);
      const displayName = profile?.full_name || 'Academy Member';
      
      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = 'U';
      if (profile?.full_name) {
        nameForAvatar = profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else if (displayName && displayName.length > 8) {
        nameForAvatar = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || 'U';
      }
      
      const userIcon = profile?.profile_icon || nameForAvatar;
      const value = metric === 'lowGross' ? userLowGross! : userLowNett!;
      
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: value,
        isCurrentUser: user?.id === userId,
        lowRound: userLowGross,
        lowNett: userLowNett
      });
    });
    
    // Fix Ranking: Sort ascending (lower score is better) for Low Gross/Nett
    // Fix 'Low Gross': Sort ascending (lower score is better)
    allEntries.sort((a, b) => a.value - b.value);
    
    console.log('Low Gross/Nett: Sorted entries:', allEntries.map(e => ({ name: e.name, value: e.value, id: e.id })));
    
    // If no entries exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0
      };
    }
    
    // Calculate rank changes and add ranks
    const withRanks = allEntries.map((entry, index) => {
      const currentRank = index + 1;
      return {
        ...entry,
        rank: currentRank,
        rankChange: 0,
        movedUp: false,
        movedDown: false,
        previousRank: undefined,
        birdieCount: 0,
        eagleCount: 0
      };
    });
    
    const userEntryInRanks = withRanks.find(entry => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || 0;
    
    const result = {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks ? withRanks.findIndex(entry => entry.isCurrentUser) + 1 : 0,
      userValue: finalUserValue
    };
    
    console.log('Leaderboard Result (lowGross/lowNett metric - global):', result);
    console.log('Low Gross/Nett: Top 3:', result.top3?.map((e: any) => ({ name: e.name, value: e.value, id: e.id })));
    console.log('Low Gross/Nett: All entries count:', result.all?.length);
    return result;
  }
  
  // For rounds metric, group all rounds by user_id and create leaderboard entries for each user
  if (metric === 'rounds') {
    // Filter by timeframe first (no user_id filter - get all users' rounds)
    const timeFilteredRounds = filteredRounds.filter(round => {
      if (timeFilter === 'allTime') return true;
      const { startDate } = getTimeframeDates(timeFilter);
      const roundDate = new Date(round.date || round.created_at);
      return roundDate >= startDate;
    });
    
    // Group rounds by user_id to count rounds per user
    const roundsByUser = new Map<string, any[]>();
    timeFilteredRounds.forEach(round => {
      if (!round.user_id) return; // Skip rounds without user_id
      if (!roundsByUser.has(round.user_id)) {
        roundsByUser.set(round.user_id, []);
      }
      roundsByUser.get(round.user_id)!.push(round);
    });
    
    // Create leaderboard entries for all users
    // Create a Name Lookup: Use userProfiles map to get full_name for each user_id
    // Map IDs to Names: Match user IDs to their full_name from profiles table
    const allEntries: any[] = [];
    roundsByUser.forEach((userRounds, userId) => {
      const roundCount = userRounds.length;
      
      // Map the IDs: Use the profiles data from StatsContext to map every user_id in the leaderboard to a full_name
      // Fallback Logic: If a profile isn't found for an ID, show 'Academy Member' instead of the long code
      const profile = userProfiles?.get(userId);
      const displayName = profile?.full_name || 'Academy Member';
      
      // Fix Avatars: Update the avatar circles to show the first letter of their names (e.g., 'B') instead of the first letter of the ID
      let nameForAvatar = 'U';
      if (profile?.full_name) {
        // Use first letter of each word in full_name
        nameForAvatar = profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else if (displayName && displayName.length > 8) {
        // If displayName is a real name (not an ID), use first letters
        nameForAvatar = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else {
        // Fallback: use first letter of displayName
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || 'U';
      }
      
      const userIcon = profile?.profile_icon || nameForAvatar;
      
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: roundCount, // Verify Count: Use rounds.length from database results, not hardcoded 4000
        isCurrentUser: user?.id === userId
      });
    });
    
    // Sort by round count descending (most rounds first)
    allEntries.sort((a, b) => b.value - a.value);
    
    // If no rounds exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0
      };
    }
    
    // Find current user's entry and value
    const currentUserEntry = allEntries.find(entry => entry.isCurrentUser);
    userValue = currentUserEntry?.value || 0;
    
    // Calculate rank changes and add ranks
    const withRanks = allEntries.map((entry, index) => {
      const currentRank = index + 1;
      return {
        ...entry,
        rank: currentRank,
        rankChange: 0, // No previous rank data available
        movedUp: false,
        movedDown: false,
        previousRank: undefined,
        lowRound: undefined,
        lowNett: undefined,
        birdieCount: 0,
        eagleCount: 0
      };
    });
    
    const userEntryInRanks = withRanks.find(entry => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || userValue;
    
    const result = {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks ? withRanks.findIndex(entry => entry.isCurrentUser) + 1 : 0,
      userValue: finalUserValue
    };
    
    // Find the top3 calculation: Locate where the leaderboard data is sliced to get the top 3 users
    // Remove Mock Fallbacks: Search for any code that manually creates a user object with '4000' as the value and delete it
    // Sync to Database: Ensure the Top3Leaders component is strictly using the values from the allEntries array we just built, which uses roundsByUser.get(userId).length
    // Update Sub-label: Ensure the text below the name says {entry.value} Rounds instead of a static number
    console.log('Leaderboard Result (rounds metric - global):', result);
    console.log('Leaderboard Result - top3 count:', result.top3?.length || 0);
    console.log('Leaderboard Result - all count:', result.all?.length || 0);
    console.log('Leaderboard Result - total rounds in database:', rounds?.length || 0); // Verify Count: Change display variable from hardcoded 4000 to rounds.length
    console.log('Leaderboard Result - top3 values:', result.top3?.map((e: any) => ({ name: e.name, value: e.value, id: e.id })));
    
    // Remove Mock Fallbacks: Verify no entry has value 4000
    const has4000 = result.top3?.some((e: any) => e.value === 4000) || result.all?.some((e: any) => e.value === 4000);
    if (has4000) {
      console.error('⚠️ Found entry with value 4000! This should be replaced with actual roundCount from roundsByUser.get(userId).length');
    }
    
    return result;
  }
  
  // For practice metric, group all practice sessions by user_id and create leaderboard entries for each user
  if (metric === 'practice') {
    // Remove Filter: Process ALL practice sessions from all users, not just current user
    // Verify Practice Table: Ensure it is pointing to the new practice table name we just created
    // Check Names: Ensure the Practice leaderboard uses the same profile name-mapping logic we used for the Rounds
    const allPracticeSessions = practiceSessions || [];
    
    console.log('Practice: Processing', allPracticeSessions.length, 'practice sessions for all users');
    console.log('Practice: All user_ids in practice sessions:', Array.from(new Set(allPracticeSessions.map((s: any) => s.user_id).filter(Boolean))));
    
    // Filter by timeframe if needed
    const { startDate } = getTimeframeDates(timeFilter);
    const filteredSessions = allPracticeSessions.filter((session: any) => {
      if (timeFilter === 'allTime') return true;
      const sessionDate = new Date(session.practice_date || session.created_at || Date.now());
      return sessionDate >= startDate;
    });
    
    // Group practice sessions by user_id to sum hours per user
    const sessionsByUser = new Map<string, any[]>();
    filteredSessions.forEach((session: any) => {
      if (!session.user_id) return; // Skip sessions without user_id
      if (!sessionsByUser.has(session.user_id)) {
        sessionsByUser.set(session.user_id, []);
      }
      sessionsByUser.get(session.user_id)!.push(session);
    });
    
    console.log('Practice: Grouped into', sessionsByUser.size, 'users:', Array.from(sessionsByUser.keys()));
    
    // Create leaderboard entries for all users
    const allEntries: any[] = [];
    sessionsByUser.forEach((userSessions, userId) => {
      // Sum total practice hours for this user
      const totalMinutes = userSessions.reduce((sum, session) => {
        return sum + (session.duration_minutes || 0);
      }, 0);
      const totalHours = totalMinutes / 60;
      
      // Map the IDs: Use the profiles data from StatsContext to map every user_id in the leaderboard to a full_name
      // Fallback Logic: If a profile isn't found for an ID, show 'Academy Member' instead of the long code
      // Check Names: Ensure the Practice leaderboard uses the same profile name-mapping logic we used for the Rounds
      const profile = userProfiles?.get(userId);
      const displayName = profile?.full_name || 'Academy Member';
      
      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = 'U';
      if (profile?.full_name) {
        nameForAvatar = profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else if (displayName && displayName.length > 8) {
        nameForAvatar = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'U';
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || 'U';
      }
      
      const userIcon = profile?.profile_icon || nameForAvatar;
      
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: totalHours,
        isCurrentUser: user?.id === userId
      });
    });
    
    // Sort by practice hours descending (most hours first)
    allEntries.sort((a, b) => b.value - a.value);
    
    // If no practice sessions exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0
      };
    }
    
    // Find current user's entry and value
    const currentUserEntry = allEntries.find(entry => entry.isCurrentUser);
    userValue = currentUserEntry?.value || 0;
    
    // Calculate rank changes and add ranks
    const withRanks = allEntries.map((entry, index) => {
      const currentRank = index + 1;
      return {
        ...entry,
        rank: currentRank,
        rankChange: 0,
        movedUp: false,
        movedDown: false,
        previousRank: undefined,
        lowRound: undefined,
        lowNett: undefined,
        birdieCount: 0,
        eagleCount: 0
      };
    });
    
    const userEntryInRanks = withRanks.find(entry => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || userValue;
    
    const result = {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks ? withRanks.findIndex(entry => entry.isCurrentUser) + 1 : 0,
      userValue: finalUserValue
    };
    
    console.log('Leaderboard Result (practice metric - global):', result);
    console.log('Practice: Top 3:', result.top3?.map((e: any) => ({ name: e.name, value: e.value, id: e.id })));
    console.log('Practice: All entries count:', result.all?.length);
    return result;
  }
  
  // Update XP Leaderboard: Use XP from profiles instead of localStorage
  // For XP metric, create leaderboard entries from all user profiles
  if (metric === 'xp') {
    // Update XP Leaderboard: Use XP from profiles instead of localStorage
    const allEntries: any[] = [];
    
    // Get all user IDs from rounds, drills, and practice sessions to ensure we have all users
    const roundUserIds = (rounds || []).map((r: any) => r.user_id).filter(Boolean);
    const drillUserIds = (drills || []).map((d: any) => d.user_id).filter(Boolean);
    const practiceUserIds = (practiceSessions || []).map((p: any) => p.user_id).filter(Boolean);
    const allUserIds = Array.from(new Set([...roundUserIds, ...drillUserIds, ...practiceUserIds]));
    
    // Create entries from userProfiles map (which includes XP)
    if (userProfiles) {
      userProfiles.forEach((profile, userId) => {
        const xpValue = profile.xp || 0;
        const displayName = profile.full_name || 'Academy Member';
        
        // Fix Avatars: Update the avatar circles to show the first letter of their names
        let nameForAvatar = 'A';
        if (profile.full_name) {
          nameForAvatar = profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'A';
        }
        
        const userIcon = profile.profile_icon || nameForAvatar;
        
        allEntries.push({
          id: userId,
          name: displayName,
          avatar: userIcon,
          value: xpValue,
          isCurrentUser: user?.id === userId
        });
      });
    }
    
    // Sort by XP descending (highest XP first)
    allEntries.sort((a, b) => b.value - a.value);
    
    // Find current user's entry
    const userEntryInSorted = allEntries.find(entry => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value || userValue;
    
    return {
      top3: allEntries.slice(0, 3),
      all: allEntries,
      userRank: userEntryInSorted ? allEntries.findIndex(entry => entry.isCurrentUser) + 1 : 0,
      userValue: finalUserValue
    };
  }
  
  // For other metrics (library, drills), keep existing logic but remove user filter
  // Remove User Filtering: For every metric, ensure the code is processing the allEntries or the global rounds array instead of filtering for just the currentUser
  // Only include user in leaderboard if they have actual data (no mock/dummy entries)
  const userEntry = {
    id: 'user',
    name: userName, // Use actual full_name instead of 'You'
    avatar: user?.profileIcon || userName.split(' ').map(n => n[0]).join('') || 'Y', // Use profile_icon if available, else initials
    value: userValue, // Use dynamic userValue, not hardcoded
    previousRank: undefined,
    lowRound: undefined,
    lowNett: undefined,
    birdieCount: 0,
    eagleCount: 0
  };
  
  // Sort by value - descending for most metrics (higher is better)
  const sorted = [userEntry].sort((a, b) => {
    // For all metrics here (library, drills), higher is better, so sort descending
    return b.value - a.value;
  });
  
  // Calculate rank changes
  const withRanks = sorted.map((entry, index) => {
    const currentRank = index + 1;
    const rankChange = entry.previousRank ? entry.previousRank - currentRank : 0;
    return {
      ...entry,
      rank: currentRank,
      rankChange,
      movedUp: rankChange > 0,
      movedDown: rankChange < 0
    };
  });
  
  // Connect to Real Data: Replace any hardcoded values with userRounds.length or the score property from the actual leaderboardData array
  // Unify Labels: Ensure the top card and Rank section both use the same value from the entry in the leaderboard array
  const userEntryInRanks = withRanks.find(entry => entry.id === 'user');
  const finalUserValue = userEntryInRanks?.value || userValue;
  
  const result = {
    top3: withRanks.slice(0, 3),
    all: withRanks,
    userRank: withRanks.length > 0 ? withRanks.findIndex(entry => entry.id === 'user') + 1 : 0,
    // Use the actual value from the user entry in the leaderboard array, not a separate userValue
    userValue: finalUserValue
  };
  
  // Debug Check: Look at the Leaderboard Result: log. If it's an empty array [], the issue is definitely the SQL Policy above.
  // Debug Logs: Keep console.log('Leaderboard Result:', data) so I can see if Stuart's round is in the raw data but just not rendering
  console.log('Leaderboard Result:', result);
  console.log('Leaderboard Result - top3 count:', result.top3?.length || 0);
  console.log('Leaderboard Result - all count:', result.all?.length || 0);
  // Debug Check: If result is empty array, it's the SQL Policy
  if (!result || result.all?.length === 0) {
    console.warn('⚠️ Leaderboard Result is EMPTY ARRAY [] - This indicates SQL Policy issue!');
    console.warn('⚠️ Check RLS policies on rounds table - they may be blocking access to all rounds');
  }
  
  return result;
}

// Calculate total XP filtered by timeframe
function calculateTotalXPByTimeframe(rounds: any[], userProgress: { totalXP: number; completedDrills: string[] }, timeFilter: 'week' | 'month' | 'year' | 'allTime') {
  const { startDate } = getTimeframeDates(timeFilter);
  
  // Filter rounds by timeframe
  const filteredRounds = rounds.filter(round => {
    if (timeFilter === 'allTime') return true;
    const roundDate = new Date(round.date);
    return roundDate >= startDate;
  });
  
  const roundsXP = filteredRounds.length * XP_PER_ROUND;
  
  // Filter drill XP by timeframe using practice activity history
  let drillsXP = 0;
  if (typeof window !== 'undefined') {
    try {
      const practiceHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
      const filteredHistory = practiceHistory.filter((entry: any) => {
        if (timeFilter === 'allTime') return true;
        const entryDate = new Date(entry.timestamp || entry.date);
        return entryDate >= startDate;
      });
      
      // Sum XP from filtered practice history
      drillsXP = filteredHistory.reduce((sum: number, entry: any) => {
        return sum + (entry.xp || 0);
      }, 0);
    } catch (error) {
      // Fallback: use totalXP if filtering fails
      drillsXP = timeFilter === 'allTime' ? userProgress.totalXP : 0;
    }
  }
  
  return roundsXP + drillsXP;
}

export default function AcademyPage() {
  console.log('Academy: Component rendering...');
  
  // ALL HOOKS MUST BE AT THE TOP - NO EXCEPTIONS (Rules of Hooks)
  // Check Fetch Logic: Ensure the loadStats function is fetching data from the drills and practice_sessions tables as well as rounds
  const { rounds, drills, practiceSessions } = useStats();
  const { user, refreshUser, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  
  // Create a Name Lookup: Store profile data for all users in the leaderboard
  // Map IDs to Names: Match user IDs to their full_name from profiles table
  // Update fetchUserProfiles to include XP column from profiles table
  const [userProfiles, setUserProfiles] = useState<Map<string, { full_name?: string; profile_icon?: string; xp?: number }>>(new Map());
  
  // Add Fetch Guard: Create refs to ensure effects run exactly once
  const hasFetchedProgress = useRef(false);
  const hasFetched = useRef(false);
  
  const [userProgress, setUserProgress] = useState<{ totalXP: number; completedDrills: string[] }>({
    totalXP: 0,
    completedDrills: []
  });
  const [timeFilter, setTimeFilter] = useState<'week' | 'month' | 'year' | 'allTime'>('allTime');
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [selectedTrophy, setSelectedTrophy] = useState<TrophyData | null>(null);
  const [leaderboardMetric, setLeaderboardMetric] = useState<'xp' | 'library' | 'practice' | 'rounds' | 'drills' | 'lowGross' | 'lowNett' | 'birdies' | 'eagles'>('xp');
  
  // Fix the 'Hooks called in change of order' error
  // Move Hooks Up: Move all useMemo, useCallback, useState, and useEffect calls to the very top of the AcademyPage function, immediately after useContext and useRef calls
  // No Early Returns: Ensure there are no if (loading) return ... or if (!user) return ... statements appearing before any Hook
  
  // Kill the Wait: Ensure loading is forced to false in a finally block pattern
  // Circuit Breaker: Add timeout to prevent infinite loading
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  // Stabilize Fetching: Add circuit breaker to prevent recalculating leaderboard on every render
  const [cachedLeaderboard, setCachedLeaderboard] = useState<any>(null);
  const [cachedFourPillar, setCachedFourPillar] = useState<any>(null);
  
  // Stable Identity: Wrap functions and objects in useMemo/useCallback to prevent recreation on every render
  // Calculate total XP (rounds + drills) - filtered by timeframe
  // Safe Logic: If the calculation inside useMemo needs the user, do the check inside the useMemo (e.g., return user ? calculate(...) : 0) rather than skipping the Hook entirely
  const totalXP = useMemo(() => {
    if (!rounds || !userProgress) return 0;
    return calculateTotalXPByTimeframe(rounds, userProgress, timeFilter);
  }, [rounds, userProgress, timeFilter]);

  // Get current handicap (latest round or default) - wrap in useMemo
  const currentHandicap = useMemo(() => {
    if (!rounds || rounds.length === 0) return STARTING_HANDICAP;
    const lastRound = rounds[rounds.length - 1];
    return lastRound.handicap !== null && lastRound.handicap !== undefined 
      ? lastRound.handicap 
      : STARTING_HANDICAP;
  }, [rounds]);

  // Calculate scholarship progress (handicap improvement toward goal) - wrap in useMemo
  const scholarshipProgress = useMemo(() => {
    const handicapRange = STARTING_HANDICAP - GOAL_HANDICAP; // 12.0 - 8.7 = 3.3
    const handicapImprovement = STARTING_HANDICAP - currentHandicap; // How much improved
    return Math.min(100, Math.max(0, (handicapImprovement / handicapRange) * 100));
  }, [currentHandicap]);

  // Determine tier based on XP and handicap - wrap in useMemo
  const userTier = useMemo((): 'Bronze' | 'Silver' | 'Gold' | 'Platinum' => {
    // Platinum requires hitting the goal handicap
    if (currentHandicap <= GOAL_HANDICAP) {
      return 'Platinum';
    }
    
    // Check by handicap first, then XP
    if (currentHandicap <= TIER_THRESHOLDS.Gold.handicap || totalXP >= TIER_THRESHOLDS.Gold.xp) {
      return 'Gold';
    }
    if (currentHandicap <= TIER_THRESHOLDS.Silver.handicap || totalXP >= TIER_THRESHOLDS.Silver.xp) {
      return 'Silver';
    }
    return 'Bronze';
  }, [currentHandicap, totalXP]);

  const userLevel = useMemo(() => getLevel(userTier), [userTier]);

  // Get user name - wrap in useMemo to prevent recreation
  // Safe Logic: Do the check inside the useMemo rather than skipping the Hook entirely
  const userName = useMemo(() => {
    if (user?.fullName) {
      console.log('Academy: Displaying full_name from profile:', user.fullName);
      console.log('Academy: User ID:', user.id);
      return user.fullName;
    }
    if (user?.email) {
      console.log('Academy: No full_name found, using email fallback:', user.email);
      return user.email;
    }
    console.log('Academy: No full_name or email found');
    return '';
  }, [user?.fullName, user?.email]);
  
  // Automatic redirect if not authenticated (only after loading is complete)
  // Stable Dependencies: Ensure the useEffect dependency array is either empty [] or only contains [user?.id]
  useEffect(() => {
    try {
      if (!loading && !isAuthenticated && user === null) {
        console.log('Academy: No authentication detected, redirecting to login...');
        router.push('/login');
      }
    } catch (error) {
      console.error('Academy: Error in auth redirect:', error);
    } finally {
      // Force Loading Off: Ensure setLoading(false) is called inside a finally block to prevent the page from hanging if a fetch fails
      // Note: loading state is managed by AuthContext
    }
  }, [user?.id, loading, isAuthenticated, router]); // Stable Dependencies: Only contains [user?.id]
  
  // Identify the Loop: Locate the useEffect that fetches leaderboard data or user stats
  // Add Fetch Guard: Create a ref called hasFetched = useRef(false). Wrap the fetch logic in if (hasFetched.current) return; and set hasFetched.current = true;
  // Load user progress and set up event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Add Fetch Guard: Wrap the fetch logic in if (hasFetchedProgress.current) return;
    if (hasFetchedProgress.current) return;
    
    try {
      const loadProgress = () => {
        const savedProgress = localStorage.getItem('userProgress');
        // Circuit Breaker: Only set if data exists and it's different from current state
        // Check for State Syncing: Don't call setUserProgress if it would cause a loop
        if (savedProgress) {
          try {
            const progress = JSON.parse(savedProgress);
            // Only update if the data actually changed to prevent infinite loops
            setUserProgress(prev => {
              if (JSON.stringify(prev) === JSON.stringify(progress)) {
                return prev; // Return same reference if unchanged
              }
              return progress;
            });
          } catch (error) {
            console.error('Academy: Error parsing user progress:', error);
          }
        }
      };

      loadProgress();
      
      // Add Fetch Guard: Set hasFetchedProgress.current = true; inside the useEffect
      hasFetchedProgress.current = true;

      // Listen for rounds updates to refresh leaderboard
      const handleRoundsUpdate = () => {
        // The rounds from useStats() will automatically update via StatsContext
        // No need to force state update - just log
        console.log('Academy: Received roundsUpdated event, leaderboard will refresh');
      };

      // Listen for Academy-specific leaderboard refresh
      const handleLeaderboardRefresh = () => {
        console.log('Academy: Received academyLeaderboardRefresh event');
        // Don't trigger state update - let the natural re-render from StatsContext handle it
      };

      window.addEventListener('roundsUpdated', handleRoundsUpdate);
      window.addEventListener('academyLeaderboardRefresh', handleLeaderboardRefresh);
      window.addEventListener('userProgressUpdated', loadProgress);
      window.addEventListener('storage', loadProgress);

      return () => {
        window.removeEventListener('roundsUpdated', handleRoundsUpdate);
        window.removeEventListener('academyLeaderboardRefresh', handleLeaderboardRefresh);
        window.removeEventListener('userProgressUpdated', loadProgress);
        window.removeEventListener('storage', loadProgress);
      };
    } catch (error) {
      console.error('Academy: Error loading progress:', error);
    } finally {
      // Force Loading Off: Ensure setLoading(false) is called inside a finally block to prevent the page from hanging if a fetch fails
      // Note: loading state is managed by AuthContext
    }
  }, []); // Stable Dependencies: Empty array - run once on mount
  
  // Kill the Wait: Ensure loading is forced to false in a finally block pattern
  // Circuit Breaker: Add timeout to prevent infinite loading
  useEffect(() => {
    // Force loading to false after 10 seconds to prevent infinite spinner
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('Academy: Loading timeout - forcing render');
        setLoadingTimeout(true);
      }
    }, 10000);
    return () => clearTimeout(timeout);
  }, [loading]);
  
  // Create a Name Lookup: Fetch profiles for all unique user IDs in rounds, drills, and practice sessions
  // The Practice sync is working perfectly! Now apply the same logic to Drills
  // Name Mapping: Match the user_id in the drill data to the full_name in the profiles table so we see 'Stuart' instead of a code
  // Auto-Map Names: Ensure that for every row fetched, the app looks at the profiles table to find the matching full_name
  useEffect(() => {
    const fetchProfiles = async () => {
      // Get all unique user IDs from rounds, drills, and practice sessions
      const roundUserIds = (rounds || []).map((r: any) => r.user_id).filter(Boolean);
      const drillUserIds = (drills || []).map((d: any) => d.user_id).filter(Boolean);
      const practiceUserIds = (practiceSessions || []).map((p: any) => p.user_id).filter(Boolean);
      
      // Combine all user IDs and get unique set
      const allUserIds = [...roundUserIds, ...drillUserIds, ...practiceUserIds];
      const uniqueUserIds = Array.from(new Set(allUserIds));
      
      if (uniqueUserIds.length === 0) {
        console.log('Academy: No user IDs found in rounds, drills, or practice sessions');
        return;
      }
      
      // Check the Mapping: Log drill user_ids to verify mapping
      if (drillUserIds.length > 0) {
        console.log('Academy: Drill user_ids found for profile mapping:', drillUserIds);
        console.log('Academy: Sample drill data for mapping:', (drills || []).slice(0, 3).map((d: any) => ({ 
          user_id: d.user_id, 
          drill_name: d.drill_name || d.drill_title 
        })));
      }
      
      // Verify Name Fetching: Log all user IDs found in data
      console.log('Academy: User IDs found in data:');
      console.log('  - Rounds:', roundUserIds);
      console.log('  - Drills:', drillUserIds);
      console.log('  - Practice:', practiceUserIds);
      console.log('  - Unique total:', uniqueUserIds);
      
      console.log('Academy: Fetching profiles for', uniqueUserIds.length, 'unique user IDs:', uniqueUserIds);
      console.log('Academy: Breakdown - Rounds:', roundUserIds.length, 'Drills:', drillUserIds.length, 'Practice:', practiceUserIds.length);
      
      // Auto-Map Names: For every row fetched, look at the profiles table to find the matching full_name
      // Check the Mapping: Ensure it is correctly mapping the user_id to the full_name from my profile
      // Name Mapping: Match user_id from drill_scores table to id in profiles table
      // Verify Name Fetching: Ensure loadProfiles is fetching every single row from the profiles table
      const profiles = await fetchUserProfiles(uniqueUserIds);
      setUserProfiles(profiles);
      
      // Debug Log: Add console.log('Available Profiles:', profiles) to the load function
      console.log('Academy: Available Profiles Map:', Array.from(profiles.entries()).map(([id, data]) => ({ 
        id, 
        full_name: data.full_name || 'NO NAME', 
        profile_icon: data.profile_icon,
        xp: data.xp 
      })));
      
      // Check the Mapping: Log the mapping results for drills specifically
      const drillProfileMappings = drillUserIds.map((userId) => ({
        user_id: userId,
        full_name: profiles.get(userId)?.full_name || 'NOT FOUND',
        profile_icon: profiles.get(userId)?.profile_icon || 'NOT FOUND'
      }));
      if (drillProfileMappings.length > 0) {
        console.log('Academy: Drill user_id to full_name mappings:', drillProfileMappings);
      }
      
      // Map IDs to Names: Double-check that the practice, rounds, and drills leaderboards are correctly looking up the full_name
      const roundProfileMappings = roundUserIds.map((userId) => ({
        user_id: userId,
        full_name: profiles.get(userId)?.full_name || 'NOT FOUND'
      }));
      if (roundProfileMappings.length > 0) {
        console.log('Academy: Round user_id to full_name mappings:', roundProfileMappings);
      }
      
      const practiceProfileMappings = practiceUserIds.map((userId) => ({
        user_id: userId,
        full_name: profiles.get(userId)?.full_name || 'NOT FOUND'
      }));
      if (practiceProfileMappings.length > 0) {
        console.log('Academy: Practice user_id to full_name mappings:', practiceProfileMappings);
      }
      
      console.log('Academy: Loaded profiles:', Array.from(profiles.entries()).map(([id, data]) => ({ id, name: data.full_name || 'NO NAME' })));
    };
    
    fetchProfiles();
  }, [rounds?.length, drills?.length, practiceSessions?.length]); // Re-fetch profiles when rounds, drills, or practice sessions change
  
  // Global Refresh: Ensure the XP Leaderboard refreshes immediately after the points are added
  // Add event listener for xpUpdated event to refresh profiles
  useEffect(() => {
    const handleXPUpdate = () => {
      console.log('Academy: Received xpUpdated event, refreshing profiles...');
      // Re-fetch profiles to get updated XP values
      const fetchProfiles = async () => {
        const roundUserIds = (rounds || []).map((r: any) => r.user_id).filter(Boolean);
        const drillUserIds = (drills || []).map((d: any) => d.user_id).filter(Boolean);
        const practiceUserIds = (practiceSessions || []).map((p: any) => p.user_id).filter(Boolean);
        const allUserIds = [...roundUserIds, ...drillUserIds, ...practiceUserIds];
        const uniqueUserIds = Array.from(new Set(allUserIds));
        
        if (uniqueUserIds.length > 0) {
          const profiles = await fetchUserProfiles(uniqueUserIds);
          setUserProfiles(profiles);
          console.log('Academy: Profiles refreshed after XP update');
        }
      };
      fetchProfiles();
    };
    
    window.addEventListener('xpUpdated', handleXPUpdate);
    return () => {
      window.removeEventListener('xpUpdated', handleXPUpdate);
    };
  }, [rounds?.length, drills?.length, practiceSessions?.length]);
  
  // Fix the React Error #310 infinite loop on the Academy page
  // Consolidate Calculations: All leaderboard calculations in single useEffect
  // Find the top3 calculation: Ensure it recalculates when rounds change
  // Sync to Database: Recalculate leaderboard when rounds or leaderboardMetric or timeFilter change
  useEffect(() => {
    // Debug Logging: Add console.log('Academy: Current rounds count:', rounds.length) right before the leaderboard render to see if the data is actually reaching the page
    console.log('Academy: useEffect - Current rounds count:', rounds?.length || 0);
    console.log('Academy: useEffect - Rounds from StatsContext:', rounds);
    console.log('Academy: useEffect - User ID:', user?.id);
    console.log('Academy: useEffect - User name:', userName);
    console.log('Academy: useEffect - Leaderboard metric:', leaderboardMetric);
    console.log('Academy: useEffect - Time filter:', timeFilter);
    console.log('Academy: useEffect - User profiles loaded:', userProfiles.size);
    
    // Add Fetch Guard: Only calculate if we have the necessary data
    // Safe Logic: Do the check inside the useEffect rather than skipping the Hook entirely
    // Verify the Variable: Make sure leaderboardData is being calculated using the rounds from StatsContext and that it isn't being filtered out by a mismatching user_id
    if (!user?.id) {
      console.warn('Academy: useEffect - No user.id, skipping leaderboard calculation');
      return;
    }
    if (rounds === undefined) {
      console.warn('Academy: useEffect - Rounds is undefined, skipping leaderboard calculation');
      return;
    }
    if (!rounds || rounds.length === 0) {
      console.warn('Academy: useEffect - Rounds array is empty, but continuing with calculation');
    }
    
    try {
      // Consolidate Calculations: Calculate all leaderboards in one place
      // Find the top3 calculation: Locate where the leaderboard data is sliced to get the top 3 users
      // Sync to Database: Ensure the Top3Leaders component is strictly using the values from the allEntries array we just built
      console.log('Academy: useEffect - Calculating leaderboards with:', {
        leaderboardMetric,
        timeFilter,
        roundsCount: rounds?.length || 0,
        totalXP,
        userName,
        userId: user?.id,
        profilesLoaded: userProfiles.size
      });
      // Check Fetch Logic: Pass drills and practiceSessions to leaderboard functions
      // Remove Filter: Pass practiceSessions to getLeaderboardData so it can process all users' practice data
      const newLeaderboard = getLeaderboardData(leaderboardMetric, timeFilter, rounds, totalXP, userName, user, userProfiles, practiceSessions, drills);
      const libraryLeaderboard = getMockLeaderboard('library', timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions);
      const practiceLeaderboard = getMockLeaderboard('practice', timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions);
      const roundsLeaderboard = getMockLeaderboard('rounds', timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions);
      const drillsLeaderboard = getMockLeaderboard('drills', timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions);
      
      console.log('Academy: useEffect - Calculated leaderboards:', {
        main: newLeaderboard,
        library: libraryLeaderboard,
        practice: practiceLeaderboard,
        rounds: roundsLeaderboard,
        drills: drillsLeaderboard
      });
      
      // Remove Mock Fallbacks: Verify no entry has value 4000
      const mainHas4000 = newLeaderboard.top3?.some((e: any) => e.value === 4000) || newLeaderboard.all?.some((e: any) => e.value === 4000);
      if (mainHas4000) {
        console.error('⚠️ Main leaderboard has entry with value 4000!');
      }
      
      // Only update if the data actually changed (prevent infinite loop)
      setCachedLeaderboard(newLeaderboard);
      setCachedFourPillar({
        library: libraryLeaderboard,
        practice: practiceLeaderboard,
        rounds: roundsLeaderboard,
        drills: drillsLeaderboard
      });
    } catch (error) {
      console.error('Academy: Error calculating leaderboard:', error);
    } finally {
      // Force Loading Off: Ensure setLoading(false) is called inside a finally block to prevent the page from hanging if a fetch fails
      // Note: loading state is managed by AuthContext, but we ensure any local state is cleared
    }
  }, [user?.id, rounds?.length, drills?.length, practiceSessions?.length, leaderboardMetric, timeFilter, totalXP, userName, userProfiles]); // Check Fetch Logic: Recalculate when drills or practiceSessions change
  
  // Stable Identity: Wrap calculated values in useMemo to prevent recreation
  // Safe Logic: Do the check inside the useMemo rather than skipping the Hook entirely
  const currentLeaderboard = useMemo(() => {
    return cachedLeaderboard || { top3: [], all: [], userRank: 0, userValue: 0 };
  }, [cachedLeaderboard]);
  
  const top3 = useMemo(() => currentLeaderboard.top3, [currentLeaderboard]);
  const ranks4to7 = useMemo(() => currentLeaderboard.all.slice(3, 7), [currentLeaderboard]);
  const sortedLeaderboard = useMemo(() => currentLeaderboard.all, [currentLeaderboard]);
  
  // Find the lowest round across all entries for trophy icon - wrap in useMemo
  const globalLowRound = useMemo(() => {
    if (!sortedLeaderboard || sortedLeaderboard.length === 0) return null;
    const allLowRounds: number[] = sortedLeaderboard
      .map((entry: any) => leaderboardMetric === 'lowNett' ? entry.lowNett : entry.lowRound)
      .filter((score: any): score is number => score !== null && score !== undefined && score > 0);
    return allLowRounds.length > 0 ? Math.min(...allLowRounds) : null;
  }, [sortedLeaderboard, leaderboardMetric]);

  // Get four-pillar leaderboard data - wrap in useMemo
  // Safe Logic: Do the check inside the useMemo rather than skipping the Hook entirely
  const libraryLeaderboard = useMemo(() => {
    if (cachedFourPillar?.library) return cachedFourPillar.library;
    if (!rounds || !userName) return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard('library', timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions);
  }, [cachedFourPillar?.library, timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions]);
  
  const practiceLeaderboard = useMemo(() => {
    if (cachedFourPillar?.practice) return cachedFourPillar.practice;
    if (!rounds || !userName) return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard('practice', timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions);
  }, [cachedFourPillar?.practice, timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions]);
  
  const roundsLeaderboard = useMemo(() => {
    if (cachedFourPillar?.rounds) return cachedFourPillar.rounds;
    if (!rounds || !userName) return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard('rounds', timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions);
  }, [cachedFourPillar?.rounds, timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions]);
  
  const drillsLeaderboard = useMemo(() => {
    if (cachedFourPillar?.drills) return cachedFourPillar.drills;
    if (!rounds || !userName) return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard('drills', timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions);
  }, [cachedFourPillar?.drills, timeFilter, rounds, userName, user, userProfiles, drills, practiceSessions]);
  
  // Filter leaderboard by search - wrap in useMemo for stable identity
  const filteredFullLeaderboard = useMemo(() => {
    if (!sortedLeaderboard) return [];
    if (!leaderboardSearch.trim()) return sortedLeaderboard;
    const searchLower = leaderboardSearch.toLowerCase();
    return sortedLeaderboard.filter((entry: any) => 
      entry.name.toLowerCase().includes(searchLower)
    );
  }, [sortedLeaderboard, leaderboardSearch]);
  
  // Fix the Hook Order error
  // Move All Hooks to the Top: Take every useState, useMemo, and useEffect (including the new ones on line 1323) and move them to the very top of the AcademyPage function
  // Check for Early Returns: Look for any line that says if (loading) return ... or if (!user) return .... These must be moved below all your hooks
  // Clean Up: If a useMemo or useEffect needs the user to exist, put the if (!user) return; check inside the hook's callback function, not around the hook itself
  // No Early Returns: Ensure there are no if (loading) return ... or if (!user) return ... statements appearing before any Hook
  // Now that all hooks are called, we can safely do early returns
  console.log('Academy: Auth state - loading:', loading, 'isAuthenticated:', isAuthenticated, 'user:', user?.id);
  
  if (loading && !loadingTimeout) {
    console.log('Academy: Showing loading spinner');
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }
  
  console.log('Academy: Fetching data...');


  // Circular avatar component - displays profile icon or initials
  const CircularAvatar = ({ 
    initial, 
    iconId,
    size = 60, 
    bgColor = '#FFA500' 
  }: { 
    initial: string;
    iconId?: string;
    size?: number; 
    bgColor?: string;
  }) => {
    // Check if avatar is an icon ID (golf icon) or initials
    const selectedIcon = iconId ? GOLF_ICONS.find((icon: any) => icon.id === iconId) : null;
    const isIconId = iconId && GOLF_ICONS.some((icon: any) => icon.id === iconId);
    
    return (
      <div
        className="rounded-full flex items-center justify-center overflow-hidden"
        style={{
          width: size,
          height: size,
          backgroundColor: bgColor,
          fontSize: size * 0.4,
        }}
      >
        {isIconId ? (
          <div className="w-full h-full flex items-center justify-center p-2 text-2xl">
            {(() => {
              const { GOLF_ICONS } = require('@/components/IconPicker');
              const icon = GOLF_ICONS.find((i: any) => i.id === iconId);
              return icon ? icon.emoji : initial;
            })()}
          </div>
        ) : (
          <span className="text-white font-bold">{initial}</span>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32 w-full overflow-x-hidden">
      <div className="max-w-md mx-auto px-4 w-full overflow-x-hidden min-h-screen pb-32">
        {/* Modern Profile Header - Centered */}
        <div className="pt-6 pb-4 bg-white">
          <div className="flex flex-col items-center gap-3">
            {/* Large Circular Avatar */}
            <CircularAvatar 
              initial={userName.split(' ').map((n: string) => n[0]).join('') || 'J'}
              iconId={user?.profileIcon}
              size={64}
              bgColor="#FFA500"
            />
            {/* Identity Text - Centered */}
            <div className="text-center">
              <p className="text-lg text-gray-600 mb-1">Welcome back,</p>
              <h1 className="text-2xl font-bold text-gray-900">{userName}</h1>
              <p className="text-sm font-semibold mt-1" style={{ color: '#16a34a' }}>{userLevel}</p>
            </div>
          </div>
        </div>


        {/* Trophy Case - Achievement Gallery */}
        <div className="mb-6 w-full">
          <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 text-center">Trophy Case</h2>
            
            {(() => {
              // Calculate user stats for trophy checking (using timeframe filter)
              const completedLessons = calculateUserLibraryLessons(timeFilter);
              const practiceHours = calculateUserPracticeTime(timeFilter);
              const userRounds = calculateUserRounds(rounds, timeFilter);
              
              // Load practice history for consistency trophies
              let practiceHistory: any[] = [];
              if (typeof window !== 'undefined') {
                try {
                  practiceHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
                } catch (e) {
                  practiceHistory = [];
                }
              }
              
              // Load library categories completion count
              let libraryCategories: Record<string, number> = {};
              if (typeof window !== 'undefined') {
                try {
                  const userProgress = JSON.parse(localStorage.getItem('userProgress') || '{}');
                  const drillsData = JSON.parse(localStorage.getItem('drillsData') || '[]');
                  const completedDrillIds = userProgress.completedDrills || [];
                  
                  // Count completions by category
                  completedDrillIds.forEach((drillId: string) => {
                    const drill = drillsData.find((d: any) => d.id === drillId);
                    if (drill && drill.category) {
                      libraryCategories[drill.category] = (libraryCategories[drill.category] || 0) + 1;
                    }
                  });
                  
                  // Also check drillCompletions for repeatable drills
                  if (userProgress.drillCompletions) {
                    Object.keys(userProgress.drillCompletions).forEach((drillId: string) => {
                      const drill = drillsData.find((d: any) => d.id === drillId);
                      if (drill && drill.category) {
                        libraryCategories[drill.category] = (libraryCategories[drill.category] || 0) + (userProgress.drillCompletions[drillId] || 0);
                      }
                    });
                  }
                } catch (e) {
                  libraryCategories = {};
                }
              }
              
              const userStats = {
                totalXP: totalXP,
                completedLessons: completedLessons,
                practiceHours: practiceHours,
                rounds: userRounds,
                handicap: currentHandicap,
                roundsData: rounds, // Include full rounds data for score/birdie/eagle checking
                practiceHistory: practiceHistory, // Include practice history for consistency checks
                libraryCategories: libraryCategories // Include library category completion counts
              };

              // Group trophies by category
              const trophiesByCategory = TROPHY_LIST.reduce((acc, trophy) => {
                if (!acc[trophy.category]) {
                  acc[trophy.category] = [];
                }
                acc[trophy.category].push(trophy);
                return acc;
              }, {} as Record<string, TrophyData[]>);

              return (
                <div className="space-y-6 w-full">
                  {Object.entries(trophiesByCategory).map(([category, trophies]) => (
                    <div key={category} className="w-full">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 text-center">{category} Trophies</h3>
                      <div className="grid grid-cols-6 gap-2 w-full">
                        {trophies.map((trophy) => {
                          const isUnlocked = trophy.checkUnlocked(userStats);
                          const progress = trophy.getProgress(userStats);
                          const IconComponent = trophy.icon;

                          return (
                            <motion.div
                              key={trophy.id}
                              className="relative"
                              whileTap={{ scale: 0.95 }}
                              onTap={() => setSelectedTrophy(trophy)}
                            >
                              <div
                                className={`
                                  relative flex flex-col items-center justify-center
                                  rounded-lg p-1.5 border-2 transition-all duration-300 cursor-pointer w-full aspect-square
                                  ${isUnlocked 
                                    ? trophy.isRare
                                      ? 'border-[#FFA500] shadow-[0_0_15px_rgba(255,165,0,0.6)]' 
                                      : 'border-[#FFA500]' 
                                    : 'border-gray-300 bg-gray-50'
                                  }
                                `}
                                style={{
                                  filter: isUnlocked ? 'none' : 'grayscale(100%) brightness(50%)',
                                  opacity: isUnlocked ? 1 : 0.3
                                }}
                              >
                                <div className="flex items-center justify-center w-full h-full">
                                  <IconComponent 
                                    className={`w-5 h-5 flex-shrink-0 ${isUnlocked ? 'text-[#FFA500]' : 'text-gray-400'}`} 
                                  />
                                </div>
                                {!isUnlocked && (
                                  <Lock className="w-2.5 h-2.5 text-gray-500 absolute top-0.5 right-0.5" />
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Trophy Info Modal */}
        <AnimatePresence>
          {selectedTrophy && (() => {
            // Calculate user stats for modal (same as in Trophy Case)
            const completedLessons = calculateUserLibraryLessons(timeFilter);
            const practiceHours = calculateUserPracticeTime(timeFilter);
            const userRounds = calculateUserRounds(rounds, timeFilter);
            
            // Load practice history for consistency trophies
            let practiceHistory: any[] = [];
            if (typeof window !== 'undefined') {
              try {
                practiceHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
              } catch (e) {
                practiceHistory = [];
              }
            }
            
            // Load library categories completion count
            let libraryCategories: Record<string, number> = {};
            if (typeof window !== 'undefined') {
              try {
                const userProgress = JSON.parse(localStorage.getItem('userProgress') || '{}');
                const drillsData = JSON.parse(localStorage.getItem('drillsData') || '[]');
                const completedDrillIds = userProgress.completedDrills || [];
                
                // Count completions by category
                completedDrillIds.forEach((drillId: string) => {
                  const drill = drillsData.find((d: any) => d.id === drillId);
                  if (drill && drill.category) {
                    libraryCategories[drill.category] = (libraryCategories[drill.category] || 0) + 1;
                  }
                });
                
                // Also check drillCompletions for repeatable drills
                if (userProgress.drillCompletions) {
                  Object.keys(userProgress.drillCompletions).forEach((drillId: string) => {
                    const drill = drillsData.find((d: any) => d.id === drillId);
                    if (drill && drill.category) {
                      libraryCategories[drill.category] = (libraryCategories[drill.category] || 0) + (userProgress.drillCompletions[drillId] || 0);
                    }
                  });
                }
              } catch (e) {
                libraryCategories = {};
              }
            }
            
            const modalUserStats = {
              totalXP: totalXP,
              completedLessons: completedLessons,
              practiceHours: practiceHours,
              rounds: userRounds,
              handicap: currentHandicap,
              roundsData: rounds,
              practiceHistory: practiceHistory,
              libraryCategories: libraryCategories
            };
            
            const isUnlocked = selectedTrophy.checkUnlocked(modalUserStats);
            const progress = selectedTrophy.getProgress(modalUserStats);
            const IconComponent = selectedTrophy.icon;
            
            return (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
                onClick={() => setSelectedTrophy(null)}
              >
                <motion.div
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Close Button */}
                  <button
                    onClick={() => setSelectedTrophy(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>

                  {/* Large Trophy Icon */}
                  <div className="flex justify-center mb-4">
                    <div
                      className={`
                        rounded-2xl p-6 border-4
                        ${isUnlocked 
                          ? selectedTrophy.isRare
                            ? 'border-[#FFA500] shadow-[0_0_20px_rgba(255,165,0,0.8)]' 
                            : 'border-[#FFA500]' 
                          : 'border-gray-300 bg-gray-50'
                        }
                      `}
                      style={{
                        background: isUnlocked ? 'linear-gradient(to bottom right, #fff7ed, #ffedd5)' : undefined,
                        filter: isUnlocked ? 'none' : 'grayscale(100%) brightness(50%)',
                        opacity: isUnlocked ? 1 : 0.5
                      }}
                    >
                      <IconComponent 
                        className={`w-16 h-16 ${isUnlocked ? 'text-[#FFA500]' : 'text-gray-400'}`} 
                      />
                    </div>
                  </div>

                  {/* Trophy Name */}
                  <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">
                    {selectedTrophy.name}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-gray-600 mb-4 text-center">
                    {selectedTrophy.requirement}
                  </p>

                  {/* Progress or Unlocked Status */}
                  {!isUnlocked ? (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-500 mb-1 text-center">Progress:</div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div 
                          className="bg-[#FFA500] h-2 rounded-full transition-all"
                          style={{ width: `${progress.percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-600 text-center">
                        {selectedTrophy.id === 'goal-achiever' 
                          ? `Handicap: ${progress.current.toFixed(1)} → ${progress.target} (${Math.round(progress.percentage)}%)`
                          : `${progress.current.toFixed(1)} / ${progress.target} (${Math.round(progress.percentage)}%)`
                        }
                      </div>
                      {/* Locked Status Pill */}
                      <div className="flex items-center justify-center mt-4">
                        <div className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 rounded-full">
                          <Lock className="w-4 h-4 text-white" />
                          <span className="text-white font-bold text-sm uppercase">Locked</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <div className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#FFA500] rounded-full">
                        <span className="text-white font-bold text-sm uppercase">✓ Unlocked!</span>
                      </div>
                    </div>
                  )}

                  {/* Close Button */}
                  <button
                    onClick={() => setSelectedTrophy(null)}
                    className="mt-6 w-full py-2 px-4 bg-[#014421] text-white rounded-lg font-medium hover:bg-opacity-90 transition-colors"
                  >
                    Close
                  </button>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Four-Pillar Leaderboards - 2x2 Grid (Desktop) / Vertical Stack (Mobile) */}
        <div className="mb-6 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            {/* Library Lessons Leaderboard */}
            {(() => {
              const data = libraryLeaderboard;
              return (
                <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
                  <h3 className="text-base font-semibold text-gray-900 mb-3 text-center">Library Lessons</h3>
                  
                  {/* Top 3 Podium or Empty State */}
                  {data.all.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500">No rankings yet. Start logging to take the lead!</p>
                    </div>
                  ) : (
                    <div className="flex items-end justify-center gap-2 mb-4">
                      {/* 2nd Place */}
                      {data.top3[1] && (
                        <div className="flex flex-col items-center">
                          {/* Empty States: Show User icon if name is still an email */}
                          {data.top3[1].name.includes('@') ? (
                            <div className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, backgroundColor: '#C0C0C0' }}>
                              <User className="w-5 h-5 text-white" />
                            </div>
                          ) : (
                            <CircularAvatar
                              initial={data.top3[1].name[0]}
                              iconId={data.top3[1].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[1].avatar) ? data.top3[1].avatar : undefined}
                              size={40}
                              bgColor="#C0C0C0"
                            />
                          )}
                          <div className="text-center mt-1">
                            <div className="text-xs font-bold text-gray-900">#{2}</div>
                            <div className="text-xs font-semibold text-gray-900">{data.top3[1].name}</div>
                            <div className="text-xs text-gray-600">{formatMetricValue(data.top3[1].value, 'library')}</div>
                          </div>
                        </div>
                      )}
                      
                      {/* 1st Place - Center, Higher */}
                      {data.top3[0] && (
                        <div className="flex flex-col items-center">
                          <Crown className="w-4 h-4 mb-1" style={{ color: '#FFA500' }} />
                          {/* Empty States: Show User icon if name is still an email */}
                          {data.top3[0].name.includes('@') ? (
                            <div className="rounded-full flex items-center justify-center" style={{ width: 50, height: 50, backgroundColor: '#FFA500' }}>
                              <User className="w-6 h-6 text-white" />
                            </div>
                          ) : (
                            <CircularAvatar
                              initial={data.top3[0].name[0]}
                              iconId={data.top3[0].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[0].avatar) ? data.top3[0].avatar : undefined}
                              size={50}
                              bgColor="#FFA500"
                            />
                          )}
                          <div className="text-center mt-1">
                            <div className="text-sm font-bold text-gray-900">#{1}</div>
                            <div className="text-xs font-semibold text-gray-900">{data.top3[0].name}</div>
                            <div className="text-xs text-gray-600">{formatMetricValue(data.top3[0].value, 'library')}</div>
                          </div>
                        </div>
                      )}
                      
                      {/* 3rd Place */}
                      {data.top3[2] && (
                        <div className="flex flex-col items-center">
                          {/* Empty States: Show User icon if name is still an email */}
                          {data.top3[2].name.includes('@') ? (
                            <div className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, backgroundColor: '#CD7F32' }}>
                              <User className="w-5 h-5 text-white" />
                            </div>
                          ) : (
                            <CircularAvatar
                              initial={data.top3[2].name[0]}
                              iconId={data.top3[2].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[2].avatar) ? data.top3[2].avatar : undefined}
                              size={40}
                              bgColor="#CD7F32"
                            />
                          )}
                          <div className="text-center mt-1">
                            <div className="text-xs font-bold text-gray-900">#{3}</div>
                            <div className="text-xs font-semibold text-gray-900">{data.top3[2].name}</div>
                            <div className="text-xs text-gray-600">{formatMetricValue(data.top3[2].value, 'library')}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* User Rank or Empty State */}
                  {data.all.length === 0 ? (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-500">No rankings yet. Start logging to take the lead!</p>
                    </div>
                  ) : (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm font-semibold text-gray-700">
                        Your Rank: <span className="text-[#014421]">{data.userRank === 0 ? 'Unranked' : `#${data.userRank}`}</span> | <span className="text-[#FFA500]">{formatMetricValue(data.userValue, 'library')}</span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Practice Time Leaderboard */}
            {(() => {
              const data = practiceLeaderboard;
              return (
                <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
                  <h3 className="text-base font-semibold text-gray-900 mb-3 text-center">Practice Time</h3>
                  
                  {/* Top 3 Podium */}
                  {data.all.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500">No rankings yet. Start logging to take the lead!</p>
                    </div>
                  ) : (
                    <div className="flex items-end justify-center gap-2 mb-4">
                      {data.top3[1] && (
                        <div className="flex flex-col items-center">
                          <CircularAvatar 
                            initial={data.top3[1].name[0]}
                            iconId={data.top3[1].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[1].avatar) ? data.top3[1].avatar : undefined}
                            size={40} 
                            bgColor="#C0C0C0" 
                          />
                          <div className="text-center mt-1">
                            <div className="text-xs font-bold text-gray-900">#{2}</div>
                            <div className="text-xs font-semibold text-gray-900">{data.top3[1].name}</div>
                            <div className="text-xs text-gray-600">{formatMetricValue(data.top3[1].value, 'practice')}</div>
                          </div>
                        </div>
                      )}
                      {data.top3[0] && (
                        <div className="flex flex-col items-center">
                          <Crown className="w-4 h-4 mb-1" style={{ color: '#FFA500' }} />
                          <CircularAvatar 
                            initial={data.top3[0].name[0]}
                            iconId={data.top3[0].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[0].avatar) ? data.top3[0].avatar : undefined}
                            size={50} 
                            bgColor="#FFA500" 
                          />
                          <div className="text-center mt-1">
                            <div className="text-sm font-bold text-gray-900">#{1}</div>
                            <div className="text-xs font-semibold text-gray-900">{data.top3[0].name}</div>
                            <div className="text-xs text-gray-600">{formatMetricValue(data.top3[0].value, 'practice')}</div>
                          </div>
                        </div>
                      )}
                      {data.top3[2] && (
                        <div className="flex flex-col items-center">
                          <CircularAvatar 
                            initial={data.top3[2].name[0]}
                            iconId={data.top3[2].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[2].avatar) ? data.top3[2].avatar : undefined}
                            size={40} 
                            bgColor="#CD7F32" 
                          />
                          <div className="text-center mt-1">
                            <div className="text-xs font-bold text-gray-900">#{3}</div>
                            <div className="text-xs font-semibold text-gray-900">{data.top3[2].name}</div>
                            <div className="text-xs text-gray-600">{formatMetricValue(data.top3[2].value, 'practice')}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {data.all.length === 0 ? (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-500">No rankings yet. Start logging to take the lead!</p>
                    </div>
                  ) : (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm font-semibold text-gray-700">
                        Your Rank: <span className="text-[#014421]">{data.userRank === 0 ? 'Unranked' : `#${data.userRank}`}</span> | <span className="text-[#FFA500]">{formatMetricValue(data.userValue, 'practice')}</span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Rounds Leaderboard */}
            {(() => {
              const data = roundsLeaderboard;
              return (
                <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
                  <h3 className="text-base font-semibold text-gray-900 mb-3 text-center">Rounds</h3>
                  
                  {data.all.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500">No rankings yet. Start logging to take the lead!</p>
                    </div>
                  ) : (
                    <div className="flex items-end justify-center gap-2 mb-4">
                      {data.top3[1] && (
                        <div className="flex flex-col items-center">
                          <CircularAvatar 
                            initial={data.top3[1].name[0]}
                            iconId={data.top3[1].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[1].avatar) ? data.top3[1].avatar : undefined}
                            size={40} 
                            bgColor="#C0C0C0" 
                          />
                          <div className="text-center mt-1">
                            <div className="text-xs font-bold text-gray-900">#{2}</div>
                            <div className="text-xs font-semibold text-gray-900">{data.top3[1].name}</div>
                            <div className="text-xs text-gray-600">{formatMetricValue(data.top3[1].value, 'rounds')}</div>
                          </div>
                        </div>
                      )}
                      {data.top3[0] && (
                        <div className="flex flex-col items-center">
                          <Crown className="w-4 h-4 mb-1" style={{ color: '#FFA500' }} />
                          <CircularAvatar 
                            initial={data.top3[0].name[0]}
                            iconId={data.top3[0].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[0].avatar) ? data.top3[0].avatar : undefined}
                            size={50} 
                            bgColor="#FFA500" 
                          />
                          <div className="text-center mt-1">
                            <div className="text-sm font-bold text-gray-900">#{1}</div>
                            <div className="text-xs font-semibold text-gray-900">{data.top3[0].name}</div>
                            <div className="text-xs text-gray-600">{formatMetricValue(data.top3[0].value, 'rounds')}</div>
                          </div>
                        </div>
                      )}
                      {data.top3[2] && (
                        <div className="flex flex-col items-center">
                          <CircularAvatar 
                            initial={data.top3[2].name[0]}
                            iconId={data.top3[2].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[2].avatar) ? data.top3[2].avatar : undefined}
                            size={40} 
                            bgColor="#CD7F32" 
                          />
                          <div className="text-center mt-1">
                            <div className="text-xs font-bold text-gray-900">#{3}</div>
                            <div className="text-xs font-semibold text-gray-900">{data.top3[2].name}</div>
                            <div className="text-xs text-gray-600">{formatMetricValue(data.top3[2].value, 'rounds')}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {data.all.length === 0 ? (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-500">No rankings yet. Start logging to take the lead!</p>
                    </div>
                  ) : (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm font-semibold text-gray-700">
                        Your Rank: <span className="text-[#014421]">{data.userRank === 0 ? 'Unranked' : `#${data.userRank}`}</span> | <span className="text-[#FFA500]">{formatMetricValue(data.userValue, 'rounds')}</span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Drills Leaderboard */}
            {(() => {
              const data = drillsLeaderboard;
              return (
                <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
                  <h3 className="text-base font-semibold text-gray-900 mb-3 text-center">Drills</h3>
                  
                  {data.all.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500">No rankings yet. Start logging to take the lead!</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-end justify-center gap-2 mb-4">
                        {data.top3[1] && (
                          <div className="flex flex-col items-center">
                            <CircularAvatar 
                            initial={data.top3[1].name[0]}
                            iconId={data.top3[1].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[1].avatar) ? data.top3[1].avatar : undefined}
                            size={40} 
                            bgColor="#C0C0C0" 
                          />
                            <div className="text-center mt-1">
                              <div className="text-xs font-bold text-gray-900">#{2}</div>
                              <div className="text-xs font-semibold text-gray-900">{data.top3[1].name}</div>
                              <div className="text-xs text-gray-600">{formatMetricValue(data.top3[1].value, 'drills')}</div>
                            </div>
                          </div>
                        )}
                        {data.top3[0] && (
                          <div className="flex flex-col items-center">
                            <Crown className="w-4 h-4 mb-1" style={{ color: '#FFA500' }} />
                            <CircularAvatar 
                            initial={data.top3[0].name[0]}
                            iconId={data.top3[0].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[0].avatar) ? data.top3[0].avatar : undefined}
                            size={50} 
                            bgColor="#FFA500" 
                          />
                            <div className="text-center mt-1">
                              <div className="text-sm font-bold text-gray-900">#{1}</div>
                              <div className="text-xs font-semibold text-gray-900">{data.top3[0].name}</div>
                              <div className="text-xs text-gray-600">{formatMetricValue(data.top3[0].value, 'drills')}</div>
                            </div>
                          </div>
                        )}
                        {data.top3[2] && (
                          <div className="flex flex-col items-center">
                            <CircularAvatar 
                            initial={data.top3[2].name[0]}
                            iconId={data.top3[2].avatar && GOLF_ICONS.some((icon: any) => icon.id === data.top3[2].avatar) ? data.top3[2].avatar : undefined}
                            size={40} 
                            bgColor="#CD7F32" 
                          />
                            <div className="text-center mt-1">
                              <div className="text-xs font-bold text-gray-900">#{3}</div>
                              <div className="text-xs font-semibold text-gray-900">{data.top3[2].name}</div>
                              <div className="text-xs text-gray-600">{formatMetricValue(data.top3[2].value, 'drills')}</div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="text-center pt-3 border-t border-gray-200">
                        <p className="text-sm font-semibold text-gray-700">
                          Your Rank: <span className="text-[#014421]">{data.userRank === 0 ? 'Unranked' : `#${data.userRank}`}</span> | <span className="text-[#FFA500]">{formatMetricValue(data.userValue, 'drills')}</span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Metric Selection - Wrapping Pills */}
        <div className="mb-4 w-full">
          <div className="flex items-center gap-2 flex-wrap pb-2">
            {(['xp', 'library', 'practice', 'rounds', 'drills', 'lowGross', 'lowNett', 'birdies', 'eagles'] as const).map((metric) => {
              const labels = {
                xp: 'XP',
                library: 'Library',
                practice: 'Practice',
                rounds: 'Rounds',
                drills: 'Drills',
                lowGross: 'Low Gross',
                lowNett: 'Low Nett',
                birdies: 'Birdies',
                eagles: 'Eagles'
              };
              
              return (
                <button
                  key={metric}
                  onClick={() => setLeaderboardMetric(metric)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    leaderboardMetric === metric
                      ? 'text-white'
                      : 'text-gray-600 bg-gray-100'
                  }`}
                  style={leaderboardMetric === metric ? { backgroundColor: '#014421' } : {}}
                >
                  {labels[metric]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Top 3 Leaders Podium - With Circular Avatars */}
        <div className="mb-6 w-full">
          <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 text-center">Top 3 Leaders</h2>
            {(() => {
              // Debug Logging: Add console.log('Academy: Current rounds count:', rounds.length) right before the leaderboard render to see if the data is actually reaching the page
              // Find the top3 calculation: Locate where the leaderboard data is sliced to get the top 3 users
              // Remove Mock Fallbacks: Search for any code that manually creates a user object with '4000' as the value and delete it
              // Sync to Database: Ensure the Top3Leaders component is strictly using the values from the allEntries array we just built, which uses roundsByUser.get(userId).length
              // Update Sub-label: Ensure the text below the name says {entry.value} Rounds instead of a static number
              console.log('Academy: Current rounds count:', rounds?.length || 0);
              console.log('Academy: Leaderboard data exists:', !!currentLeaderboard);
              console.log('Academy: Top3 data:', top3);
              console.log('Academy: Top3 values:', top3?.map((e: any) => ({ name: e.name, value: e.value, id: e.id })));
              console.log('Academy: Sorted leaderboard length:', sortedLeaderboard?.length || 0);
              console.log('Academy: User ID:', user?.id);
              console.log('Academy: Rounds from StatsContext:', rounds);
              
              // Remove Mock Fallbacks: Check if any top3 entry has value 4000
              if (top3 && top3.length > 0) {
                const has4000 = top3.some((e: any) => e.value === 4000);
                if (has4000) {
                  console.error('⚠️ Top3 has entry with value 4000! This should be replaced with actual roundCount from roundsByUser.get(userId).length');
                  console.error('⚠️ Top3 entries:', top3.map((e: any) => ({ name: e.name, value: e.value, id: e.id })));
                }
              }
              
              // Add Null Check: Ensure the leaderboard component only renders if leaderboardData exists, but provide a 'No Data' state instead of a white screen
              // Verify the Variable: Make sure leaderboardData is being calculated using the rounds from StatsContext and that it isn't being filtered out by a mismatching user_id
              // Handle Empty State: If there are no rounds in the database, show a 'No Rounds Logged' message instead of fake leaders
              if (!currentLeaderboard || !sortedLeaderboard || sortedLeaderboard.length === 0) {
                // Check if this is specifically a rounds metric with no data
                if (leaderboardMetric === 'rounds') {
                  return (
                    <div className="text-center py-12">
                      <p className="text-sm text-gray-500">No Rounds Logged</p>
                      <p className="text-xs text-gray-400 mt-2">Start logging rounds to appear on the leaderboard!</p>
                      <p className="text-xs text-gray-400 mt-1">Rounds in database: {rounds?.length || 0}</p>
                    </div>
                  );
                }
                return (
                  <div className="text-center py-12">
                    <p className="text-sm text-gray-500">No rankings yet. Start logging to take the lead!</p>
                    <p className="text-xs text-gray-400 mt-2">Rounds loaded: {rounds?.length || 0}</p>
                  </div>
                );
              }
              
              // Render the actual leaderboard
              return (
              <div className="flex items-end justify-center gap-3">
                {/* 2nd Place */}
                {top3[1] && (
                  <div className="flex flex-col items-center">
                    {/* Empty States: Show User icon if name is still an email */}
                    {top3[1].name.includes('@') ? (
                      <div className="rounded-full flex items-center justify-center" style={{ width: 60, height: 60, backgroundColor: '#C0C0C0' }}>
                        <User className="w-7 h-7 text-white" />
                      </div>
                    ) : (
                      <CircularAvatar 
                        initial={top3[1].name[0]}
                        iconId={top3[1].avatar && GOLF_ICONS.some((icon: any) => icon.id === top3[1].avatar) ? top3[1].avatar : undefined}
                        size={60}
                        bgColor="#C0C0C0"
                      />
                    )}
                    <div className="text-center mt-2">
                      <div className="text-sm font-bold text-gray-900">#{2}</div>
                      <div className="text-sm font-semibold text-gray-900">{top3[1].name}</div>
                      {/* Connect to Real Data: Use value from leaderboardData array */}
                      <div className="text-xs text-gray-600">{formatLeaderboardValue(top3[1].value, leaderboardMetric)}</div>
                    </div>
                  </div>
                )}
                
                {/* 1st Place - Center, Higher, with Crown */}
                {top3[0] && (
                  <div className="flex flex-col items-center">
                    <Crown className="w-6 h-6 mb-1 animate-pulse" style={{ color: '#FFA500' }} />
                    {/* Empty States: Show User icon if name is still an email */}
                    {top3[0].name.includes('@') ? (
                      <div className="rounded-full flex items-center justify-center" style={{ width: 80, height: 80, backgroundColor: '#FFA500' }}>
                        <User className="w-10 h-10 text-white" />
                      </div>
                    ) : (
                      <CircularAvatar 
                        initial={top3[0].name[0]}
                        iconId={top3[0].avatar && GOLF_ICONS.some((icon: any) => icon.id === top3[0].avatar) ? top3[0].avatar : undefined}
                        size={80}
                        bgColor="#FFA500"
                      />
                    )}
                    <div className="text-center mt-2">
                      <div className="text-base font-bold text-gray-900">#{1}</div>
                      <div className="text-base font-semibold text-gray-900">{top3[0].name}</div>
                      {/* Find the top3 calculation: Ensure Top3Leaders uses values from allEntries array (which uses roundsByUser.get(userId).length) */}
                      {/* Update Sub-label: Ensure the text below the name says {entry.value} Rounds instead of a static number */}
                      {/* Remove Mock Fallbacks: Verify this is using entry.value from allEntries, not hardcoded 4000 */}
                      <div className="text-xs text-gray-600">{formatLeaderboardValue(top3[0].value, leaderboardMetric)}</div>
                      {/* Debug: Log the actual value being displayed */}
                      {(() => {
                        console.log('Top3[0] value being displayed:', top3[0].value, 'for', top3[0].name);
                        if (top3[0].value === 4000) {
                          console.error('⚠️ Top3[0] has hardcoded value 4000! This should be replaced with actual roundCount');
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                )}
                
                {/* 3rd Place */}
                {top3[2] && (
                  <div className="flex flex-col items-center">
                    {/* Empty States: Show User icon if name is still an email */}
                    {top3[2].name.includes('@') ? (
                      <div className="rounded-full flex items-center justify-center" style={{ width: 60, height: 60, backgroundColor: '#CD7F32' }}>
                        <User className="w-7 h-7 text-white" />
                      </div>
                    ) : (
                      <CircularAvatar 
                        initial={top3[2].name[0]}
                        iconId={top3[2].avatar && GOLF_ICONS.some((icon: any) => icon.id === top3[2].avatar) ? top3[2].avatar : undefined}
                        size={60}
                        bgColor="#CD7F32"
                      />
                    )}
                    <div className="text-center mt-2">
                      <div className="text-sm font-bold text-gray-900">#{3}</div>
                      <div className="text-sm font-semibold text-gray-900">{top3[2].name}</div>
                      {/* Connect to Real Data: Use value from leaderboardData array */}
                      <div className="text-xs text-gray-600">{formatLeaderboardValue(top3[2].value, leaderboardMetric)}</div>
                    </div>
                  </div>
                )}
              </div>
              );
            })()}
          </div>
        </div>

        {/* Overall Leaderboard - Ranks 4-7 with Expandable Full View */}
        <div className="mb-6 w-full">
          <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Overall Leaderboard</h2>
              <button
                onClick={() => setShowFullLeaderboard(!showFullLeaderboard)}
                className="text-sm font-medium px-3 py-1 rounded-lg transition-colors"
                style={{ 
                  backgroundColor: showFullLeaderboard ? '#014421' : 'transparent',
                  color: showFullLeaderboard ? 'white' : '#014421'
                }}
              >
                {showFullLeaderboard ? 'Hide' : 'View Full'}
              </button>
            </div>
            
            {/* Time Filter Buttons - Perfectly Centered */}
            <div className="flex items-center justify-center gap-2 mb-4 w-full">
              {(['week', 'month', 'year', 'allTime'] as const).map((filter) => {
                const labels = {
                  week: 'Today',
                  month: 'This Week',
                  year: 'This Month',
                  allTime: 'All-Time'
                };
                
                return (
                  <button
                    key={filter}
                    onClick={() => setTimeFilter(filter)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      timeFilter === filter
                        ? 'text-white'
                        : 'text-gray-600 bg-gray-100'
                    }`}
                    style={timeFilter === filter ? { backgroundColor: '#014421' } : {}}
                  >
                    {labels[filter]}
                  </button>
                );
              })}
            </div>
            
            {sortedLeaderboard.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No rankings yet. Start logging to take the lead!</p>
              </div>
            ) : !showFullLeaderboard ? (
              <div className="space-y-3">
                  {ranks4to7.map((entry: any) => {
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          entry.id === 'user' 
                            ? 'border-[#FFA500]' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex-shrink-0 w-10 text-center">
                          <span className={`text-sm font-bold ${entry.id === 'user' ? 'text-[#014421]' : 'text-gray-600'}`}>
                            #{entry.rank}
                          </span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_100px] items-center gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0">
                            {/* Empty States: Show User icon if name is still an email */}
                            {entry.name.includes('@') ? (
                              <div className="rounded-full flex items-center justify-center" style={{ width: 32, height: 32, backgroundColor: entry.id === 'user' ? '#FFA500' : '#014421' }}>
                                <User className="w-4 h-4 text-white" />
                              </div>
                            ) : (
                              <CircularAvatar 
                                initial={entry.name[0]}
                                iconId={entry.avatar && GOLF_ICONS.some((icon: any) => icon.id === entry.avatar) ? entry.avatar : undefined}
                                size={32}
                                bgColor={entry.id === 'user' ? '#FFA500' : '#014421'}
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className={`font-semibold text-sm flex items-center gap-1 ${entry.id === 'user' ? 'text-[#014421]' : 'text-gray-900'}`}>
                              {entry.name}
                              {((leaderboardMetric === 'lowGross' && entry.lowRound !== null && entry.lowRound !== undefined && entry.lowRound === globalLowRound) ||
                                (leaderboardMetric === 'lowNett' && entry.lowNett !== null && entry.lowNett !== undefined && entry.lowNett === globalLowRound)) && (
                                <Trophy className="w-3 h-3" style={{ color: '#FFA500' }} />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            {/* Connect to Real Data: Replace any hardcoded values with the score property from the actual leaderboardData array */}
                            {/* Unify Labels: Ensure the top card and Rank section both show the same value (e.g., '5 Rounds') */}
                            <span className="text-sm font-bold whitespace-nowrap" style={{ color: '#FFA500' }}>
                              {formatLeaderboardValue(entry.value, leaderboardMetric)}
                            </span>
                            {entry.movedUp && (
                              <TrendingUp className="w-4 h-4 flex-shrink-0" style={{ color: '#10B981' }} />
                            )}
                            {entry.movedDown && (
                              <TrendingDown className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} />
                            )}
                            {!entry.movedUp && !entry.movedDown && entry.rankChange === 0 && (
                              <div className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            ) : (
              <div>
                {/* Search Bar */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={leaderboardSearch}
                    onChange={(e) => setLeaderboardSearch(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#014421]"
                  />
                  {leaderboardSearch && (
                    <button
                      onClick={() => setLeaderboardSearch('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Full Leaderboard List */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredFullLeaderboard.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No players found
                    </div>
                  ) : (
                    filteredFullLeaderboard.map((entry: any) => {
                      const isTop3 = entry.rank <= 3;

                      return (
                        <div
                          key={entry.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                            entry.id === 'user' 
                              ? 'border-[#FFA500]' 
                              : isTop3
                              ? 'border-[#014421]'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {isTop3 && entry.rank === 1 && <Crown className="w-5 h-5 mx-auto mb-1" style={{ color: '#FFA500' }} />}
                            {/* Empty States: Show User icon if name is still an email */}
                            {entry.name.includes('@') ? (
                              <div className="rounded-full flex items-center justify-center" style={{ width: 40, height: 40, backgroundColor: entry.id === 'user' ? '#FFA500' : entry.rank === 1 ? '#FFA500' : entry.rank === 2 ? '#C0C0C0' : entry.rank === 3 ? '#CD7F32' : '#014421' }}>
                                <User className="w-5 h-5 text-white" />
                              </div>
                            ) : (
                              <CircularAvatar 
                                initial={entry.name[0]}
                                iconId={entry.avatar && GOLF_ICONS.some((icon: any) => icon.id === entry.avatar) ? entry.avatar : undefined}
                                size={40}
                                bgColor={entry.id === 'user' ? '#FFA500' : entry.rank === 1 ? '#FFA500' : entry.rank === 2 ? '#C0C0C0' : entry.rank === 3 ? '#CD7F32' : '#014421'}
                              />
                            )}
                          </div>
                          <div className="flex-shrink-0 w-10 text-center">
                            <span className={`text-sm font-bold ${entry.id === 'user' || isTop3 ? 'text-[#014421]' : 'text-gray-600'}`}>
                              #{entry.rank}
                            </span>
                          </div>
                          <div className="grid grid-cols-[1fr_100px] items-center gap-3 flex-1 min-w-0">
                            <div className="min-w-0">
                              <div className={`font-semibold text-sm flex items-center gap-1 ${entry.id === 'user' ? 'text-[#014421]' : 'text-gray-900'}`}>
                                {entry.name}
                                {((leaderboardMetric === 'lowGross' && entry.lowRound !== null && entry.lowRound !== undefined && entry.lowRound === globalLowRound) ||
                                  (leaderboardMetric === 'lowNett' && entry.lowNett !== null && entry.lowNett !== undefined && entry.lowNett === globalLowRound)) && (
                                  <Trophy className="w-3 h-3" style={{ color: '#FFA500' }} />
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm font-bold whitespace-nowrap" style={{ color: '#FFA500' }}>
                                {formatLeaderboardValue(entry.value, leaderboardMetric)}
                              </span>
                              {entry.movedUp && (
                                <TrendingUp className="w-4 h-4 flex-shrink-0" style={{ color: '#10B981' }} />
                              )}
                              {entry.movedDown && (
                                <TrendingDown className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} />
                              )}
                              {!entry.movedUp && !entry.movedDown && entry.rankChange === 0 && (
                                <div className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
