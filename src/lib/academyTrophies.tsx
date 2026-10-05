import type React from "react";
import {
  Trophy,
  Award,
  Medal,
  Crown,
  Target,
  BookOpen,
  Clock,
  Zap,
  Star,
  Flame,
  Crosshair,
} from "lucide-react";
import { puttingTestConfig } from "@/lib/puttingTestConfig";
import { userIsPuttingTestLeader } from "@/lib/puttingTestLeaderboard";
import { countUserCombineCompletions } from "@/lib/combineCompletionDetection";

/** Display name; catalog label for `achievement_id` stored in `user_trophies`. */
export const PUTTING_TEST_CHAMPION_TROPHY_NAME = `Champion: ${puttingTestConfig.testName}`;

// Trophy/Achievement data structure
export interface TrophyData {
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
    userId?: string;
    practiceSessions?: any[];
    practiceLogs?: any[];
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
    userId?: string;
    practiceSessions?: any[];
    practiceLogs?: any[];
  }) => { current: number; target: number; percentage: number };
  isRare?: boolean; // For special styling (e.g., Eagle Eye)
}

/** Drill ids Coach's Insights has recommended (written by `AIPlayerInsights`). */
export const RECOMMENDED_DRILLS_STORAGE_KEY = "recommendedDrills";

function completedRecommendedDrillCount(
  practiceSessions: readonly { notes?: unknown; type?: unknown }[] | undefined,
): number {
  if (typeof window === "undefined") return 0;
  try {
    const recommended = new Set<string>(
      JSON.parse(localStorage.getItem(RECOMMENDED_DRILLS_STORAGE_KEY) || "[]"),
    );
    if (recommended.size === 0) return 0;
    const done = new Set<string>();
    for (const row of practiceSessions || []) {
      const notes = typeof row?.notes === "string" ? row.notes.toLowerCase() : "";
      const key = String(row?.type ?? "").trim();
      if (notes.startsWith("completed drill") && recommended.has(key)) done.add(key);
    }
    const userProgress = JSON.parse(localStorage.getItem("userProgress") || "{}");
    for (const id of userProgress.completedDrills || []) {
      if (recommended.has(id)) done.add(id);
    }
    for (const [id, n] of Object.entries(userProgress.drillCompletions || {})) {
      if (recommended.has(id) && Number(n) > 0) done.add(id);
    }
    return done.size;
  } catch {
    return 0;
  }
}

