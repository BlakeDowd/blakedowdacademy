import type { SupabaseClient } from "@supabase/supabase-js";

export const FEEL_LOG_CLUBS = [
  "Driver",
  "3-Wood",
  "5-Wood",
  "Hybrid",
  "4-Iron",
  "5-Iron",
  "6-Iron",
  "7-Iron",
  "8-Iron",
  "9-Iron",
  "PW",
  "GW",
  "56° Wedge",
  "60° Wedge",
  "Putter",
] as const;

export type FeelLogClub = (typeof FEEL_LOG_CLUBS)[number] | string;

export const FEEL_LOG_FOCUS_AREAS = [
  "Backswing depth",
  "Clubface control",
  "Tempo",
  "Hip clear",
  "Weight shift",
  "Takeaway",
  "Transition",
  "Impact",
  "Start line",
  "Speed control",
  "Contact quality",
  "Mental / commitment",
  "Driving",
  "Irons",
  "Wedges",
  "Chipping",
  "Bunkers",
  "Putting",
  "On-Course",
] as const;

export type FeelLogFocusArea = (typeof FEEL_LOG_FOCUS_AREAS)[number] | string;

export const FEEL_LOG_BALL_FLIGHTS = [
  "Flush",
  "Straight",
  "Draw",
  "Fade",
  "Push",
  "Pull",
  "Thin",
  "Fat",
] as const;

export type FeelLogBallFlight = (typeof FEEL_LOG_BALL_FLIGHTS)[number];

export type FeelLogEntry = {
  id: string;
  user_id: string;
  logged_at: string;
  club: string;
  target_feel: string;
  focus_area: string;
  is_hitting_it_good: boolean;
  ball_flight_result: FeelLogBallFlight | null;
  coach_notes: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

export const FEEL_LOG_MIGRATION_HINT =
  "Run supabase/migrations/20261105120000_player_feel_logs.sql in Supabase first.";

function isMissingRelation(message: string): boolean {
  return /player_feel_logs|schema cache|does not exist/i.test(message);
}

function isBallFlight(v: string): v is FeelLogBallFlight {
  return (FEEL_LOG_BALL_FLIGHTS as readonly string[]).includes(v);
}

function mapRow(row: Record<string, unknown>): FeelLogEntry {
  const flightRaw = typeof row.ball_flight_result === "string" ? row.ball_flight_result : null;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    logged_at: String(row.logged_at || row.created_at || ""),
    club: String(row.club || ""),
    target_feel: String(row.target_feel || ""),
    focus_area: String(row.focus_area || ""),
    is_hitting_it_good: Boolean(row.is_hitting_it_good),
    ball_flight_result: flightRaw && isBallFlight(flightRaw) ? flightRaw : null,
    coach_notes: typeof row.coach_notes === "string" ? row.coach_notes : null,
    is_pinned: Boolean(row.is_pinned),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

const SELECT =
  "id, user_id, logged_at, club, target_feel, focus_area, is_hitting_it_good, ball_flight_result, coach_notes, is_pinned, created_at, updated_at";

export function sortFeelLogEntries(rows: FeelLogEntry[]): FeelLogEntry[] {
  return [...rows].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return b.logged_at.localeCompare(a.logged_at);
  });
}

export async function fetchFeelLogs(
  client: SupabaseClient,
  opts: { userId: string; goldenOnly?: boolean },
): Promise<{ rows: FeelLogEntry[]; error: string | null; available: boolean }> {
  let q = client
    .from("player_feel_logs")
    .select(SELECT)
    .eq("user_id", opts.userId)
    .order("is_pinned", { ascending: false })
    .order("logged_at", { ascending: false });
  if (opts.goldenOnly) q = q.eq("is_hitting_it_good", true);

  const { data, error } = await q;
  if (error) {
    const msg = error.message || "Couldn't load feel log.";
    if (isMissingRelation(msg)) {
      return { rows: [], error: FEEL_LOG_MIGRATION_HINT, available: false };
    }
    return { rows: [], error: msg, available: true };
  }
  return {
    rows: sortFeelLogEntries(((data as Record<string, unknown>[]) || []).map(mapRow)),
    error: null,
    available: true,
  };
}

