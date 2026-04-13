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

/** Display + DB trophy_name (must match user_trophies rows). */
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
  {
    id: "combine-finisher",
    name: "Combine Finisher",
    requirement:
      "Complete any Academy combine logged to the practice table (session with a combine test_type) or a combine protocol saved to practice_logs",
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
    requirement: `Hold #1 on the ${puttingTestConfig.testName} leaderboard (all-time best session; ties count)`,
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

export type TrophyCaseRow = "volume" | "performance" | "consistency";

export function trophyCaseRowForId(id: string): TrophyCaseRow {
  const volume = new Set([
    "first-steps",
    "dedicated",
    "practice-master",
    "practice-legend",
    "monthly-legend",
    "student",
    "scholar",
    "expert",
    "putting-professor",
    "wedge-wizard",
    "combine-finisher",
  ]);
  const consistency = new Set(["week-warrior", "rising-star", "champion", "elite"]);
  if (volume.has(id)) return "volume";
  if (consistency.has(id)) return "consistency";
  return "performance";
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
  const pct = Math.round(p.percentage);
  if (def.id === "goal-achiever") {
    return `Handicap index ${p.current} — goal ≤ ${p.target} (${pct}% toward unlock)`;
  }
  if (def.id === "breaking-90" || def.id === "breaking-80" || def.id === "breaking-70") {
    return `Best 18-hole score tracked: ${p.current} — need below ${p.target + 1} (${pct}%)`;
  }
  if (def.id === "combine-finisher") {
    const n = p.current;
    return n > 0
      ? `${n} logged combine session${n === 1 ? "" : "s"}`
      : "Log a combine session to unlock";
  }
  return `${p.current} / ${p.target} (${pct}%)`;
}