export const TROPHY_LIST: TrophyData[] = [
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
    requirement: "Watch 5 library lessons to the end",
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
    requirement: "Watch 20 library lessons to the end",
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
    requirement: "Watch 50 library lessons to the end",
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
    requirement: "Complete 5 putting drills",
    category: "Knowledge",
    icon: BookOpen,
    checkUnlocked: (stats) => {
      if (!stats.libraryCategories) return false;
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
    requirement: "Complete 5 wedge drills",
    category: "Knowledge",
    icon: BookOpen,
    checkUnlocked: (stats) => {
      if (!stats.libraryCategories) return false;
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
    requirement: "Complete a drill recommended in Coach's Insights",
    category: "Performance",
    icon: Award,
    checkUnlocked: (stats) => completedRecommendedDrillCount(stats.practiceSessions) >= 1,
    getProgress: (stats) => {
      const n = completedRecommendedDrillCount(stats.practiceSessions);
      return { current: n, target: 1, percentage: n > 0 ? 100 : 0 };
    },
  },
  {
    id: "combine-finisher",
    name: "Combine Finisher",
    requirement: "Finish any combine test in Practice",
    category: "Practice",
    icon: Crosshair,
    checkUnlocked: (stats) => countUserCombineCompletions(stats) >= 1,
    getProgress: (stats) => {
      const n = countUserCombineCompletions(stats);
      return {
        current: n,
        target: 1,
        percentage: n > 0 ? 100 : 0,
      };
    },
  },
  {
    id: "champion-putting-test-18",
    name: PUTTING_TEST_CHAMPION_TROPHY_NAME,
    requirement: `Hold #1 on the ${puttingTestConfig.testName} leaderboard (ties count)`,
    category: "Performance",
    icon: Crown,
    checkUnlocked: (stats) => {
      if (!stats.userId || !stats.practiceSessions?.length) return false;
      return userIsPuttingTestLeader(stats.userId, stats.practiceSessions);
    },
    getProgress: (stats) => {
      const unlocked =
        !!stats.userId &&
        !!stats.practiceSessions?.length &&
        userIsPuttingTestLeader(stats.userId, stats.practiceSessions);
      return {
        current: unlocked ? 1 : 0,
        target: 1,
        percentage: unlocked ? 100 : 0,
      };
    },
  },
];

export type TrophyGroup = "practice" | "learning" | "rounds" | "xp";

export const TROPHY_GROUPS: { id: TrophyGroup; label: string }[] = [
  { id: "practice", label: "Practice" },
  { id: "rounds", label: "Rounds & scoring" },
  { id: "learning", label: "Library" },
  { id: "xp", label: "XP milestones" },
];

const PRACTICE_GROUP = new Set([
  "first-steps",
  "dedicated",
  "practice-master",
  "practice-legend",
  "week-warrior",
  "monthly-legend",
  "combine-finisher",
  "putting-professor",
  "wedge-wizard",
  "coachs-pet",
  "champion-putting-test-18",
]);

export function trophyGroupForId(id: string): TrophyGroup {
  if (PRACTICE_GROUP.has(id)) return "practice";
  if (id === "student" || id === "scholar" || id === "expert") return "learning";
  if (id === "rising-star" || id === "champion" || id === "elite") return "xp";
  return "rounds";
}

export type TrophyEarnLink = { href: string; label: string };

/** Where in the app the player goes to make progress on a trophy. */
export function trophyEarnLink(id: string): TrophyEarnLink {
  switch (id) {
    case "combine-finisher":
      return { href: "/practice?plan=combine", label: "Pick a combine test" };
    case "putting-professor":
      return { href: "/practice?plan=library", label: "Find putting drills" };
    case "wedge-wizard":
      return { href: "/practice?plan=library", label: "Find wedge drills" };
    case "coachs-pet":
      return { href: "/practice?plan=insights", label: "Open Coach's Insights" };
    case "champion-putting-test-18":
      return { href: "/practice/putting-test", label: `Take the ${puttingTestConfig.testName}` };
  }
  switch (trophyGroupForId(id)) {
    case "practice":
      return { href: "/practice", label: "Log practice" };
    case "learning":
      return { href: "/library", label: "Open the Library" };
    case "xp":
      return { href: "/practice", label: "Earn XP in Practice" };
    default:
      return { href: "/log-round", label: "Log a round" };
  }
}

export type UnlockedAccent = "gold" | "emerald" | "silver";

export function unlockedAccentForTrophy(t: TrophyData): UnlockedAccent {
  if (t.id === "elite" || t.id === "champion" || t.isRare === true) return "gold";
  if (t.category === "Practice") return "emerald";
  return "silver";
}

export function buildLibraryCategoryCountsFromStorage(): Record<string, number> {
  const libraryCategories: Record<string, number> = {};
  if (typeof window === "undefined") return libraryCategories;
  try {
    const userProgress = JSON.parse(localStorage.getItem("userProgress") || "{}");
    const drillsData = JSON.parse(localStorage.getItem("drillsData") || "[]");
    const completedDrillIds: string[] = userProgress.completedDrills || [];
    completedDrillIds.forEach((drillId: string) => {
      const drill = drillsData.find((d: { id: string; category?: string }) => d.id === drillId);
      if (drill?.category) {
        libraryCategories[drill.category] = (libraryCategories[drill.category] || 0) + 1;
      }
    });
    const drillCompletions = userProgress.drillCompletions || {};
    Object.keys(drillCompletions).forEach((drillId: string) => {
      const drill = drillsData.find((d: { id: string; category?: string }) => d.id === drillId);
      if (drill?.category) {
        libraryCategories[drill.category] =
          (libraryCategories[drill.category] || 0) + (drillCompletions[drillId] || 0);
      }
    });
  } catch {
    /* ignore */
  }
  return libraryCategories;
}

export function formatTrophyProgressLine(
  def: TrophyData,
  stats: Parameters<TrophyData["getProgress"]>[0],
): string {
  const p = def.getProgress(stats);
  const hasRounds = (stats.roundsData?.length ?? 0) > 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  switch (def.id) {
    case "first-steps":
    case "dedicated":
    case "practice-master":
    case "practice-legend":
      return `${Math.round(p.current * 10) / 10} of ${p.target} hours`;
    case "monthly-legend":
      return `Best month so far: ${Math.round(p.current * 10) / 10} of ${p.target} hours`;
    case "week-warrior":
      return `Best streak: ${plural(p.current, "day")} in a row`;
    case "student":
    case "scholar":
    case "expert":
      return `${p.current} of ${p.target} lessons watched`;
    case "putting-professor":
    case "wedge-wizard":
      return `${p.current} of ${p.target} drills done`;
    case "first-round":
    case "consistent":
    case "tracker":
      return `${p.current} of ${plural(p.target, "round")} logged`;
    case "rising-star":
    case "champion":
    case "elite":
      return `${p.current.toLocaleString()} of ${p.target.toLocaleString()} XP`;
    case "goal-achiever":
      return `Handicap ${p.current}, goal ${p.target} or better`;
    case "breaking-90":
    case "breaking-80":
    case "breaking-70":
      return hasRounds ? `Best score so far: ${p.current}` : "No rounds logged yet";
    case "birdie-machine":
      return hasRounds ? `Most birdies in a round: ${p.current}` : "No rounds logged yet";
    case "par-train":
      return hasRounds ? `Most pars in a round: ${p.current}` : "No rounds logged yet";
    case "combine-finisher":
      return p.current > 0 ? `${plural(p.current, "combine")} finished` : "No combines finished yet";
  }
  return p.percentage >= 100 ? "Done" : "Not done yet";
}
