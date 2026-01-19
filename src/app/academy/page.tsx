"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Trophy,
  Award,
  Medal,
  Crown,
  TrendingUp,
  TrendingDown,
  Search,
  X,
  Lock,
  Target,
  BookOpen,
  Clock,
  Zap,
  Star,
  Flame,
  Pencil,
  Check,
  User,
  Eye,
  EyeOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GOLF_ICONS } from "@/components/IconPicker";
import TrophyCard from "@/components/TrophyCard";

interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  handicap: number;
  tier: "Bronze" | "Silver" | "Gold" | "Platinum";
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
const getLevel = (tier: "Bronze" | "Silver" | "Gold" | "Platinum"): string => {
  switch (tier) {
    case "Platinum":
      return "Level 4: Elite";
    case "Gold":
      return "Level 3: Elite";
    case "Silver":
      return "Level 2: Advanced";
    case "Bronze":
      return "Level 1: Foundation";
  }
};

// Trophy/Achievement data structure
interface TrophyData {
  id: string;
  name: string;
  requirement: string;
  category:
    | "Practice"
    | "Knowledge"
    | "Performance"
    | "Milestone"
    | "Scoring Milestones";
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
    id: "first-steps",
    name: "First Steps",
    requirement: "Complete 1 hour of practice",
    category: "Practice",
    icon: Clock,
    checkUnlocked: (stats) => stats.practiceHours >= 1,
    getProgress: (stats) => ({
      current: stats.practiceHours,
      target: 1,
      percentage: Math.min(100, (stats.practiceHours / 1) * 100),
    }),
  },
  {
    id: "dedicated",
    name: "Dedicated",
    requirement: "Complete 10 hours of practice",
    category: "Practice",
    icon: Clock,
    checkUnlocked: (stats) => stats.practiceHours >= 10,
    getProgress: (stats) => ({
      current: stats.practiceHours,
      target: 10,
      percentage: Math.min(100, (stats.practiceHours / 10) * 100),
    }),
  },
  {
    id: "practice-master",
    name: "Practice Master",
    requirement: "Complete 50 hours of practice",
    category: "Practice",
    icon: Target,
    checkUnlocked: (stats) => stats.practiceHours >= 50,
    getProgress: (stats) => ({
      current: stats.practiceHours,
      target: 50,
      percentage: Math.min(100, (stats.practiceHours / 50) * 100),
    }),
  },
  {
    id: "practice-legend",
    name: "Practice Legend",
    requirement: "Complete 100 hours of practice",
    category: "Practice",
    icon: Flame,
    checkUnlocked: (stats) => stats.practiceHours >= 100,
    getProgress: (stats) => ({
      current: stats.practiceHours,
      target: 100,
      percentage: Math.min(100, (stats.practiceHours / 100) * 100),
    }),
  },
  // Knowledge Trophies
  {
    id: "student",
    name: "Student",
    requirement: "Complete 5 lessons",
    category: "Knowledge",
    icon: BookOpen,
    checkUnlocked: (stats) => stats.completedLessons >= 5,
    getProgress: (stats) => ({
      current: stats.completedLessons,
      target: 5,
      percentage: Math.min(100, (stats.completedLessons / 5) * 100),
    }),
  },
  {
    id: "scholar",
    name: "Scholar",
    requirement: "Complete 20 lessons",
    category: "Knowledge",
    icon: BookOpen,
    checkUnlocked: (stats) => stats.completedLessons >= 20,
    getProgress: (stats) => ({
      current: stats.completedLessons,
      target: 20,
      percentage: Math.min(100, (stats.completedLessons / 20) * 100),
    }),
  },
  {
    id: "expert",
    name: "Expert",
    requirement: "Complete 50 lessons",
    category: "Knowledge",
    icon: BookOpen,
    checkUnlocked: (stats) => stats.completedLessons >= 50,
    getProgress: (stats) => ({
      current: stats.completedLessons,
      target: 50,
      percentage: Math.min(100, (stats.completedLessons / 50) * 100),
    }),
  },
  // Performance Trophies
  {
    id: "first-round",
    name: "First Round",
    requirement: "Log your first round",
    category: "Performance",
    icon: Trophy,
    checkUnlocked: (stats) => stats.rounds >= 1,
    getProgress: (stats) => ({
      current: stats.rounds,
      target: 1,
      percentage: Math.min(100, (stats.rounds / 1) * 100),
    }),
  },
  {
    id: "consistent",
    name: "Consistent",
    requirement: "Log 10 rounds",
    category: "Performance",
    icon: Trophy,
    checkUnlocked: (stats) => stats.rounds >= 10,
    getProgress: (stats) => ({
      current: stats.rounds,
      target: 10,
      percentage: Math.min(100, (stats.rounds / 10) * 100),
    }),
  },
  {
    id: "tracker",
    name: "Tracker",
    requirement: "Log 25 rounds",
    category: "Performance",
    icon: Trophy,
    checkUnlocked: (stats) => stats.rounds >= 25,
    getProgress: (stats) => ({
      current: stats.rounds,
      target: 25,
      percentage: Math.min(100, (stats.rounds / 25) * 100),
    }),
  },
  // Milestone Trophies
  {
    id: "rising-star",
    name: "Rising Star",
    requirement: "Earn 1,000 XP",
    category: "Milestone",
    icon: Star,
    checkUnlocked: (stats) => stats.totalXP >= 1000,
    getProgress: (stats) => ({
      current: stats.totalXP,
      target: 1000,
      percentage: Math.min(100, (stats.totalXP / 1000) * 100),
    }),
  },
  {
    id: "champion",
    name: "Champion",
    requirement: "Earn 5,000 XP",
    category: "Milestone",
    icon: Zap,
    checkUnlocked: (stats) => stats.totalXP >= 5000,
    getProgress: (stats) => ({
      current: stats.totalXP,
      target: 5000,
      percentage: Math.min(100, (stats.totalXP / 5000) * 100),
    }),
  },
  {
    id: "elite",
    name: "Elite",
    requirement: "Earn 10,000 XP",
    category: "Milestone",
    icon: Crown,
    checkUnlocked: (stats) => stats.totalXP >= 10000,
    getProgress: (stats) => ({
      current: stats.totalXP,
      target: 10000,
      percentage: Math.min(100, (stats.totalXP / 10000) * 100),
    }),
  },
  {
    id: "goal-achiever",
    name: "Goal Achiever",
    requirement: "Reach 8.7 handicap",
    category: "Milestone",
    icon: Medal,
    checkUnlocked: (stats) => stats.handicap <= 8.7,
    getProgress: (stats) => {
      const startHandicap = 12.0;
      const goalHandicap = 8.7;
      const improvement = startHandicap - stats.handicap;
      const totalNeeded = startHandicap - goalHandicap;
      const percentage = Math.min(
        100,
        Math.max(0, (improvement / totalNeeded) * 100),
      );
      return { current: stats.handicap, target: goalHandicap, percentage };
    },
  },
  // Scoring Milestones
  {
    id: "birdie-hunter",
    name: "Birdie Hunter",
    requirement: "Log 1 Birdie in a round",
    category: "Performance",
    icon: Target,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some((round: any) => (round.birdies || 0) >= 1);
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 0, target: 1, percentage: 0 };
      }
      const hasBirdie = stats.roundsData.some(
        (round: any) => (round.birdies || 0) >= 1,
      );
      return {
        current: hasBirdie ? 1 : 0,
        target: 1,
        percentage: hasBirdie ? 100 : 0,
      };
    },
  },
  {
    id: "breaking-90",
    name: "Breaking 90",
    requirement: "Score below 90 in a round",
    category: "Performance",
    icon: Trophy,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some(
        (round: any) => round.score !== null && round.score < 90,
      );
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 90, target: 89, percentage: 0 };
      }
      const bestScore = Math.min(
        ...stats.roundsData
          .map((r: any) => (r.score !== null ? r.score : 999))
          .filter((s: number) => s < 999),
      );
      const target = 89;
      const percentage =
        bestScore < 90
          ? 100
          : Math.max(0, ((90 - bestScore) / (90 - target)) * 100);
      return {
        current: bestScore < 999 ? bestScore : 90,
        target: target,
        percentage: Math.min(100, percentage),
      };
    },
  },
  {
    id: "breaking-80",
    name: "Breaking 80",
    requirement: "Score below 80 in a round",
    category: "Performance",
    icon: Trophy,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some(
        (round: any) => round.score !== null && round.score < 80,
      );
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 90, target: 79, percentage: 0 };
      }
      const bestScore = Math.min(
        ...stats.roundsData
          .map((r: any) => (r.score !== null ? r.score : 999))
          .filter((s: number) => s < 999),
      );
      const target = 79;
      const percentage =
        bestScore < 80
          ? 100
          : Math.max(0, ((80 - bestScore) / (80 - target)) * 100);
      return {
        current: bestScore < 999 ? bestScore : 90,
        target: target,
        percentage: Math.min(100, percentage),
      };
    },
  },
  {
    id: "breaking-70",
    name: "Breaking 70",
    requirement: "Score below 70 in a round",
    category: "Scoring Milestones",
    icon: Trophy,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some(
        (round: any) => round.score !== null && round.score < 70,
      );
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 90, target: 69, percentage: 0 };
      }
      const bestScore = Math.min(
        ...stats.roundsData
          .map((r: any) => (r.score !== null ? r.score : 999))
          .filter((s: number) => s < 999),
      );
      const target = 69;
      const percentage =
        bestScore < 70
          ? 100
          : Math.max(0, ((70 - bestScore) / (70 - target)) * 100);
      return {
        current: bestScore < 999 ? bestScore : 90,
        target: target,
        percentage: Math.min(100, percentage),
      };
    },
  },
  {
    id: "eagle-eye",
    name: "Eagle Eye",
    requirement: "Score an Eagle in a round",
    category: "Scoring Milestones",
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
      const hasEagle = stats.roundsData.some(
        (round: any) => (round.eagles || 0) >= 1,
      );
      return {
        current: hasEagle ? 1 : 0,
        target: 1,
        percentage: hasEagle ? 100 : 0,
      };
    },
  },
  {
    id: "birdie-machine",
    name: "Birdie Machine",
    requirement: "Score 5 Birdies in a single round",
    category: "Scoring Milestones",
    icon: Zap,
    checkUnlocked: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) return false;
      return stats.roundsData.some((round: any) => (round.birdies || 0) >= 5);
    },
    getProgress: (stats) => {
      if (!stats.roundsData || stats.roundsData.length === 0) {
        return { current: 0, target: 5, percentage: 0 };
      }
      const maxBirdies = Math.max(
        ...stats.roundsData.map((r: any) => r.birdies || 0),
      );
      return {
        current: maxBirdies,
        target: 5,
        percentage: Math.min(100, (maxBirdies / 5) * 100),
      };
    },
  },
  {
    id: "par-train",
    name: "Par Train",
    requirement: "Score 5 consecutive pars in a round",
    category: "Scoring Milestones",
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
      const maxPars = Math.max(
        ...stats.roundsData.map((r: any) => r.pars || 0),
      );
      return {
        current: maxPars,
        target: 5,
        percentage: Math.min(100, (maxPars / 5) * 100),
      };
    },
  },
  {
    id: "week-warrior",
    name: "Week Warrior",
    requirement: "Practice 3 days in a row",
    category: "Practice",
    icon: Flame,
    checkUnlocked: (stats) => {
      if (!stats.practiceHistory || stats.practiceHistory.length === 0)
        return false;
      // Get unique practice dates, sorted
      const practiceDates = [
        ...new Set(
          stats.practiceHistory.map((entry: any) => {
            const date = new Date(entry.timestamp || entry.date);
            return date.toISOString().split("T")[0]; // YYYY-MM-DD
          }),
        ),
      ].sort();

      // Check for 3 consecutive days
      for (let i = 0; i < practiceDates.length - 2; i++) {
        const date1 = new Date(practiceDates[i]);
        const date2 = new Date(practiceDates[i + 1]);
        const date3 = new Date(practiceDates[i + 2]);

        // Check if dates are consecutive
        date1.setDate(date1.getDate() + 1);
        date2.setDate(date2.getDate() + 1);
        if (
          date1.toISOString().split("T")[0] === practiceDates[i + 1] &&
          date2.toISOString().split("T")[0] === practiceDates[i + 2]
        ) {
          return true;
        }
      }
      return false;
    },
    getProgress: (stats) => {
      if (!stats.practiceHistory || stats.practiceHistory.length === 0) {
        return { current: 0, target: 3, percentage: 0 };
      }
      const practiceDates = [
        ...new Set(
          stats.practiceHistory.map((entry: any) => {
            const date = new Date(entry.timestamp || entry.date);
            return date.toISOString().split("T")[0];
          }),
        ),
      ].sort();

      let maxConsecutive = 0;
      let currentConsecutive = 1;
      for (let i = 1; i < practiceDates.length; i++) {
        const prevDate = new Date(practiceDates[i - 1]);
        const currDate = new Date(practiceDates[i]);
        prevDate.setDate(prevDate.getDate() + 1);
        if (prevDate.toISOString().split("T")[0] === practiceDates[i]) {
          currentConsecutive++;
        } else {
          maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
          currentConsecutive = 1;
        }
      }
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      return {
        current: maxConsecutive,
        target: 3,
        percentage: Math.min(100, (maxConsecutive / 3) * 100),
      };
    },
  },
  {
    id: "monthly-legend",
    name: "Monthly Legend",
    requirement: "Log 20 total hours in a month",
    category: "Practice",
    icon: Crown,
    checkUnlocked: (stats) => {
      if (!stats.practiceHistory || stats.practiceHistory.length === 0)
        return false;
      // Group practice by month
      const monthlyHours: Record<string, number> = {};
      stats.practiceHistory.forEach((entry: any) => {
        const date = new Date(entry.timestamp || entry.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const minutes =
          entry.duration || entry.estimatedMinutes || entry.xp / 10 || 0;
        monthlyHours[monthKey] = (monthlyHours[monthKey] || 0) + minutes / 60;
      });
      return Object.values(monthlyHours).some((hours) => hours >= 20);
    },
    getProgress: (stats) => {
      if (!stats.practiceHistory || stats.practiceHistory.length === 0) {
        return { current: 0, target: 20, percentage: 0 };
      }
      const monthlyHours: Record<string, number> = {};
      stats.practiceHistory.forEach((entry: any) => {
        const date = new Date(entry.timestamp || entry.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const minutes =
          entry.duration || entry.estimatedMinutes || entry.xp / 10 || 0;
        monthlyHours[monthKey] = (monthlyHours[monthKey] || 0) + minutes / 60;
      });
      const maxHours = Math.max(...Object.values(monthlyHours), 0);
      return {
        current: maxHours,
        target: 20,
        percentage: Math.min(100, (maxHours / 20) * 100),
      };
    },
  },
  {
    id: "putting-professor",
    name: "Putting Professor",
    requirement: "Complete all Putting category lessons",
    category: "Knowledge",
    icon: BookOpen,
    checkUnlocked: (stats) => {
      if (!stats.libraryCategories) return false;
      // Check if user has completed at least 5 Putting category drills (as a proxy for "all")
      return (stats.libraryCategories["Putting"] || 0) >= 5;
    },
    getProgress: (stats) => {
      const puttingCount = stats.libraryCategories?.["Putting"] || 0;
      return {
        current: puttingCount,
        target: 5,
        percentage: Math.min(100, (puttingCount / 5) * 100),
      };
    },
  },
  {
    id: "wedge-wizard",
    name: "Wedge Wizard",
    requirement: "Complete all Wedge Play category lessons",
    category: "Knowledge",
    icon: BookOpen,
    checkUnlocked: (stats) => {
      if (!stats.libraryCategories) return false;
      // Check if user has completed at least 5 Wedge Play category drills
      return (stats.libraryCategories["Wedge Play"] || 0) >= 5;
    },
    getProgress: (stats) => {
      const wedgeCount = stats.libraryCategories?.["Wedge Play"] || 0;
      return {
        current: wedgeCount,
        target: 5,
        percentage: Math.min(100, (wedgeCount / 5) * 100),
      };
    },
  },
  {
    id: "coachs-pet",
    name: "Coach's Pet",
    requirement: 'Complete a recommended drill from "Most Needed to Improve"',
    category: "Performance",
    icon: Award,
    checkUnlocked: (stats) => {
      if (typeof window === "undefined") return false;
      try {
        // Check if user has completed any recommended drills
        // Recommended drills are stored when user clicks the "Most Needed to Improve" card
        const recommendedDrills = JSON.parse(
          localStorage.getItem("recommendedDrills") || "[]",
        );
        const userProgress = JSON.parse(
          localStorage.getItem("userProgress") || "{}",
        );
        const completedDrillIds = userProgress.completedDrills || [];
        const drillCompletions = userProgress.drillCompletions || {};

        // Check if any recommended drill has been completed
        return recommendedDrills.some(
          (drillId: string) =>
            completedDrillIds.includes(drillId) ||
            (drillCompletions[drillId] && drillCompletions[drillId] > 0),
        );
      } catch (e) {
        return false;
      }
    },
    getProgress: (stats) => {
      if (typeof window === "undefined") {
        return { current: 0, target: 1, percentage: 0 };
      }
      try {
        const recommendedDrills = JSON.parse(
          localStorage.getItem("recommendedDrills") || "[]",
        );
        const userProgress = JSON.parse(
          localStorage.getItem("userProgress") || "{}",
        );
        const completedDrillIds = userProgress.completedDrills || [];
        const drillCompletions = userProgress.drillCompletions || {};

        const completedCount = recommendedDrills.filter(
          (drillId: string) =>
            completedDrillIds.includes(drillId) ||
            (drillCompletions[drillId] && drillCompletions[drillId] > 0),
        ).length;

        return {
          current: completedCount,
          target: 1,
          percentage: Math.min(100, (completedCount / 1) * 100),
        };
      } catch (e) {
        return { current: 0, target: 1, percentage: 0 };
      }
    },
  },
];

// Helper function to get timeframe dates
function getTimeframeDates(timeFilter: "week" | "month" | "year" | "allTime") {
  const now = new Date();
  let startDate: Date;

  if (timeFilter === "week") {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
  } else if (timeFilter === "month") {
    startDate = new Date(now);
    startDate.setMonth(now.getMonth() - 1);
  } else if (timeFilter === "year") {
    startDate = new Date(now);
    startDate.setFullYear(now.getFullYear() - 1);
  } else {
    startDate = new Date(0); // All time
  }

  return { startDate, endDate: now };
}

// Calculate rounds count for a specific user
function calculateUserRounds(
  rounds: any[],
  timeFilter: "week" | "month" | "year" | "allTime",
  userId?: string,
) {
  // Verify the Variable: Make sure leaderboardData is being calculated using the rounds from StatsContext and that it isn't being filtered out by a mismatching user_id
  console.log("calculateUserRounds: Input rounds count:", rounds?.length || 0);
  console.log("calculateUserRounds: Filtering for user_id:", userId);
  console.log("calculateUserRounds: TimeFilter:", timeFilter);

  if (!rounds || rounds.length === 0) {
    console.log("calculateUserRounds: No rounds provided, returning 0");
    return 0;
  }

  const { startDate } = getTimeframeDates(timeFilter);
  // Find the Top 3 Render: Replace placeholder with actual count of rounds for that user
  // Verify StatsContext: Ensure the data coming from StatsContext is being passed into the leaderboard calculation correctly
  const userRounds = rounds.filter((round) => {
    // Filter by user_id if provided
    if (userId && round.user_id !== userId) {
      console.log(
        "calculateUserRounds: Round filtered out - user_id mismatch:",
        round.user_id,
        "vs",
        userId,
      );
      return false;
    }
    // Filter by timeframe
    if (timeFilter === "allTime") return true;
    const roundDate = new Date(round.date || round.created_at);
    const isInTimeframe = roundDate >= startDate;
    if (!isInTimeframe) {
      console.log(
        "calculateUserRounds: Round filtered out - outside timeframe:",
        roundDate,
        "vs",
        startDate,
      );
    }
    return isInTimeframe;
  });

  console.log(
    "calculateUserRounds: Filtered userRounds count:",
    userRounds.length,
  );
  return userRounds.length;
}

// Calculate practice time (in hours)
function calculateUserPracticeTime(
  timeFilter: "week" | "month" | "year" | "allTime",
) {
  if (typeof window === "undefined") return 0;
  try {
    const { startDate } = getTimeframeDates(timeFilter);
    const practiceHistory = JSON.parse(
      localStorage.getItem("practiceActivityHistory") || "[]",
    );

    const filteredHistory = practiceHistory.filter((entry: any) => {
      if (timeFilter === "allTime") return true;
      const entryDate = new Date(entry.timestamp || entry.date);
      return entryDate >= startDate;
    });

    // Sum minutes from practice history
    const totalMinutes = filteredHistory.reduce((sum: number, entry: any) => {
      // Estimate minutes from XP (10 XP per minute for drills)
      return sum + (entry.xp / 10 || 0);
    }, 0);

    // Also check totalPracticeMinutes from localStorage
    const savedMinutes = parseInt(
      localStorage.getItem("totalPracticeMinutes") || "0",
    );

    return (totalMinutes + savedMinutes) / 60; // Convert to hours
  } catch (error) {
    return 0;
  }
}

// Calculate drills count
function calculateUserDrills(
  timeFilter: "week" | "month" | "year" | "allTime",
) {
  if (typeof window === "undefined") return 0;
  try {
    const { startDate } = getTimeframeDates(timeFilter);
    const practiceHistory = JSON.parse(
      localStorage.getItem("practiceActivityHistory") || "[]",
    );

    const filteredHistory = practiceHistory.filter((entry: any) => {
      if (timeFilter === "allTime") return true;
      const entryDate = new Date(entry.timestamp || entry.date);
      return entryDate >= startDate;
    });

    // Count unique drill completions
    const uniqueDrills = new Set(
      filteredHistory
        .map((entry: any) => entry.drillTitle || entry.title)
        .filter(Boolean),
    );
    return uniqueDrills.size;
  } catch (error) {
    return 0;
  }
}

// Calculate library lessons count (completed lessons with both video and text)
function calculateUserLibraryLessons(
  timeFilter: "week" | "month" | "year" | "allTime",
) {
  if (typeof window === "undefined") return 0;
  try {
    const { startDate } = getTimeframeDates(timeFilter);
    const savedProgress = localStorage.getItem("userProgress");
    if (!savedProgress) return 0;

    const progress = JSON.parse(savedProgress);
    const completedDrillIds = progress.completedDrills || [];

    // Count completed library items (lessons)
    // Filter by timeframe using practice activity history if available
    if (timeFilter === "allTime") {
      return completedDrillIds.length;
    }

    // Try to filter by timeframe using practice activity history
    try {
      const practiceHistory = JSON.parse(
        localStorage.getItem("practiceActivityHistory") || "[]",
      );
      const filteredHistory = practiceHistory.filter((entry: any) => {
        const entryDate = new Date(entry.timestamp || entry.date);
        return entryDate >= startDate && entry.type === "practice";
      });

      // Count unique drill IDs from filtered history
      const uniqueDrillIds = new Set(
        filteredHistory
          .map((entry: any) => entry.drillTitle || entry.id)
          .filter(Boolean),
      );
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
function formatMetricValue(
  value: number,
  metric: "library" | "practice" | "rounds" | "drills",
) {
  switch (metric) {
    case "library":
      return `${value} Lesson${value !== 1 ? "s" : ""}`;
    case "practice":
      return `${value.toFixed(1)} hrs`;
    case "rounds":
      return `${value} Round${value !== 1 ? "s" : ""}`;
    case "drills":
      return `${value} Drill${value !== 1 ? "s" : ""}`;
    default:
      return `${value}`;
  }
}

// Helper function: Get display name with proper fallback (full_name first, then email prefix)
function getDisplayName(
  profile?: { full_name?: string },
  email?: string,
): string {
  // Name Fallback: Check for full_name first
  if (profile?.full_name) {
    return profile.full_name;
  }
  // Name Fallback: If full_name is empty, use the part of the email before the '@'
  if (email && email.includes("@")) {
    return email.split("@")[0];
  }
  return "Anonymous User";
}

// Helper function: Get avatar/icon with proper fallback (profile_icon from database, then first initial)
function getAvatarIcon(
  profile?: { full_name?: string; profile_icon?: string },
  displayName?: string,
): string {
  // Show User Icons: Ensure avatars pull profile_icon from profiles table first
  if (profile?.profile_icon) {
    return profile.profile_icon;
  }
  // Fallback: First initial in a colored circle
  if (profile?.full_name) {
    return (
      profile.full_name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase() || "U"
    );
  }
  if (displayName && !displayName.includes("@")) {
    return (
      displayName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase() || "U"
    );
  }
  return "U";
}

// Create a Name Lookup: Fetch full_name, profile_icon, and xp for each user_id
// Name Mapping: Match the user_id from the practice table (or rounds/drills) to the id in the profiles table to display their real names
// Update fetchUserProfiles to include XP column from profiles table
// Verify Name Fetching: Ensure loadProfiles is fetching every single row from the profiles table
// Debug Log: Add console.log('Available Profiles:', profiles) to the load function so I can see in the browser if Stuart and Sean's names are actually being loaded
async function fetchUserProfiles(
  userIds: string[],
): Promise<
  Map<string, { full_name?: string; profile_icon?: string; xp?: number }>
> {
  const profileMap = new Map<
    string,
    { full_name?: string; profile_icon?: string; xp?: number }
  >();

  if (userIds.length === 0) {
    console.warn(
      "fetchUserProfiles: No user IDs provided, returning empty map",
    );
    return profileMap;
  }

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // Verify Name Fetching: Log the user IDs we're looking for
    console.log(
      "fetchUserProfiles: Looking for profiles for",
      userIds.length,
      "user IDs:",
      userIds,
    );

    // Verify Name Fetching: Also fetch ALL profiles to verify we're getting everything
    // This helps debug if we're missing profiles
    // Column Safety: Ensure the query only asks for columns we know exist: id, full_name, and xp
    // Prevent Crashes: If allProfilesData comes back as undefined or empty, initialize it as an empty array [] so the .map() function doesn't break the app
    let allProfilesData: any[] = [];
    try {
      // Sanitize Column Names: Update the .select() to strictly use id, full_name, xp
      // Completely remove email, avatar_url, and total_xp to stop the 42703 SQL errors
      // Fix Registration: Fetch ALL profiles from Supabase (not just current user) for complete leaderboard
      const { data: allProfiles, error: allProfilesError } = await supabase
        .from("profiles")
        .select("id, full_name, xp");

      if (allProfilesError) {
        // Debug the Error: Full error object with JSON.stringify to see actual message
        console.error("Full Error Object:", JSON.stringify(allProfilesError, null, 2));
      } else {
        // Restore Data: Ensure allProfilesData is correctly set so XP totals populate the leaderboard
        allProfilesData = allProfiles || [];
        console.log("Restore Data: allProfilesData set with", allProfilesData.length, "profiles");
        if (allProfilesData.length > 0) {
          console.log("Restore Data: Sample XP values:", allProfilesData.slice(0, 3).map((p: any) => ({
            id: p.id,
            full_name: p.full_name,
            xp: p.xp || 0 // Default Zero: Use profile.xp || 0 in the display so it registers a number even for new players
          })));
        }
      }
    } catch (allProfilesErr: any) {
      // Debug the Error: Full error object with JSON.stringify to see actual message
      console.error("Full Error Object (Exception):", JSON.stringify(allProfilesErr, null, 2));
      allProfilesData = [];
    }

    // Prevent Crashes: Initialize as empty array if undefined
    const safeAllProfiles = allProfilesData || [];
    console.log(
      "fetchUserProfiles: ALL profiles in database:",
      safeAllProfiles.map((p: any) => ({
        id: p.id,
        full_name: p.full_name || "Anonymous User",
        xp: p.xp,
      })),
    );
    console.log(
      "fetchUserProfiles: Total profiles in database:",
      safeAllProfiles.length,
    );

    // Name Mapping: Match user_id from practice/rounds/drills tables to id in profiles table
    // Show User Icons: Fetch profile_icon from profiles table for avatar display
    // Sanitize Column Names: Update the .select() to strictly use id, full_name, xp
    // Completely remove email, avatar_url, and total_xp to stop the 42703 SQL errors
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, xp")
      .in("id", userIds);

    if (error) {
      // Debug the Error: Full error object with JSON.stringify to see actual message
      console.error("Full Error Object:", JSON.stringify(error, null, 2));
      return profileMap;
    }

    // Prevent Crashes: Initialize as empty array if undefined
    const safeData = data || [];

    // Debug Log: Add console.log('Available Profiles:', profiles) to the load function
    console.log("Available Profiles:", safeData);
    console.log(
      "fetchUserProfiles: Raw data from Supabase:",
      safeData.map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        xp: p.xp,
      })),
    );

    // Map IDs to Names: Create a map of user_id -> { full_name, profile_icon, xp }
    // The key is the user_id from practice/rounds/drills, which matches the id in profiles table
    // Update fetchUserProfiles to include XP column from profiles table
    safeData.forEach((profile: any) => {
      // Name Mapping: user_id from practice table matches id in profiles table
      // Show User Icons: Include profile_icon from database for avatar display
      // Standardize Fallback: Use (profile.xp || 0) to ensure we aren't trying to add undefined or NaN to the state
      const xpValue = profile.xp || 0;
      profileMap.set(profile.id, {
        full_name: profile.full_name,
        profile_icon: undefined, // Clean Data Fetch: Removed profile_icon from query - using fallback logic elsewhere
        xp: xpValue, // Standardize Fallback: Use (profile.xp || 0) to ensure we aren't trying to add undefined or NaN to the state
      });
      console.log(
        `fetchUserProfiles: Mapped ${profile.id} -> ${profile.full_name || "Anonymous User"}`,
      );
    });

    // Check for missing profiles
    const missingIds = userIds.filter((id) => !profileMap.has(id));
    if (missingIds.length > 0) {
      console.warn(
        "fetchUserProfiles: Missing profiles for user IDs:",
        missingIds,
      );
      console.warn(
        "These user IDs were requested but not found in the profiles table",
      );
    }

    console.log(
      "Fetched profiles for",
      profileMap.size,
      "users:",
      Array.from(profileMap.entries()).map(([id, data]) => ({
        id,
        name: data.full_name || "Anonymous User",
        xp: data.xp,
      })),
    );
  } catch (error: any) {
    console.error("Error in fetchUserProfiles:", error);
    // Error Catching: In the catch block for the profile fetch, add console.log('SQL Query Error:', error.message)
    console.log(
      "SQL Query Error (catch block):",
      error?.message || "Unknown error",
    );
    console.log("SQL Query Error (full error):", error);
  }

  return profileMap;
}

