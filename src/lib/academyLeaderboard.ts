// Shared leaderboard helpers for Academy + Home Hall Of Fame
import {
  type ParsedPuttingHole,
  parsePuttingHoleSession,
  bestClusteredPuttingTestScoreAndSessionEndMs,
  isCompletePuttingCombineSession,
  parsePutting9HoleSession,
  isCompletePutting9Session,
  parsePuttingTest3To6ftSession,
  isCompletePuttingTest3To6ftSession,
  parsePuttingTest8To20Session,
  isCompletePuttingTest8To20Session,
  parsePuttingTest20To40Session,
  isCompletePuttingTest20To40Session,
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
  isLeaderboardDrivenCombineId,
} from "@/lib/academyCombinesLeaderboard";
import {
  practiceSessionMinutesFromRow,
  practiceSessionsForUser,
} from "@/lib/practiceSessionDuration";

const XP_PER_ROUND = 500;

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
 * Per-user XP in the selected window from `practice` rows — same sources as updateUserXP on the
 * practice page (freestyle + roadmap drills). Putting-test rows contribute 0 here.
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

/** XP from logged rounds in the window (same award as `XP_AWARD_PER_LOGGED_ROUND` on save). */
function accumulateRoundXpByUserForTimeFilter(
  timeFilter: "week" | "month" | "year" | "allTime",
  communityRounds: any[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (timeFilter === "allTime") return out;
  for (const round of communityRounds || []) {
    const uid = round?.user_id;
    if (!uid) continue;
    if (!roundPassesLeaderboardTimeFilter(round, timeFilter)) continue;
    out.set(uid, (out.get(uid) || 0) + XP_PER_ROUND);
  }
  return out;
}

function mergePeriodXpMaps(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const out = new Map(a);
  for (const [uid, v] of b) {
    out.set(uid, (out.get(uid) || 0) + v);
  }
  return out;
}

/**
 * Lifetime XP implied by logged `practice` + `rounds` rows (same rules as period XP).
 * Used so All-Time can align with week/month when `profiles.total_xp` lagged behind (e.g. rounds
 * logged before profile XP was updated).
 */
function accumulateLifetimeActivityXpByUser(
  practiceSessions: any[],
  communityRounds: any[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const session of practiceSessions || []) {
    const uid = session?.user_id;
    if (!uid) continue;
    const add = estimatedXpFromPracticeRow(session);
    if (add <= 0) continue;
    out.set(uid, (out.get(uid) || 0) + add);
  }
  for (const round of communityRounds || []) {
    const uid = round?.user_id;
    if (!uid) continue;
    out.set(uid, (out.get(uid) || 0) + XP_PER_ROUND);
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
  pinnedDateMs?: number,
): any[] {
  if (!user?.id || entries.some((e) => e.id === user.id)) return entries;
  const profile = userProfiles?.get(user.id);
  const displayName = profile?.full_name?.trim() || "Academy Member";
  let nameForAvatar = "U";
  if (displayName && displayName !== "Academy Member") {
    nameForAvatar =
      displayName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase() || "U";
  }
  const userIcon = profile?.preferred_icon_id || nameForAvatar;
  const dateOk =
    typeof pinnedDateMs === "number" &&
    Number.isFinite(pinnedDateMs) &&
    pinnedDateMs > 0;
  return [
    ...entries,
    {
      id: user.id,
      name: displayName,
      avatar: userIcon,
      value: pinnedValue,
      isCurrentUser: true,
      ...(dateOk ? { dateMs: pinnedDateMs } : {}),
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
      const displayName =
        typeof profile.full_name === "string" && profile.full_name.trim().length > 0
          ? profile.full_name.trim()
          : "Academy Member";
      profileMap.set(profile.id, {
        full_name: displayName,
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
      const detail = bestClusteredPuttingTestScoreAndSessionEndMs(
        holes,
        isCompletePuttingCombineSession,
      );
      if (!detail || detail.score <= 0) return;
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
        value: detail.score,
        dateMs: detail.sessionEndMs,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    let meSessionEndMs: number | undefined;
    if (user?.id) {
      const meDetail = bestClusteredPuttingTestScoreAndSessionEndMs(
        holesByUser.get(user.id) || [],
        isCompletePuttingCombineSession,
      );
      meBest = meDetail?.score ?? 0;
      meSessionEndMs = meDetail?.sessionEndMs;
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
      meSessionEndMs,
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
      const detail = bestClusteredPuttingTestScoreAndSessionEndMs(holes, isCompletePutting9Session);
      if (!detail || detail.score <= 0) return;
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
        value: detail.score,
        dateMs: detail.sessionEndMs,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    let meSessionEndMs: number | undefined;
    if (user?.id) {
      const meDetail = bestClusteredPuttingTestScoreAndSessionEndMs(
        holesByUser.get(user.id) || [],
        isCompletePutting9Session,
      );
      meBest = meDetail?.score ?? 0;
      meSessionEndMs = meDetail?.sessionEndMs;
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
      meSessionEndMs,
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
      const detail = bestClusteredPuttingTestScoreAndSessionEndMs(
        holes,
        isCompletePuttingTest3To6ftSession,
      );
      if (!detail || detail.score <= 0) return;
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
        value: detail.score,
        dateMs: detail.sessionEndMs,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    let meSessionEndMs: number | undefined;
    if (user?.id) {
      const meDetail = bestClusteredPuttingTestScoreAndSessionEndMs(
        holesByUser.get(user.id) || [],
        isCompletePuttingTest3To6ftSession,
      );
      meBest = meDetail?.score ?? 0;
      meSessionEndMs = meDetail?.sessionEndMs;
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
      meSessionEndMs,
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
      const detail = bestClusteredPuttingTestScoreAndSessionEndMs(
        holes,
        isCompletePuttingTest8To20Session,
      );
      if (!detail || detail.score <= 0) return;
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
        value: detail.score,
        dateMs: detail.sessionEndMs,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    let meSessionEndMs: number | undefined;
    if (user?.id) {
      const meDetail = bestClusteredPuttingTestScoreAndSessionEndMs(
        holesByUser.get(user.id) || [],
        isCompletePuttingTest8To20Session,
      );
      meBest = meDetail?.score ?? 0;
      meSessionEndMs = meDetail?.sessionEndMs;
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
      meSessionEndMs,
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
      const detail = bestClusteredPuttingTestScoreAndSessionEndMs(
        holes,
        isCompletePuttingTest20To40Session,
      );
      if (!detail || detail.score <= 0) return;
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
        value: detail.score,
        dateMs: detail.sessionEndMs,
        isCurrentUser: user?.id === userId,
      });
    });

    allEntries.sort((a, b) => b.value - a.value);

    let meBest = 0;
    let meSessionEndMs: number | undefined;
    if (user?.id) {
      const meDetail = bestClusteredPuttingTestScoreAndSessionEndMs(
        holesByUser.get(user.id) || [],
        isCompletePuttingTest20To40Session,
      );
      meBest = meDetail?.score ?? 0;
      meSessionEndMs = meDetail?.sessionEndMs;
    }
    const withPinned = ensureCurrentUserOnLeaderboard(
      allEntries,
      user,
      userProfiles,
      meBest,
      meSessionEndMs,
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

  // XP leaderboard: all-time = max(profile.total_xp, lifetime practice+round implied XP);
  // week/month/year = practice XP in window + round XP in window
  if (metric === "xp") {
    const allEntries: any[] = [];

    const lifetimeActivityXpByUser = accumulateLifetimeActivityXpByUser(
      practiceSessions || [],
      rounds,
    );

    const periodXpPractice =
      timeFilter === "allTime"
        ? null
        : accumulateXpByUserForTimeFilter(
            timeFilter,
            practiceSessions || [],
          );
    const periodXpRounds =
      timeFilter === "allTime"
        ? null
        : accumulateRoundXpByUserForTimeFilter(timeFilter, rounds);
    const periodXpByUser =
      timeFilter === "allTime"
        ? null
        : mergePeriodXpMaps(
            periodXpPractice || new Map(),
            periodXpRounds || new Map(),
          );

    if (userProfiles && userProfiles.size > 0) {
      userProfiles.forEach((profile, userId) => {
        if (!profile) return;
        const profileXp = profile.xp || 0;
        const activityLifetime = lifetimeActivityXpByUser.get(userId) || 0;
        const xpValue =
          timeFilter === "allTime"
            ? Math.max(profileXp, activityLifetime)
            : periodXpByUser?.get(userId) || 0;
        if (xpValue <= 0) return;

        const displayName = profile.full_name?.trim() || "Academy Member";

        let nameForAvatar = "A";
        if (displayName !== "Academy Member") {
          nameForAvatar =
            displayName
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
        ? Math.max(
            userProfiles?.get(user.id)?.xp || 0,
            lifetimeActivityXpByUser.get(user.id) || 0,
          )
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
export {
  getTimeframeDates,
  fetchUserProfiles,
  getMockLeaderboard,
  formatLeaderboardValue,
  getLeaderboardData,
};