export type FeelLogInsertInput = {
  userId: string;
  club: string;
  targetFeel: string;
  focusArea: string;
  isHittingItGood?: boolean;
  ballFlightResult?: FeelLogBallFlight | null;
  isPinned?: boolean;
  loggedAt?: string | null;
  coachNotes?: string | null;
};

export async function insertFeelLog(
  client: SupabaseClient,
  input: FeelLogInsertInput,
): Promise<{ row: FeelLogEntry | null; error: string | null }> {
  const club = input.club.trim();
  const targetFeel = input.targetFeel.trim();
  const focusArea = input.focusArea.trim();
  if (!club) return { row: null, error: "Pick a club." };
  if (!targetFeel) return { row: null, error: "Add the feel / cue you want to remember." };
  if (targetFeel.length > 500) return { row: null, error: "Feel cue is too long." };
  if (!focusArea) return { row: null, error: "Pick what you were working on." };

  const payload: Record<string, unknown> = {
    user_id: input.userId,
    club,
    target_feel: targetFeel,
    focus_area: focusArea,
    is_hitting_it_good: Boolean(input.isHittingItGood),
    ball_flight_result: input.ballFlightResult || null,
    is_pinned: Boolean(input.isPinned),
    logged_at: input.loggedAt?.trim() || new Date().toISOString(),
  };
  if (input.coachNotes != null && String(input.coachNotes).trim() !== "") {
    payload.coach_notes = String(input.coachNotes).trim();
  }

  const { data, error } = await client.from("player_feel_logs").insert(payload).select(SELECT).maybeSingle();
  if (error) {
    const msg = error.message || "Couldn't save feel log.";
    // Insert may succeed while returning the row fails — retry as plain insert.
    if (/permission|rls|policy/i.test(msg)) {
      const retry = await client.from("player_feel_logs").insert(payload);
      if (!retry.error) return { row: null, error: null };
    }
    return { row: null, error: isMissingRelation(msg) ? FEEL_LOG_MIGRATION_HINT : msg };
  }
  return {
    row: data ? mapRow(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function updateFeelLog(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    club: string;
    targetFeel: string;
    focusArea: string;
    isHittingItGood: boolean;
    ballFlightResult: FeelLogBallFlight | null;
    isPinned: boolean;
    loggedAt: string;
    coachNotes: string | null;
  }>,
): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.club != null) {
    const club = patch.club.trim();
    if (!club) return { error: "Club can't be empty." };
    row.club = club;
  }
  if (patch.targetFeel != null) {
    const feel = patch.targetFeel.trim();
    if (!feel) return { error: "Feel cue can't be empty." };
    if (feel.length > 500) return { error: "Feel cue is too long." };
    row.target_feel = feel;
  }
  if (patch.focusArea != null) {
    const focus = patch.focusArea.trim();
    if (!focus) return { error: "Focus area can't be empty." };
    row.focus_area = focus;
  }
  if (patch.isHittingItGood != null) row.is_hitting_it_good = patch.isHittingItGood;
  if (patch.ballFlightResult !== undefined) row.ball_flight_result = patch.ballFlightResult;
  if (patch.isPinned != null) row.is_pinned = patch.isPinned;
  if (patch.loggedAt != null) row.logged_at = patch.loggedAt;
  if (patch.coachNotes !== undefined) {
    const notes = patch.coachNotes?.trim() || null;
    row.coach_notes = notes;
  }

  const { error } = await client.from("player_feel_logs").update(row).eq("id", id);
  if (error) {
    const msg = error.message || "Couldn't update feel log.";
    return { error: isMissingRelation(msg) ? FEEL_LOG_MIGRATION_HINT : msg };
  }
  return { error: null };
}

export async function deleteFeelLog(
  client: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await client.from("player_feel_logs").delete().eq("id", id);
  if (error) {
    const msg = error.message || "Couldn't delete feel log.";
    return { error: isMissingRelation(msg) ? FEEL_LOG_MIGRATION_HINT : msg };
  }
  return { error: null };
}

export function formatFeelLogWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  return (
    d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) +
    " · " +
    time
  );
}
