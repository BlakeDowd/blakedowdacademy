import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CoachingSetupError,
  fetchCoachInbox,
  fetchProfileNames,
  type CoachingSpaceSummary,
} from "@/lib/coachingFeed";

/** Future paid tiers. Recorded on every space; nothing is locked by it yet. */
export type CoachingPlan = "free" | "paid";

export type CoachingSpaceRecord = {
  id: string;
  student_id: string | null;
  coach_id: string | null;
  display_name: string;
  invite_code: string;
  plan: CoachingPlan;
  created_at: string;
  joined_at: string | null;
};

const SPACE_COLUMNS = "id, student_id, coach_id, display_name, invite_code, plan, created_at, joined_at";

const SETUP_MESSAGE =
  "Invites need a database update. Run supabase/migrations/20261006130000_coaching_invites.sql in Supabase.";

/** Posts are filed under the player's user id once they join, or the space id while the invite waits. */
export const spaceKey = (s: Pick<CoachingSpaceRecord, "id" | "student_id">) => s.student_id ?? s.id;

function isMissingSetup(error: { message?: string; code?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    error.code === "42P01" ||
    error.code === "42883" ||
    /coaching_spaces|coaching_invite_preview|accept_coaching_invite/.test(error.message ?? "")
  );
}

function rethrow(error: { message?: string; code?: string } | null): void {
  if (!error) return;
  if (isMissingSetup(error)) throw new CoachingSetupError(SETUP_MESSAGE);
  throw new Error(error.message || "Something went wrong");
}

/** Every space record the coach can see, or null before the invites migration has been run. */
async function fetchSpaceRecords(supabase: SupabaseClient): Promise<CoachingSpaceRecord[] | null> {
  const { data, error } = await supabase
    .from("coaching_spaces")
    .select(SPACE_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingSetup(error)) return null;
    throw new Error(error.message);
  }
  return (data ?? []) as CoachingSpaceRecord[];
}

/** Before the invites migration: every player in the app, as the Spaces screen used to work. */
async function fetchEveryPlayerSpace(supabase: SupabaseClient, coachId: string): Promise<CoachingSpaceSummary[]> {
  const [inbox, withRole] = await Promise.all([
    fetchCoachInbox(supabase, coachId),
    supabase.from("profiles").select("id, full_name, role"),
  ]);
  const profilesRes = withRole.error ? await supabase.from("profiles").select("id, full_name") : withRole;
  const byId = new Map(inbox.map((t) => [t.studentId, t] as const));
  const spaces: CoachingSpaceSummary[] = [];
  for (const p of (profilesRes.data ?? []) as { id: string; full_name: string | null; role?: string | null }[]) {
    const isCoachProfile = (p.role ?? "").trim().toLowerCase() === "coach";
    const thread = byId.get(p.id);
    if (p.id === coachId && !thread) continue;
    if (isCoachProfile && !thread) continue;
    spaces.push({
      studentId: p.id,
      name: p.full_name?.trim() || "Golfer",
      lastActivityAt: thread?.latest?.created_at ?? null,
      unread: thread?.unread ?? false,
    });
  }
  return spaces;
}

/**
 * The coach's Spaces screen: spaces they created or invited, players who already have posts,
 * and invites still waiting for the player to join.
 */
export async function fetchSpaces(supabase: SupabaseClient, coachId: string): Promise<CoachingSpaceSummary[]> {
  const [inbox, records] = await Promise.all([fetchCoachInbox(supabase, coachId), fetchSpaceRecords(supabase)]);
  if (!records) return fetchEveryPlayerSpace(supabase, coachId);

  const threads = new Map(inbox.map((t) => [t.studentId, t] as const));
  const mine = records
    .filter((r) => !r.coach_id || r.coach_id === coachId)
    .sort((a, b) => Number(b.coach_id === coachId) - Number(a.coach_id === coachId));
  const names = await fetchProfileNames(
    supabase,
    mine.flatMap((r) => (r.student_id && !threads.has(r.student_id) ? [r.student_id] : [])),
  );

  const byKey = new Map<string, CoachingSpaceSummary>();
  for (const r of mine) {
    const key = spaceKey(r);
    if (byKey.has(key)) continue;
    const thread = threads.get(key);
    byKey.set(key, {
      studentId: key,
      name: r.student_id ? (thread?.studentName ?? names.get(r.student_id) ?? r.display_name) : r.display_name,
      lastActivityAt: thread?.latest?.created_at ?? null,
      unread: thread?.unread ?? false,
      space: { id: r.id, inviteCode: r.invite_code, pending: !r.student_id, createdAt: r.created_at },
    });
  }

  const otherCoaches = new Set(records.filter((r) => r.coach_id && r.coach_id !== coachId).map(spaceKey));
  for (const t of inbox) {
    if (byKey.has(t.studentId) || t.studentId === coachId || otherCoaches.has(t.studentId)) continue;
    byKey.set(t.studentId, {
      studentId: t.studentId,
      name: t.studentName,
      lastActivityAt: t.latest?.created_at ?? null,
      unread: t.unread,
    });
  }
  return [...byKey.values()];
}

