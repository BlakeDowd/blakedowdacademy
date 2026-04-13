"use client";

import { useEffect, useState, useRef, useMemo, useCallback, type CSSProperties } from "react";
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
import {
  type ParsedPuttingHole,
  parsePuttingHoleSession,
  bestPuttingCombineScoreForUser,
  parsePutting9HoleSession,
  bestPutting9HolesScoreForUser,
  parsePuttingTest3To6ftSession,
  bestPuttingTest3To6ftScoreForUser,
  parsePuttingTest8To20Session,
  bestPuttingTest8To20ScoreForUser,
  parsePuttingTest20To40Session,
  bestPuttingTest20To40ScoreForUser,
} from "@/lib/puttingTestLeaderboard";
import { puttingTest9Config } from "@/lib/puttingTest9Config";
import { puttingTest3To6ftConfig } from "@/lib/puttingTest3To6ftConfig";
import { puttingTest8To20Config } from "@/lib/puttingTest8To20Config";
import { puttingTest20To40Config } from "@/lib/puttingTest20To40Config";
import { gauntletPrecisionProtocolConfig } from "@/lib/gauntletPrecisionProtocolConfig";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import {
  buildGauntletBlackLabelLeaderboard,
  computeBestGauntletSessionForUser,
} from "@/lib/gauntletLeaderboard";
import {
  buildAcademyCombinesLeaderboard,
  COMBINE_LEADERBOARD_OPTIONS,
  isLeaderboardDrivenCombineId,
  type CombineLeaderboardTestId,
} from "@/lib/academyCombinesLeaderboard";
import { getTrophyMultiplierContributions } from "@/lib/trophyMultiplierContributions";
import { TROPHY_LIST, buildLibraryCategoryCountsFromStorage } from "@/lib/academyTrophies";
import {
  achievementCountsFromRows,
  ensureAchievementsForEarnedTrophies,
  fetchUserAchievementRows,
  type UserAchievementRow,
} from "@/lib/userAchievements";
import AcademyTrophyCasePanel, {
  type AcademySelectedTrophy,
} from "@/components/AcademyTrophyCasePanel";

type AcademyDbTrophyRow = {
  trophy_name: string;
  trophy_icon?: string;
  unlocked_at?: string;
  description?: string;
  id?: string;
};

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


// Helper function to get timeframe dates
function getTimeframeDates(timeFilter: "week" | "month" | "year" | "allTime") {
  const now = new Date();
  let startDate: Date;

  if (timeFilter === "week") {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
  } else if (timeFilter === "month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (timeFilter === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else {
    startDate = new Date(0); // All time
  }

  return { startDate, endDate: now };
}

/**
 * True if event time falls in the selected range using the user's local calendar (fixes month/year
 * mismatches vs comparing raw ms to startDate only).
 */
function eventMsMatchesLeaderboardTimeFilter(
  ms: number,
  timeFilter: "week" | "month" | "year" | "allTime",
): boolean {
  if (timeFilter === "allTime") return true;
  if (!Number.isFinite(ms)) return false;
  const now = new Date();
  const event = new Date(ms);

  if (timeFilter === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return ms >= start.getTime();
  }
  if (timeFilter === "month") {
    return (
      event.getFullYear() === now.getFullYear() &&
      event.getMonth() === now.getMonth()
    );
  }
  if (timeFilter === "year") {
    return event.getFullYear() === now.getFullYear();
  }
  return true;
}

