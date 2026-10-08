import { createClient } from "@/lib/supabase/client";
import { authJsonHeaders } from "@/lib/coachingFeed";
import { inviteUrl } from "@/lib/coachingSpaces";

export type FamilyPlayer = {
  id: string;
  name: string;
  iconId: string | null;
  role: "guardian" | "player";
  familyName: string;
};

/** Set once someone has picked who's practising in this browser session. */
const PICKED_KEY = "family:picked";

/** Practice data some screens keep on the device rather than per player. */
const DEVICE_KEYS = [
  "weeklyPracticePlans",
  "userProgress",
  "practiceActivityHistory",
  "totalPracticeMinutes",
  "recommendedDrills",
  "libraryLastWatchedLessonId",
];
const DEVICE_KEY_PREFIXES = ["freestyleMinutes_"];
const stashKey = (userId: string) => `family:device:${userId}`;

/** Everyone the signed-in player can switch to, themselves included. Empty when not in a family. */
export async function fetchFamilyPlayers(): Promise<FamilyPlayer[]> {
  const { data, error } = await createClient().rpc("family_players");
  if (error || !Array.isArray(data)) return [];
  return (
    data as { user_id: string; full_name: string; preferred_icon_id: string | null; role: string; family_name: string }[]
  )
    .map((r) => ({
      id: r.user_id,
      name: r.full_name,
      iconId: r.preferred_icon_id,
      role: r.role === "guardian" ? ("guardian" as const) : ("player" as const),
      familyName: r.family_name,
    }))
    .sort((a, b) => Number(b.role === "guardian") - Number(a.role === "guardian") || a.name.localeCompare(b.name));
}

export function hasPickedPlayer(): boolean {
  try {
    return sessionStorage.getItem(PICKED_KEY) === "1";
  } catch {
    return true;
  }
}

export function markPlayerPicked(): void {
  try {
    sessionStorage.setItem(PICKED_KEY, "1");
  } catch {
    // Private browsing: the picker shows again next launch.
  }
}

function deviceKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (DEVICE_KEYS.includes(k) || DEVICE_KEY_PREFIXES.some((p) => k.startsWith(p)))) keys.push(k);
  }
  return keys;
}

/** Keeps each child's on-device practice data separate on a shared phone. */
function swapDeviceData(fromUserId: string, toUserId: string): void {
  try {
    const saved: Record<string, string> = {};
    for (const k of deviceKeys()) {
      saved[k] = localStorage.getItem(k) ?? "";
      localStorage.removeItem(k);
    }
    localStorage.setItem(stashKey(fromUserId), JSON.stringify(saved));
    const next = JSON.parse(localStorage.getItem(stashKey(toUserId)) || "{}") as Record<string, string>;
    for (const [k, v] of Object.entries(next)) localStorage.setItem(k, v);
    localStorage.removeItem(stashKey(toUserId));
    localStorage.removeItem("auth_user_cache");
  } catch {
    // Storage full or blocked: switching still works, the device data just isn't swapped.
  }
}

/** Family links share /join/<code> with coaching space invites; family codes are "F" + 8 characters. */
export const isFamilyInviteCode = (code: string) => code.length === 9 && code.startsWith("F");

export type FamilyInvitePreview = {
  familyName: string;
  coachName: string;
  playerCount: number;
  isMember: boolean;
};

export async function fetchFamilyInvitePreview(code: string): Promise<FamilyInvitePreview | null> {
  const { data, error } = await createClient().rpc("family_invite_preview", { p_code: code });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { family_name: string; coach_name: string; player_count: number; is_member: boolean }
    | undefined;
  if (!row) return null;
  return {
    familyName: row.family_name,
    coachName: row.coach_name,
    playerCount: row.player_count,
    isMember: row.is_member,
  };
}

const ACCEPT_ERRORS: Record<string, string> = {
  not_signed_in: "Sign in first, then open the family link again.",
  invite_not_found: "This family link isn't valid any more. Ask your coach for a new one.",
  coach_cannot_join: "You're signed in as a coach. Send this link to the parent.",
  profile_missing: "Finish setting up your profile, then open the family link again.",
};

export async function acceptFamilyInvite(code: string): Promise<void> {
  const { error } = await createClient().rpc("accept_family_invite", { p_code: code });
  if (!error) return;
  const known = Object.keys(ACCEPT_ERRORS).find((k) => error.message?.includes(k));
  throw new Error(known ? ACCEPT_ERRORS[known] : error.message || "Couldn't join the family.");
}

export async function resetFamilyInvite(familyId: string): Promise<string> {
  const { data, error } = await createClient().rpc("reset_family_invite", { p_family: familyId });
  if (error || typeof data !== "string") throw new Error(error?.message || "Couldn't make a new link.");
  return data;
}

/** Opens the share sheet (text, WhatsApp, email…), or copies the link where sharing isn't available. */
export async function shareFamilyInvite(
  code: string,
  familyName: string,
  coachName: string,
): Promise<"shared" | "copied" | "cancelled"> {
  const url = inviteUrl(code);
  const text = `Hi, ${coachName} has set up "${familyName}" on the golf app. Sign up here so the kids can log their practice and see their progress:`;
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Join your family on the golf app", text, url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return "copied";
}

/** Signs this device in as another member of the family, then reloads the app as them. */
export async function switchToPlayer(currentUserId: string, playerId: string): Promise<void> {
  const res = await fetch("/api/family/switch", {
    method: "POST",
    headers: await authJsonHeaders(),
    body: JSON.stringify({ playerId }),
  });
  const body = (await res.json().catch(() => ({}))) as { tokenHash?: string; error?: string };
  if (!res.ok || !body.tokenHash) throw new Error(body.error || "Couldn't switch player.");

  const { error } = await createClient().auth.verifyOtp({ token_hash: body.tokenHash, type: "magiclink" });
  if (error) throw new Error(error.message || "Couldn't switch player.");

  swapDeviceData(currentUserId, playerId);
  markPlayerPicked();
  window.location.assign("/");
}