/** Creates a space for someone who isn't on the app yet. Share its invite link so they can join. */
export async function createInviteSpace(
  supabase: SupabaseClient,
  coachId: string,
  name: string,
): Promise<CoachingSpaceRecord> {
  const { data, error } = await supabase
    .from("coaching_spaces")
    .insert({ coach_id: coachId, display_name: name.trim() })
    .select(SPACE_COLUMNS)
    .single();
  rethrow(error);
  return data as CoachingSpaceRecord;
}

/** Puts a player who already has an account on the coach's Spaces screen. No invite needed. */
export async function addExistingPlayer(
  supabase: SupabaseClient,
  coachId: string,
  player: { id: string; name: string },
): Promise<CoachingSpaceRecord> {
  const { data, error } = await supabase
    .from("coaching_spaces")
    .insert({
      coach_id: coachId,
      student_id: player.id,
      display_name: player.name.trim() || "Golfer",
      joined_at: new Date().toISOString(),
    })
    .select(SPACE_COLUMNS)
    .single();
  rethrow(error);
  return data as CoachingSpaceRecord;
}

/** Deleting a waiting invite also deletes anything already posted into it. */
export async function deletePendingSpace(supabase: SupabaseClient, spaceId: string): Promise<void> {
  const { error } = await supabase.from("coaching_spaces").delete().eq("id", spaceId).is("student_id", null);
  rethrow(error);
}

export type PlayerOption = { id: string; name: string };

/** Players on the app (not coaches) for "Add someone already on the app". */
export async function fetchPlayerOptions(supabase: SupabaseClient): Promise<PlayerOption[]> {
  const withRole = await supabase.from("profiles").select("id, full_name, role");
  const res = withRole.error ? await supabase.from("profiles").select("id, full_name") : withRole;
  rethrow(res.error);
  return ((res.data ?? []) as { id: string; full_name: string | null; role?: string | null }[])
    .filter((p) => (p.role ?? "").trim().toLowerCase() !== "coach" && p.full_name?.trim())
    .map((p) => ({ id: p.id, name: p.full_name!.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type InvitePreview = {
  displayName: string;
  coachName: string;
  joined: boolean;
  joinedByYou: boolean;
};

export async function fetchInvitePreview(supabase: SupabaseClient, code: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc("coaching_invite_preview", { p_code: code });
  rethrow(error);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { display_name: string; coach_name: string; joined: boolean; joined_by_you: boolean }
    | undefined;
  if (!row) return null;
  return {
    displayName: row.display_name,
    coachName: row.coach_name,
    joined: row.joined,
    joinedByYou: row.joined_by_you,
  };
}

const ACCEPT_ERRORS: Record<string, string> = {
  not_signed_in: "Sign in first, then open the invite link again.",
  invite_not_found: "This invite link isn't valid. Ask your coach to send a new one.",
  invite_used: "This invite has already been used by someone else. Ask your coach for a new link.",
  coach_cannot_join: "You're signed in as a coach. Send this link to the player so they can join.",
  profile_missing: "Finish setting up your profile, then open the invite link again.",
};

export async function acceptInvite(supabase: SupabaseClient, code: string): Promise<void> {
  const { error } = await supabase.rpc("accept_coaching_invite", { p_code: code });
  if (!error) return;
  const known = Object.keys(ACCEPT_ERRORS).find((k) => error.message?.includes(k));
  if (known) throw new Error(ACCEPT_ERRORS[known]);
  rethrow(error);
}

export const normalizeInviteCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export const inviteUrl = (code: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/join/${code}`;

/** Opens the phone's share sheet (text, WhatsApp, email…), or copies the link where sharing isn't available. */
export async function shareInvite(
  code: string,
  playerName: string,
  coachName: string,
): Promise<"shared" | "copied" | "cancelled"> {
  const url = inviteUrl(code);
  const text = `Hi ${playerName.split(" ")[0]}, ${coachName} has set up a private coaching space for you. Join here:`;
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Join your coaching space", text, url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return "copied";
}

const PENDING_INVITE_KEY = "coaching_pending_invite";
const PENDING_INVITE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Remembers an invite opened while signed out so login/sign-up can bring the player back to it. */
export function rememberPendingInvite(code: string, playerName: string): void {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ code, name: playerName, at: Date.now() }));
  } catch {
    // Private browsing: the player can open the link again after signing in.
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // ignore
  }
}

function readPendingInvite(): { code: string; name: string | null } | null {
  try {
    const raw = localStorage.getItem(PENDING_INVITE_KEY);
    if (!raw) return null;
    const { code, name, at } = JSON.parse(raw) as { code?: string; name?: string; at?: number };
    if (code && at && Date.now() - at < PENDING_INVITE_MAX_AGE_MS) return { code, name: name?.trim() || null };
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // ignore
  }
  return null;
}

/** The name the coach gave the invite, to pre-fill sign-up. */
export const pendingInviteName = () => readPendingInvite()?.name ?? null;

/** Query flag telling the invite page to join straight away (the player came back from login/sign-up). */
export const AUTO_JOIN_PARAM = "auto";

/** Where to go after signing in: back to a waiting invite (joining it automatically), otherwise the profile. */
export function postLoginPath(): string {
  const pending = readPendingInvite();
  return pending ? `/join/${encodeURIComponent(pending.code)}?${AUTO_JOIN_PARAM}=1` : "/profile";
}
