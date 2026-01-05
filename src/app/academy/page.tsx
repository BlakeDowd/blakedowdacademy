"use client";

import { useEffect, useState } from "react";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Trophy, Award, Medal, Crown, TrendingUp, TrendingDown, Search, X, Lock, Target, BookOpen, Clock, Zap, Star, Flame } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  handicap: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  previousRank?: number; // For trend arrows
  avatar?: string; // Avatar initial or emoji
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

// Mock leaderboard data with previous ranks for trends
const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { id: 'alex', name: 'Alex', xp: 12500, handicap: 5.2, tier: 'Platinum', previousRank: 1, avatar: 'A' },
  { id: 'sarah', name: 'Sarah', xp: 9800, handicap: 7.1, tier: 'Gold', previousRank: 3, avatar: 'S' },
  { id: 'mike', name: 'Mike', xp: 8700, handicap: 8.3, tier: 'Gold', previousRank: 2, avatar: 'M' },
  { id: 'jordan', name: 'Jordan', xp: 7200, handicap: 9.5, tier: 'Silver', previousRank: 5, avatar: 'J' },
  { id: 'taylor', name: 'Taylor', xp: 6500, handicap: 10.2, tier: 'Silver', previousRank: 4, avatar: 'T' },
  { id: 'casey', name: 'Casey', xp: 5400, handicap: 11.8, tier: 'Bronze', previousRank: 7, avatar: 'C' },
  { id: 'riley', name: 'Riley', xp: 4800, handicap: 12.5, tier: 'Bronze', previousRank: 6, avatar: 'R' },
];

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
function getTimeframeDates(timeFilter: 'week' | 'month' | 'allTime') {
  const now = new Date();
  let startDate: Date;
  
  if (timeFilter === 'week') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
  } else if (timeFilter === 'month') {
    startDate = new Date(now);
    startDate.setMonth(now.getMonth() - 1);
  } else {
    startDate = new Date(0); // All time
  }
  
  return { startDate, endDate: now };
}

// Calculate rounds count
function calculateUserRounds(rounds: any[], timeFilter: 'week' | 'month' | 'allTime') {
  const { startDate } = getTimeframeDates(timeFilter);
  return rounds.filter(round => {
    if (timeFilter === 'allTime') return true;
    const roundDate = new Date(round.date);
    return roundDate >= startDate;
  }).length;
}