/** Rounds: prefer created_at, fall back to date for older rows */
function roundLeaderboardTimeMs(round: { created_at?: string; date?: string }): number {
  if (round.created_at) {
    const t = new Date(round.created_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (round.date) {
    const t = new Date(round.date).getTime();
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

function roundPassesLeaderboardTimeFilter(
  round: { created_at?: string; date?: string },
  timeFilter: "week" | "month" | "year" | "allTime",
): boolean {
  if (timeFilter === "allTime") return true;
  const ms = roundLeaderboardTimeMs(round);
  if (!Number.isFinite(ms)) return false;
  return ms >= getTimeframeDates(timeFilter).startDate.getTime();
}

function holesPlayedCount(round: any): number {
  const h = round.holes ?? round.holes_played;
  if (typeof h === "number" && Number.isFinite(h)) return h;
  const n = Number(h);
  return Number.isFinite(n) ? n : 0;
}

function isEighteenHoleRound(round: any): boolean {
  return holesPlayedCount(round) === 18;
}

/**
 * Normalize Postgres / PostgREST timestamp strings so Date.parse succeeds (fixes "This Month" dropping rows).
 * - Space between date and time → "T"
 * - Whitespace before numeric TZ offset → removed (e.g. ".123 +10" → ".123+10")
 * - Trailing ±HH without minutes → ±HH:00 (many engines reject "+00", "+10")
 * - Bare YYYY-MM-DD (10 chars) → YYYY-MM-DDT12:00:00 (local noon)
 */
function normalizePostgresTimestampString(s: string): string {
  let out = s.trim();
  if (!out) return out;
  if (out.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(out)) {
    return `${out}T12:00:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}\s/.test(out)) {
    out = out.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  }
  // "2026-04-10T14:30:00.123 +10" / "2026-04-10T14:30 +00" — space before offset only
  out = out.replace(
    /(\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s+([+-])(?=\d)/g,
    "$1$2",
  );
  // Require ±HH:MM; extend ±HH at end of string only
  if (/[+-]\d{2}$/.test(out) && !/[+-]\d{2}:\d{2}$/.test(out)) {
    out = out.replace(/([+-])(\d{2})$/, "$1$2:00");
  }
  return out;
}

/**
 * Parse timestamps from Supabase/Postgres for leaderboard time filters (week/month/year).
 */
function parseLeaderboardEventMs(raw: unknown): number | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    const t = new Date(ms).getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // Epoch as string (ms or seconds)
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    const ms = s.length >= 13 ? n : n * 1000;
    const t = new Date(ms).getTime();
    if (Number.isFinite(t)) return t;
  }

  const normalized = normalizePostgresTimestampString(s);
  let t = new Date(normalized).getTime();
  if (Number.isFinite(t)) return t;

  // Last resort: leading calendar date (Postgres may append unparsable fragments)
  const m = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) {
    t = new Date(`${m[1]}T12:00:00`).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function practiceLeaderboardTimeMs(session: any): number {
  // Order: completed_at → created_at → practice_date → updated_at (snake + camel for PostgREST / adapters)
  // allTime counts rows even when every parse fails; week/month/year need at least one good timestamp.
  const candidates = [
    session.completed_at,
    session.completedAt,
    session.created_at,
    session.createdAt,
    session.practice_date,
    session.practiceDate,
    session.updated_at,
    session.updatedAt,
  ];
  for (const raw of candidates) {
    const ms = parseLeaderboardEventMs(raw);
    if (ms != null) return ms;
  }
  return NaN;
}

function practicePassesLeaderboardTimeFilter(
  session: any,
  timeFilter: "week" | "month" | "year" | "allTime",
): boolean {
  if (timeFilter === "allTime") return true;
  const ms = practiceLeaderboardTimeMs(session);
  return eventMsMatchesLeaderboardTimeFilter(ms, timeFilter);
}

function drillLeaderboardTimeMs(drill: any): number {
  const candidates = [
    drill.completed_at,
    drill.completedAt,
    drill.created_at,
    drill.createdAt,
    drill.updated_at,
    drill.updatedAt,
  ];
  for (const raw of candidates) {
    const ms = parseLeaderboardEventMs(raw);
    if (ms != null) return ms;
  }
  return NaN;
}

function drillPassesLeaderboardTimeFilter(
  drill: any,
  timeFilter: "week" | "month" | "year" | "allTime",
): boolean {
  if (timeFilter === "allTime") return true;
  const ms = drillLeaderboardTimeMs(drill);
  return eventMsMatchesLeaderboardTimeFilter(ms, timeFilter);
}

function practiceNotesPlainText(session: any): string {
  const n = session?.notes;
  if (n == null) return "";
  if (typeof n === "string") return n;
  try {
    return JSON.stringify(n);
  } catch {
    return String(n);
  }
}

/** Putting tests + freestyle facility rows — not roadmap drill completions. */
function isPuttingOrFreestylePracticeRow(session: any): boolean {
  const typeRaw = String(session?.type ?? "").trim();
  const tl = typeRaw.toLowerCase();
  if (tl === "putting-test") return true;
  if (
    typeRaw === puttingTest9Config.practiceType ||
    typeRaw === puttingTest3To6ftConfig.practiceType ||
    typeRaw === puttingTest8To20Config.practiceType ||
    typeRaw === puttingTest20To40Config.practiceType
  ) {
    return true;
  }

  const text = practiceNotesPlainText(session);
  if (text.startsWith("{")) {
    try {
      const j = JSON.parse(text) as { kind?: string };
      const k = j?.kind;
      if (
        k === "putting_test_hole" ||
        k === puttingTest9Config.noteKind ||
        k === puttingTest3To6ftConfig.noteKind ||
        k === puttingTest8To20Config.noteKind ||
        k === puttingTest20To40Config.noteKind
      ) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }

  const freestyleExact = new Set([
    "driving",
    "irons",
    "wedges",
    "chipping",
    "bunkers",
    "putting",
    "mental/strategy",
  ]);
  if (freestyleExact.has(tl)) return true;

  return false;
}

/**
 * Roadmap drill completions: usually `notes` contains "Completed Drill" (practice/page). Also count
 * rows whose `type` is a drill id (uuid/slug) — not putting tests or freestyle facility types.
 */
function isRoadmapDrillCompletionPracticeRow(session: any): boolean {
  if (isPuttingOrFreestylePracticeRow(session)) return false;
  const text = practiceNotesPlainText(session);
  if (text.includes("Completed Drill")) return true;
  const typeRaw = String(session?.type ?? "").trim();
  return typeRaw.length > 0;
}

/**
 * Estimated XP from one `practice` row — aligned with practice/page updateUserXP (freestyle uses
 * floor(minutes/10)*10; roadmap drills use minutes×10 or 500 for on-course). Putting tests → 0.
 */
function estimatedXpFromPracticeRow(session: any): number {
  const dm = Number(session.duration_minutes) || 0;
  if (isPuttingOrFreestylePracticeRow(session)) {
    const text = practiceNotesPlainText(session).trim();
    if (text.startsWith("{")) return 0;
    return Math.floor(dm / 10) * 10;
  }
  const t = practiceNotesPlainText(session).toLowerCase();
  if (t.includes("on-course challenge")) return 500;
  return dm * 10;
}

/**
 * Per-user XP in the selected window from `practice` rows only — same sources as updateUserXP on
 * the practice page (freestyle + roadmap drills). Rounds are NOT included: logging a round does not
 * call updateUserXP, so adding XP_PER_ROUND per round would exceed profiles.total_xp (e.g. 11k "this
 * year" vs 3k all-time).
 */
function accumulateXpByUserForTimeFilter(
  timeFilter: "week" | "month" | "year" | "allTime",
  practiceSessions: any[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (timeFilter === "allTime") return out;

  for (const session of practiceSessions || []) {
    const uid = session?.user_id;
    if (!uid) continue;
    if (!practicePassesLeaderboardTimeFilter(session, timeFilter)) continue;
    const add = estimatedXpFromPracticeRow(session);
    if (add <= 0) continue;
    out.set(uid, (out.get(uid) || 0) + add);
  }
  return out;
}

function ensureCurrentUserOnLeaderboard(
  entries: any[],
  user: { id?: string; preferredIconId?: string } | null | undefined,
  userProfiles: Map<
    string,
    { full_name?: string; preferred_icon_id?: string; xp?: number }
  > | undefined,
  pinnedValue: number,
): any[] {
  if (!user?.id || entries.some((e) => e.id === user.id)) return entries;
  const profile = userProfiles?.get(user.id);
  if (!profile?.full_name) return entries;
  let nameForAvatar = "U";
  if (profile.full_name) {
    nameForAvatar =
      profile.full_name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase() || "U";
  }
  const userIcon = profile.preferred_icon_id || nameForAvatar;
  return [
    ...entries,
    {
      id: user.id,
      name: profile.full_name,
      avatar: userIcon,
      value: pinnedValue,
      isCurrentUser: true,
    },
  ];
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
    // Filter by timeframe (prefer created_at via shared helper)
    if (timeFilter === "allTime") return true;
    const isInTimeframe = roundPassesLeaderboardTimeFilter(round, timeFilter);
    if (!isInTimeframe) {
      console.log(
        "calculateUserRounds: Round filtered out - outside timeframe:",
        round.created_at || round.date,
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
  return "Academy Member";
}

// Helper function: Get avatar/icon with proper fallback (preferred_icon_id from database, then first initial)
function getAvatarIcon(
  profile?: { full_name?: string; preferred_icon_id?: string },
  displayName?: string,
): string {
  // Show User Icons: Ensure avatars pull preferred_icon_id from profiles table first
  if (profile?.preferred_icon_id) {
    return profile.preferred_icon_id;
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

// Create a Name Lookup: Fetch full_name, preferred_icon_id, and xp for each user_id
// Name Mapping: Match the user_id from the practice table (or rounds/drills) to the id in the profiles table to display their real names
// Update fetchUserProfiles to include XP column from profiles table
// Verify Name Fetching: Ensure loadProfiles is fetching every single row from the profiles table
// Debug Log: Add console.log('Available Profiles:', profiles) to the load function so I can see in the browser if Stuart and Sean's names are actually being loaded
async function fetchUserProfiles(
  userIds: string[],
): Promise<
  Map<string, { full_name?: string; preferred_icon_id?: string; xp?: number }>
> {
  const profileMap = new Map<
    string,
    { full_name?: string; preferred_icon_id?: string; xp?: number }
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
      .select("id, full_name, total_xp, preferred_icon_id");

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
            xp: p.total_xp || 0 // Default Zero: Use profile.total_xp || 0 in the display so it registers a number even for new players
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
        full_name: p.full_name || "Academy Member",
        xp: p.total_xp,
      })),
    );
    console.log(
      "fetchUserProfiles: Total profiles in database:",
      safeAllProfiles.length,
    );

    // Name Mapping: Match user_id from practice/rounds/drills tables to id in profiles table
    // Show User Icons: Fetch preferred_icon_id from profiles table for avatar display
    // Sanitize Column Names: Update the .select() to strictly use id, full_name, xp
    // Completely remove email, avatar_url, and total_xp to stop the 42703 SQL errors
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, total_xp, preferred_icon_id")
      .in("id", userIds)
      .not("full_name", "is", null);

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
        xp: p.total_xp,
      })),
    );

    // Map IDs to Names: Create a map of user_id -> { full_name, preferred_icon_id, xp }
    // The key is the user_id from practice/rounds/drills, which matches the id in profiles table
    // Update fetchUserProfiles to include XP column from profiles table
    safeData.forEach((profile: any) => {
      // Name Mapping: user_id from practice table matches id in profiles table
      // Show User Icons: Include preferred_icon_id from database for avatar display
      // Standardize Fallback: Use (profile.total_xp || 0) to ensure we aren't trying to add undefined or NaN to the state
      const xpValue = profile.total_xp || 0;
      profileMap.set(profile.id, {
        full_name: profile.full_name,
        preferred_icon_id: profile.preferred_icon_id, 
        xp: xpValue, // Standardize Fallback: Use (profile.total_xp || 0) to ensure we aren't trying to add undefined or NaN to the state
      });
      console.log(
        `fetchUserProfiles: Mapped ${profile.id} -> ${profile.full_name || "Academy Member"}`,
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
        name: data.full_name || "Academy Member",
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
  user?: { id?: string; initialHandicap?: number; preferredIconId?: string } | null,
  userProfiles?: Map<
    string,
    { full_name?: string; preferred_icon_id?: string; xp?: number }
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
      // Final value set in drills branch below (practice + drill_scores)
      userValue = 0;
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
  // For drills metric, count per user: drill_scores rows + roadmap completions on `practice`
  if (metric === "drills") {
    const allDrills = drills || [];
    const allPractice = practiceSessions || [];

    const filteredDrills = allDrills.filter((drill: any) =>
      drillPassesLeaderboardTimeFilter(drill, timeFilter),
    );

    const filteredPracticeDrillRows = allPractice.filter(
      (session: any) =>
        isRoadmapDrillCompletionPracticeRow(session) &&
        practicePassesLeaderboardTimeFilter(session, timeFilter),
    );

    const drillCountByUser = new Map<string, number>();
    filteredDrills.forEach((drill: any) => {
      if (!drill.user_id) return;
      drillCountByUser.set(
        drill.user_id,
        (drillCountByUser.get(drill.user_id) || 0) + 1,
      );
    });
    filteredPracticeDrillRows.forEach((session: any) => {
      if (!session.user_id) return;
      drillCountByUser.set(
        session.user_id,
        (drillCountByUser.get(session.user_id) || 0) + 1,
      );
    });

    const allEntries: any[] = [];
    drillCountByUser.forEach((drillCount, userId) => {
      if (drillCount <= 0) return;
      const profile = userProfiles?.get(userId);
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;

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

      const userIcon = profile?.preferred_icon_id || nameForAvatar;

      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: drillCount,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    const meCount = user?.id ? drillCountByUser.get(user.id) || 0 : 0;
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meCount,
    );
    withPinned.forEach((e: any) => {
      e.isCurrentUser = user?.id === e.id;
    });
    withPinned.sort((a, b) => b.value - a.value);

    if (withPinned.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    const userEntryInSorted = withPinned.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value ?? meCount;

    console.log("getMockLeaderboard - drills metric (global):", {
      drillScoresRows: allDrills.length,
      practiceDrillCompletionRows: filteredPracticeDrillRows.length,
      mergedUserCount: drillCountByUser.size,
      leaderboardEntries: withPinned.length,
      top3Values: withPinned
        .slice(0, 3)
        .map((e) => ({ name: e.name, value: e.value, id: e.id })),
      currentUserValue: finalUserValue,
    });

    return {
      top3: withPinned.slice(0, 3),
      all: withPinned,
      userRank: userEntryInSorted
        ? withPinned.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  // For practice metric, group all practice_sessions by user_id and create leaderboard entries for each user
  if (metric === "practice") {
    // Check Fetch Logic: Use practice_sessions from database (StatsContext) instead of localStorage
    // Remove User Filters: Process ALL practice_sessions from all users, not just current user
    const allPracticeSessions = practiceSessions || [];

    const filteredSessions = allPracticeSessions.filter((session: any) =>
      practicePassesLeaderboardTimeFilter(session, timeFilter),
    );

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
      // Inner Join: Skip if no profile or name exists
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;

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

      const userIcon = profile?.preferred_icon_id || nameForAvatar;

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
      // Inner Join: Skip if no profile or name exists
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;

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

      const userIcon = profile?.preferred_icon_id || nameForAvatar;

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
      if (!profile || !profile.full_name) return; // Skip if no profile or name exists
      const displayName = profile.full_name || userName || "Academy Member";
      
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
      
      const userIcon = profile?.preferred_icon_id || nameForAvatar;
      
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
        if (!profile || !profile.full_name) return; // Skip if no profile or name exists
        
        const displayName = profile.full_name || "Academy Member";
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
        
        const userIcon = profile.preferred_icon_id || nameForAvatar;
        
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
      user?.preferredIconId ||
      userName
        .split(" ")
        .map((n: string) => n[0])
        .join("") ||
      "Y", // Use preferred_icon_id if available, else initials
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
    | "puttingCombine"
    | "puttingTest9Holes"
    | "puttingTest3To6ft"
    | "puttingTest8To20"
    | "puttingTest20To40"
    | "gauntletBlackLabel"
    | "rounds"
    | "drills"
    | "lowGross"
    | "lowNett"
    | "birdies"
    | "eagles"
    | "putts"
    | "lowestPutts"
    | "lowestAvgBogeys"
    | "lowestAvgDoubleBogeys"
    | "highestAvgBirdies"
    | "bogeyFreeRounds"
    | "doubleFreeRounds",
) {
  if (
    (metric === "putts" || metric === "lowestPutts") &&
    typeof value === "number" &&
    Number.isNaN(value)
  ) {
    return "—";
  }
  switch (metric) {
    case "xp":
      return `${value.toLocaleString()} XP`;
    case "library":
      return `${value} Lesson${value !== 1 ? "s" : ""}`;
    case "practice":
      return `${value.toFixed(1)} hrs`;
    case "puttingCombine":
      return `${Math.round(value)} Test Pts`;
    case "puttingTest9Holes":
      return `${Math.round(value)} Test Pts`;
    case "puttingTest3To6ft":
      return `${Math.round(value)} Test Pts`;
    case "puttingTest8To20":
      return `${Math.round(value)} Test Pts`;
    case "puttingTest20To40":
      return `${Math.round(value)} Test Pts`;
    case "gauntletBlackLabel": {
      const n = Math.round(value);
      return `${n} Perfect Putt${n === 1 ? "" : "s"}`;
    }
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
      return `${value} Avg Putts`;
    case "lowestPutts":
      return `${value} putts`;
    case "lowestAvgBogeys":
      return `${value}`;
    case "lowestAvgDoubleBogeys":
      return `${value}`;
    case "highestAvgBirdies":
      return `${value} avg birdies`;
    case "bogeyFreeRounds":
      return `${value} round${value !== 1 ? "s" : ""}`;
    case "doubleFreeRounds":
      return `${value} round${value !== 1 ? "s" : ""}`;
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
    | "puttingCombine"
    | "puttingTest9Holes"
    | "puttingTest3To6ft"
    | "puttingTest8To20"
    | "puttingTest20To40"
    | "gauntletBlackLabel"
    | "rounds"
    | "drills"
    | "lowGross"
    | "lowNett"
    | "birdies"
    | "eagles"
    | "putts"
    | "lowestPutts"
    | "lowestAvgBogeys"
    | "lowestAvgDoubleBogeys"
    | "highestAvgBirdies"
    | "bogeyFreeRounds"
    | "doubleFreeRounds",
  timeFilter: "week" | "month" | "year" | "allTime",
  rounds: any[],
  totalXP: number,
  userName: string,
  user?: { id?: string; preferredIconId?: string } | null,
  userProfiles?: Map<
    string,
    { full_name?: string; preferred_icon_id?: string; xp?: number }
  >,
  practiceSessions?: any[],
  drills?: any[],
  practiceLogs: any[] = [],
) {
  if (metric === "puttingCombine") {
    const allPractice = practiceSessions || [];
    const puttingRows = allPractice.filter((session: any) => {
      const t = String(session.type || "").toLowerCase();
      if (t !== "putting-test") return false;
      return practicePassesLeaderboardTimeFilter(session, timeFilter);
    });

    const holesByUser = new Map<string, ParsedPuttingHole[]>();
    puttingRows.forEach((session: any) => {
      const uid = session.user_id;
      if (!uid) return;
      const parsed = parsePuttingHoleSession(session);
      if (!parsed) return;
      if (!holesByUser.has(uid)) holesByUser.set(uid, []);
      holesByUser.get(uid)!.push(parsed);
    });

    const allEntries: any[] = [];
    holesByUser.forEach((holes, userId) => {
      const best = bestPuttingCombineScoreForUser(holes);
      if (best <= 0) return;
      const profile = userProfiles?.get(userId);
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;
      let nameForAvatar = "U";
      if (profile.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      }
      const userIcon = profile.preferred_icon_id || nameForAvatar;
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: best,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    if (user?.id) {
      meBest = bestPuttingCombineScoreForUser(holesByUser.get(user.id) || []);
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
    );
    withPinned.sort((a, b) => b.value - a.value);

    if (withPinned.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    const userEntryInRanks = withPinned.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value ?? 0;
    const withRanks = withPinned.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      rankChange: 0,
      movedUp: false,
      movedDown: false,
      previousRank: undefined,
      lowRound: undefined,
      lowNett: undefined,
      birdieCount: 0,
      eagleCount: 0,
    }));

    return {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  if (metric === "puttingTest9Holes") {
    const allPractice = practiceSessions || [];
    const nineRows = allPractice.filter((session: any) => {
      if (String(session.type || "") !== puttingTest9Config.practiceType) return false;
      return practicePassesLeaderboardTimeFilter(session, timeFilter);
    });

    const holesByUser = new Map<string, ParsedPuttingHole[]>();
    nineRows.forEach((session: any) => {
      const uid = session.user_id;
      if (!uid) return;
      const parsed = parsePutting9HoleSession(session);
      if (!parsed) return;
      if (!holesByUser.has(uid)) holesByUser.set(uid, []);
      holesByUser.get(uid)!.push(parsed);
    });

    const allEntries: any[] = [];
    holesByUser.forEach((holes, userId) => {
      const best = bestPutting9HolesScoreForUser(holes);
      if (best <= 0) return;
      const profile = userProfiles?.get(userId);
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;
      let nameForAvatar = "U";
      if (profile.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      }
      const userIcon = profile.preferred_icon_id || nameForAvatar;
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: best,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    if (user?.id) {
      meBest = bestPutting9HolesScoreForUser(holesByUser.get(user.id) || []);
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
    );
    withPinned.sort((a, b) => b.value - a.value);

    if (withPinned.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    const userEntryInRanks = withPinned.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value ?? 0;
    const withRanks = withPinned.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      rankChange: 0,
      movedUp: false,
      movedDown: false,
      previousRank: undefined,
      lowRound: undefined,
      lowNett: undefined,
      birdieCount: 0,
      eagleCount: 0,
    }));

    return {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  if (metric === "puttingTest3To6ft") {
    const allPractice = practiceSessions || [];
    const rows = allPractice.filter((session: any) => {
      if (String(session.type || "") !== puttingTest3To6ftConfig.practiceType) return false;
      return practicePassesLeaderboardTimeFilter(session, timeFilter);
    });

    const holesByUser = new Map<string, ParsedPuttingHole[]>();
    rows.forEach((session: any) => {
      const uid = session.user_id;
      if (!uid) return;
      const parsed = parsePuttingTest3To6ftSession(session);
      if (!parsed) return;
      if (!holesByUser.has(uid)) holesByUser.set(uid, []);
      holesByUser.get(uid)!.push(parsed);
    });

    const allEntries: any[] = [];
    holesByUser.forEach((holes, userId) => {
      const best = bestPuttingTest3To6ftScoreForUser(holes);
      if (best <= 0) return;
      const profile = userProfiles?.get(userId);
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;
      let nameForAvatar = "U";
      if (profile.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      }
      const userIcon = profile.preferred_icon_id || nameForAvatar;
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: best,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    if (user?.id) {
      meBest = bestPuttingTest3To6ftScoreForUser(holesByUser.get(user.id) || []);
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
    );
    withPinned.sort((a, b) => b.value - a.value);

    if (withPinned.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    const userEntryInRanks = withPinned.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value ?? 0;
    const withRanks = withPinned.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      rankChange: 0,
      movedUp: false,
      movedDown: false,
      previousRank: undefined,
      lowRound: undefined,
      lowNett: undefined,
      birdieCount: 0,
      eagleCount: 0,
    }));

    return {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  if (metric === "puttingTest8To20") {
    const allPractice = practiceSessions || [];
    const rows = allPractice.filter((session: any) => {
      if (String(session.type || "") !== puttingTest8To20Config.practiceType) return false;
      return practicePassesLeaderboardTimeFilter(session, timeFilter);
    });

    const holesByUser = new Map<string, ParsedPuttingHole[]>();
    rows.forEach((session: any) => {
      const uid = session.user_id;
      if (!uid) return;
      const parsed = parsePuttingTest8To20Session(session);
      if (!parsed) return;
      if (!holesByUser.has(uid)) holesByUser.set(uid, []);
      holesByUser.get(uid)!.push(parsed);
    });

    const allEntries: any[] = [];
    holesByUser.forEach((holes, userId) => {
      const best = bestPuttingTest8To20ScoreForUser(holes);
      if (best <= 0) return;
      const profile = userProfiles?.get(userId);
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;
      let nameForAvatar = "U";
      if (profile.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      }
      const userIcon = profile.preferred_icon_id || nameForAvatar;
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: best,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    if (user?.id) {
      meBest = bestPuttingTest8To20ScoreForUser(holesByUser.get(user.id) || []);
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
    );
    withPinned.sort((a, b) => b.value - a.value);

    if (withPinned.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    const userEntryInRanks = withPinned.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value ?? 0;
    const withRanks = withPinned.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      rankChange: 0,
      movedUp: false,
      movedDown: false,
      previousRank: undefined,
      lowRound: undefined,
      lowNett: undefined,
      birdieCount: 0,
      eagleCount: 0,
    }));

    return {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  if (metric === "puttingTest20To40") {
    const allPractice = practiceSessions || [];
    const rows = allPractice.filter((session: any) => {
      if (String(session.type || "") !== puttingTest20To40Config.practiceType) return false;
      return practicePassesLeaderboardTimeFilter(session, timeFilter);
    });

    const holesByUser = new Map<string, ParsedPuttingHole[]>();
    rows.forEach((session: any) => {
      const uid = session.user_id;
      if (!uid) return;
      const parsed = parsePuttingTest20To40Session(session);
      if (!parsed) return;
      if (!holesByUser.has(uid)) holesByUser.set(uid, []);
      holesByUser.get(uid)!.push(parsed);
    });

    const allEntries: any[] = [];
    holesByUser.forEach((holes, userId) => {
      const best = bestPuttingTest20To40ScoreForUser(holes);
      if (best <= 0) return;
      const profile = userProfiles?.get(userId);
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;
      let nameForAvatar = "U";
      if (profile.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase() || "U";
      }
      const userIcon = profile.preferred_icon_id || nameForAvatar;
      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: best,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    if (user?.id) {
      meBest = bestPuttingTest20To40ScoreForUser(holesByUser.get(user.id) || []);
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
    );
    withPinned.sort((a, b) => b.value - a.value);

    if (withPinned.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    const userEntryInRanks = withPinned.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value ?? 0;
    const withRanks = withPinned.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      rankChange: 0,
      movedUp: false,
      movedDown: false,
      previousRank: undefined,
      lowRound: undefined,
      lowNett: undefined,
      birdieCount: 0,
      eagleCount: 0,
    }));

    return {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  if (metric === "gauntletBlackLabel") {
    const built = buildGauntletBlackLabelLeaderboard(
      practiceLogs,
      timeFilter,
      userProfiles,
      user?.id,
    );
    let meBest = 0;
    if (user?.id) {
      const st = computeBestGauntletSessionForUser(
        practiceLogs,
        user.id,
        timeFilter,
      );
      meBest = st?.perfect ?? 0;
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      built.all,
      user,
      userProfiles,
      meBest,
    );
    withPinned.sort((a, b) => b.value - a.value);

    if (withPinned.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    const userEntryInRanks = withPinned.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value ?? meBest;
    const withRanks = withPinned.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      rankChange: 0,
      movedUp: false,
      movedDown: false,
      previousRank: undefined,
      lowRound: undefined,
      lowNett: undefined,
      birdieCount: 0,
      eagleCount: 0,
    }));

    return {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

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

  const filteredRounds = (rounds || []).filter((round) =>
    roundPassesLeaderboardTimeFilter(round, timeFilter),
  );

  // For Low Gross and Low Nett: Filter to only 18-hole rounds
  const eighteenHoleRounds = filteredRounds.filter((round) =>
    isEighteenHoleRound(round),
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
      if (timeFilter === "allTime") {
        if (userProfiles && user?.id) {
          const userProfile = userProfiles.get(user.id);
          userValue = (userProfile?.xp || 0) || totalXP || 0;
        } else {
          userValue = totalXP || 0;
        }
      } else {
        const periodXp = accumulateXpByUserForTimeFilter(
          timeFilter,
          practiceSessions || [],
        );
        userValue = user?.id ? periodXp.get(user.id) || 0 : 0;
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
    case "lowestAvgBogeys":
    case "lowestAvgDoubleBogeys":
    case "highestAvgBirdies":
    case "bogeyFreeRounds":
    case "doubleFreeRounds":
      userValue = 0;
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
      // Inner Join: Skip if no profile or name exists
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;

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

      const userIcon = profile?.preferred_icon_id || nameForAvatar;
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

  if (
    metric === "lowestAvgBogeys" ||
    metric === "lowestAvgDoubleBogeys" ||
    metric === "highestAvgBirdies" ||
    metric === "bogeyFreeRounds" ||
    metric === "doubleFreeRounds"
  ) {
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
      const n = userRounds.length;
      if (n === 0) return;
      const profile = userProfiles?.get(userId);
      if (!profile?.full_name) return;

      let value: number;
      if (metric === "lowestAvgBogeys") {
        const sum = userRounds.reduce((s, r) => s + (r.bogeys || 0), 0);
        value = Number((sum / n).toFixed(2));
      } else if (metric === "lowestAvgDoubleBogeys") {
        const sum = userRounds.reduce((s, r) => s + (r.doubleBogeys || 0), 0);
        value = Number((sum / n).toFixed(2));
      } else if (metric === "highestAvgBirdies") {
        const sum = userRounds.reduce((s, r) => s + (r.birdies || 0), 0);
        value = Number((sum / n).toFixed(2));
      } else if (metric === "bogeyFreeRounds") {
        value = userRounds.filter(
          (r) => (r.bogeys || 0) === 0 && (r.doubleBogeys || 0) === 0,
        ).length;
      } else {
        value = userRounds.filter((r) => (r.doubleBogeys || 0) === 0).length;
      }

      let nameForAvatar = "U";
      if (profile.full_name) {
        nameForAvatar =
          profile.full_name
            .split(" ")
            .map((x: string) => x[0])
            .join("")
            .toUpperCase() || "U";
      }
      const userIcon = profile.preferred_icon_id || nameForAvatar;

      allEntries.push({
        id: userId,
        name: profile.full_name,
        avatar: userIcon,
        value,
        isCurrentUser: user?.id === userId,
      });
    });

    const sortDesc =
      metric === "highestAvgBirdies" ||
      metric === "bogeyFreeRounds" ||
      metric === "doubleFreeRounds";
    allEntries.sort((a, b) =>
      sortDesc ? b.value - a.value || a.name.localeCompare(b.name) : a.value - b.value || a.name.localeCompare(b.name),
    );

    if (allEntries.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    const withRanks = allEntries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      rankChange: 0,
      movedUp: false,
      movedDown: false,
      previousRank: undefined,
      lowRound: undefined,
      lowNett: undefined,
    }));

    const userEntryInRanks = withRanks.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInRanks?.value || 0;

    return {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
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
      // Inner Join: Skip if no profile or name exists
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;

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

      const userIcon = profile?.preferred_icon_id || nameForAvatar;
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
  // Sort: ascending (lower is better) for both average and lowest single-round putts
  if (metric === "putts" || metric === "lowestPutts") {
    const eighteenForPutts = filteredRounds.filter(
      (r) => r.user_id && isEighteenHoleRound(r),
    );
    const roundsByUser = new Map<string, any[]>();
    eighteenForPutts.forEach((round) => {
      if (!roundsByUser.has(round.user_id)) {
        roundsByUser.set(round.user_id, []);
      }
      roundsByUser.get(round.user_id)!.push(round);
    });

    const allEntries: any[] = [];
    roundsByUser.forEach((userRounds, userId) => {
      const puttsValues = userRounds
        .map((round) => Number(round.totalPutts) || 0)
        .filter((val) => val > 0);

      if (puttsValues.length === 0) {
        return;
      }

      const sumPutts = puttsValues.reduce((sum, val) => sum + val, 0);
      const userStat =
        metric === "putts"
          ? Number((sumPutts / puttsValues.length).toFixed(1))
          : Math.min(...puttsValues);

      const profile = userProfiles?.get(userId);
      if (!profile || !profile.full_name) return; // Skip if no profile or name exists
      const displayName = profile.full_name;

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

      const userIcon = profile?.preferred_icon_id || nameForAvatar;

      allEntries.push({
        id: userId,
        name: displayName,
        avatar: userIcon,
        value: userStat,
        isCurrentUser: user?.id === userId,
      });
    });

    // Sort lowest first (better average or better single-round total)
    allEntries.sort((a, b) => a.value - b.value);

    const puttValsForUser = (uid: string) => {
      const urs = eighteenForPutts.filter((r) => r.user_id === uid);
      return urs
        .map((round) => Number(round.totalPutts) || 0)
        .filter((val) => val > 0);
    };
    let mePuttPinned = NaN;
    if (user?.id) {
      const pv = puttValsForUser(user.id);
      if (pv.length > 0) {
        mePuttPinned =
          metric === "putts"
            ? Number(
                (pv.reduce((s, v) => s + v, 0) / pv.length).toFixed(1),
              )
            : Math.min(...pv);
      }
    }

    let ordered = [...allEntries];
    if (user?.id && !ordered.some((e) => e.id === user.id)) {
      const profile = userProfiles?.get(user.id);
      if (profile?.full_name) {
        let nameForAvatar = "U";
        if (profile.full_name) {
          nameForAvatar =
            profile.full_name
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase() || "U";
        }
        const userIcon = profile.preferred_icon_id || nameForAvatar;
        ordered.push({
          id: user.id,
          name: profile.full_name,
          avatar: userIcon,
          value: mePuttPinned,
          isCurrentUser: true,
        });
      }
    }

    if (ordered.length === 0) {
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    const withRanks = ordered.map((entry, index) => {
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
    const finalUserValue = Number.isFinite(userEntryInRanks?.value)
      ? userEntryInRanks!.value
      : 0;

    return {
      top3: withRanks.slice(0, 3),
      all: withRanks,
      userRank: userEntryInRanks
        ? withRanks.findIndex((entry) => entry.isCurrentUser) + 1
        : 0,
      userValue: finalUserValue,
    };
  }

  // For rounds metric, group all rounds by user_id and create leaderboard entries for each user
  if (metric === "rounds") {
    const roundsByUser = new Map<string, any[]>();
    filteredRounds.forEach((round) => {
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
      // Inner Join: Skip if no profile or name exists
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;

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

      const userIcon = profile?.preferred_icon_id || nameForAvatar;

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

    const filteredSessions = allPracticeSessions.filter((session: any) =>
      practicePassesLeaderboardTimeFilter(session, timeFilter),
    );

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
      // Inner Join: Skip if no profile or name exists
      if (!profile || !profile.full_name) return;
      const displayName = profile.full_name;

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

      const userIcon = profile?.preferred_icon_id || nameForAvatar;

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

  // XP leaderboard: all-time = profile.total_xp; week/month/year = sum of practice-row XP in window
  if (metric === "xp") {
    const allEntries: any[] = [];

    const periodXpByUser =
      timeFilter === "allTime"
        ? null
        : accumulateXpByUserForTimeFilter(
            timeFilter,
            practiceSessions || [],
          );

    if (userProfiles && userProfiles.size > 0) {
      userProfiles.forEach((profile, userId) => {
        if (!profile || !profile.full_name) return;
        const xpValue =
          timeFilter === "allTime"
            ? profile.xp || 0
            : periodXpByUser?.get(userId) || 0;
        if (xpValue <= 0) return;

        const displayName = profile.full_name;

        let nameForAvatar = "A";
        if (profile.full_name) {
          nameForAvatar =
            profile.full_name
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .toUpperCase() || "A";
        }

        const userIcon = profile.preferred_icon_id || nameForAvatar;

        allEntries.push({
          id: userId,
          name: displayName,
          avatar: userIcon,
          value: xpValue,
          isCurrentUser: user?.id === userId,
        });
      });
    }

    const meXp =
      user?.id && timeFilter === "allTime"
        ? userProfiles?.get(user.id)?.xp || 0
        : user?.id
          ? periodXpByUser?.get(user.id) || 0
          : 0;
    const withPinnedXp = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meXp,
    );
    withPinnedXp.sort((a, b) => b.value - a.value);

    if (withPinnedXp.length === 0) {
      console.warn("XP Leaderboard: No entries created - check if userProfiles is populated");
      return {
        top3: [],
        all: [],
        userRank: 0,
        userValue: 0,
      };
    }

    console.log(
      "XP Leaderboard: Created",
      withPinnedXp.length,
      "entries, top XP:",
      withPinnedXp[0]?.value,
    );

    const userEntryInSorted = withPinnedXp.find((entry) => entry.isCurrentUser);
    const finalUserValue = userEntryInSorted?.value ?? userValue;

    return {
      top3: withPinnedXp.slice(0, 3),
      all: withPinnedXp,
      userRank: userEntryInSorted
        ? withPinnedXp.findIndex((entry) => entry.isCurrentUser) + 1
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
      user?.preferredIconId ||
      userName
        .split(" ")
        .map((n) => n[0])
        .join("") ||
      "Y", // Use preferred_icon_id if available, else initials
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
  const { rounds, communityRounds, drills, practiceSessions, practiceLogs } = useStats();
  const { user, refreshUser, isAuthenticated, loading } = useAuth();
  const router = useRouter();

  // Create a Name Lookup: Store profile data for all users in the leaderboard
  // Map IDs to Names: Match user IDs to their full_name from profiles table
  // Update fetchUserProfiles to include XP column from profiles table
  const [userProfiles, setUserProfiles] = useState<
    Map<string, { full_name?: string; preferred_icon_id?: string; xp?: number }>
  >(new Map());

  // Add Fetch Guard: Create refs to ensure effects run exactly once
  const hasFetchedProgress = useRef(false);
  const hasFetched = useRef(false);
  
  // Add Deep Equality Guard: useRef to store previous leaderboard data string to prevent unnecessary re-renders
  const prevLeaderboardStr = useRef<string>("");

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
  const [selectedTrophy, setSelectedTrophy] = useState<AcademySelectedTrophy | null>(null);
  const [leaderboardMetric, setLeaderboardMetric] = useState<
    | "xp"
    | "library"
    | "practice"
    | "rounds"
    | "drills"
    | "lowGross"
    | "lowNett"
    | "birdies"
    | "eagles"
    | "putts"
    | "lowestPutts"
    | "lowestAvgBogeys"
    | "lowestAvgDoubleBogeys"
    | "highestAvgBirdies"
    | "bogeyFreeRounds"
    | "doubleFreeRounds"
  >("xp");

  // Database-First Academy: Fetch trophies from user_trophies table instead of calculating from live scores
  const [dbTrophies, setDbTrophies] = useState<AcademyDbTrophyRow[]>([]);

  // Toggle State: Add a showLocked boolean state (defaulting to true)
  const [showLocked, setShowLocked] = useState<boolean>(false);

  const [userAchievementRows, setUserAchievementRows] = useState<UserAchievementRow[]>([]);
  const achievementCountByKey = useMemo(
    () => achievementCountsFromRows(userAchievementRows),
    [userAchievementRows],
  );

  // Fix the 'Hooks called in change of order' error
  // Move Hooks Up: Move all useMemo, useCallback, useState, and useEffect calls to the very top of the AcademyPage function, immediately after useContext and useRef calls
  // No Early Returns: Ensure there are no if (loading) return ... or if (!user) return ... statements appearing before any Hook

  // Kill the Wait: Ensure loading is forced to false in a finally block pattern
  // Circuit Breaker: Add timeout to prevent infinite loading
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Stabilize Fetching: Add circuit breaker to prevent recalculating leaderboard on every render
  const [cachedLeaderboard, setCachedLeaderboard] = useState<any>(null);

  const [hallLeaderTab, setHallLeaderTab] = useState<"stats" | "combines">("stats");
  const [combineLeaderboardTest, setCombineLeaderboardTest] =
    useState<CombineLeaderboardTestId>("aimpoint_6ft_combine");
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

  /** Stats object passed to `TROPHY_LIST` getProgress / checks — mirrors HomeDashboard trophy logic. */
  const academyTrophyStats = useMemo(() => {
    const practiceHours = (practiceSessions || []).reduce((sum: number, s: any) => {
      const m =
        Number(s?.duration_minutes) || Number(s?.duration) || Number(s?.estimatedMinutes) || 0;
      return sum + m / 60;
    }, 0);
    let completedLessons = 0;
    let practiceHistory: any[] = [];
    let libraryCategories: Record<string, number> = {};
    if (typeof window !== "undefined") {
      try {
        const progress = JSON.parse(localStorage.getItem("userProgress") || "{}");
        completedLessons = (progress.completedDrills || []).length;
        practiceHistory = JSON.parse(localStorage.getItem("practiceActivityHistory") || "[]");
        libraryCategories = buildLibraryCategoryCountsFromStorage();
      } catch {
        /* ignore */
      }
    }
    return {
      totalXP: user?.totalXP || 0,
      completedLessons,
      practiceHours,
      rounds: rounds?.length || 0,
      handicap: currentHandicap,
      roundsData: rounds || [],
      practiceHistory,
      libraryCategories,
      userId: user?.id,
      practiceSessions: practiceSessions || [],
      practiceLogs: practiceLogs || [],
    };
  }, [
    user?.id,
    user?.totalXP,
    rounds,
    practiceSessions,
    practiceLogs,
    currentHandicap,
    userProgress.completedDrills,
  ]);

  const [roundStatsRowCount, setRoundStatsRowCount] = useState<number | null>(null);
  const [roundStatsPlayedAt, setRoundStatsPlayedAt] = useState<string[]>([]);
  useEffect(() => {
    if (!user?.id) {
      setRoundStatsRowCount(null);
      setRoundStatsPlayedAt([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data, error } = await supabase
          .from("round_stats")
          .select("played_at")
          .eq("user_id", user.id)
          .order("played_at", { ascending: false })
          .limit(200);
        if (cancelled) return;
        if (error) {
          setRoundStatsRowCount(null);
          setRoundStatsPlayedAt([]);
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        setRoundStatsRowCount(rows.length);
        setRoundStatsPlayedAt(
          rows.map((r: { played_at?: string | null }) => r.played_at).filter((x): x is string => !!x),
        );
      } catch {
        if (!cancelled) {
          setRoundStatsRowCount(null);
          setRoundStatsPlayedAt([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const trophyMultiplierById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getTrophyMultiplierContributions>>();
    for (const t of TROPHY_LIST) {
      m.set(
        t.id,
        getTrophyMultiplierContributions(t.id, academyTrophyStats, practiceLogs || [], roundStatsPlayedAt),
      );
    }
    return m;
  }, [academyTrophyStats, practiceLogs, roundStatsPlayedAt]);

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

        const raw = Array.isArray(data)
          ? (data as Array<{
              trophy_name: string;
              trophy_icon?: string | null;
              unlocked_at?: string | null;
              description?: string | null;
            }>)
          : [];
        const trophiesWithIds: AcademyDbTrophyRow[] = raw.map((trophy) => ({
          trophy_name: trophy.trophy_name,
          trophy_icon: trophy.trophy_icon ?? undefined,
          unlocked_at: trophy.unlocked_at ?? undefined,
          description: trophy.description ?? undefined,
          id: TROPHY_LIST.find((t) => t.name === trophy.trophy_name)?.id,
        }));

        setDbTrophies(trophiesWithIds);
      } catch (err) {
        console.error("Error fetching Academy trophies:", err);
      }
    };

    fetchTrophies();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setUserAchievementRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        await ensureAchievementsForEarnedTrophies(supabase, user.id, dbTrophies);
        const rows = await fetchUserAchievementRows(supabase, user.id);
        if (!cancelled) setUserAchievementRows(rows);
      } catch {
        if (!cancelled) setUserAchievementRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, dbTrophies]);

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
      const roundUserIds = (communityRounds || [])
        .map((r: any) => r.user_id)
        .filter(Boolean);
      const drillUserIds = (drills || [])
        .map((d: any) => d.user_id)
        .filter(Boolean);
      const practiceUserIds = (practiceSessions || [])
        .map((p: any) => p.user_id)
        .filter(Boolean);
      const practiceLogUserIds = (practiceLogs || [])
        .map((p: any) => p.user_id)
        .filter(Boolean);

      // Combine all user IDs and get unique set
      const allUserIds = [
        ...roundUserIds,
        ...drillUserIds,
        ...practiceUserIds,
        ...practiceLogUserIds,
      ];
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
          full_name: data.full_name || "Academy Member",
          preferred_icon_id: data.preferred_icon_id,
          xp: data.xp,
        })),
      );

      // Check the Mapping: Log the mapping results for drills specifically
      const drillProfileMappings = drillUserIds.map((userId) => ({
        user_id: userId,
        full_name: profiles.get(userId)?.full_name || "NOT FOUND",
        preferred_icon_id: profiles.get(userId)?.preferred_icon_id || "NOT FOUND",
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
          name: data.full_name || "Academy Member",
        })),
      );
    };

    fetchProfiles();
  }, [
    communityRounds?.length ?? 0,
    drills?.length ?? 0,
    practiceSessions?.length ?? 0,
    practiceLogs?.length ?? 0,
  ]); // Re-fetch profiles when source tables change (fixed length: 4)

  // Global Refresh: Ensure the XP Leaderboard refreshes immediately after the points are added
  // Realtime Filter: Not using Supabase Realtime - only listening to custom xpUpdated events
  // Add event listener for xpUpdated event to refresh profiles
  useEffect(() => {
    const handleXPUpdate = () => {
      console.log("Academy: Received xpUpdated event, refreshing profiles...");
      // Re-fetch profiles to get updated XP values
      const fetchProfiles = async () => {
        const roundUserIds = (communityRounds || [])
          .map((r: any) => r.user_id)
          .filter(Boolean);
        const drillUserIds = (drills || [])
          .map((d: any) => d.user_id)
          .filter(Boolean);
        const practiceUserIds = (practiceSessions || [])
          .map((p: any) => p.user_id)
          .filter(Boolean);
        const practiceLogUserIds = (practiceLogs || [])
          .map((p: any) => p.user_id)
          .filter(Boolean);
        const allUserIds = [
          ...roundUserIds,
          ...drillUserIds,
          ...practiceUserIds,
          ...practiceLogUserIds,
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
  }, [
    communityRounds?.length ?? 0,
    drills?.length ?? 0,
    practiceSessions?.length ?? 0,
    practiceLogs?.length ?? 0,
  ]); // Same four deps as profile fetch — array length must stay constant for React

  // Calculate score-based leaderboards (lowGross, lowNett, birdies, eagles, putts) with loop guard
  // Always calculate all score-based metrics so they're available when needed
  useEffect(() => {
    if (!user?.id) {
      return;
    }

    try {
      const totalXP = user?.totalXP || 0;
      
      // Calculate all score-based metrics and cache them
      const metrics = [
        "lowGross",
        "lowNett",
        "birdies",
        "eagles",
        "putts",
        "lowestPutts",
        "lowestAvgBogeys",
        "lowestAvgDoubleBogeys",
        "highestAvgBirdies",
        "bogeyFreeRounds",
        "doubleFreeRounds",
      ] as const;
      const scoreBasedLeaderboards: Record<string, any> = {};
      
      metrics.forEach((metric) => {
        const leaderboard = getLeaderboardData(
          metric,
          timeFilter,
          communityRounds,
          totalXP,
          userName,
          user,
          userProfiles,
          practiceSessions,
          drills,
          practiceLogs || [],
        );
        scoreBasedLeaderboards[metric] = leaderboard;
      });

      // Update cache for currently selected metric (circuit breaker prevents infinite loops)
      const currentMetric = leaderboardMetric;
      if (currentMetric === "lowGross" || currentMetric === "lowNett" || 
          currentMetric === "birdies" || currentMetric === "eagles" || currentMetric === "putts" ||
          currentMetric === "lowestPutts" ||
          currentMetric === "lowestAvgBogeys" ||
          currentMetric === "lowestAvgDoubleBogeys" ||
          currentMetric === "highestAvgBirdies" ||
          currentMetric === "bogeyFreeRounds" ||
          currentMetric === "doubleFreeRounds") {
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
    communityRounds?.length,
    drills?.length,
    practiceSessions?.length,
    practiceLogs?.length,
    timeFilter,
    user?.totalXP,
    userName,
    userProfiles,
    leaderboardMetric,
  ]);

  // Stable Identity: Wrap calculated values in useMemo to prevent recreation
  // Safe Logic: Do the check inside the useMemo rather than skipping the Hook entirely
  const currentLeaderboard = useMemo(() => {
    // Use getLeaderboardData for score-based metrics and xp
    if (leaderboardMetric === "xp" || leaderboardMetric === "lowGross" || leaderboardMetric === "lowNett" || 
        leaderboardMetric === "birdies" || leaderboardMetric === "eagles" || leaderboardMetric === "putts" ||
        leaderboardMetric === "lowestPutts" ||
        leaderboardMetric === "lowestAvgBogeys" ||
        leaderboardMetric === "lowestAvgDoubleBogeys" ||
        leaderboardMetric === "highestAvgBirdies" ||
        leaderboardMetric === "bogeyFreeRounds" ||
        leaderboardMetric === "doubleFreeRounds") {
      // Don't use cache for xp (always derive from practice rows)
      if (
        cachedLeaderboard &&
        leaderboardMetric !== "xp"
      ) {
        return cachedLeaderboard;
      }
      // Calculate on-demand if not cached yet
      if (user?.id) {
        const totalXP = user?.totalXP || 0;
        return getLeaderboardData(
          leaderboardMetric,
          timeFilter,
          communityRounds,
          totalXP,
          userName,
          user,
          userProfiles,
          practiceSessions,
          drills,
          practiceLogs || [],
        );
      }
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    }

    // Four-pillar metrics: always derive from timeFilter + live stats (never use a stale cache)
    const emptyFour = { top3: [], all: [], userRank: 0, userValue: 0 };
    if (!userName) {
      return emptyFour;
    }
    switch (leaderboardMetric) {
      case "library":
      case "practice":
      case "rounds":
      case "drills":
        return getMockLeaderboard(
          leaderboardMetric,
          timeFilter,
          communityRounds,
          userName,
          user,
          userProfiles,
          drills,
          practiceSessions,
        );
      default:
        return emptyFour;
    }
  }, [cachedLeaderboard, leaderboardMetric, timeFilter, rounds, communityRounds, userProgress.totalXP, userName, user, userProfiles, practiceSessions, drills, practiceLogs]);

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
    if (!userName)
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard(
      "library",
      timeFilter,
      communityRounds,
      userName,
      user,
      userProfiles,
      drills,
      practiceSessions,
    );
  }, [
    timeFilter,
    communityRounds,
    userName,
    user,
    userProfiles,
    drills,
    practiceSessions,
  ]);

  const practiceLeaderboard = useMemo(() => {
    if (!userName)
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard(
      "practice",
      timeFilter,
      communityRounds,
      userName,
      user,
      userProfiles,
      drills,
      practiceSessions,
    );
  }, [
    timeFilter,
    communityRounds,
    userName,
    user,
    userProfiles,
    drills,
    practiceSessions,
  ]);

  const roundsLeaderboard = useMemo(() => {
    if (!userName)
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard(
      "rounds",
      timeFilter,
      communityRounds,
      userName,
      user,
      userProfiles,
      drills,
      practiceSessions,
    );
  }, [
    timeFilter,
    communityRounds,
    userName,
    user,
    userProfiles,
    drills,
    practiceSessions,
  ]);

  const drillsLeaderboard = useMemo(() => {
    if (!userName)
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    return getMockLeaderboard(
      "drills",
      timeFilter,
      communityRounds,
      userName,
      user,
      userProfiles,
      drills,
      practiceSessions,
    );
  }, [
    timeFilter,
    communityRounds,
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

  const hallCombineRows = useMemo(() => {
    if (isLeaderboardDrivenCombineId(combineLeaderboardTest)) {
      const data = getLeaderboardData(
        combineLeaderboardTest as Parameters<typeof getLeaderboardData>[0],
        timeFilter,
        communityRounds || [],
        user?.totalXP || 0,
        userName || "Academy Member",
        user,
        userProfiles,
        practiceSessions || [],
        drills || [],
        practiceLogs || [],
      );
      if (!data?.all?.length) return [];
      return data.all.map((entry: any) => ({
        userId: String(entry.id),
        name: entry.name,
        scoreDisplay: formatLeaderboardValue(
          entry.value,
          combineLeaderboardTest as Parameters<typeof formatLeaderboardValue>[1],
        ),
        sortValue:
          typeof entry.value === "number" && Number.isFinite(entry.value) ? entry.value : 0,
        dateMs: 0,
        dateLabel: "—",
        isCurrentUser: !!entry.isCurrentUser,
      }));
    }
    return buildAcademyCombinesLeaderboard(
      combineLeaderboardTest,
      practiceSessions,
      practiceLogs,
      userProfiles,
      timeFilter,
      user?.id,
    );
  }, [
    combineLeaderboardTest,
    timeFilter,
    communityRounds,
    user?.totalXP,
    userName,
    user,
    userProfiles,
    practiceSessions,
    drills,
    practiceLogs,
    user?.id,
  ]);

  const combineScoreColumnLabel = useMemo(() => {
    const opt = COMBINE_LEADERBOARD_OPTIONS.find((o) => o.id === combineLeaderboardTest);
    return opt?.scoreHeader ?? "Score";
  }, [combineLeaderboardTest]);

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
          >
            {(() => {
              const { GOLF_ICONS } = require("@/components/IconPicker");
              const iconData = GOLF_ICONS.find((i: any) => i.id === iconId);
              if (iconData && iconData.icon) {
                const IconComponent = iconData.icon;
                return <IconComponent className="w-8 h-8 text-white" />;
              }
              return initial;
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
    <div className="flex-1 w-full flex flex-col bg-gray-50">
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-32">
        <div className="max-w-md mx-auto">
          {/* Modern Profile Header - Centered */}
          <div className="pb-4 bg-white rounded-2xl p-4 shadow-sm mb-6">
          <div className="flex flex-col items-center gap-3">
            {/* Large Circular Avatar */}
            <CircularAvatar
              initial={
                userName
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("") || "J"
              }
              iconId={user?.preferredIconId}
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

        <AcademyTrophyCasePanel
          dbTrophies={dbTrophies}
          showLocked={showLocked}
          onShowLockedChange={setShowLocked}
          selectedTrophy={selectedTrophy}
          onSelectTrophy={setSelectedTrophy}
          academyTrophyStats={academyTrophyStats}
          trophyMultiplierById={trophyMultiplierById}
          achievementRows={userAchievementRows}
          achievementCountByKey={achievementCountByKey}
          practiceLogs={practiceLogs}
          roundStatsRowCount={roundStatsRowCount}
        />

        {/* Hall Of Fame Leaderboard */}
        <div className="mb-6 w-full">
          <div className="rounded-2xl overflow-hidden border-2 border-amber-200/60 bg-gradient-to-b from-stone-50 via-white to-amber-50/30 shadow-md w-full flex flex-col">
            <div className="px-5 pt-5 pb-3 text-center border-b border-amber-100/80 bg-stone-900/[0.03]">
              <div className="inline-flex items-center gap-2 text-amber-800/90 mb-1">
                <Medal className="w-5 h-5" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em]">Hall Of Fame</p>
              </div>
              <h3 className="text-xl font-bold text-stone-900 font-serif tracking-tight">
                {hallLeaderTab === "combines" && combineLeaderboardTest === "gauntletBlackLabel"
                  ? gauntletPrecisionProtocolConfig.blackLabelLeaderboardTitle
                  : "Academy Leaderboard"}
              </h3>
              <p className="text-xs text-stone-600 mt-1 max-w-md mx-auto">
                {hallLeaderTab === "combines"
                  ? "Session-Based Combine Rankings By Selected Test."
                  : "Pick A Category To Compare Academy-Wide Rankings."}
              </p>
            </div>

            <div className="px-4 pt-4 pb-2 flex justify-center">
              <div
                className="inline-flex rounded-full p-1 bg-stone-200/80 border border-stone-300/80 shadow-inner"
                role="tablist"
                aria-label="Leaderboard view"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={hallLeaderTab === "stats"}
                  onClick={() => setHallLeaderTab("stats")}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                    hallLeaderTab === "stats"
                      ? "bg-white text-stone-900 shadow border border-stone-200"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Stats
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={hallLeaderTab === "combines"}
                  onClick={() => setHallLeaderTab("combines")}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                    hallLeaderTab === "combines"
                      ? "bg-white text-stone-900 shadow border border-stone-200"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  Combines
                </button>
              </div>
            </div>

            {hallLeaderTab === "stats" && (
              <div className="px-4 pb-3 max-w-xl mx-auto w-full">
                <label
                  htmlFor="stats-category-select"
                  className="block text-xs font-semibold uppercase tracking-wide text-stone-600 mb-1.5"
                >
                  Category
                </label>
                <select
                  id="stats-category-select"
                  value={leaderboardMetric}
                  onChange={(e) => {
                    setLeaderboardMetric(e.target.value as typeof leaderboardMetric);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-medium text-stone-900 bg-white border border-stone-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#014421]/30 focus:border-[#014421]"
                >
                  <option value="xp">Overall (Total XP)</option>
                  <option value="practice">Practice Hours</option>
                  <option value="library">Library Lessons</option>
                  <option value="rounds">Rounds Entered</option>
                  <option value="drills">Drills</option>
                  <option value="lowGross">Low Gross</option>
                  <option value="lowNett">Low Nett</option>
                  <option value="birdies">Birdies</option>
                  <option value="eagles">Eagles</option>
                  <option value="putts">Average Putts</option>
                  <option value="lowestPutts">Lowest Putts</option>
                  <option value="lowestAvgBogeys">Lowest Average Bogeys</option>
                  <option value="lowestAvgDoubleBogeys">Lowest Average Double Bogeys</option>
                  <option value="highestAvgBirdies">Highest Average Birdies</option>
                  <option value="bogeyFreeRounds">Bogey Free Rounds</option>
                  <option value="doubleFreeRounds">Double Free Rounds</option>
                </select>
              </div>
            )}

            {hallLeaderTab === "combines" && (
              <div className="px-4 pb-3 max-w-xl mx-auto w-full">
                <label
                  htmlFor="combine-test-select"
                  className="block text-xs font-semibold uppercase tracking-wide text-stone-600 mb-1.5"
                >
                  Test Type
                </label>
                <select
                  id="combine-test-select"
                  value={combineLeaderboardTest}
                  onChange={(e) =>
                    setCombineLeaderboardTest(e.target.value as CombineLeaderboardTestId)
                  }
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-medium text-stone-900 bg-white border border-stone-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#014421]/30 focus:border-[#014421]"
                >
                  {COMBINE_LEADERBOARD_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {combineLeaderboardTest === "gauntlet" && (
                  <p className="text-[11px] text-stone-500 mt-1.5 text-center">
                    Points Use Session Matrix Average — Lower Is Better.
                  </p>
                )}
                {combineLeaderboardTest === "ironPrecisionProtocol" && (
                  <p className="text-[11px] text-stone-500 mt-1.5 text-center">
                    {ironPrecisionProtocolConfig.testName}: ranks by best session{" "}
                    <span className="font-semibold text-stone-700">total points</span> (higher is
                    better).
                  </p>
                )}
                {combineLeaderboardTest === "wedge_lateral_9" && (
                  <p className="text-[11px] text-stone-500 mt-1.5 text-center">
                    {wedgeLateral9Config.testName}: ranks by best session{" "}
                    <span className="font-semibold text-stone-700">total points</span> (higher is
                    better).
                  </p>
                )}
                {combineLeaderboardTest === "gauntletBlackLabel" && (
                  <p className="text-xs text-stone-600 max-w-xl mx-auto mt-2 text-center px-1">
                    {gauntletPrecisionProtocolConfig.testName}: ranks by best single-session{" "}
                    <span className="font-semibold text-stone-800">Perfect Putt</span> count (Clean Strike +
                    Through Gate + under 10 cm from target).
                  </p>
                )}
              </div>
            )}

            <div className="px-4 pb-4 w-full">
              <div className="flex items-center justify-center gap-2 sm:gap-2.5 flex-wrap max-w-xl mx-auto">
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
                      type="button"
                      onClick={() => setTimeFilter(filter)}
                      className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                        timeFilter === filter
                          ? "text-white bg-[#014421]"
                          : "text-stone-600 bg-stone-100 hover:bg-stone-200"
                      }`}
                    >
                      {labels[filter]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-3 sm:px-5 pb-5">
              {hallLeaderTab === "stats" ? (
                (() => {
                    const dataToRender =
                      leaderboardMetric === "xp"
                        ? getLeaderboardData(
                            "xp",
                            timeFilter,
                            communityRounds || [],
                            user?.totalXP || 0,
                            userName || "Academy Member",
                            user,
                            userProfiles,
                            practiceSessions || [],
                            drills || [],
                            practiceLogs || [],
                          )
                        : currentLeaderboard;

                    if (!dataToRender || !dataToRender.all || dataToRender.all.length === 0) {
                      const timeLabels = {
                        week: "this week",
                        month: "this month",
                        year: "this year",
                        allTime: "yet",
                      };
                      return (
                        <div className="text-center flex-1 flex flex-col items-center justify-center min-h-[160px]">
                          <p className="text-sm text-stone-500">
                            No data for {timeLabels[timeFilter]}. Start logging to take the lead!
                          </p>
                        </div>
                      );
                    }

                    const top20 = dataToRender.all.slice(0, 20);
                    const meEntry = dataToRender.all.find((e: any) => e.isCurrentUser);
                    const meInTop20 = top20.some((e: any) => e.isCurrentUser);
                    const meRank =
                      meEntry != null
                        ? dataToRender.all.findIndex((e: any) => e.isCurrentUser) + 1
                        : 0;

                    const renderRow = (entry: any, rank: number, keySuffix: string) => {
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
                      const isMe = entry.isCurrentUser;
                      const displayValue = formatLeaderboardValue(
                        entry.value,
                        leaderboardMetric as Parameters<typeof formatLeaderboardValue>[1],
                      );
                      const podium =
                        rank === 1
                          ? "border-l-4 border-amber-400 bg-amber-50/50 ring-1 ring-amber-200/50"
                          : rank === 2
                            ? "border-l-4 border-slate-400 bg-slate-50/90 ring-1 ring-slate-200/60"
                            : rank === 3
                              ? "border-l-4 border-amber-800/50 bg-orange-50/50 ring-1 ring-orange-200/50"
                              : "border-l-4 border-transparent bg-white/60";
                      return (
                        <div
                          key={entry.id ? `${entry.id}-${keySuffix}` : `rank-${rank}-${keySuffix}`}
                          className={`grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,5.5rem)] gap-1 sm:gap-2 items-center px-2 py-2 rounded-xl transition-all ${podium} ${
                            isMe ? "ring-2 ring-[#014421]/40" : ""
                          }`}
                        >
                          <span
                            className={`text-sm font-bold tabular-nums text-center ${
                              rank === 1
                                ? "text-amber-600"
                                : rank === 2
                                  ? "text-slate-500"
                                  : rank === 3
                                    ? "text-orange-800/80"
                                    : "text-stone-700"
                            }`}
                          >
                            {rank}
                          </span>
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="shrink-0 relative">
                              {rank === 1 && keySuffix === "top" && (
                                <Crown className="w-4 h-4 absolute -top-2 -right-1 text-amber-500" />
                              )}
                              <CircularAvatar
                                initial={displayName[0]}
                                iconId={
                                  entry.avatar &&
                                  GOLF_ICONS.some((icon: any) => icon.id === entry.avatar)
                                    ? entry.avatar
                                    : undefined
                                }
                                size={36}
                                bgColor={isMe ? "#014421" : rank <= 3 ? "#b45309" : "#78716c"}
                              />
                            </div>
                            <span className="text-sm font-semibold text-stone-900 truncate" title={displayName}>
                              {displayName}
                              {isMe && (
                                <span className="text-[10px] font-bold text-[#014421] ml-1">(You)</span>
                              )}
                            </span>
                          </div>
                          <span className="text-sm font-bold text-[#014421] text-right tabular-nums leading-tight">
                            {displayValue}
                          </span>
                        </div>
                      );
                    };

                    return (
                      <div className="mx-auto w-full max-w-xl space-y-2">
                        {top20.map((entry: any, index: number) =>
                          renderRow(entry, index + 1, "top"),
                        )}
                        {user?.id && meEntry && !meInTop20 && meRank > 0 ? (
                          <div className="pt-2 mt-1 border-t border-stone-200">
                            <p className="text-xs text-stone-500 mb-2 text-center">
                              Your rank (#{meRank}) — not in the top 20 for this filter
                            </p>
                            {renderRow(meEntry, meRank, "you")}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
              ) : hallCombineRows.length === 0 ? (
                <div className="text-center py-12 text-sm text-stone-500">
                  No Combine Sessions For This Test And Period Yet.
                </div>
              ) : (
                <div className="mx-auto w-full max-w-xl space-y-2">
                  <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,5.5rem)_4.5rem] gap-1 px-2 py-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-stone-500 border-b border-stone-200">
                    <span>Rank</span>
                    <span>Student Name</span>
                    <span className="text-right">{combineScoreColumnLabel}</span>
                    <span className="text-right">Date</span>
                  </div>
                  {hallCombineRows.slice(0, 40).map((row, index) => {
                    const rank = index + 1;
                    const podium =
                      rank === 1
                        ? "border-l-4 border-amber-400 bg-amber-50/50 ring-1 ring-amber-200/50"
                        : rank === 2
                          ? "border-l-4 border-slate-400 bg-slate-50/90 ring-1 ring-slate-200/60"
                          : rank === 3
                            ? "border-l-4 border-amber-800/50 bg-orange-50/50 ring-1 ring-orange-200/50"
                            : "border-l-4 border-transparent bg-white/60";
                    const prof = userProfiles.get(row.userId);
                    return (
                      <div
                        key={`${row.userId}-${index}-${row.sortValue}`}
                        className={`grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,5.5rem)_4.5rem] gap-1 items-center px-2 py-2 rounded-xl ${podium} ${
                          row.isCurrentUser ? "ring-2 ring-[#014421]/40" : ""
                        }`}
                      >
                        <span className="text-sm font-bold text-stone-700 tabular-nums">{rank}</span>
                        <div className="flex items-center gap-2 min-w-0">
                          <CircularAvatar
                            initial={row.name[0]?.toUpperCase() || "?"}
                            iconId={
                              prof?.preferred_icon_id &&
                              GOLF_ICONS.some((icon: any) => icon.id === prof.preferred_icon_id)
                                ? prof.preferred_icon_id
                                : undefined
                            }
                            size={36}
                            bgColor={rank <= 3 ? "#b45309" : "#78716c"}
                          />
                          <span className="text-sm font-semibold text-stone-900 truncate">
                            {row.name}
                            {row.isCurrentUser && (
                              <span className="text-[10px] font-bold text-[#014421] ml-1">(You)</span>
                            )}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-[#014421] text-right tabular-nums leading-tight">
                          {row.scoreDisplay}
                        </span>
                        <span className="text-xs text-stone-600 text-right whitespace-nowrap">
                          {row.dateLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        </div>
      </div>
    </div>
  );
}




