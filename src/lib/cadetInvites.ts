import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { inviteUrl } from "@/lib/coachingSpaces";
import type { CadetHoleGroup } from "@/lib/cadetScoring";

export const CADET_INVITE_MIGRATION_HINT =
  "Cadet setup links need a database update. Run supabase/migrations/20261104160000_cadet_setup_invites.sql in Supabase, then reload.";

export type CadetInviteRow = {
  id: string;
  coach_id: string;
  display_name: string;
  hole_group: CadetHoleGroup;
  invite_code: string;
  player_id: string | null;
  claimed_at: string | null;
  created_at: string;
  player_name?: string | null;
};

export type CadetInvitePreview = {
  displayName: string;
  holeGroup: CadetHoleGroup;
  claimed: boolean;
  isSelf: boolean;
};

/** Cadet codes are "C" + 8 chars (same alphabet as coaching). */
export function isCadetInviteCode(code: string): boolean {
  return /^C[A-Z2-9]{8}$/i.test(code.trim());
}

function isMissingSetup(message: string): boolean {
  return /cadet_invites|cadet_invite_preview|accept_cadet_invite|schema cache|does not exist/i.test(
    message,
  );
}

export function cadetInviteUrl(code: string): string {
  return inviteUrl(code);
}

export async function fetchCadetInvites(
  client: SupabaseClient,
): Promise<{ rows: CadetInviteRow[]; error: string | null; available: boolean }> {
  const { data, error } = await client
    .from("cadet_invites")
    .select(
      "id, coach_id, display_name, hole_group, invite_code, player_id, claimed_at, created_at, profiles:player_id(full_name)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    const msg = error.message || "Couldn't load cadet invites.";
    if (isMissingSetup(msg)) {
      return { rows: [], error: CADET_INVITE_MIGRATION_HINT, available: false };
    }
    return { rows: [], error: msg, available: true };
  }

  return {
    rows: ((data as Record<string, unknown>[]) || []).map((row) => {
      const profiles = row.profiles as { full_name?: string | null } | null | undefined;
      return {
        id: String(row.id),
        coach_id: String(row.coach_id),
        display_name: String(row.display_name || ""),
        hole_group: Number(row.hole_group) as CadetHoleGroup,
        invite_code: String(row.invite_code || ""),
        player_id: row.player_id == null ? null : String(row.player_id),
        claimed_at: row.claimed_at == null ? null : String(row.claimed_at),
        created_at: String(row.created_at || ""),
        player_name: profiles?.full_name ?? null,
      };
    }),
    error: null,
    available: true,
  };
}

export async function createCadetInvite(
  client: SupabaseClient,
  input: { coachId: string; displayName: string; holeGroup: CadetHoleGroup },
): Promise<{ row: CadetInviteRow | null; error: string | null }> {
  const name = input.displayName.trim();
  if (name.length < 1) return { row: null, error: "Enter the cadet’s name." };

  const { data, error } = await client
    .from("cadet_invites")
    .insert({
      coach_id: input.coachId,
      display_name: name,
      hole_group: input.holeGroup,
    })
    .select("id, coach_id, display_name, hole_group, invite_code, player_id, claimed_at, created_at")
    .single();

  if (error || !data) {
    const msg = error?.message || "Couldn't create setup link.";
    return { row: null, error: isMissingSetup(msg) ? CADET_INVITE_MIGRATION_HINT : msg };
  }

  const row = data as Record<string, unknown>;
  return {
    row: {
      id: String(row.id),
      coach_id: String(row.coach_id),
      display_name: String(row.display_name || ""),
      hole_group: Number(row.hole_group) as CadetHoleGroup,
      invite_code: String(row.invite_code || ""),
      player_id: row.player_id == null ? null : String(row.player_id),
      claimed_at: row.claimed_at == null ? null : String(row.claimed_at),
      created_at: String(row.created_at || ""),
    },
    error: null,
  };
}

export async function deleteCadetInvite(
  client: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await client.from("cadet_invites").delete().eq("id", id);
  if (error) {
    const msg = error.message || "Couldn't delete invite.";
    return { error: isMissingSetup(msg) ? CADET_INVITE_MIGRATION_HINT : msg };
  }
  return { error: null };
}

export async function fetchCadetInvitePreview(code: string): Promise<CadetInvitePreview | null> {
  const { data, error } = await createClient().rpc("cadet_invite_preview", {
    p_code: code.trim().toUpperCase(),
  });
  if (error) {
    if (isMissingSetup(error.message || "")) {
      throw new Error(CADET_INVITE_MIGRATION_HINT);
    }
    throw new Error(error.message || "Couldn't load the cadet link.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    displayName: String(r.display_name || "Cadet"),
    holeGroup: Number(r.hole_group) as CadetHoleGroup,
    claimed: Boolean(r.claimed),
    isSelf: Boolean(r.is_self),
  };
}

export async function acceptCadetInvite(code: string): Promise<void> {
  const { error } = await createClient().rpc("accept_cadet_invite", {
    p_code: code.trim().toUpperCase(),
  });
  if (error) {
    const msg = error.message || "";
    if (isMissingSetup(msg)) throw new Error(CADET_INVITE_MIGRATION_HINT);
    if (/not_authenticated/i.test(msg)) throw new Error("Sign in to join Cadets.");
    if (/invite_not_found/i.test(msg)) throw new Error("This cadet link isn’t valid any more.");
    if (/invite_already_claimed/i.test(msg)) {
      throw new Error("This cadet link was already used by another account.");
    }
    throw new Error(msg || "Couldn't join Cadets.");
  }
}

/** Players enrolled in Cadets — preferred source for coach search. */
export async function fetchCadetEnrolledPlayers(
  client: SupabaseClient,
): Promise<{ players: { id: string; full_name: string | null }[]; error: string | null; available: boolean }> {
  const { data, error } = await client
    .from("cadet_enrollments")
    .select("player_id, status, profiles(full_name)")
    .eq("status", "active")
    .order("enrolled_on", { ascending: false });

  if (error) {
    const msg = error.message || "Couldn't load cadets.";
    if (/cadet_enrollments|schema cache|does not exist/i.test(msg)) {
      return { players: [], error: null, available: false };
    }
    return { players: [], error: msg, available: true };
  }

  const players = ((data as Record<string, unknown>[]) || []).map((row) => {
    const profiles = row.profiles as { full_name?: string | null } | null | undefined;
    return {
      id: String(row.player_id),
      full_name: profiles?.full_name ?? null,
    };
  });

  players.sort((a, b) =>
    (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" }),
  );

  return { players, error: null, available: true };
}
