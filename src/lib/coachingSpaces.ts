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

type ProfileRow = { id: string; full_name: string | null; role?: string | null };

async function fetchProfiles(supabase: SupabaseClient): Promise<ProfileRow[]> {
  const withRole = await supabase.from("profiles").select("id, full_name, role");
  const res = withRole.error ? await supabase.from("profiles").select("id, full_name") : withRole;
  if (res.error) console.warn("[coachingSpaces] profiles:", res.error.message);
  return (res.data ?? []) as ProfileRow[];
}

const isCoachProfile = (p: ProfileRow) => (p.role ?? "").trim().toLowerCase() === "coach";

/** Before the invites migration: every player in the app, as the Spaces screen used to work. */
async function fetchEveryPlayerSpace(supabase: SupabaseClient, coachId: string): Promise<CoachingSpaceSummary[]> {
  const [inbox, profiles] = await Promise.all([fetchCoachInbox(supabase, coachId), fetchProfiles(supabase)]);
  const byId = new Map(inbox.map((t) => [t.studentId, t] as const));
  const spaces: CoachingSpaceSummary[] = [];
  for (const p of profiles) {
    const thread = byId.get(p.id);
    if (p.id === coachId && !thread) continue;
    if (isCoachProfile(p) && !thread) continue;
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
 * invites still waiting for the player to join, then every other player on the app (no activity,
 * so the grid tucks them under "no posts yet").
 */
export async function fetchSpaces(supabase: SupabaseClient, coachId: string): Promise<CoachingSpaceSummary[]> {
  const [inbox, records, profiles] = await Promise.all([
    fetchCoachInbox(supabase, coachId),
    fetchSpaceRecords(supabase),
    fetchProfiles(supabase),
  ]);
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

  for (const p of profiles) {
    if (byKey.has(p.id) || p.id === coachId || isCoachProfile(p) || otherCoaches.has(p.id)) continue;
    byKey.set(p.id, { studentId: p.id, name: p.full_name?.trim() || "Golfer", lastActivityAt: null, unread: false });
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

/** Makes sure the signed-in user has a profiles row so accept_coaching_invite can succeed. */
export async function ensurePlayerProfile(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null; fullName?: string | null },
): Promise<void> {
  const { data, error } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (error && !isMissingSetup(error)) throw new Error(error.message || "Couldn't check your profile.");
  if (data?.id) return;

  const fullName = user.fullName?.trim() || user.email?.split("@")[0] || "Golfer";
  const insert = await supabase.from("profiles").insert({
    id: user.id,
    full_name: fullName,
    starting_handicap: 54,
    created_at: new Date().toISOString(),
  });
  if (insert.error) {
    // Race: another tab may have created it
    const again = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (again.data?.id) return;
    throw new Error(insert.error.message || "Couldn't create your profile.");
  }
}

export async function acceptInvite(supabase: SupabaseClient, code: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    await ensurePlayerProfile(supabase, {
      id: auth.user.id,
      email: auth.user.email,
      fullName:
        (auth.user.user_metadata?.full_name as string | undefined) ||
        (auth.user.user_metadata?.fullName as string | undefined) ||
        null,
    });
  }

  const { error } = await supabase.rpc("accept_coaching_invite", { p_code: code });
  if (!error) return;
  const known = Object.keys(ACCEPT_ERRORS).find((k) => error.message?.includes(k));
  if (known) throw new Error(ACCEPT_ERRORS[known]);
  rethrow(error);
}

/**
 * Coach recovery: attach a player who already signed up (without the invite) to a waiting space
 * so posts/videos filed under the space id move to their account.
 */
export async function linkExistingPlayerToPendingSpace(
  supabase: SupabaseClient,
  spaceId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("link_player_to_pending_space", {
    p_space_id: spaceId,
    p_player_id: playerId,
  });
  if (!error) return;
  if (/space_not_pending|space_not_found|player_missing|already_linked|not_coach/i.test(error.message ?? "")) {
    const map: Record<string, string> = {
      space_not_found: "That invite space wasn't found.",
      space_not_pending: "This space is already linked to a player.",
      player_missing: "That player doesn't have a profile yet.",
      already_linked: "That player is already in another coaching space.",
      not_coach: "Only the coach can link a player to this invite.",
    };
    const key = Object.keys(map).find((k) => error.message?.includes(k));
    throw new Error(key ? map[key]! : error.message);
  }
  rethrow(error);
}

/**
 * Coach: absorb a duplicate space/account into the one that should keep the videos.
 * `keepId` / `dropId` are space keys (player user id, or pending invite space id).
 * Returns the surviving space key to open after refresh.
 */
export async function mergeCoachingThreads(
  supabase: SupabaseClient,
  keepId: string,
  dropId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("coach_merge_coaching_threads", {
    p_keep: keepId,
    p_drop: dropId,
  });
  if (error) {
    const map: Record<string, string> = {
      not_coach: "Only the coach can merge duplicates.",
      pick_two_different: "Pick two different spaces to merge.",
      keep_not_found: "Couldn't find the space to keep.",
      drop_not_found: "Couldn't find the duplicate to merge away.",
      cannot_merge_coach: "Coach accounts can't be merged.",
      space_not_pending: "That invite was already linked.",
      space_not_found: "That invite space wasn't found.",
      player_missing: "That player doesn't have a profile yet.",
    };
    const key = Object.keys(map).find((k) => error.message?.includes(k));
    throw new Error(key ? map[key]! : error.message);
  }
  return (data as string) || keepId;
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
  // Put the URL in the text body — many apps (WhatsApp, iMessage) ignore the separate `url` field
  // and players then sign up from the App Store with no invite → empty space, missing videos.
  const text = `Hi ${playerName.split(" ")[0]}, ${coachName} has set up a private coaching space for you on Blake Dowd Golf.\n\nOpen this link to join (don't just download the app):\n${url}`;
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Join your coaching space", text, url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(text);
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