// Calculate practice time (in hours)
function calculateUserPracticeTime(timeFilter: 'week' | 'month' | 'allTime') {
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
function calculateUserDrills(timeFilter: 'week' | 'month' | 'allTime') {
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
function calculateUserLibraryLessons(timeFilter: 'week' | 'month' | 'allTime') {
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

// Generate mock leaderboard data for a specific metric (four-pillar cards)
function getMockLeaderboard(
  metric: 'library' | 'practice' | 'rounds' | 'drills',
  timeFilter: 'week' | 'month' | 'allTime',
  rounds: any[],
  userName: string
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
      userValue = calculateUserRounds(rounds, timeFilter);
      break;
    case 'drills':
      userValue = calculateUserDrills(timeFilter);
      break;
    default:
      userValue = 0;
  }
  
  // Generate mock data that includes the user
  const mockData = [
    { id: 'alex', name: 'Alex', avatar: 'A', value: Math.max(userValue + 5, 15) },
    { id: 'sarah', name: 'Sarah', avatar: 'S', value: Math.max(userValue + 3, 12) },
    { id: 'mike', name: 'Mike', avatar: 'M', value: Math.max(userValue + 2, 10) },
    { id: 'jordan', name: 'Jordan', avatar: 'J', value: Math.max(userValue + 1, 8) },
    { id: 'user', name: 'You', avatar: userName.split(' ').map((n: string) => n[0]).join('') || 'Y', value: userValue },
    { id: 'taylor', name: 'Taylor', avatar: 'T', value: Math.max(userValue - 1, 6) },
    { id: 'casey', name: 'Casey', avatar: 'C', value: Math.max(userValue - 2, 4) },
    { id: 'riley', name: 'Riley', avatar: 'R', value: Math.max(userValue - 3, 3) },
    { id: 'sam', name: 'Sam', avatar: 'S', value: Math.max(userValue - 4, 2) },
    { id: 'chris', name: 'Chris', avatar: 'C', value: Math.max(userValue - 5, 1) },
  ];
  
  // Sort by value descending and get top 3 for podium
  const sorted = mockData.sort((a, b) => b.value - a.value);
  return {
    top3: sorted.slice(0, 3),
    all: sorted,
    userRank: sorted.findIndex(entry => entry.id === 'user') + 1,
    userValue: userValue
  };
}

// Format leaderboard value for display (used in main XP leaderboard)
function formatLeaderboardValue(value: number, metric: 'xp' | 'library' | 'practice' | 'rounds' | 'drills') {
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
    default:
      return `${value}`;
  }
}

// Get leaderboard data for selected metric (main XP leaderboard)
function getLeaderboardData(
  metric: 'xp' | 'library' | 'practice' | 'rounds' | 'drills',
  timeFilter: 'week' | 'month' | 'allTime',
  rounds: any[],
  totalXP: number,
  userName: string
) {
  let userValue: number;
  
  switch (metric) {
    case 'xp':
      userValue = totalXP;
      break;
    case 'library':
      userValue = calculateUserLibraryLessons(timeFilter);
      break;
    case 'practice':
      userValue = calculateUserPracticeTime(timeFilter);
      break;
    case 'rounds':
      userValue = calculateUserRounds(rounds, timeFilter);
      break;
    case 'drills':
      userValue = calculateUserDrills(timeFilter);
      break;
    default:
      userValue = 0;
  }
  
  // Generate mock data with previous ranks for trending
  const mockData = [
    { id: 'alex', name: 'Alex', avatar: 'A', value: Math.max(userValue + 5000, 15000), previousRank: 1 },
    { id: 'sarah', name: 'Sarah', avatar: 'S', value: Math.max(userValue + 3000, 12000), previousRank: 3 },
    { id: 'mike', name: 'Mike', avatar: 'M', value: Math.max(userValue + 2000, 10000), previousRank: 2 },
    { id: 'jordan', name: 'Jordan', avatar: 'J', value: Math.max(userValue + 1000, 8000), previousRank: 5 },
    { id: 'user', name: 'You', avatar: userName.split(' ').map(n => n[0]).join('') || 'Y', value: userValue, previousRank: 6 },
    { id: 'taylor', name: 'Taylor', avatar: 'T', value: Math.max(userValue - 500, 6000), previousRank: 4 },
    { id: 'casey', name: 'Casey', avatar: 'C', value: Math.max(userValue - 1000, 5000), previousRank: 7 },
    { id: 'riley', name: 'Riley', avatar: 'R', value: Math.max(userValue - 1500, 4000), previousRank: 8 },
  ];
  
  // Sort by value descending
  const sorted = mockData.sort((a, b) => b.value - a.value);
  
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
  
  return {
    top3: withRanks.slice(0, 3),
    all: withRanks,
    userRank: withRanks.findIndex(entry => entry.id === 'user') + 1,
    userValue: userValue
  };
}

// Calculate total XP filtered by timeframe
function calculateTotalXPByTimeframe(rounds: any[], userProgress: { totalXP: number; completedDrills: string[] }, timeFilter: 'week' | 'month' | 'allTime') {
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
  const { rounds } = useStats();
  const { user } = useAuth();
  const [userProgress, setUserProgress] = useState<{ totalXP: number; completedDrills: string[] }>({
    totalXP: 0,
    completedDrills: []
  });
  const [timeFilter, setTimeFilter] = useState<'week' | 'month' | 'allTime'>('allTime');
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [selectedTrophy, setSelectedTrophy] = useState<TrophyData | null>(null);
  const [leaderboardMetric, setLeaderboardMetric] = useState<'xp' | 'library' | 'practice' | 'rounds' | 'drills'>('xp');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadProgress = () => {
      const savedProgress = localStorage.getItem('userProgress');
      if (savedProgress) {
        const progress = JSON.parse(savedProgress);
        setUserProgress(progress);
      }
    };

    loadProgress();

    // Listen for XP updates
    window.addEventListener('userProgressUpdated', loadProgress);
    window.addEventListener('storage', loadProgress);

    return () => {
      window.removeEventListener('userProgressUpdated', loadProgress);
      window.removeEventListener('storage', loadProgress);
    };
  }, []);

  // Calculate total XP (rounds + drills) - filtered by timeframe
  const totalXP = calculateTotalXPByTimeframe(rounds, userProgress, timeFilter);

  // Get current handicap (latest round or default)
  const getCurrentHandicap = () => {
    if (rounds.length === 0) return STARTING_HANDICAP;
    const lastRound = rounds[rounds.length - 1];
    return lastRound.handicap !== null && lastRound.handicap !== undefined 
      ? lastRound.handicap 
      : STARTING_HANDICAP;
  };

  const currentHandicap = getCurrentHandicap();

  // Calculate scholarship progress (handicap improvement toward goal)
  const calculateScholarshipProgress = () => {
    const handicapRange = STARTING_HANDICAP - GOAL_HANDICAP; // 12.0 - 8.7 = 3.3
    const handicapImprovement = STARTING_HANDICAP - currentHandicap; // How much improved
    const progress = Math.min(100, Math.max(0, (handicapImprovement / handicapRange) * 100));
    return progress;
  };

  const scholarshipProgress = calculateScholarshipProgress();

  // Determine tier based on XP and handicap
  const getTier = (): 'Bronze' | 'Silver' | 'Gold' | 'Platinum' => {
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
  };

  const userTier = getTier();
  const userLevel = getLevel(userTier);

  // Get user name from auth context
  const getUserName = () => {
    if (!user?.email) return 'Player';
    const emailParts = user.email.split('@')[0];
    const nameParts = emailParts.split('.');
    if (nameParts.length >= 2) {
      return nameParts.map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }
    return emailParts.charAt(0).toUpperCase() + emailParts.slice(1);
  };

  const userName = getUserName();

  // Get current leaderboard data - recalculates when timeFilter or leaderboardMetric changes
  const currentLeaderboard = getLeaderboardData(leaderboardMetric, timeFilter, rounds, totalXP, userName);
  const top3 = currentLeaderboard.top3;
  const ranks4to7 = currentLeaderboard.all.slice(3, 7);
  const sortedLeaderboard = currentLeaderboard.all;

  // Get four-pillar leaderboard data - recalculates when timeFilter changes
  const libraryLeaderboard = getMockLeaderboard('library', timeFilter, rounds, userName);
  const practiceLeaderboard = getMockLeaderboard('practice', timeFilter, rounds, userName);
  const roundsLeaderboard = getMockLeaderboard('rounds', timeFilter, rounds, userName);
  const drillsLeaderboard = getMockLeaderboard('drills', timeFilter, rounds, userName);

  // Filter leaderboard by search
  const getFilteredFullLeaderboard = () => {
    if (!leaderboardSearch.trim()) return sortedLeaderboard;
    const searchLower = leaderboardSearch.toLowerCase();
    return sortedLeaderboard.filter(entry => 
      entry.name.toLowerCase().includes(searchLower)
    );
  };

  const filteredFullLeaderboard = getFilteredFullLeaderboard();


  // Circular avatar component
  const CircularAvatar = ({ 
    initial, 
    size = 60, 
    bgColor = '#FFA500' 
  }: { 
    initial: string; 
    size?: number; 
    bgColor?: string;
  }) => {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-bold"
        style={{
          width: size,
          height: size,
          backgroundColor: bgColor,
          fontSize: size * 0.4,
        }}
      >
        {initial}
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

        {/* Global Timeframe Toggle */}
        <div className="mb-6 mt-4">
          <div className="flex items-center justify-center gap-2 bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
            <button
              onClick={() => setTimeFilter('week')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeFilter === 'week'
                  ? 'text-white'
                  : 'text-gray-600 bg-gray-100'
              }`}
              style={timeFilter === 'week' ? { backgroundColor: '#014421' } : {}}
            >
              Week
            </button>
            <button
              onClick={() => setTimeFilter('month')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeFilter === 'month'
                  ? 'text-white'
                  : 'text-gray-600 bg-gray-100'
              }`}
              style={timeFilter === 'month' ? { backgroundColor: '#014421' } : {}}
            >
              Month
            </button>
            <button
              onClick={() => setTimeFilter('allTime')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeFilter === 'allTime'
                  ? 'text-white'
                  : 'text-gray-600 bg-gray-100'
              }`}
              style={timeFilter === 'allTime' ? { backgroundColor: '#014421' } : {}}
            >
              All-Time
            </button>
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
                  
                  {/* Top 3 Podium */}
                  <div className="flex items-end justify-center gap-2 mb-4">
                    {/* 2nd Place */}
                    {data.top3[1] && (
                      <div className="flex flex-col items-center">
                        <CircularAvatar 
                          initial={data.top3[1].avatar} 
                          size={40}
                          bgColor="#C0C0C0"
                        />
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
                        <CircularAvatar 
                          initial={data.top3[0].avatar} 
                          size={50}
                          bgColor="#FFA500"
                        />
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
                        <CircularAvatar 
                          initial={data.top3[2].avatar} 
                          size={40}
                          bgColor="#CD7F32"
                        />
                        <div className="text-center mt-1">
                          <div className="text-xs font-bold text-gray-900">#{3}</div>
                          <div className="text-xs font-semibold text-gray-900">{data.top3[2].name}</div>
                          <div className="text-xs text-gray-600">{formatMetricValue(data.top3[2].value, 'library')}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* User Rank */}
                  <div className="text-center pt-3 border-t border-gray-200">
                    <p className="text-sm font-semibold text-gray-700">
                      Your Rank: <span className="text-[#014421]">#{data.userRank}</span> | <span className="text-[#FFA500]">{formatMetricValue(data.userValue, 'library')}</span>
                    </p>
                  </div>
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
                  <div className="flex items-end justify-center gap-2 mb-4">
                    {data.top3[1] && (
                      <div className="flex flex-col items-center">
                        <CircularAvatar initial={data.top3[1].avatar} size={40} bgColor="#C0C0C0" />
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
                        <CircularAvatar initial={data.top3[0].avatar} size={50} bgColor="#FFA500" />
                        <div className="text-center mt-1">
                          <div className="text-sm font-bold text-gray-900">#{1}</div>
                          <div className="text-xs font-semibold text-gray-900">{data.top3[0].name}</div>
                          <div className="text-xs text-gray-600">{formatMetricValue(data.top3[0].value, 'practice')}</div>
                        </div>
                      </div>
                    )}
                    {data.top3[2] && (
                      <div className="flex flex-col items-center">
                        <CircularAvatar initial={data.top3[2].avatar} size={40} bgColor="#CD7F32" />
                        <div className="text-center mt-1">
                          <div className="text-xs font-bold text-gray-900">#{3}</div>
                          <div className="text-xs font-semibold text-gray-900">{data.top3[2].name}</div>
                          <div className="text-xs text-gray-600">{formatMetricValue(data.top3[2].value, 'practice')}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-center pt-3 border-t border-gray-200">
                    <p className="text-sm font-semibold text-gray-700">
                      Your Rank: <span className="text-[#014421]">#{data.userRank}</span> | <span className="text-[#FFA500]">{formatMetricValue(data.userValue, 'practice')}</span>
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Rounds Leaderboard */}
            {(() => {
              const data = roundsLeaderboard;
              return (
                <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
                  <h3 className="text-base font-semibold text-gray-900 mb-3 text-center">Rounds</h3>
                  
                  <div className="flex items-end justify-center gap-2 mb-4">
                    {data.top3[1] && (
                      <div className="flex flex-col items-center">
                        <CircularAvatar initial={data.top3[1].avatar} size={40} bgColor="#C0C0C0" />
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
                        <CircularAvatar initial={data.top3[0].avatar} size={50} bgColor="#FFA500" />
                        <div className="text-center mt-1">
                          <div className="text-sm font-bold text-gray-900">#{1}</div>
                          <div className="text-xs font-semibold text-gray-900">{data.top3[0].name}</div>
                          <div className="text-xs text-gray-600">{formatMetricValue(data.top3[0].value, 'rounds')}</div>
                        </div>
                      </div>
                    )}
                    {data.top3[2] && (
                      <div className="flex flex-col items-center">
                        <CircularAvatar initial={data.top3[2].avatar} size={40} bgColor="#CD7F32" />
                        <div className="text-center mt-1">
                          <div className="text-xs font-bold text-gray-900">#{3}</div>
                          <div className="text-xs font-semibold text-gray-900">{data.top3[2].name}</div>
                          <div className="text-xs text-gray-600">{formatMetricValue(data.top3[2].value, 'rounds')}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-center pt-3 border-t border-gray-200">
                    <p className="text-sm font-semibold text-gray-700">
                      Your Rank: <span className="text-[#014421]">#{data.userRank}</span> | <span className="text-[#FFA500]">{formatMetricValue(data.userValue, 'rounds')}</span>
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Drills Leaderboard */}
            {(() => {
              const data = drillsLeaderboard;
              return (
                <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
                  <h3 className="text-base font-semibold text-gray-900 mb-3 text-center">Drills</h3>
                  
                  <div className="flex items-end justify-center gap-2 mb-4">
                    {data.top3[1] && (
                      <div className="flex flex-col items-center">
                        <CircularAvatar initial={data.top3[1].avatar} size={40} bgColor="#C0C0C0" />
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
                        <CircularAvatar initial={data.top3[0].avatar} size={50} bgColor="#FFA500" />
                        <div className="text-center mt-1">
                          <div className="text-sm font-bold text-gray-900">#{1}</div>
                          <div className="text-xs font-semibold text-gray-900">{data.top3[0].name}</div>
                          <div className="text-xs text-gray-600">{formatMetricValue(data.top3[0].value, 'drills')}</div>
                        </div>
                      </div>
                    )}
                    {data.top3[2] && (
                      <div className="flex flex-col items-center">
                        <CircularAvatar initial={data.top3[2].avatar} size={40} bgColor="#CD7F32" />
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
                      Your Rank: <span className="text-[#014421]">#{data.userRank}</span> | <span className="text-[#FFA500]">{formatMetricValue(data.userValue, 'drills')}</span>
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Metric Selection - Wrapping Pills */}
        <div className="mb-4 w-full">
          <div className="flex items-center gap-2 flex-wrap pb-2">
            {(['xp', 'library', 'practice', 'rounds', 'drills'] as const).map((metric) => {
              const labels = {
                xp: 'XP',
                library: 'Library',
                practice: 'Practice',
                rounds: 'Rounds',
                drills: 'Drills'
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
            <div className="flex items-end justify-center gap-3">
              {/* 2nd Place */}
              {top3[1] && (
                <div className="flex flex-col items-center">
                  <CircularAvatar 
                    initial={top3[1].avatar || top3[1].name[0]} 
                    size={60}
                    bgColor="#C0C0C0"
                  />
                  <div className="text-center mt-2">
                    <div className="text-sm font-bold text-gray-900">#{2}</div>
                    <div className="text-sm font-semibold text-gray-900">{top3[1].name}</div>
                    <div className="text-xs text-gray-600">{formatLeaderboardValue(top3[1].value, leaderboardMetric)}</div>
                  </div>
                </div>
              )}
              
              {/* 1st Place - Center, Higher, with Crown */}
              {top3[0] && (
                <div className="flex flex-col items-center">
                  <Crown className="w-6 h-6 mb-1" style={{ color: '#FFA500' }} />
                  <CircularAvatar 
                    initial={top3[0].avatar || top3[0].name[0]} 
                    size={80}
                    bgColor="#FFA500"
                  />
                  <div className="text-center mt-2">
                    <div className="text-base font-bold text-gray-900">#{1}</div>
                    <div className="text-base font-semibold text-gray-900">{top3[0].name}</div>
                    <div className="text-xs text-gray-600">{formatLeaderboardValue(top3[0].value, leaderboardMetric)}</div>
                  </div>
                </div>
              )}
              
              {/* 3rd Place */}
              {top3[2] && (
                <div className="flex flex-col items-center">
                  <CircularAvatar 
                    initial={top3[2].avatar || top3[2].name[0]} 
                    size={60}
                    bgColor="#CD7F32"
                  />
                  <div className="text-center mt-2">
                    <div className="text-sm font-bold text-gray-900">#{3}</div>
                    <div className="text-sm font-semibold text-gray-900">{top3[2].name}</div>
                    <div className="text-xs text-gray-600">{formatLeaderboardValue(top3[2].value, leaderboardMetric)}</div>
                  </div>
                </div>
              )}
            </div>
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
            
            {!showFullLeaderboard ? (
              <div className="space-y-3">
                {ranks4to7.map((entry) => {
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
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold text-sm ${entry.id === 'user' ? 'text-[#014421]' : 'text-gray-900'}`}>
                          {entry.name}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: '#FFA500' }}>
                          {formatLeaderboardValue(entry.value, leaderboardMetric)}
                        </span>
                        {entry.movedUp && (
                          <TrendingUp className="w-4 h-4" style={{ color: '#10B981' }} />
                        )}
                        {entry.movedDown && (
                          <TrendingDown className="w-4 h-4" style={{ color: '#EF4444' }} />
                        )}
                        {!entry.movedUp && !entry.movedDown && entry.rankChange === 0 && (
                          <div className="w-4 h-4" />
                        )}
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
                    filteredFullLeaderboard.map((entry) => {
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
                          <div className="flex-shrink-0 w-12 text-center">
                            {isTop3 && entry.rank === 1 && <Crown className="w-5 h-5 mx-auto mb-1" style={{ color: '#FFA500' }} />}
                            <span className={`text-sm font-bold ${entry.id === 'user' || isTop3 ? 'text-[#014421]' : 'text-gray-600'}`}>
                              #{entry.rank}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold text-sm ${entry.id === 'user' ? 'text-[#014421]' : 'text-gray-900'}`}>
                              {entry.name}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold" style={{ color: '#FFA500' }}>
                              {formatLeaderboardValue(entry.value, leaderboardMetric)}
                            </span>
                            {entry.movedUp && (
                              <TrendingUp className="w-4 h-4" style={{ color: '#10B981' }} />
                            )}
                            {entry.movedDown && (
                              <TrendingDown className="w-4 h-4" style={{ color: '#EF4444' }} />
                            )}
                            {!entry.movedUp && !entry.movedDown && entry.rankChange === 0 && (
                              <div className="w-4 h-4" />
                            )}
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