// Generate mock leaderboard data for a specific metric (four-pillar cards)
function getMockLeaderboard(
  metric: "library" | "practice" | "rounds" | "drills",
  timeFilter: "week" | "month" | "year" | "allTime",
  rounds: any[],
  userName: string,
  user?: { id?: string; initialHandicap?: number; profileIcon?: string } | null,
  userProfiles?: Map<
    string,
    { full_name?: string; profile_icon?: string; xp?: number }
  >,
  drills?: any[],
  practiceSessions?: any[],
) {
  let userValue: number;

  switch (metric) {
    case "library":
      userValue = calculateUserLibraryLessons(timeFilter);
      break;
    case "practice":
      userValue = calculateUserPracticeTime(timeFilter);
      break;
    case "rounds":
      // Find the Top 3 Render: Replace placeholder with actual count of rounds for that user (e.g., userRounds.length)
      userValue = calculateUserRounds(rounds, timeFilter, user?.id);
      break;
    case "drills":
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
  if (metric === "drills") {
    // Global Fetch: Use drills from database (StatsContext) - already fetching all records without user_id filter
    // Remove User Filters: Process ALL drills from all users, not just current user
    const allDrills = drills || [];

    // Filter by timeframe if needed
    const { startDate } = getTimeframeDates(timeFilter);
    const filteredDrills = allDrills.filter((drill: any) => {
      if (timeFilter === "allTime") return true;
      const drillDate = new Date(
        drill.completed_at || drill.created_at || Date.now(),
      );
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
      // Fallback Logic: Since the email is gone, ensure the name display logic uses: profile.full_name || 'Anonymous User'
      const displayName = profile?.full_name || "Anonymous User";

      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = "U";
      if (profile?.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else if (displayName && displayName.length > 8) {
        nameForAvatar =
          displayName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
      }

      const userIcon = profile?.profile_icon || nameForAvatar;

      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: drillCount,
        isCurrentUser: user?.id === userId,
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
        userValue: 0,
      };
    }

    // Find current user's entry and value
    const currentUserEntry = allEntries.find((entry) => entry.isCurrentUser);
    userValue = currentUserEntry?.value || 0;

    const userEntryInSorted = allEntries.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value || userValue;

    console.log("getMockLeaderboard - drills metric (global):", {
      totalDrillsInDatabase: allDrills.length,
      totalUsers: allEntries.length,
      top3Values: allEntries
        .slice(0, 3)
        .map((e) => ({ name: e.name, value: e.value, id: e.id })),
      currentUserValue: finalUserValue,
    });

    return {
      top3: allEntries.slice(0, 3),
      all: allEntries,
      userRank: userEntryInSorted
        ? allEntries.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  // For practice metric, group all practice_sessions by user_id and create leaderboard entries for each user
  if (metric === "practice") {
    // Check Fetch Logic: Use practice_sessions from database (StatsContext) instead of localStorage
    // Remove User Filters: Process ALL practice_sessions from all users, not just current user
    const allPracticeSessions = practiceSessions || [];

    // Filter by timeframe if needed
    const { startDate } = getTimeframeDates(timeFilter);
    const filteredSessions = allPracticeSessions.filter((session: any) => {
      if (timeFilter === "allTime") return true;
      const sessionDate = new Date(
        session.practice_date || session.created_at || Date.now(),
      );
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
      // Fallback Logic: Since the email is gone, ensure the name display logic uses: profile.full_name || 'Anonymous User'
      const displayName = profile?.full_name || "Anonymous User";

      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = "U";
      if (profile?.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else if (displayName && displayName.length > 8) {
        nameForAvatar =
          displayName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
      }

      const userIcon = profile?.profile_icon || nameForAvatar;

      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: totalHours,
        isCurrentUser: user?.id === userId,
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
        userValue: 0,
      };
    }

    // Find current user's entry and value
    const currentUserEntry = allEntries.find((entry) => entry.isCurrentUser);
    userValue = currentUserEntry?.value || 0;

    const userEntryInSorted = allEntries.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value || userValue;

    console.log("getMockLeaderboard - practice metric (global):", {
      totalPracticeSessionsInDatabase: allPracticeSessions.length,
      totalUsers: allEntries.length,
      top3Values: allEntries
        .slice(0, 3)
        .map((e) => ({ name: e.name, value: e.value, id: e.id })),
      currentUserValue: finalUserValue,
    });

    return {
      top3: allEntries.slice(0, 3),
      all: allEntries,
      userRank: userEntryInSorted
        ? allEntries.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  // Remove User Filter: For global leaderboard, process ALL rounds from all users, not just current user
  // Connect Top 3: Ensure the 'Top 3 Leaders' card is pulling from this new global array instead of using a hardcoded mock object
  if (metric === "rounds") {
    // Filter by timeframe first (no user_id filter - get all users' rounds)
    const timeFilteredRounds = rounds.filter((round) => {
      if (timeFilter === "allTime") return true;
      const { startDate } = getTimeframeDates(timeFilter);
      const roundDate = new Date(round.date || round.created_at);
      return roundDate >= startDate;
    });

    // Group rounds by user_id to count rounds per user
    const roundsByUser = new Map<string, any[]>();
    timeFilteredRounds.forEach((round) => {
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
      // Fallback Logic: Since the email is gone, ensure the name display logic uses: profile.full_name || 'Anonymous User'
      const displayName = profile?.full_name || "Anonymous User";

      // Fix Avatars: Update the avatar circles to show the first letter of their names (e.g., 'B') instead of the first letter of the ID
      let nameForAvatar = "U";
      if (profile?.full_name) {
        // Use first letter of each word in full_name
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else if (displayName && displayName.length > 8) {
        // If displayName is a real name (not an ID), use first letters
        nameForAvatar =
          displayName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else {
        // Fallback: use first letter of displayName
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
      }

      const userIcon = profile?.profile_icon || nameForAvatar;

      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: roundCount, // Verify Count: Use rounds.length from database results, not hardcoded 4000
        isCurrentUser: user?.id === userId,
        handicap: user?.id === userId ? user?.initialHandicap : undefined,
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
        userValue: 0,
      };
    }

    // Find current user's entry and value
    const currentUserEntry = allEntries.find((entry) => entry.isCurrentUser);
    userValue = currentUserEntry?.value || 0;

    const userEntryInSorted = allEntries.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value || userValue;

    // Find the top3 calculation: Locate where the leaderboard data is sliced to get the top 3 users
    // Remove Mock Fallbacks: Search for any code that manually creates a user object with '4000' as the value and delete it
    // Sync to Database: Ensure the Top3Leaders component is strictly using the values from the allEntries array we just built, which uses roundsByUser.get(userId).length
    // Update Sub-label: Ensure the text below the name says {entry.value} Rounds instead of a static number
    console.log("getMockLeaderboard - rounds metric (global):", {
      totalRoundsInDatabase: rounds?.length || 0, // Verify Count: Change display variable from hardcoded 4000 to rounds.length
      totalUsers: allEntries.length,
      top3Values: allEntries
        .slice(0, 3)
        .map((e) => ({ name: e.name, value: e.value, id: e.id })),
      currentUserValue: finalUserValue,
      allEntriesValues: allEntries.map((e) => ({
        name: e.name,
        value: e.value,
        id: e.id,
      })),
    });

    // Sanitize Data: Ensure no hardcoded 4000 values - all entries come directly from database

    // Find the top3 calculation: Slice allEntries to get top 3 users
    // Sync to Database: Ensure Top3Leaders uses values from allEntries array (which uses roundsByUser.get(userId).length)
    const top3FromAllEntries = allEntries.slice(0, 3);
    console.log(
      "getMockLeaderboard - top3 from allEntries:",
      top3FromAllEntries.map((e) => ({ name: e.name, value: e.value })),
    );

    return {
      top3: top3FromAllEntries, // Find the top3 calculation: Use allEntries.slice(0, 3) - strictly from database
      all: allEntries,
      userRank: userEntryInSorted
        ? allEntries.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  // For library metric, create leaderboard entries (library data is in localStorage, so we can only show current user accurately)
  if (metric === "library") {
    // Library lessons are stored in localStorage, so we can only accurately show the current user
    // For other users, we'll show 0 until we have a database source
    const allEntries: any[] = [];
    
    // Add current user's entry
    if (user?.id) {
      const profile = userProfiles?.get(user.id);
      const displayName = profile?.full_name || userName || "Anonymous User";
      
      let nameForAvatar = "U";
      if (profile?.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else if (displayName) {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
      }
      
      const userIcon = profile?.profile_icon || nameForAvatar;
      
      allEntries.push({
        id: user.id,
        name: displayName,
        avatar: userIcon,
        value: userValue || 0, // This comes from calculateUserLibraryLessons - ensure it's a number
        isCurrentUser: true,
        full_name: displayName,
      });
    }
    
    // Add entries for other users (with 0 value since we don't have their library data)
    if (userProfiles) {
      userProfiles.forEach((profile, userId) => {
        if (userId === user?.id) return; // Skip current user, already added
        
        const displayName = profile.full_name || "Anonymous User";
        let nameForAvatar = "U";
        if (profile.full_name) {
          nameForAvatar =
            profile.full_name
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase() || "U";
        } else {
          nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
        }
        
        const userIcon = profile.profile_icon || nameForAvatar;
        
        allEntries.push({
          id: userId,
          name: displayName,
          avatar: userIcon,
          value: 0, // Library data not available for other users (stored in localStorage)
          isCurrentUser: false,
        });
      });
    }
    
    // Sort by value descending (most lessons first)
    allEntries.sort((a, b) => b.value - a.value);
    
    // If no entries exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }
    
    const userEntryInSorted = allEntries.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value || userValue;
    
    console.log("getMockLeaderboard - library metric:", {
      totalUsers: allEntries.length,
      top3Values: allEntries
        .slice(0, 3)
        .map((e) => ({ name: e.name, value: e.value, id: e.id })),
      currentUserValue: finalUserValue,
    });
    
    return {
      top3: allEntries.slice(0, 3),
      all: allEntries,
      userRank: userEntryInSorted
        ? allEntries.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  // For other metrics, keep existing logic
  const userEntry = {
    id: "user",
    name: userName, // Use actual full_name instead of 'You'
    avatar:
      user?.profileIcon ||
      userName
        .split(" ")
        .map((n: string) => n[0])
        .join("") ||
      "Y", // Use profile_icon if available, else initials
    value: userValue, // Use dynamic userValue from calculateUserRounds (which uses userRounds.length), not hardcoded
    handicap: user?.initialHandicap, // Include handicap for sorting rounds by skill level
  };

  // Sort by value descending for other metrics
  const sorted = [userEntry].sort((a, b) => b.value - a.value);

  // Connect to Real Data: Replace any hardcoded values with userRounds.length or the score property from the actual leaderboardData array
  // Unify Labels: Ensure the top card and Rank section both use the same value from the entry in the leaderboard array
  const userEntryInSorted = sorted.find((entry) => entry.id === "user");
  const finalUserValue = userEntryInSorted?.value || userValue;

  return {
    top3: sorted.slice(0, 3),
    all: sorted,
    userRank:
      sorted.length > 0
        ? sorted.findIndex((entry) => entry.id === "user") + 1
        : 0,
    // Use the actual value from the user entry in the leaderboard array, not a separate userValue
    userValue: finalUserValue,
  };
}

// Format leaderboard value for display (used in main XP leaderboard)
function formatLeaderboardValue(
  value: number,
  metric:
    | "xp"
    | "library"
    | "practice"
    | "rounds"
    | "drills"
    | "lowGross"
    | "lowNett"
    | "birdies"
    | "eagles"
    | "putts",
) {
  switch (metric) {
    case "xp":
      return `${value.toLocaleString()} XP`;
    case "library":
      return `${value} Lesson${value !== 1 ? "s" : ""}`;
    case "practice":
      return `${value.toFixed(1)} hrs`;
    case "rounds":
      return `${value} Round${value !== 1 ? "s" : ""}`;
    case "drills":
      return `${value} Drill${value !== 1 ? "s" : ""}`;
    case "lowGross":
      return `${value} Gross`;
    case "lowNett":
      return `${value} Nett`;
    case "birdies":
      return `${value} Birdie${value !== 1 ? "s" : ""}`;
    case "eagles":
      return `${value} Eagle${value !== 1 ? "s" : ""}`;
    case "putts":
      return `${value} Putt${value !== 1 ? "s" : ""}`;
    default:
      return `${value}`;
  }
}

// Get leaderboard data for selected metric (main XP leaderboard)
function getLeaderboardData(
  metric:
    | "xp"
    | "library"
    | "practice"
    | "rounds"
    | "drills"
    | "lowGross"
    | "lowNett"
    | "birdies"
    | "eagles"
    | "putts",
  timeFilter: "week" | "month" | "year" | "allTime",
  rounds: any[],
  totalXP: number,
  userName: string,
  user?: { id?: string; profileIcon?: string } | null,
  userProfiles?: Map<
    string,
    { full_name?: string; profile_icon?: string; xp?: number }
  >,
  practiceSessions?: any[],
  drills?: any[],
) {
  // Debug: Log leaderboard calculation inputs
  // Debug Logs: Keep console.log to see if Stuart's round is in the raw data
  console.log("Leaderboard Data Debug:", {
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
    console.log(
      "Leaderboard: All rounds with user info:",
      rounds.map((r: any) => ({
        user_id: r.user_id,
        full_name: r.full_name || "Unknown User",
        date: r.date,
        score: r.score,
      })),
    );
    // Map Stuart's Data: Check if Stuart's rounds are in the data
    const stuartRounds = rounds.filter(
      (r: any) =>
        r.full_name?.toLowerCase().includes("stuart") ||
        r.user_id?.includes("stuart") ||
        r.full_name === "Stuart Tibben",
    );
    if (stuartRounds.length > 0) {
      console.log(
        "✅ Leaderboard: Stuart's rounds found:",
        stuartRounds.length,
      );
      console.log(
        "✅ Leaderboard: Stuart's rounds data:",
        stuartRounds.map((r: any) => ({
          user_id: r.user_id,
          full_name: r.full_name,
          date: r.date,
          score: r.score,
        })),
      );
    } else {
      console.log(
        "Leaderboard: No Stuart rounds found in data (this is OK if Stuart hasn't logged rounds)",
      );
    }
    // Check for Null Profiles: Count rounds with 'Unknown User'
    const unknownUserRounds = rounds.filter(
      (r: any) => !r.full_name || r.full_name === "Unknown User",
    );
    if (unknownUserRounds.length > 0) {
      console.log(
        'Leaderboard: Rounds with "Unknown User" (missing profiles):',
        unknownUserRounds.length,
      );
    }
  } else {
    console.warn(
      "⚠️ Leaderboard: No rounds found! Check if rounds are being fetched from database.",
    );
  }

  // Filter rounds by timeframe first - use created_at if available, otherwise fall back to date
  const filteredRounds = rounds.filter((round) => {
    if (timeFilter === "allTime") return true;
    const { startDate } = getTimeframeDates(timeFilter);
    // Use created_at for filtering (more accurate for when round was logged)
    const roundTimestamp = round.created_at
      ? new Date(round.created_at)
      : new Date(round.date);
    return roundTimestamp >= startDate;
  });

  // For Low Gross and Low Nett: Filter to only 18-hole rounds
  const eighteenHoleRounds = filteredRounds.filter(
    (round) => round.holes === 18,
  );
  const valid18HoleScores = eighteenHoleRounds
    .map((r) => r.score)
    .filter((score) => score !== null && score !== undefined && score > 0);
  const lowGross =
    valid18HoleScores.length > 0 ? Math.min(...valid18HoleScores) : null;

  // Calculate Low Nett: Score minus Handicap (only for 18-hole rounds with valid score and handicap)
  const validNettRounds = eighteenHoleRounds.filter(
    (round) =>
      round.score !== null &&
      round.score !== undefined &&
      round.score > 0 &&
      round.handicap !== null &&
      round.handicap !== undefined,
  );
  const nettScores = validNettRounds.map(
    (round) => round.score! - round.handicap!,
  );
  const lowNett = nettScores.length > 0 ? Math.min(...nettScores) : null;

  // For Birdies: Sum all birdies from all rounds (not just 18-hole)
  const birdieCount = filteredRounds.reduce(
    (sum, round) => sum + (round.birdies || 0),
    0,
  );

  // For Eagles: Sum all eagles from all rounds (not just 18-hole)
  const eagleCount = filteredRounds.reduce(
    (sum, round) => sum + (round.eagles || 0),
    0,
  );

  let userValue: number;

  switch (metric) {
    case "xp":
      // Fallback to All-Time: XP is cumulative, always use total from profile (not filtered by date)
      // XP Mapping: Ensure the rest of the code looks for profile.xp instead of profile.total_xp
      if (userProfiles && user?.id) {
        const userProfile = userProfiles.get(user.id);
        // Standardize Fallback: Use (profile.xp || 0) to ensure we aren't trying to add undefined or NaN to the state
        userValue = (userProfile?.xp || 0) || totalXP || 0;
        console.log("XP Leaderboard: Current user XP value:", userValue, "from profile:", userProfile);
      } else {
        userValue = totalXP || 0;
      }
      break;
    case "library":
      userValue = calculateUserLibraryLessons(timeFilter);
      break;
    case "practice":
      // For practice metric, we'll calculate from all practice sessions below in the special case
      userValue = 0; // Will be calculated from practice sessions
      break;
    case "rounds":
      // Find the Top 3 Render: Replace placeholder with actual count of rounds for that user (e.g., userRounds.length)
      userValue = calculateUserRounds(rounds, timeFilter, user?.id);
      break;
    case "drills":
      userValue = calculateUserDrills(timeFilter);
      break;
    case "lowGross":
      userValue = lowGross !== null ? lowGross : 0; // Use 0 if no low gross (will be filtered out)
      break;
    case "lowNett":
      userValue = lowNett !== null ? lowNett : 0; // Use 0 if no low nett (will be filtered out)
      break;
    case "birdies":
      userValue = birdieCount;
      break;
    case "eagles":
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
  if (metric === "birdies" || metric === "eagles") {
    // Locate getLeaderboardData: Find the logic that calculates stats like Birdies, Eagles
    // Remove the User Filter: Ensure the code iterates through all rounds in the rounds array (the global set) instead of filtering for round.user_id === user.id
    // Group and Sum: For Birdies/Eagles, ensure it sums them up per user ID, then maps them to the allEntries array so Stuart's name and total appear
    // Fix Ranking: Make sure the sorting for these tabs is set to Descending (highest birdies first) so the leaders show up at the top

    console.log(
      "Birdies/Eagles: Processing",
      filteredRounds.length,
      "rounds for all users",
    );
    console.log(
      "Birdies/Eagles: All user_ids in filteredRounds:",
      Array.from(
        new Set(filteredRounds.map((r: any) => r.user_id).filter(Boolean)),
      ),
    );

    // Fix Birdie/Eagle Counting: Iterate through all users' rounds to sum up their birdies/eagles, then sort from highest to lowest
    // Group rounds by user_id to calculate totals per user
    // Remove the User Filter: Process ALL rounds, not just current user's rounds
    const roundsByUser = new Map<string, any[]>();
    filteredRounds.forEach((round) => {
      // Remove the User Filter: Don't filter by user.id - process all rounds
      if (!round.user_id) return; // Skip rounds without user_id
      if (!roundsByUser.has(round.user_id)) {
        roundsByUser.set(round.user_id, []);
      }
      roundsByUser.get(round.user_id)!.push(round);
    });

    console.log(
      "Birdies/Eagles: Grouped into",
      roundsByUser.size,
      "users:",
      Array.from(roundsByUser.keys()),
    );

    // Group and Sum: For Birdies/Eagles, ensure it sums them up per user ID, then maps them to the allEntries array so Stuart's name and total appear
    const allEntries: any[] = [];
    roundsByUser.forEach((userRounds, userId) => {
      // Remove the User Filter: Process all users' rounds, not just current user
      // Group and Sum: Sum birdies/eagles for this user across all their rounds
      const totalBirdies = userRounds.reduce(
        (sum, round) => sum + (round.birdies || 0),
        0,
      );
      const totalEagles = userRounds.reduce(
        (sum, round) => sum + (round.eagles || 0),
        0,
      );

      console.log(
        `Birdies/Eagles: User ${userId} - ${userRounds.length} rounds, ${totalBirdies} birdies, ${totalEagles} eagles`,
      );

      // Map the IDs: Use the profiles data from StatsContext to map every user_id in the leaderboard to a full_name
      // Fallback Logic: If a profile isn't found for an ID, show 'Academy Member' instead of the long code
      const profile = userProfiles?.get(userId);
      // Fallback Logic: Since the email is gone, ensure the name display logic uses: profile.full_name || 'Anonymous User'
      const displayName = profile?.full_name || "Anonymous User";

      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = "U";
      if (profile?.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else if (displayName && displayName.length > 8) {
        nameForAvatar =
          displayName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
      }

      const userIcon = profile?.profile_icon || nameForAvatar;
      const value = metric === "birdies" ? totalBirdies : totalEagles;

      // Group and Sum: Map to allEntries array so Stuart's name and total appear
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: value,
        isCurrentUser: user?.id === userId,
        birdieCount: totalBirdies,
        eagleCount: totalEagles,
      });
    });

    // Fix Ranking: Make sure the sorting for these tabs is set to Descending (highest birdies first) so the leaders show up at the top
    // Fix Birdie/Eagle Counting: Sort from highest to lowest
    allEntries.sort((a, b) => b.value - a.value);

    console.log(
      "Birdies/Eagles: Sorted entries:",
      allEntries.map((e) => ({ name: e.name, value: e.value, id: e.id })),
    );

    // If no entries exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
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
        lowNett: undefined,
      };
    });

    const userEntryInRanks = withRanks.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || 0;

    const result = {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };

    console.log("Leaderboard Result (birdies/eagles metric - global):", result);
    console.log(
      "Birdies/Eagles: Top 3:",
      result.top3?.map((e: any) => ({
        name: e.name,
        value: e.value,
        id: e.id,
      })),
    );
    console.log("Birdies/Eagles: All entries count:", result.all?.length);
    return result;
  }

  // Fix 'Low Gross' and 'Low Nett': Find the single lowest score among all users' rounds, not just mine
  if (metric === "lowGross" || metric === "lowNett") {
    // Locate getLeaderboardData: Find the logic that calculates stats like Low Gross
    // Remove the User Filter: Ensure the code iterates through all rounds in the rounds array (the global set) instead of filtering for round.user_id === user.id

    console.log(
      "Low Gross/Nett: Processing",
      eighteenHoleRounds.length,
      "18-hole rounds for all users",
    );
    console.log(
      "Low Gross/Nett: All user_ids in eighteenHoleRounds:",
      Array.from(
        new Set(eighteenHoleRounds.map((r: any) => r.user_id).filter(Boolean)),
      ),
    );

    // For lowGross and lowNett, check if they are null (these should return empty if null)
    if (
      (metric === "lowGross" && lowGross === null) ||
      (metric === "lowNett" && lowNett === null)
    ) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    // Remove the User Filter: Process ALL 18-hole rounds, not just current user's rounds
    // Group 18-hole rounds by user_id to find each user's lowest score
    const roundsByUser = new Map<string, any[]>();
    eighteenHoleRounds.forEach((round) => {
      // Remove the User Filter: Don't filter by user.id - process all rounds
      if (!round.user_id) return; // Skip rounds without user_id
      if (!roundsByUser.has(round.user_id)) {
        roundsByUser.set(round.user_id, []);
      }
      roundsByUser.get(round.user_id)!.push(round);
    });

    console.log(
      "Low Gross/Nett: Grouped into",
      roundsByUser.size,
      "users:",
      Array.from(roundsByUser.keys()),
    );

    // Group and Sum: Create leaderboard entries for all users
    const allEntries: any[] = [];
    roundsByUser.forEach((userRounds, userId) => {
      // Remove the User Filter: Process all users' rounds, not just current user
      // Fix 'Low Gross': Find the single lowest score among all this user's rounds
      const validScores = userRounds
        .map((r) => r.score)
        .filter((score) => score !== null && score !== undefined && score > 0);
      const userLowGross =
        validScores.length > 0 ? Math.min(...validScores) : null;

      // Fix 'Low Nett': Find the single lowest nett score among all this user's rounds
      const validNettRounds = userRounds.filter(
        (round) =>
          round.score !== null &&
          round.score !== undefined &&
          round.score > 0 &&
          round.handicap !== null &&
          round.handicap !== undefined,
      );
      const nettScores = validNettRounds.map(
        (round) => round.score! - round.handicap!,
      );
      const userLowNett =
        nettScores.length > 0 ? Math.min(...nettScores) : null;

      console.log(
        `Low Gross/Nett: User ${userId} - ${userRounds.length} rounds, lowGross: ${userLowGross}, lowNett: ${userLowNett}`,
      );

      // Skip users with no valid scores
      if (metric === "lowGross" && userLowGross === null) return;
      if (metric === "lowNett" && userLowNett === null) return;

      // Map the IDs: Use the profiles data from StatsContext to map every user_id in the leaderboard to a full_name
      // Fallback Logic: If a profile isn't found for an ID, show 'Academy Member' instead of the long code
      const profile = userProfiles?.get(userId);
      // Fallback Logic: Since the email is gone, ensure the name display logic uses: profile.full_name || 'Anonymous User'
      const displayName = profile?.full_name || "Anonymous User";

      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = "U";
      if (profile?.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else if (displayName && displayName.length > 8) {
        nameForAvatar =
          displayName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
      }

      const userIcon = profile?.profile_icon || nameForAvatar;
      const value = metric === "lowGross" ? userLowGross! : userLowNett!;

      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: value,
        isCurrentUser: user?.id === userId,
        lowRound: userLowGross,
        lowNett: userLowNett,
      });
    });

    // Fix Ranking: Sort ascending (lower score is better) for Low Gross/Nett
    // Fix 'Low Gross': Sort ascending (lower score is better)
    allEntries.sort((a, b) => a.value - b.value);

    console.log(
      "Low Gross/Nett: Sorted entries:",
      allEntries.map((e) => ({ name: e.name, value: e.value, id: e.id })),
    );

    // If no entries exist, return empty leaderboard
    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
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
        eagleCount: 0,
      };
    });

    const userEntryInRanks = withRanks.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || 0;

    const result = {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };

    console.log(
      "Leaderboard Result (lowGross/lowNett metric - global):",
      result,
    );
    console.log(
      "Low Gross/Nett: Top 3:",
      result.top3?.map((e: any) => ({
        name: e.name,
        value: e.value,
        id: e.id,
      })),
    );
    console.log("Low Gross/Nett: All entries count:", result.all?.length);
    return result;
  }

  // Check Database: Column name is total_putts in database, mapped to totalPutts in TypeScript
  // Hard-Code the Link: Use round.totalPutts (camelCase from RoundData interface)
  // Sort & Label: Sort Lowest (Ascending) and label 'X Putts'
  if (metric === "putts") {
    // Fetch entire row: filteredRounds contains all data from golf_rounds table
    const roundsByUser = new Map<string, any[]>();
    filteredRounds.forEach((round) => {
      if (!round.user_id) return;
      if (!roundsByUser.has(round.user_id)) {
        roundsByUser.set(round.user_id, []);
      }
      roundsByUser.get(round.user_id)!.push(round);
    });

    const allEntries: any[] = [];
    roundsByUser.forEach((userRounds, userId) => {
      // Hard-Code the Link: Use exact column name totalPutts (from RoundData interface)
      const puttsValues = userRounds
        .map((round) => {
          // Hard-Code the Link: round.totalPutts (camelCase from StatsContext transformation)
          const score = round.totalPutts || 0;
          return Number(score) || 0;
        })
        .filter((val) => val > 0);

      if (puttsValues.length === 0) {
        return;
      }

      const userLowPutts = Math.min(...puttsValues);

      const profile = userProfiles?.get(userId);
      const displayName = profile?.full_name || "Anonymous User";

      let nameForAvatar = "U";
      if (profile?.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else if (displayName && displayName.length > 8) {
        nameForAvatar =
          displayName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
      }

      const userIcon = profile?.profile_icon || nameForAvatar;

      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: Number(userLowPutts),
        isCurrentUser: user?.id === userId,
      });
    });

    // Sort Lowest to Highest
    allEntries.sort((a, b) => a.value - b.value);

    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

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
      };
    });

    const userEntryInRanks = withRanks.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || 0;

    const result = {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };

    return result;
  }

  // For rounds metric, group all rounds by user_id and create leaderboard entries for each user
  if (metric === "rounds") {
    // Filter by timeframe first (no user_id filter - get all users' rounds)
    const timeFilteredRounds = filteredRounds.filter((round) => {
      if (timeFilter === "allTime") return true;
      const { startDate } = getTimeframeDates(timeFilter);
      const roundDate = new Date(round.date || round.created_at);
      return roundDate >= startDate;
    });

    // Group rounds by user_id to count rounds per user
    const roundsByUser = new Map<string, any[]>();
    timeFilteredRounds.forEach((round) => {
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
      // Fallback Logic: Since the email is gone, ensure the name display logic uses: profile.full_name || 'Anonymous User'
      const displayName = profile?.full_name || "Anonymous User";

      // Fix Avatars: Update the avatar circles to show the first letter of their names (e.g., 'B') instead of the first letter of the ID
      let nameForAvatar = "U";
      if (profile?.full_name) {
        // Use first letter of each word in full_name
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else if (displayName && displayName.length > 8) {
        // If displayName is a real name (not an ID), use first letters
        nameForAvatar =
          displayName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else {
        // Fallback: use first letter of displayName
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
      }

      const userIcon = profile?.profile_icon || nameForAvatar;

      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: roundCount, // Verify Count: Use rounds.length from database results, not hardcoded 4000
        isCurrentUser: user?.id === userId,
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
        userValue: 0,
      };
    }

    // Find current user's entry and value
    const currentUserEntry = allEntries.find((entry) => entry.isCurrentUser);
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
        eagleCount: 0,
      };
    });

    const userEntryInRanks = withRanks.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || userValue;

    const result = {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };

    // Find the top3 calculation: Locate where the leaderboard data is sliced to get the top 3 users
    // Remove Mock Fallbacks: Search for any code that manually creates a user object with '4000' as the value and delete it
    // Sync to Database: Ensure the Top3Leaders component is strictly using the values from the allEntries array we just built, which uses roundsByUser.get(userId).length
    // Update Sub-label: Ensure the text below the name says {entry.value} Rounds instead of a static number
    console.log("Leaderboard Result (rounds metric - global):", result);
    console.log("Leaderboard Result - top3 count:", result.top3?.length || 0);
    console.log("Leaderboard Result - all count:", result.all?.length || 0);
    console.log(
      "Leaderboard Result - total rounds in database:",
      rounds?.length || 0,
    ); // Verify Count: Change display variable from hardcoded 4000 to rounds.length
    console.log(
      "Leaderboard Result - top3 values:",
      result.top3?.map((e: any) => ({
        name: e.name,
        value: e.value,
        id: e.id,
      })),
    );

    // Sanitize Data: Ensure no hardcoded 4000 values - all entries come directly from database

    return result;
  }

  // For practice metric, group all practice sessions by user_id and create leaderboard entries for each user
  if (metric === "practice") {
    // Remove Filter: Process ALL practice sessions from all users, not just current user
    // Verify Practice Table: Ensure it is pointing to the new practice table name we just created
    // Check Names: Ensure the Practice leaderboard uses the same profile name-mapping logic we used for the Rounds
    const allPracticeSessions = practiceSessions || [];

    console.log(
      "Practice: Processing",
      allPracticeSessions.length,
      "practice sessions for all users",
    );
    console.log(
      "Practice: All user_ids in practice sessions:",
      Array.from(
        new Set(allPracticeSessions.map((s: any) => s.user_id).filter(Boolean)),
      ),
    );

    // Filter by timeframe if needed
    const { startDate } = getTimeframeDates(timeFilter);
    const filteredSessions = allPracticeSessions.filter((session: any) => {
      if (timeFilter === "allTime") return true;
      const sessionDate = new Date(
        session.practice_date || session.created_at || Date.now(),
      );
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

    console.log(
      "Practice: Grouped into",
      sessionsByUser.size,
      "users:",
      Array.from(sessionsByUser.keys()),
    );

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
      // Fallback Logic: Since the email is gone, ensure the name display logic uses: profile.full_name || 'Anonymous User'
      const displayName = profile?.full_name || "Anonymous User";

      // Fix Avatars: Update the avatar circles to show the first letter of their names
      let nameForAvatar = "U";
      if (profile?.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else if (displayName && displayName.length > 8) {
        nameForAvatar =
          displayName
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      } else {
        nameForAvatar = displayName.substring(0, 1).toUpperCase() || "U";
      }

      const userIcon = profile?.profile_icon || nameForAvatar;

      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: totalHours,
        isCurrentUser: user?.id === userId,
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
        userValue: 0,
      };
    }

    // Find current user's entry and value
    const currentUserEntry = allEntries.find((entry) => entry.isCurrentUser);
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
        eagleCount: 0,
      };
    });

    const userEntryInRanks = withRanks.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || userValue;

    const result = {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };

    console.log("Leaderboard Result (practice metric - global):", result);
    console.log(
      "Practice: Top 3:",
      result.top3?.map((e: any) => ({
        name: e.name,
        value: e.value,
        id: e.id,
      })),
    );
    console.log("Practice: All entries count:", result.all?.length);
    return result;
  }

  // Update XP Leaderboard: Use XP from profiles instead of localStorage
  // For XP metric, create leaderboard entries from all user profiles
  if (metric === "xp") {
    // Update XP Leaderboard: Use XP from profiles instead of localStorage
    const allEntries: any[] = [];

    // Get all user IDs from rounds, drills, and practice sessions to ensure we have all users
    const roundUserIds = (rounds || [])
      .map((r: any) => r.user_id)
      .filter(Boolean);
    const drillUserIds = (drills || [])
      .map((d: any) => d.user_id)
      .filter(Boolean);
    const practiceUserIds = (practiceSessions || [])
      .map((p: any) => p.user_id)
      .filter(Boolean);
    const allUserIds = Array.from(
      new Set([...roundUserIds, ...drillUserIds, ...practiceUserIds]),
    );

    // Create entries from userProfiles map (which includes XP)
    // Fallback to All-Time: Ensure XP is always fetched correctly, regardless of filter
    // Filter Logic: XP is cumulative - don't filter by date, always show total XP
    if (userProfiles && userProfiles.size > 0) {
      console.log("XP Leaderboard: Creating entries from", userProfiles.size, "profiles");
      console.log("XP Leaderboard: Time filter is", timeFilter, "- XP is cumulative, not filtered by date");
      userProfiles.forEach((profile, userId) => {
        // Column Mapping: In the leaderboard mapping logic, change the reference from profile.total_xp or profile.value to exactly profile.xp
        // Default Zero: Use profile.xp || 0 in the display so it registers a number even for new players
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/cc9628f8-b6b7-4cad-8d2c-8aad59e6d1dc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'academy/page.tsx:2464',message:'XP value extraction',data:{userId,profileKeys:Object.keys(profile||{}),hasXp:'xp' in (profile||{}),xpValue:profile?.xp,rawProfile:profile},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        const xpValue = profile.xp || 0;
        // Fallback Logic: Since the email is gone, ensure the name display logic uses: profile.full_name || 'Anonymous User'
        const displayName = profile.full_name || "Anonymous User";
        
        // Debug: Log XP values to verify they're being fetched
        if (xpValue > 0) {
          console.log(`XP Leaderboard: ${displayName} has ${xpValue} XP`);
        } else {
          console.warn(`XP Leaderboard: ${displayName} has 0 XP (check database column name)`);
        }

        // Fix Avatars: Update the avatar circles to show the first letter of their names
        let nameForAvatar = "A";
        if (profile.full_name) {
          nameForAvatar =
            profile.full_name
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase() || "A";
        }

        const userIcon = profile.profile_icon || nameForAvatar;

        allEntries.push({
          id: userId,
          name: displayName,
          avatar: userIcon,
          value: xpValue,
          isCurrentUser: user?.id === userId,
        });
      });
    }

    // Sort by XP descending (highest XP first)
    allEntries.sort((a, b) => b.value - a.value);

    // Fallback to All-Time: If no entries or all entries have 0 XP, log warning
    if (allEntries.length === 0) {
      console.warn("XP Leaderboard: No entries created - check if userProfiles is populated");
    } else if (allEntries.every(e => e.value === 0)) {
      console.warn("XP Leaderboard: All entries have 0 XP - check database column name (xp vs points)");
    } else {
      console.log("XP Leaderboard: Created", allEntries.length, "entries, top XP:", allEntries[0]?.value);
    }

    // Find current user's entry
    const userEntryInSorted = allEntries.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value || userValue;

    return {
      top3: allEntries.slice(0, 3),
      all: allEntries,
      userRank: userEntryInSorted
        ? allEntries.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  // For other metrics (library, drills), keep existing logic but remove user filter
  // Remove User Filtering: For every metric, ensure the code is processing the allEntries or the global rounds array instead of filtering for just the currentUser
  // Only include user in leaderboard if they have actual data (no mock/dummy entries)
  const userEntry = {
    id: "user",
    name: userName, // Use actual full_name instead of 'You'
    avatar:
      user?.profileIcon ||
      userName
        .split(" ")
        .map((n) => n[0])
        .join("") ||
      "Y", // Use profile_icon if available, else initials
    value: userValue, // Use dynamic userValue, not hardcoded
    previousRank: undefined,
    lowRound: undefined,
    lowNett: undefined,
    birdieCount: 0,
    eagleCount: 0,
  };

  // Sort by value - descending for most metrics (higher is better)
  const sorted = [userEntry].sort((a, b) => {
    // For all metrics here (library, drills), higher is better, so sort descending
    return b.value - a.value;
  });

  // Calculate rank changes
  const withRanks = sorted.map((entry, index) => {
    const currentRank = index + 1;
    const rankChange = entry.previousRank
      ? entry.previousRank - currentRank
      : 0;
    return {
      ...entry,
      rank: currentRank,
      rankChange,
      movedUp: rankChange > 0,
      movedDown: rankChange < 0,
    };
  });

  // Connect to Real Data: Replace any hardcoded values with userRounds.length or the score property from the actual leaderboardData array
  // Unify Labels: Ensure the top card and Rank section both use the same value from the entry in the leaderboard array
  const userEntryInRanks = withRanks.find((entry) => entry.id === "user");
  const finalUserValue = userEntryInRanks?.value || userValue;

  const result = {
    top3: withRanks.slice(0, 3),
    all: withRanks,
    userRank:
      withRanks.length > 0
        ? withRanks.findIndex((entry) => entry.id === "user") + 1
        : 0,
    // Use the actual value from the user entry in the leaderboard array, not a separate userValue
    userValue: finalUserValue,
  };

  // Debug Check: Look at the Leaderboard Result: log. If it's an empty array [], the issue is definitely the SQL Policy above.
  // Debug Logs: Keep console.log('Leaderboard Result:', data) so I can see if Stuart's round is in the raw data but just not rendering
  console.log("Leaderboard Result:", result);
  console.log("Leaderboard Result - top3 count:", result.top3?.length || 0);
  console.log("Leaderboard Result - all count:", result.all?.length || 0);
  // Debug Check: If result is empty array, it's the SQL Policy
  if (!result || result.all?.length === 0) {
    console.warn(
      "⚠️ Leaderboard Result is EMPTY ARRAY [] - This indicates SQL Policy issue!",
    );
    console.warn(
      "⚠️ Check RLS policies on rounds table - they may be blocking access to all rounds",
    );
  }

  return result;
}

// Calculate total XP filtered by timeframe
function calculateTotalXPByTimeframe(
  rounds: any[],
  userProgress: { totalXP: number; completedDrills: string[] },
  timeFilter: "week" | "month" | "year" | "allTime",
) {
  const { startDate } = getTimeframeDates(timeFilter);

  // Filter rounds by timeframe
  const filteredRounds = rounds.filter((round) => {
    if (timeFilter === "allTime") return true;
    const roundDate = new Date(round.date);
    return roundDate >= startDate;
  });

  const roundsXP = filteredRounds.length * XP_PER_ROUND;

  // Filter drill XP by timeframe using practice activity history
  let drillsXP = 0;
  if (typeof window !== "undefined") {
    try {
      const practiceHistory = JSON.parse(
        localStorage.getItem("practiceActivityHistory") || "[]",
      );
      const filteredHistory = practiceHistory.filter((entry: any) => {
        if (timeFilter === "allTime") return true;
        const entryDate = new Date(entry.timestamp || entry.date);
        return entryDate >= startDate;
      });

      // Sum XP from filtered practice history
      drillsXP = filteredHistory.reduce((sum: number, entry: any) => {
        return sum + (entry.xp || 0);
      }, 0);
    } catch (error) {
      // Fallback: use totalXP if filtering fails
      drillsXP = timeFilter === "allTime" ? userProgress.totalXP : 0;
    }
  }

  return roundsXP + drillsXP;
}

export default function AcademyPage() {
  console.log("Academy: Component rendering...");

  // ALL HOOKS MUST BE AT THE TOP - NO EXCEPTIONS (Rules of Hooks)
  // Check Fetch Logic: Ensure the loadStats function is fetching data from the drills and practice_sessions tables as well as rounds
  const { rounds, drills, practiceSessions } = useStats();
  const { user, refreshUser, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  // Create a Name Lookup: Store profile data for all users in the leaderboard
  // Map IDs to Names: Match user IDs to their full_name from profiles table
  // Update fetchUserProfiles to include XP column from profiles table
  const [userProfiles, setUserProfiles] = useState<
    Map<string, { full_name?: string; profile_icon?: string; xp?: number }>
  >(new Map());

  // Add Fetch Guard: Create refs to ensure effects run exactly once
  const hasFetchedProgress = useRef(false);
  const hasFetched = useRef(false);
  
  // Add Deep Equality Guard: useRef to store previous leaderboard data string to prevent unnecessary re-renders
  const prevLeaderboardStr = useRef<string>("");
  const prevFourPillarStr = useRef<string>("");

  const [userProgress, setUserProgress] = useState<{
    totalXP: number;
    completedDrills: string[];
  }>({
    totalXP: 0,
    completedDrills: [],
  });
  const [timeFilter, setTimeFilter] = useState<
    "week" | "month" | "year" | "allTime"
  >("week");
  const [isFiltering, setIsFiltering] = useState(false);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [leaderboardSearch, setLeaderboardSearch] = useState("");
  const [selectedTrophy, setSelectedTrophy] = useState<
    | TrophyData
    | {
        trophy_name: string;
        description?: string;
        unlocked_at?: string;
        id?: string;
        trophy_icon?: string;
      }
    | null
  >(null);
  const [leaderboardMetric, setLeaderboardMetric] = useState<
    | "library"
    | "practice"
    | "rounds"
    | "drills"
    | "lowGross"
    | "lowNett"
    | "birdies"
    | "eagles"
    | "putts"
  >("library");

  // Database-First Academy: Fetch trophies from user_trophies table instead of calculating from live scores
  const [dbTrophies, setDbTrophies] = useState<
    Array<{
      trophy_name: string;
      trophy_icon?: string;
      unlocked_at?: string;
      description?: string;
      id?: string;
    }>
  >([]);

  // Toggle State: Add a showLocked boolean state (defaulting to true)
  const [showLocked, setShowLocked] = useState<boolean>(true);

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
    return Math.min(
      100,
      Math.max(0, (handicapImprovement / handicapRange) * 100),
    );
  }, [currentHandicap]);

  // Determine tier based on XP and handicap - wrap in useMemo
  const userTier = useMemo((): "Bronze" | "Silver" | "Gold" | "Platinum" => {
    // Platinum requires hitting the goal handicap
    if (currentHandicap <= GOAL_HANDICAP) {
      return "Platinum";
    }

    // Check by handicap first, then XP
    if (
      currentHandicap <= TIER_THRESHOLDS.Gold.handicap ||
      totalXP >= TIER_THRESHOLDS.Gold.xp
    ) {
      return "Gold";
    }
    if (
      currentHandicap <= TIER_THRESHOLDS.Silver.handicap ||
      totalXP >= TIER_THRESHOLDS.Silver.xp
    ) {
      return "Silver";
    }
    return "Bronze";
  }, [currentHandicap, totalXP]);

  const userLevel = useMemo(() => getLevel(userTier), [userTier]);

  // Get user name - wrap in useMemo to prevent recreation
  // Safe Logic: Do the check inside the useMemo rather than skipping the Hook entirely
  const userName = useMemo(() => {
    if (user?.fullName) {
      console.log("Academy: Displaying full_name from profile:", user.fullName);
      console.log("Academy: User ID:", user.id);
      return user.fullName;
    }
    if (user?.email) {
      console.log(
        "Academy: No full_name found, using email fallback:",
        user.email,
      );
      return user.email;
    }
    console.log("Academy: No full_name or email found");
    return "";
  }, [user?.fullName, user?.email]);

  // Automatic redirect if not authenticated (only after loading is complete)
  // Stable Dependencies: Ensure the useEffect dependency array is either empty [] or only contains [user?.id]
  useEffect(() => {
    try {
      if (!loading && !isAuthenticated && user === null) {
        console.log(
          "Academy: No authentication detected, redirecting to login...",
        );
        router.push("/login");
      }
    } catch (error) {
      console.error("Academy: Error in auth redirect:", error);
    } finally {
      // Force Loading Off: Ensure setLoading(false) is called inside a finally block to prevent the page from hanging if a fetch fails
      // Note: loading state is managed by AuthContext
    }
  }, [user?.id, loading, isAuthenticated, router]); // Stable Dependencies: Only contains [user?.id]

  // Database-First Academy: Fetch trophies from user_trophies table instead of calculating from live scores
  useEffect(() => {
    const fetchTrophies = async () => {
      if (!user?.id) return;

      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        const { data, error } = await supabase
          .from("user_trophies")
          .select("trophy_name, trophy_icon, unlocked_at, description")
          .eq("user_id", user.id)
          .order("unlocked_at", { ascending: false });

        if (error) {
          console.error("Academy Trophy Fetch Error:", error);
          return;
        }

        // Map DB trophies to include id from TROPHY_LIST
        const trophiesWithIds = (data || []).map((trophy: any) => ({
          ...trophy,
          id: TROPHY_LIST.find((t) => t.name === trophy.trophy_name)?.id,
        }));

        setDbTrophies(trophiesWithIds);
      } catch (err) {
        console.error("Error fetching Academy trophies:", err);
      }
    };

    fetchTrophies();
  }, [user?.id]);

  // Identify the Loop: Locate the useEffect that fetches leaderboard data or user stats
  // Add Fetch Guard: Create a ref called hasFetched = useRef(false). Wrap the fetch logic in if (hasFetched.current) return; and set hasFetched.current = true;
  // Load user progress and set up event listeners
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Add Fetch Guard: Wrap the fetch logic in if (hasFetchedProgress.current) return;
    if (hasFetchedProgress.current) return;

    try {
      const loadProgress = () => {
        const savedProgress = localStorage.getItem("userProgress");
        // Circuit Breaker: Only set if data exists and it's different from current state
        // Check for State Syncing: Don't call setUserProgress if it would cause a loop
        if (savedProgress) {
          try {
            const progress = JSON.parse(savedProgress);
            // Only update if the data actually changed to prevent infinite loops
            setUserProgress((prev) => {
              if (JSON.stringify(prev) === JSON.stringify(progress)) {
                return prev; // Return same reference if unchanged
              }
              return progress;
            });
          } catch (error) {
            console.error("Academy: Error parsing user progress:", error);
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
        console.log(
          "Academy: Received roundsUpdated event, leaderboard will refresh",
        );
      };

      // Listen for Academy-specific leaderboard refresh
      const handleLeaderboardRefresh = () => {
        console.log("Academy: Received academyLeaderboardRefresh event");
        // Don't trigger state update - let the natural re-render from StatsContext handle it
      };

      window.addEventListener("roundsUpdated", handleRoundsUpdate);
      window.addEventListener(
        "academyLeaderboardRefresh",
        handleLeaderboardRefresh,
      );
      window.addEventListener("userProgressUpdated", loadProgress);
      window.addEventListener("storage", loadProgress);

      return () => {
        window.removeEventListener("roundsUpdated", handleRoundsUpdate);
        window.removeEventListener(
          "academyLeaderboardRefresh",
          handleLeaderboardRefresh,
        );
        window.removeEventListener("userProgressUpdated", loadProgress);
        window.removeEventListener("storage", loadProgress);
      };
    } catch (error) {
      console.error("Academy: Error loading progress:", error);
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
        console.warn("Academy: Loading timeout - forcing render");
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
      const roundUserIds = (rounds || [])
        .map((r: any) => r.user_id)
        .filter(Boolean);
      const drillUserIds = (drills || [])
        .map((d: any) => d.user_id)
        .filter(Boolean);
      const practiceUserIds = (practiceSessions || [])
        .map((p: any) => p.user_id)
        .filter(Boolean);

      // Combine all user IDs and get unique set
      const allUserIds = [...roundUserIds, ...drillUserIds, ...practiceUserIds];
      const uniqueUserIds = Array.from(new Set(allUserIds));

      if (uniqueUserIds.length === 0) {
        console.log(
          "Academy: No user IDs found in rounds, drills, or practice sessions",
        );
        return;
      }

      // Check the Mapping: Log drill user_ids to verify mapping
      if (drillUserIds.length > 0) {
        console.log(
          "Academy: Drill user_ids found for profile mapping:",
          drillUserIds,
        );
        console.log(
          "Academy: Sample drill data for mapping:",
          (drills || []).slice(0, 3).map((d: any) => ({
            user_id: d.user_id,
            drill_name: d.drill_name || d.drill_title,
          })),
        );
      }

      // Verify Name Fetching: Log all user IDs found in data
      console.log("Academy: User IDs found in data:");
      console.log("  - Rounds:", roundUserIds);
      console.log("  - Drills:", drillUserIds);
      console.log("  - Practice:", practiceUserIds);
      console.log("  - Unique total:", uniqueUserIds);

      console.log(
        "Academy: Fetching profiles for",
        uniqueUserIds.length,
        "unique user IDs:",
        uniqueUserIds,
      );
      console.log(
        "Academy: Breakdown - Rounds:",
        roundUserIds.length,
        "Drills:",
        drillUserIds.length,
        "Practice:",
        practiceUserIds.length,
      );

      // Auto-Map Names: For every row fetched, look at the profiles table to find the matching full_name
      // Check the Mapping: Ensure it is correctly mapping the user_id to the full_name from my profile
      // Name Mapping: Match user_id from drill_scores table to id in profiles table
      // Verify Name Fetching: Ensure loadProfiles is fetching every single row from the profiles table
      const profiles = await fetchUserProfiles(uniqueUserIds);
      setUserProfiles(profiles);

      // Debug Log: Add console.log('Available Profiles:', profiles) to the load function
      console.log(
        "Academy: Available Profiles Map:",
        Array.from(profiles.entries()).map(([id, data]) => ({
          id,
          full_name: data.full_name || "Anonymous User",
          profile_icon: data.profile_icon,
          xp: data.xp,
        })),
      );

      // Check the Mapping: Log the mapping results for drills specifically
      const drillProfileMappings = drillUserIds.map((userId) => ({
        user_id: userId,
        full_name: profiles.get(userId)?.full_name || "NOT FOUND",
        profile_icon: profiles.get(userId)?.profile_icon || "NOT FOUND",
      }));
      if (drillProfileMappings.length > 0) {
        console.log(
          "Academy: Drill user_id to full_name mappings:",
          drillProfileMappings,
        );
      }

      // Map IDs to Names: Double-check that the practice, rounds, and drills leaderboards are correctly looking up the full_name
      const roundProfileMappings = roundUserIds.map((userId) => ({
        user_id: userId,
        full_name: profiles.get(userId)?.full_name || "NOT FOUND",
      }));
      if (roundProfileMappings.length > 0) {
        console.log(
          "Academy: Round user_id to full_name mappings:",
          roundProfileMappings,
        );
      }

      const practiceProfileMappings = practiceUserIds.map((userId) => ({
        user_id: userId,
        full_name: profiles.get(userId)?.full_name || "NOT FOUND",
      }));
      if (practiceProfileMappings.length > 0) {
        console.log(
          "Academy: Practice user_id to full_name mappings:",
          practiceProfileMappings,
        );
      }

      console.log(
        "Academy: Loaded profiles:",
        Array.from(profiles.entries()).map(([id, data]) => ({
          id,
          name: data.full_name || "Anonymous User",
        })),
      );
    };

    fetchProfiles();
  }, [rounds?.length, drills?.length, practiceSessions?.length]); // Re-fetch profiles when rounds, drills, or practice sessions change

  // Global Refresh: Ensure the XP Leaderboard refreshes immediately after the points are added
  // Realtime Filter: Not using Supabase Realtime - only listening to custom xpUpdated events
  // Add event listener for xpUpdated event to refresh profiles
  useEffect(() => {
    const handleXPUpdate = () => {
      console.log("Academy: Received xpUpdated event, refreshing profiles...");
      // Re-fetch profiles to get updated XP values
      const fetchProfiles = async () => {
        const roundUserIds = (rounds || [])
          .map((r: any) => r.user_id)
          .filter(Boolean);
        const drillUserIds = (drills || [])
          .map((d: any) => d.user_id)
          .filter(Boolean);
        const practiceUserIds = (practiceSessions || [])
          .map((p: any) => p.user_id)
          .filter(Boolean);
        const allUserIds = [
          ...roundUserIds,
          ...drillUserIds,
          ...practiceUserIds,
        ];
        const uniqueUserIds = Array.from(new Set(allUserIds));

        if (uniqueUserIds.length > 0) {
          const profiles = await fetchUserProfiles(uniqueUserIds);
          setUserProfiles(profiles);
          console.log("Academy: Profiles refreshed after XP update");
        }
      };
      fetchProfiles();
    };

    window.addEventListener("xpUpdated", handleXPUpdate);
    return () => {
      window.removeEventListener("xpUpdated", handleXPUpdate);
    };
  }, [rounds?.length, drills?.length, practiceSessions?.length]);

  // Calculate four-pillar leaderboards with loop guard
  useEffect(() => {
    if (!user?.id || rounds === undefined) {
      return;
    }

    try {
      const libraryLeaderboard = getMockLeaderboard(
        "library",
        timeFilter,
        rounds,
        userName,
        user,
        userProfiles,
        drills,
        practiceSessions,
      );
      const practiceLeaderboard = getMockLeaderboard(
        "practice",
        timeFilter,
        rounds,
        userName,
        user,
        userProfiles,
        drills,
        practiceSessions,
      );
      const roundsLeaderboard = getMockLeaderboard(
        "rounds",
        timeFilter,
        rounds,
        userName,
        user,
        userProfiles,
        drills,
        practiceSessions,
      );
      const drillsLeaderboard = getMockLeaderboard(
        "drills",
        timeFilter,
        rounds,
        userName,
        user,
        userProfiles,
        drills,
        practiceSessions,
      );

      // Circuit breaker: Prevent infinite loop with JSON.stringify comparison
      const newFourPillar = {
        library: libraryLeaderboard,
        practice: practiceLeaderboard,
        rounds: roundsLeaderboard,
        drills: drillsLeaderboard,
      };
      const newFourPillarStr = JSON.stringify(newFourPillar);
      const cachedFourPillarStr = JSON.stringify(cachedFourPillar);
      if (newFourPillarStr !== cachedFourPillarStr) {
        setCachedFourPillar(newFourPillar);
      }
    } catch (error) {
      console.error("Academy: Error calculating four-pillar leaderboards:", error);
    }
  }, [
    user?.id,
    rounds?.length,
    drills?.length,
    practiceSessions?.length,
    timeFilter,
    userName,
    userProfiles,
  ]);

  // Calculate score-based leaderboards (lowGross, lowNett, birdies, eagles, putts) with loop guard
  // Always calculate all score-based metrics so they're available when needed
  useEffect(() => {
    if (!user?.id || rounds === undefined) {
      return;
    }

    try {
      const totalXP = userProgress.totalXP || 0;
      
      // Calculate all score-based metrics and cache them
      const metrics = ["lowGross", "lowNett", "birdies", "eagles", "putts"] as const;
      const scoreBasedLeaderboards: Record<string, any> = {};
      
      metrics.forEach((metric) => {
        const leaderboard = getLeaderboardData(
          metric,
          timeFilter,
          rounds,
          totalXP,
          userName,
          user,
          userProfiles,
          practiceSessions,
          drills,
        );
        scoreBasedLeaderboards[metric] = leaderboard;
      });

      // Update cache for currently selected metric (circuit breaker prevents infinite loops)
      const currentMetric = leaderboardMetric;
      if (currentMetric === "lowGross" || currentMetric === "lowNett" || 
          currentMetric === "birdies" || currentMetric === "eagles" || currentMetric === "putts") {
        const scoreBasedLeaderboard = scoreBasedLeaderboards[currentMetric];
        
        // Circuit breaker: Prevent infinite loop with JSON.stringify comparison
        const newLeaderboardStr = JSON.stringify(scoreBasedLeaderboard);
        const cachedLeaderboardStr = JSON.stringify(cachedLeaderboard);
        if (newLeaderboardStr !== cachedLeaderboardStr) {
          setCachedLeaderboard(scoreBasedLeaderboard);
        }
      }
    } catch (error) {
      console.error("Academy: Error calculating score-based leaderboard:", error);
    }
  }, [
    user?.id,
    rounds?.length,
    drills?.length,
    practiceSessions?.length,
    timeFilter,
    userProgress.totalXP,
    userName,
    userProfiles,
    leaderboardMetric,
  ]);

  // Stable Identity: Wrap calculated values in useMemo to prevent recreation
  // Safe Logic: Do the check inside the useMemo rather than skipping the Hook entirely
  const currentLeaderboard = useMemo(() => {
    // Use getLeaderboardData for score-based metrics (lowGross, lowNett, birdies, eagles, putts)
    if (leaderboardMetric === "lowGross" || leaderboardMetric === "lowNett" || 
        leaderboardMetric === "birdies" || leaderboardMetric === "eagles" || leaderboardMetric === "putts") {
      if (cachedLeaderboard) {
        return cachedLeaderboard;
      }
      // Calculate on-demand if not cached yet
      if (user?.id && rounds) {
        const totalXP = userProgress.totalXP || 0;
        return getLeaderboardData(
          leaderboardMetric,
          timeFilter,
          rounds,
          totalXP,
          userName,
          user,
          userProfiles,
          practiceSessions,
          drills,
        );
      }
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    }

    // Use cachedFourPillar for four-pillar metrics
    if (!cachedFourPillar) {
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    }
    switch (leaderboardMetric) {
      case "library":
        return cachedFourPillar.library || { top3: [], all: [], userRank: 0, userValue: 0 };
      case "practice":
        return cachedFourPillar.practice || { top3: [], all: [], userRank: 0, userValue: 0 };
      case "rounds":
        return cachedFourPillar.rounds || { top3: [], all: [], userRank: 0, userValue: 0 };
      case "drills":
        return cachedFourPillar.drills || { top3: [], all: [], userRank: 0, userValue: 0 };
      default:
        return cachedFourPillar.library || { top3: [], all: [], userRank: 0, userValue: 0 };
    }
  }, [cachedFourPillar, cachedLeaderboard, leaderboardMetric, timeFilter, rounds, userProgress.totalXP, userName, user, userProfiles, practiceSessions, drills]);

  const top3 = useMemo(() => currentLeaderboard.top3, [currentLeaderboard]);
  const ranks4to7 = useMemo(
    () => currentLeaderboard.all.slice(3, 7),
    [currentLeaderboard],
  );
  const sortedLeaderboard = useMemo(
    () => currentLeaderboard.all,
    [currentLeaderboard],
  );

  // Find the lowest round across all entries for trophy icon - wrap in useMemo
  const globalLowRound = useMemo(() => {
    if (!sortedLeaderboard || sortedLeaderboard.length === 0) return null;
    const allLowRounds: number[] = sortedLeaderboard
      .map((entry: any) =>
        leaderboardMetric === "lowNett" ? entry.lowNett : entry.lowRound,
      )
      .filter(
        (score: any): score is number =>
          score !== null && score !== undefined && score > 0,
      );
    return allLowRounds.length > 0 ? Math.min(...allLowRounds) : null;
  }, [sortedLeaderboard, leaderboardMetric]);

  // Get four-pillar leaderboard data - wrap in useMemo
  // Safe Logic: Do the check inside the useMemo rather than skipping the Hook entirely
  const libraryLeaderboard = useMemo(() => {
    if (cachedFourPillar?.library) return cachedFourPillar.library;
    if (!rounds || !userName)
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard(
      "library",
      timeFilter,
      rounds,
      userName,
      user,
      userProfiles,
      drills,
      practiceSessions,
    );
  }, [
    cachedFourPillar?.library,
    timeFilter,
    rounds,
    userName,
    user,
    userProfiles,
    drills,
    practiceSessions,
  ]);

  const practiceLeaderboard = useMemo(() => {
    if (cachedFourPillar?.practice) return cachedFourPillar.practice;
    if (!rounds || !userName)
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard(
      "practice",
      timeFilter,
      rounds,
      userName,
      user,
      userProfiles,
      drills,
      practiceSessions,
    );
  }, [
    cachedFourPillar?.practice,
    timeFilter,
    rounds,
    userName,
    user,
    userProfiles,
    drills,
    practiceSessions,
  ]);

  const roundsLeaderboard = useMemo(() => {
    if (cachedFourPillar?.rounds) return cachedFourPillar.rounds;
    if (!rounds || !userName)
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard(
      "rounds",
      timeFilter,
      rounds,
      userName,
      user,
      userProfiles,
      drills,
      practiceSessions,
    );
  }, [
    cachedFourPillar?.rounds,
    timeFilter,
    rounds,
    userName,
    user,
    userProfiles,
    drills,
    practiceSessions,
  ]);

  const drillsLeaderboard = useMemo(() => {
    if (cachedFourPillar?.drills) return cachedFourPillar.drills;
    if (!rounds || !userName)
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard(
      "drills",
      timeFilter,
      rounds,
      userName,
      user,
      userProfiles,
      drills,
      practiceSessions,
    );
  }, [
    cachedFourPillar?.drills,
    timeFilter,
    rounds,
    userName,
    user,
    userProfiles,
    drills,
    practiceSessions,
  ]);

  // Filter leaderboard by search - wrap in useMemo for stable identity
  const filteredFullLeaderboard = useMemo(() => {
    if (!sortedLeaderboard) return [];
    if (!leaderboardSearch.trim()) return sortedLeaderboard;
    const searchLower = leaderboardSearch.toLowerCase();
    return sortedLeaderboard.filter((entry: any) =>
      entry.name.toLowerCase().includes(searchLower),
    );
  }, [sortedLeaderboard, leaderboardSearch]);

  // Fix the Hook Order error
  // Move All Hooks to the Top: Take every useState, useMemo, and useEffect (including the new ones on line 1323) and move them to the very top of the AcademyPage function
  // Check for Early Returns: Look for any line that says if (loading) return ... or if (!user) return .... These must be moved below all your hooks
  // Clean Up: If a useMemo or useEffect needs the user to exist, put the if (!user) return; check inside the hook's callback function, not around the hook itself
  // No Early Returns: Ensure there are no if (loading) return ... or if (!user) return ... statements appearing before any Hook
  // Now that all hooks are called, we can safely do early returns
  console.log(
    "Academy: Auth state - loading:",
    loading,
    "isAuthenticated:",
    isAuthenticated,
    "user:",
    user?.id,
  );

  if (loading && !loadingTimeout) {
    console.log("Academy: Showing loading spinner");
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  console.log("Academy: Fetching data...");

  // Circular avatar component - displays profile icon or initials
  const CircularAvatar = ({
    initial,
    iconId,
    size = 60,
    bgColor = "#FFA500",
  }: {
    initial: string;
    iconId?: string;
    size?: number;
    bgColor?: string;
  }) => {
    // Check if avatar is an icon ID (golf icon) or initials
    const selectedIcon = iconId
      ? GOLF_ICONS.find((icon: any) => icon.id === iconId)
      : null;
    const isIconId =
      iconId && GOLF_ICONS.some((icon: any) => icon.id === iconId);

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
        {/* Icon Alignment: Ensure the user-selected icons (like the golf flags) are centered perfectly inside the circles */}
        {isIconId ? (
          <div
            className="w-full h-full flex items-center justify-center p-2"
            style={{ fontSize: size * 0.35 }}
          >
            {(() => {
              const { GOLF_ICONS } = require("@/components/IconPicker");
              const icon = GOLF_ICONS.find((i: any) => i.id === iconId);
              return icon ? icon.emoji : initial;
            })()}
          </div>
        ) : (
          <span
            className="text-white font-bold"
            style={{ fontSize: size * 0.4 }}
          >
            {initial}
          </span>
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
              initial={
                userName
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("") || "J"
              }
              iconId={user?.profileIcon}
              size={64}
              bgColor="#FFA500"
            />
            {/* Identity Text - Centered */}
            <div className="text-center">
              <p className="text-lg text-gray-600 mb-1">Welcome back,</p>
              <h1 className="text-2xl font-bold text-gray-900">{userName}</h1>
              <p
                className="text-sm font-semibold mt-1"
                style={{ color: "#16a34a" }}
              >
                {userLevel}
              </p>
            </div>
          </div>
        </div>

        {/* Trophy Case - Achievement Gallery */}
        <div className="mb-6 w-full">
          <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
            {/* Header with Toggle Button: Place a small 'Show Locked' button/switch in the Trophy Case header */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Trophy Case
              </h2>
              <button
                onClick={() => setShowLocked(!showLocked)}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors rounded-md hover:bg-gray-50"
                aria-label={
                  showLocked ? "Hide locked trophies" : "Show locked trophies"
                }
              >
                {showLocked ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Show Locked</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide Locked</span>
                  </>
                )}
              </button>
            </div>

            {(() => {
              // Define the Collection: Show ALL possible trophies from TROPHY_LIST
              const earnedTrophyNames = new Set(
                dbTrophies.map((t: any) => t.trophy_name),
              );

              // Build complete trophy list with earned/locked status (Sync with Database: only earned trophies are in color)
              const allTrophies = TROPHY_LIST.map((trophy) => {
                const isEarned = earnedTrophyNames.has(trophy.name);
                const dbTrophy = dbTrophies.find(
                  (t: any) => t.trophy_name === trophy.name,
                );

                return {
                  trophy_name: trophy.name,
                  trophy_icon: undefined, // Use icon component via id
                  id: trophy.id,
                  description: trophy.requirement || dbTrophy?.description,
                  unlocked_at: dbTrophy?.unlocked_at,
                  isEarned: isEarned, // Track if trophy is earned (in database) or locked
                  requirement: trophy.requirement, // Store requirement for locked trophy modal
                };
              });

              // Filter Logic: If showLocked is false, filter to only show earned trophies
              const displayTrophies = showLocked
                ? allTrophies
                : allTrophies.filter((trophy) => trophy.isEarned !== false);

              // Shrink the Grid: Change the layout to grid-cols-6 and reduce the icon size so they look like small badges
              // Sync with Database: Ensure only earned trophies are in color (matching the Dashboard); the rest should be grayscale and opacity-40
              // Clickable Interaction: Ensure clicking any icon opens the selectedTrophy modal
              return displayTrophies.length > 0 ? (
                <div className="grid grid-cols-6 gap-1.5">
                  {displayTrophies.map((trophy, index) => {
                    const isEarned = trophy.isEarned !== false;
                    const IconComponent = trophy.trophy_icon || Trophy;

                    return (
                      <button
                        key={trophy.id || `trophy-${index}`}
                        onClick={() => setSelectedTrophy(trophy)}
                        className={`flex flex-col items-center justify-center rounded-md p-0.5 border transition-all duration-200 hover:scale-110 cursor-pointer aspect-square ${
                          isEarned
                            ? "border-[#FFA500]/30 bg-white/50 hover:bg-white hover:border-[#FFA500]"
                            : "border-gray-200 bg-gray-50/50 hover:bg-gray-100"
                        }`}
                        style={{
                          filter: isEarned
                            ? "none"
                            : "grayscale(100%) brightness(60%)",
                          opacity: isEarned ? 1 : 0.4,
                        }}
                      >
                        {isEarned ? (
                          <>
                            {/* Shrink the Grid: Reduce icon size so they look like small badges */}
                            <IconComponent
                              className="w-4 h-4"
                              style={{ color: "#FFA500" }}
                            />
                            <span className="text-[9px] text-gray-600 text-center mt-0.5 line-clamp-1 w-full leading-tight px-0.5">
                              {trophy.trophy_name}
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="relative">
                              {/* Shrink the Grid: Reduce icon size so they look like small badges */}
                              <IconComponent className="w-4 h-4 text-gray-400" />
                              {/* Lock emoji overlay - smaller */}
                              <span className="absolute -top-0.5 -right-0.5 text-[7px] leading-none">
                                🔒
                              </span>
                            </div>
                            <span className="text-[9px] text-gray-400 text-center mt-0.5 line-clamp-1 w-full leading-tight px-0.5">
                              {trophy.trophy_name}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500">
                    {showLocked
                      ? "Loading trophies..."
                      : "No unlocked trophies yet. Keep practicing!"}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Click for Detail: Ensure the 'Click-to-Expand' modal works on both Dashboard and Academy */}
        {/* Trophy Info Modal - Updated to work with database trophy format */}
        {selectedTrophy &&
          (() => {
            // Check if selectedTrophy is a TrophyData (old format) or database trophy (new format)
            const isDbTrophy = "trophy_name" in selectedTrophy;
            const trophyId = isDbTrophy
              ? selectedTrophy.id ||
                selectedTrophy.trophy_name?.toLowerCase().replace(/\s+/g, "-")
              : selectedTrophy.id;
            const trophyDef = TROPHY_LIST.find(
              (t) =>
                t.id === trophyId ||
                t.name ===
                  (isDbTrophy
                    ? selectedTrophy.trophy_name
                    : selectedTrophy.name),
            );

            // Icon mapping for database trophies (matches TrophyCard component)
            const getTrophyIconComponent = (id: string) => {
              const iconMap: Record<
                string,
                React.ComponentType<{ className?: string }>
              > = {
                "first-steps": Clock,
                dedicated: Clock,
                "practice-master": Target,
                "practice-legend": Flame,
                student: BookOpen,
                scholar: BookOpen,
                expert: BookOpen,
                "first-round": Trophy,
                consistent: Trophy,
                tracker: Trophy,
                "rising-star": Star,
                champion: Zap,
                elite: Crown,
                "goal-achiever": Medal,
                "birdie-hunter": Target,
                "breaking-90": Trophy,
                "breaking-80": Trophy,
                "breaking-70": Trophy,
                "eagle-eye": Star,
                "birdie-machine": Zap,
                "par-train": Trophy,
                "week-warrior": Flame,
                "monthly-legend": Crown,
                "putting-professor": BookOpen,
                "wedge-wizard": BookOpen,
                "coachs-pet": Award,
              };
              return iconMap[id] || Trophy;
            };

            // Fix TS Error 2339: Use icon for TrophyData, trophy_icon for database trophies
            const IconComponent = isDbTrophy
              ? selectedTrophy.trophy_icon
                ? Trophy
                : getTrophyIconComponent(trophyId || "")
              : (selectedTrophy as TrophyData).icon || Trophy;
            const displayIcon = isDbTrophy
              ? selectedTrophy.trophy_icon || null
              : null;
            const trophyName = isDbTrophy
              ? selectedTrophy.trophy_name
              : selectedTrophy.name;
            const isEarned = isDbTrophy
              ? (selectedTrophy as any).isEarned !== false
              : true;
            const description = isDbTrophy
              ? selectedTrophy.description ||
                trophyDef?.requirement ||
                "Achievement unlocked!"
              : selectedTrophy.requirement;
            const requirement = isDbTrophy
              ? (selectedTrophy as any).requirement ||
                trophyDef?.requirement ||
                description
              : selectedTrophy.requirement;
            const unlockedAt = isDbTrophy
              ? selectedTrophy.unlocked_at
              : undefined;

            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                onClick={() => setSelectedTrophy(null)}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative animate-in zoom-in-95 duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Close Button */}
                  <button
                    onClick={() => setSelectedTrophy(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
                    aria-label="Close modal"
                  >
                    <X className="w-6 h-6" />
                  </button>

                  {/* Detailed View: Large version of the trophy icon, trophy name in bold, and full description */}
                  <div className="flex flex-col items-center text-center">
                    {/* Large Trophy Icon */}
                    {displayIcon ? (
                      <div className="mb-6">
                        <span className="text-7xl">{displayIcon}</span>
                      </div>
                    ) : (
                      <div
                        className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-lg ${
                          isEarned ? "" : "opacity-50"
                        }`}
                        style={{
                          backgroundColor: isEarned ? "#FFA500" : "#9CA3AF",
                        }}
                      >
                        <IconComponent className="w-12 h-12 text-white" />
                        {!isEarned && (
                          <span className="absolute text-2xl">🔒</span>
                        )}
                      </div>
                    )}

                    {/* The full title */}
                    <h3 className="text-3xl font-bold text-gray-900 mb-3">
                      {trophyName}
                    </h3>

                    {/* Detailed Description: Full description of why the trophy was earned or locked requirement */}
                    {isEarned ? (
                      <p className="text-gray-600 mb-6 text-base leading-relaxed px-2">
                        {description}
                      </p>
                    ) : (
                      <div className="bg-gray-100 rounded-lg p-4 mb-6">
                        <p className="text-gray-800 mb-2 font-semibold">
                          🔒 Locked
                        </p>
                        <p className="text-gray-600 text-base leading-relaxed">
                          Complete{" "}
                          <strong>
                            {requirement || description || "this requirement"}
                          </strong>{" "}
                          to unlock this trophy!
                        </p>
                      </div>
                    )}

                    {/* Date Display: Show the 'Unlocked on' date using the unlocked_at timestamp */}
                    {unlockedAt && (
                      <div className="mt-2 pt-4 border-t border-gray-200 w-full">
                        <p className="text-sm text-gray-500">
                          Unlocked on{" "}
                          {new Date(unlockedAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

        {/* Four-Pillar Leaderboards - 2x2 Grid (Desktop) / Vertical Stack (Mobile) */}
        <div className="mb-6 w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
            {/* Library Lessons Leaderboard */}
            {(() => {
              const data = libraryLeaderboard;
              return (
                <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
                  <h3 className="text-base font-semibold text-gray-900 mb-3 text-center">
                    Library Lessons
                  </h3>

                  {/* Top 3 Podium or Empty State */}
                  {data.all.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500">
                        No rankings yet. Start logging to take the lead!
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Visual Cleanup: Pull the podium up by applying mt-[-25px] to the player circles to fix the gap under the titles */}
                      <div className="mt-[-25px]">
                        <div className="h-[160px] flex items-end justify-center gap-2 mb-4">
                        {/* 2nd Place */}
                        {data.top3[1] && (
                        <div className="flex flex-col items-center justify-end">
                          {/* Unified Names: Ensure every single name display uses the clean fallback */}
                          {(() => {
                            const entry = data.top3[1];
                            const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                            return (
                              <>
                                <CircularAvatar
                                  initial={displayName[0]}
                                  iconId={
                                    data.top3[1].avatar &&
                                    GOLF_ICONS.some(
                                      (icon: any) =>
                                        icon.id === data.top3[1].avatar,
                                    )
                                      ? data.top3[1].avatar
                                      : undefined
                                  }
                                  size={48}
                                  bgColor="#C0C0C0"
                                />
                                {/* Center Text: Ensure the name text is centered under the user's icon circle */}
                                <div className="text-center mt-1">
                                  <div className="text-xs font-bold text-gray-900">
                                    #{2}
                                  </div>
                                  <div className="text-xs font-semibold text-gray-900">
                                    {displayName}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    {formatMetricValue(data.top3[1].value, "library")}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {/* 1st Place - Center, Higher */}
                      {data.top3[0] && (
                        <div className="flex flex-col items-center justify-end relative">
                          <Crown
                            className="w-4 h-4 absolute -top-2"
                            style={{ color: "#FFA500" }}
                          />
                          {/* Unified Names: Ensure every single name display uses the clean fallback */}
                          {(() => {
                            const entry = data.top3[0];
                            const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                            return (
                              <>
                                <CircularAvatar
                                  initial={displayName[0]}
                                  iconId={
                                    data.top3[0].avatar &&
                                    GOLF_ICONS.some(
                                      (icon: any) =>
                                        icon.id === data.top3[0].avatar,
                                    )
                                      ? data.top3[0].avatar
                                      : undefined
                                  }
                                  size={64}
                                  bgColor="#FFA500"
                                />
                                {/* Center Text: Ensure the name text is centered under the user's icon circle */}
                                <div className="text-center mt-1">
                                  <div className="text-sm font-bold text-gray-900">
                                    #{1}
                                  </div>
                                  <div className="text-xs font-semibold text-gray-900">
                                    {displayName}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    {formatMetricValue(data.top3[0].value, "library")}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {/* 3rd Place */}
                      {data.top3[2] && (
                        <div className="flex flex-col items-center justify-end">
                          {/* Unified Names: Ensure every single name display uses the clean fallback */}
                          {(() => {
                            const entry = data.top3[2];
                            const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                            return (
                              <>
                                <CircularAvatar
                                  initial={displayName[0]}
                                  iconId={
                                    data.top3[2].avatar &&
                                    GOLF_ICONS.some(
                                      (icon: any) =>
                                        icon.id === data.top3[2].avatar,
                                    )
                                      ? data.top3[2].avatar
                                      : undefined
                                  }
                                  size={48}
                                  bgColor="#CD7F32"
                                />
                                {/* Center Text: Ensure the name text is centered under the user's icon circle */}
                                <div className="text-center mt-1">
                                  <div className="text-xs font-bold text-gray-900">
                                    #{3}
                                  </div>
                                  <div className="text-xs font-semibold text-gray-900">
                                    {displayName}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    {formatMetricValue(data.top3[2].value, "library")}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* User Rank or Empty State */}
                  {data.all.length === 0 ? (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-500">
                        No rankings yet. Start logging to take the lead!
                      </p>
                    </div>
                  ) : (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm font-semibold text-gray-700">
                        Your Rank:{" "}
                        <span className="text-[#014421]">
                          {data.userRank === 0
                            ? "Unranked"
                            : `#${data.userRank}`}
                        </span>{" "}
                        |{" "}
                        <span className="text-[#FFA500]">
                          {formatMetricValue(data.userValue, "library")}
                        </span>
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
                  <h3 className="text-base font-semibold text-gray-900 mb-3 text-center">
                    Practice Time
                  </h3>

                  {/* Top 3 Podium */}
                  {data.all.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500">
                        No rankings yet. Start logging to take the lead!
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Visual Cleanup: Pull the podium up by applying mt-[-25px] to the player circles to fix the gap under the titles */}
                      <div className="mt-[-25px]">
                        <div className="h-[160px] flex items-end justify-center gap-2 mb-4">
                          {data.top3[1] && (
                            <div className="flex flex-col items-center justify-end">
                              {/* Unified Names: Ensure every single name display uses the clean fallback */}
                              {(() => {
                                const entry = data.top3[1];
                                const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                                return (
                                  <>
                                    <CircularAvatar
                                      initial={displayName[0]}
                                  iconId={
                                    data.top3[1].avatar &&
                                    GOLF_ICONS.some(
                                      (icon: any) => icon.id === data.top3[1].avatar,
                                    )
                                      ? data.top3[1].avatar
                                      : undefined
                                  }
                                  size={48}
                                  bgColor="#C0C0C0"
                                />
                                {/* Center Text: Ensure the name text is centered under the user's icon circle */}
                                <div className="text-center mt-1">
                                  <div className="text-xs font-bold text-gray-900">
                                    #{2}
                                  </div>
                                  <div className="text-xs font-semibold text-gray-900">
                                    {displayName}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    {formatMetricValue(
                                      data.top3[1].value,
                                      "practice",
                                    )}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                      {data.top3[0] && (
                        <div className="flex flex-col items-center justify-end relative">
                          <Crown
                            className="w-4 h-4 absolute -top-2"
                            style={{ color: "#FFA500" }}
                          />
                          {/* Unified Names: Ensure every single name display uses the clean fallback */}
                          {(() => {
                            const entry = data.top3[0];
                            const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                            return (
                              <>
                                <CircularAvatar
                                  initial={displayName[0]}
                                  iconId={
                                    data.top3[0].avatar &&
                                    GOLF_ICONS.some(
                                      (icon: any) => icon.id === data.top3[0].avatar,
                                    )
                                      ? data.top3[0].avatar
                                      : undefined
                                  }
                                  size={64}
                                  bgColor="#FFA500"
                                />
                                {/* Center Text: Ensure the name text is centered under the user's icon circle */}
                                <div className="text-center mt-1">
                                  <div className="text-sm font-bold text-gray-900">
                                    #{1}
                                  </div>
                                  <div className="text-xs font-semibold text-gray-900">
                                    {displayName}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    {formatMetricValue(
                                      data.top3[0].value,
                                      "practice",
                                    )}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                      {data.top3[2] && (
                        <div className="flex flex-col items-center justify-end">
                          {/* Unified Names: Ensure every single name display uses the clean fallback */}
                          {(() => {
                            const entry = data.top3[2];
                            const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                            return (
                              <>
                                <CircularAvatar
                                  initial={displayName[0]}
                                  iconId={
                                    data.top3[2].avatar &&
                                    GOLF_ICONS.some(
                                      (icon: any) => icon.id === data.top3[2].avatar,
                                    )
                                      ? data.top3[2].avatar
                                      : undefined
                                  }
                                  size={48}
                                  bgColor="#CD7F32"
                                />
                                {/* Center Text: Ensure the name text is centered under the user's icon circle */}
                                <div className="text-center mt-1">
                                  <div className="text-xs font-bold text-gray-900">
                                    #{3}
                                  </div>
                                  <div className="text-xs font-semibold text-gray-900">
                                    {displayName}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    {formatMetricValue(
                                      data.top3[2].value,
                                      "practice",
                                    )}
                                  </div>
                                </div>
                              </>
                            );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {data.all.length === 0 ? (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-500">
                        No rankings yet. Start logging to take the lead!
                      </p>
                    </div>
                  ) : (
                    <div className="text-center pt-3 border-t border-gray-200">
                      <p className="text-sm font-semibold text-gray-700">
                        Your Rank:{" "}
                        <span className="text-[#014421]">
                          {data.userRank === 0
                            ? "Unranked"
                            : `#${data.userRank}`}
                        </span>{" "}
                        |{" "}
                        <span className="text-[#FFA500]">
                          {formatMetricValue(data.userValue, "practice")}
                        </span>
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
                  {/* Header Alignment: Title at top with minimal padding */}
                  <h3 className="text-base font-semibold text-gray-900 mb-0 text-center">
                    Rounds
                  </h3>

                  {data.all.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500">
                        No rankings yet. Start logging to take the lead!
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Kill the Gap: Apply mt-[-20px] to pull players up and remove massive white space under titles */}
                      <div className="mt-[-20px]">
                        {/* The Stage: Fixed 100px height for circles only */}
                        <div className="h-[100px] flex items-end justify-center gap-3">
                        {data.top3[1] && (
                          <div className="flex flex-col items-center justify-end">
                            <CircularAvatar
                              initial={(data.top3[1].full_name || data.top3[1].name || "U")[0]}
                              iconId={
                                data.top3[1].avatar &&
                                GOLF_ICONS.some(
                                  (icon: any) => icon.id === data.top3[1].avatar,
                                )
                                  ? data.top3[1].avatar
                                  : undefined
                              }
                              size={44}
                              bgColor="#C0C0C0"
                            />
                          </div>
                        )}
                        {data.top3[0] && (
                          <div className="flex flex-col items-center justify-end relative">
                            {/* Crown Positioning: Absolute so it floats over the circle */}
                            <Crown
                              className="w-4 h-4 absolute -top-2"
                              style={{ color: "#FFA500" }}
                            />
                            <CircularAvatar
                              initial={(data.top3[0].full_name || data.top3[0].name || "U")[0]}
                              iconId={
                                data.top3[0].avatar &&
                                GOLF_ICONS.some(
                                  (icon: any) => icon.id === data.top3[0].avatar,
                                )
                                  ? data.top3[0].avatar
                                  : undefined
                              }
                              size={56}
                              bgColor="#FFA500"
                            />
                          </div>
                        )}
                        {data.top3[2] && (
                          <div className="flex flex-col items-center justify-end">
                            <CircularAvatar
                              initial={(data.top3[2].full_name || data.top3[2].name || "U")[0]}
                              iconId={
                                data.top3[2].avatar &&
                                GOLF_ICONS.some(
                                  (icon: any) => icon.id === data.top3[2].avatar,
                                )
                                  ? data.top3[2].avatar
                                  : undefined
                              }
                              size={44}
                              bgColor="#CD7F32"
                            />
                          </div>
                        )}
                        </div>
                        {/* Label Cleanup: Reduce gap between circle and name to mt-1 */}
                        {/* Fixed Name Height: Wrap names in fixed height container to prevent layout shifts */}
                        <div className="flex items-start justify-center gap-3 mb-4 mt-1">
                          {data.top3[1] && (
                            <div className="flex flex-col items-center">
                              {(() => {
                                const entry = data.top3[1];
                                const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                                return (
                                  <div className="text-center">
                                    <div className="text-xs font-bold text-gray-900">
                                      #{2}
                                    </div>
                                    {/* Fixed Name Height: Prevents long names from pushing layout */}
                                    <div className="h-[40px] flex items-center justify-center text-center">
                                      <div className="text-xs font-semibold text-gray-900">
                                        {displayName}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      {formatMetricValue(data.top3[1].value, "rounds")}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {data.top3[0] && (
                            <div className="flex flex-col items-center">
                              {(() => {
                                const entry = data.top3[0];
                                const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                                return (
                                  <div className="text-center">
                                    <div className="text-sm font-bold text-gray-900">
                                      #{1}
                                    </div>
                                    {/* Fixed Name Height: Prevents long names from pushing layout */}
                                    <div className="h-[40px] flex items-center justify-center text-center">
                                      <div className="text-xs font-semibold text-gray-900">
                                        {displayName}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      {formatMetricValue(data.top3[0].value, "rounds")}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {data.top3[2] && (
                            <div className="flex flex-col items-center">
                              {(() => {
                                const entry = data.top3[2];
                                const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                                return (
                                  <div className="text-center">
                                    <div className="text-xs font-bold text-gray-900">
                                      #{3}
                                    </div>
                                    {/* Fixed Name Height: Prevents long names from pushing layout */}
                                    <div className="h-[40px] flex items-center justify-center text-center">
                                      <div className="text-xs font-semibold text-gray-900">
                                        {displayName}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      {formatMetricValue(data.top3[2].value, "rounds")}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-center pt-3 border-t border-gray-200">
                        <p className="text-sm font-semibold text-gray-700">
                          Your Rank:{" "}
                          <span className="text-[#014421]">
                            {data.userRank === 0
                              ? "Unranked"
                              : `#${data.userRank}`}
                          </span>{" "}
                          |{" "}
                          <span className="text-[#FFA500]">
                            {formatMetricValue(data.userValue, "rounds")}
                          </span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Drills Leaderboard */}
            {(() => {
              const data = drillsLeaderboard;
              return (
                <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm w-full">
                  {/* Header Alignment: Title at top with minimal padding */}
                  <h3 className="text-base font-semibold text-gray-900 mb-0 text-center">
                    Drills
                  </h3>

                  {data.all.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500">
                        No rankings yet. Start logging to take the lead!
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Kill the Gap: Apply mt-[-20px] to pull players up and remove massive white space under titles */}
                      <div className="mt-[-20px]">
                        {/* The Stage: Fixed 100px height for circles only */}
                        <div className="h-[100px] flex items-end justify-center gap-3">
                        {data.top3[1] && (
                          <div className="flex flex-col items-center justify-end">
                            <CircularAvatar
                              initial={(data.top3[1].full_name || data.top3[1].name || "U")[0]}
                              iconId={
                                data.top3[1].avatar &&
                                GOLF_ICONS.some(
                                  (icon: any) =>
                                    icon.id === data.top3[1].avatar,
                                )
                                  ? data.top3[1].avatar
                                  : undefined
                              }
                              size={44}
                              bgColor="#C0C0C0"
                            />
                          </div>
                        )}
                        {data.top3[0] && (
                          <div className="flex flex-col items-center justify-end relative">
                            {/* Crown Positioning: Absolute so it floats over the circle */}
                            <Crown
                              className="w-4 h-4 absolute -top-2"
                              style={{ color: "#FFA500" }}
                            />
                            <CircularAvatar
                              initial={(data.top3[0].full_name || data.top3[0].name || "U")[0]}
                              iconId={
                                data.top3[0].avatar &&
                                GOLF_ICONS.some(
                                  (icon: any) =>
                                    icon.id === data.top3[0].avatar,
                                )
                                  ? data.top3[0].avatar
                                  : undefined
                              }
                              size={56}
                              bgColor="#FFA500"
                            />
                          </div>
                        )}
                        {data.top3[2] && (
                          <div className="flex flex-col items-center justify-end">
                            <CircularAvatar
                              initial={(data.top3[2].full_name || data.top3[2].name || "U")[0]}
                              iconId={
                                data.top3[2].avatar &&
                                GOLF_ICONS.some(
                                  (icon: any) =>
                                    icon.id === data.top3[2].avatar,
                                )
                                  ? data.top3[2].avatar
                                  : undefined
                              }
                              size={44}
                              bgColor="#CD7F32"
                            />
                          </div>
                        )}
                        </div>
                        {/* Label Cleanup: Reduce gap between circle and name to mt-1 */}
                        {/* Fixed Name Height: Wrap names in fixed height container to prevent layout shifts */}
                        <div className="flex items-start justify-center gap-3 mb-4 mt-1">
                          {data.top3[1] && (
                            <div className="flex flex-col items-center">
                              {(() => {
                                const entry = data.top3[1];
                                const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || entry.name || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                                return (
                                  <div className="text-center">
                                    <div className="text-xs font-bold text-gray-900">
                                      #{2}
                                    </div>
                                    {/* Fixed Name Height: Prevents long names from pushing layout */}
                                    <div className="h-[40px] flex items-center justify-center text-center">
                                      <div className="text-xs font-semibold text-gray-900">
                                        {displayName}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      {formatMetricValue(
                                        data.top3[1].value,
                                        "drills",
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {data.top3[0] && (
                            <div className="flex flex-col items-center">
                              {(() => {
                                const displayName = data.top3[0].name.includes("@")
                                  ? data.top3[0].name.split("@")[0]
                                  : data.top3[0].name;
                                return (
                                  <div className="text-center">
                                    <div className="text-sm font-bold text-gray-900">
                                      #{1}
                                    </div>
                                    {/* Fixed Name Height: Prevents long names from pushing layout */}
                                    <div className="h-[40px] flex items-center justify-center text-center">
                                      <div className="text-xs font-semibold text-gray-900">
                                        {displayName}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      {formatMetricValue(
                                        data.top3[0].value,
                                        "drills",
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {data.top3[2] && (
                            <div className="flex flex-col items-center">
                              {(() => {
                                const displayName = data.top3[2].name.includes("@")
                                  ? data.top3[2].name.split("@")[0]
                                  : data.top3[2].name;
                                return (
                                  <div className="text-center">
                                    <div className="text-xs font-bold text-gray-900">
                                      #{3}
                                    </div>
                                    {/* Fixed Name Height: Prevents long names from pushing layout */}
                                    <div className="h-[40px] flex items-center justify-center text-center">
                                      <div className="text-xs font-semibold text-gray-900">
                                        {displayName}
                                      </div>
                                    </div>
                                    <div className="text-xs text-gray-600 mt-1">
                                      {formatMetricValue(
                                        data.top3[2].value,
                                        "drills",
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-center pt-3 border-t border-gray-200">
                        <p className="text-sm font-semibold text-gray-700">
                          Your Rank:{" "}
                          <span className="text-[#014421]">
                            {data.userRank === 0
                              ? "Unranked"
                              : `#${data.userRank}`}
                          </span>{" "}
                          |{" "}
                          <span className="text-[#FFA500]">
                            {formatMetricValue(data.userValue, "drills")}
                          </span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Unified Leaderboard Card */}
        <div className="mb-6 w-full">
          <div className="rounded-2xl p-4 sm:p-6 bg-white border border-gray-200 shadow-sm w-full">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4 text-center">
              Overall Leaderboard
            </h2>

            {/* Time Filter Buttons - Top Row */}
            <div className="mb-4 w-full">
              <div className="flex items-center justify-center gap-2 sm:gap-2.5 px-2 sm:px-4 flex-wrap">
                {(["week", "month", "year", "allTime"] as const).map((filter) => {
                  const labels = {
                    week: "This Week",
                    month: "This Month",
                    year: "This Year",
                    allTime: "All-Time",
                  };

                  return (
                    <button
                      key={filter}
                      onClick={() => {
                        setIsFiltering(true);
                        setTimeFilter(filter);
                        setTimeout(() => setIsFiltering(false), 300);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        timeFilter === filter
                          ? "text-white"
                          : "text-gray-600 bg-gray-100"
                      }`}
                      style={
                        timeFilter === filter
                          ? { backgroundColor: "#014421" }
                          : {}
                      }
                    >
                      {labels[filter]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category Dropdown - Middle Row */}
            <div className="mb-6 w-full">
              <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
                <label htmlFor="category-select" className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">
                  Category:
                </label>
                <select
                  id="category-select"
                  value={leaderboardMetric}
                  onChange={(e) => {
                    const selectedMetric = e.target.value as typeof leaderboardMetric;
                    setLeaderboardMetric(selectedMetric);
                  }}
                  className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium text-gray-900 bg-white border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#014421] focus:border-[#014421] transition-colors cursor-pointer w-full sm:w-auto"
                  style={{ minWidth: '180px', maxWidth: '100%' }}
                >
                  <option value="library">Library</option>
                  <option value="practice">Practice</option>
                  <option value="drills">Drills</option>
                  <option value="rounds">Rounds Entered</option>
                  <option value="lowGross">Low Gross</option>
                  <option value="lowNett">Low Nett</option>
                  <option value="birdies">Birdies</option>
                  <option value="eagles">Eagles</option>
                  <option value="putts">Putts</option>
                </select>
              </div>
            </div>

            {/* Top 3 Leaders Section */}
            <div className="mb-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4 text-center">
                Top 3 Leaders
              </h3>
            {(() => {

              // Register XP: Ensure the list rendering logic uses {profile.xp || 0} XP from database

              // Add Null Check: Ensure the leaderboard component only renders if leaderboardData exists, but provide a 'No Data' state instead of a white screen
              // Verify the Variable: Make sure leaderboardData is being calculated using the rounds from StatsContext and that it isn't being filtered out by a mismatching user_id
              // Handle Empty State: Show message when no data is available
              // DUMP TO UI: Show debug message if leaderboard is empty
              if (
                !currentLeaderboard ||
                !sortedLeaderboard ||
                sortedLeaderboard.length === 0
              ) {
                // DUMP TO UI: Show debug message if available
                const debugMessage = (currentLeaderboard as any)?.debugMessage;
                return (
                  <div className="text-center py-12">
                    {debugMessage ? (
                      <p className="text-sm text-gray-700 font-medium">
                        {debugMessage}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500">
                        No rankings yet. Start logging to take the lead!
                      </p>
                    )}
                  </div>
                );
              }

              // Render the actual leaderboard
              // Alignment: Wrap the Top 3 profile circles in a div with flex items-end to fix the lopsided look and apply mt-[-25px] to remove the gap under the title
              return (
                <div className="max-w-md mx-auto mt-[-25px]">
                  <div className="flex items-end justify-center gap-3">
                    {/* 2nd Place */}
                    {top3[1] && (
                      <div className="flex flex-col items-center">
                        {/* Unified Names: Ensure every single name display uses the clean fallback */}
                        {(() => {
                          const entry = top3[1];
                          const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                          return (
                            <>
                              <CircularAvatar
                                initial={displayName[0]}
                                iconId={
                                  top3[1].avatar &&
                                  GOLF_ICONS.some(
                                    (icon: any) => icon.id === top3[1].avatar,
                                  )
                                    ? top3[1].avatar
                                    : undefined
                                }
                                size={60}
                                bgColor="#C0C0C0"
                              />
                              <div className="text-center mt-2">
                                <div className="text-sm font-bold text-gray-900">
                                  #{2}
                                </div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {displayName}
                                </div>
                                {/* Connect to Real Data: Use value from leaderboardData array */}
                                <div className="text-xs text-gray-600">
                                  {formatLeaderboardValue(
                                    top3[1].value,
                                    leaderboardMetric,
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* 1st Place - Center, Higher, with Crown */}
                    {top3[0] && (
                      <div className="flex flex-col items-center">
                        <Crown
                          className="w-6 h-6 mb-1 animate-pulse"
                          style={{ color: "#FFA500" }}
                        />
                        {/* Unified Names: Ensure every single name display uses the clean fallback */}
                        {(() => {
                          const entry = top3[0];
                          const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                          return (
                            <>
                              <CircularAvatar
                                initial={displayName[0]}
                                iconId={
                                  top3[0].avatar &&
                                  GOLF_ICONS.some(
                                    (icon: any) => icon.id === top3[0].avatar,
                                  )
                                    ? top3[0].avatar
                                    : undefined
                                }
                                size={80}
                                bgColor="#FFA500"
                              />
                              <div className="text-center mt-2">
                                <div className="text-base font-bold text-gray-900">
                                  #{1}
                                </div>
                                <div className="text-base font-semibold text-gray-900">
                                  {displayName}
                                </div>
                                {/* Find the top3 calculation: Ensure Top3Leaders uses values from allEntries array (which uses roundsByUser.get(userId).length) */}
                                {/* Update Sub-label: Ensure the text below the name says {entry.value} Rounds instead of a static number */}
                                {/* Remove Mock Fallbacks: Verify this is using entry.value from allEntries, not hardcoded 4000 */}
                                <div className="text-xs text-gray-600">
                                  {formatLeaderboardValue(
                                    top3[0].value,
                                    leaderboardMetric,
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* 3rd Place */}
                    {top3[2] && (
                      <div className="flex flex-col items-center">
                        {/* Unified Names: Ensure every single name display uses the clean fallback */}
                        {(() => {
                          const entry = top3[2];
                          const displayName = entry.full_name || entry.display_name || (entry.email?.includes("@") ? entry.email.split("@")[0] : entry.email) || (entry.name?.includes("@") ? entry.name.split("@")[0] : entry.name) || "Academy Member";
                          return (
                            <>
                              <CircularAvatar
                                initial={displayName[0]}
                                iconId={
                                  top3[2].avatar &&
                                  GOLF_ICONS.some(
                                    (icon: any) => icon.id === top3[2].avatar,
                                  )
                                    ? top3[2].avatar
                                    : undefined
                                }
                                size={60}
                                bgColor="#CD7F32"
                              />
                              <div className="text-center mt-2">
                                <div className="text-sm font-bold text-gray-900">
                                  #{3}
                                </div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {displayName}
                                </div>
                                {/* Connect to Real Data: Use value from leaderboardData array */}
                                <div className="text-xs text-gray-600">
                                  {formatLeaderboardValue(
                                    top3[2].value,
                                    leaderboardMetric,
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            </div>

            {/* Full Leaderboard List Section - Works for ALL categories (Library, Practice, Drills, Low Gross, Low Nett, Birdies, Eagles) */}
            {sortedLeaderboard && sortedLeaderboard.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900">
                    Full Rankings
                  </h3>
                  <button
                    onClick={() => setShowFullLeaderboard(!showFullLeaderboard)}
                    className="text-sm font-medium text-[#014421] hover:underline"
                  >
                    {showFullLeaderboard ? "Show Less" : "View Full"}
                  </button>
                </div>

                {sortedLeaderboard.length > 3 && (
                  <div className="space-y-2">
                    {(showFullLeaderboard
                      ? sortedLeaderboard.slice(3)
                      : sortedLeaderboard.slice(3, 6)
                    ).map((entry: any, index: number) => {
                    const rank = index + 4;
                    const displayName =
                      entry.full_name ||
                      entry.display_name ||
                      (entry.email?.includes("@")
                        ? entry.email.split("@")[0]
                        : entry.email) ||
                      (entry.name?.includes("@")
                        ? entry.name.split("@")[0]
                        : entry.name) ||
                      "Academy Member";

                    // Unified value extraction for ALL metrics:
                    // Practice: entry.value = totalHours
                    // Drills: entry.value = drillCount  
                    // Library: entry.value = lessons_completed count
                    // Low Gross: entry.value = min(score_gross)
                    // Birdies: entry.value = sum(birdies_count)
                    const entryValue = entry.value !== undefined && entry.value !== null ? entry.value : 0;

                    return (
                      <div
                        key={entry.id || `entry-${rank}`}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          entry.isCurrentUser
                            ? "bg-green-50 border border-green-200"
                            : "bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-bold text-gray-600 w-8">
                            #{rank}
                          </div>
                          <CircularAvatar
                            initial={displayName[0]}
                            iconId={
                              entry.avatar &&
                              GOLF_ICONS.some(
                                (icon: any) => icon.id === entry.avatar,
                              )
                                ? entry.avatar
                                : undefined
                            }
                            size={40}
                            bgColor={
                              entry.isCurrentUser ? "#014421" : "#9CA3AF"
                            }
                          />
                          <div className="text-sm font-medium text-gray-900">
                            {displayName}
                          </div>
                        </div>
                        <div className="text-sm text-gray-600">
                          {formatLeaderboardValue(
                            entryValue,
                            leaderboardMetric,
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
