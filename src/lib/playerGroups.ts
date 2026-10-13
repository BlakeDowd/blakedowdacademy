"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

/** Coach-made player groups (Scholarship etc.); see supabase/migrations/20261013120000_player_groups.sql. */
export type PlayerGroup = { id: string; name: string };
export type GroupMember = { group_id: string; player_id: string; started_on: string | null };
export type TalentProfile = { player_id: string; date_of_birth: string | null; notes: string | null };

const MIGRATION_HINT = "Run supabase/migrations/20261013120000_player_groups.sql in Supabase first.";

type GroupsState = {
  groups: PlayerGroup[];
  members: GroupMember[];
  loaded: boolean;
  /** False when the tables aren't there yet (migration not run). */
  available: boolean;
};

const EMPTY: GroupsState = { groups: [], members: [], loaded: false, available: true };
let state = EMPTY;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: GroupsState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const byName = (a: PlayerGroup, b: PlayerGroup) => a.name.localeCompare(b.name);

function errorMessage(message: string): string {
  if (/player_group|player_talent|schema cache|does not exist/i.test(message)) return MIGRATION_HINT;
  if (/row-level security|permission/i.test(message)) return "Only coaches can change player groups.";
  if (/duplicate|unique/i.test(message)) return "There's already a group with that name.";
  return message;
}

function load(): Promise<void> {
  loading ??= (async () => {
    const supabase = createClient();
    const [groupsRes, membersRes] = await Promise.all([
      supabase.from("player_groups").select("id, name"),
      supabase.from("player_group_members").select("group_id, player_id, started_on"),
    ]);
    if (groupsRes.error || membersRes.error) {
      emit({ ...EMPTY, loaded: true, available: false });
      return;
    }
    emit({
      groups: ((groupsRes.data ?? []) as PlayerGroup[]).sort(byName),
      members: (membersRes.data ?? []) as GroupMember[],
      loaded: true,
      available: true,
    });
  })();
  return loading;
}

/** Every group and membership (coaches see all members). Loaded once and shared. */
export function usePlayerGroups(): GroupsState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    void load();
  }, []);
  return snapshot;
}

export function groupsForPlayer(s: GroupsState, playerId: string): PlayerGroup[] {
  const ids = new Set(s.members.filter((m) => m.player_id === playerId).map((m) => m.group_id));
  return s.groups.filter((g) => ids.has(g.id));
}

export function membersOfGroup(s: GroupsState, groupId: string): GroupMember[] {
  return s.members.filter((m) => m.group_id === groupId);
}

export async function createPlayerGroup(name: string): Promise<{ error: string } | { group: PlayerGroup }> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return { error: "Give the group a name." };
  const { data, error } = await createClient().from("player_groups").insert({ name: clean }).select("id, name").single();
  if (error) return { error: errorMessage(error.message) };
  const group = data as PlayerGroup;
  emit({ ...state, groups: [...state.groups, group].sort(byName) });
  return { group };
}

export async function renamePlayerGroup(groupId: string, name: string): Promise<string | null> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) return "Give the group a name.";
  const previous = state.groups;
  emit({ ...state, groups: previous.map((g) => (g.id === groupId ? { ...g, name: clean } : g)).sort(byName) });
  const { error } = await createClient().from("player_groups").update({ name: clean }).eq("id", groupId);
  if (!error) return null;
  emit({ ...state, groups: previous });
  return errorMessage(error.message);
}

export async function deletePlayerGroup(groupId: string): Promise<string | null> {
  const previous = state;
  emit({
    ...state,
    groups: state.groups.filter((g) => g.id !== groupId),
    members: state.members.filter((m) => m.group_id !== groupId),
  });
  const { error } = await createClient().from("player_groups").delete().eq("id", groupId);
  if (!error) return null;
  emit(previous);
  return errorMessage(error.message);
}

/** Adds the player (starting today unless a date is given) or removes them. */
export async function setGroupMembership(
  groupId: string,
  playerId: string,
  member: boolean,
  startedOn: string | null = todayKey(),
): Promise<string | null> {
  const previous = state.members;
  const others = previous.filter((m) => !(m.group_id === groupId && m.player_id === playerId));
  emit({
    ...state,
    members: member ? [...others, { group_id: groupId, player_id: playerId, started_on: startedOn }] : others,
  });
  const table = createClient().from("player_group_members");
  const { error } = member
    ? await table.upsert({ group_id: groupId, player_id: playerId, started_on: startedOn })
    : await table.delete().eq("group_id", groupId).eq("player_id", playerId);
  if (!error) return null;
  emit({ ...state, members: previous });
  return errorMessage(error.message);
}

export async function setGroupStartDate(groupId: string, playerId: string, startedOn: string | null): Promise<string | null> {
  const previous = state.members;
  emit({
    ...state,
    members: previous.map((m) =>
      m.group_id === groupId && m.player_id === playerId ? { ...m, started_on: startedOn } : m,
    ),
  });
  const { error } = await createClient()
    .from("player_group_members")
    .update({ started_on: startedOn })
    .eq("group_id", groupId)
    .eq("player_id", playerId);
  if (!error) return null;
  emit({ ...state, members: previous });
  return errorMessage(error.message);
}

export async function fetchTalentProfiles(playerIds: string[]): Promise<Map<string, TalentProfile>> {
  const out = new Map<string, TalentProfile>();
  if (playerIds.length === 0) return out;
  const { data } = await createClient()
    .from("player_talent_profiles")
    .select("player_id, date_of_birth, notes")
    .in("player_id", playerIds);
  for (const row of (data ?? []) as TalentProfile[]) out.set(row.player_id, row);
  return out;
}

export async function saveTalentProfile(
  playerId: string,
  fields: { date_of_birth: string | null; notes: string | null },
): Promise<string | null> {
  const { error } = await createClient()
    .from("player_talent_profiles")
    .upsert({ player_id: playerId, ...fields, updated_at: new Date().toISOString() });
  return error ? errorMessage(error.message) : null;
}

/** The signed-in player's own groups, for their profile badge. */
export function useMyPlayerGroups(userId: string | null | undefined): string[] {
  const [loaded, setLoaded] = useState<{ userId: string; names: string[] } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void createClient()
      .from("player_group_members")
      .select("player_groups(name)")
      .eq("player_id", userId)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const names = (data ?? [])
          .flatMap((row) => {
            const g = (row as { player_groups?: { name?: string } | { name?: string }[] | null }).player_groups;
            return Array.isArray(g) ? g : g ? [g] : [];
          })
          .map((g) => g.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0)
          .sort();
        setLoaded({ userId, names });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return loaded && loaded.userId === userId ? loaded.names : [];
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ageFromDob(dob: string | null | undefined, at = new Date()): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = at.getFullYear() - y;
  if (at.getMonth() + 1 < m || (at.getMonth() + 1 === m && at.getDate() < d)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export type AgeGroup = "U12" | "U14" | "U16" | "U18" | "18+" | "No DOB";
export const AGE_GROUPS: readonly AgeGroup[] = ["U12", "U14", "U16", "U18", "18+", "No DOB"];

export function ageGroup(age: number | null): AgeGroup {
  if (age == null) return "No DOB";
  if (age < 12) return "U12";
  if (age < 14) return "U14";
  if (age < 16) return "U16";
  if (age < 18) return "U18";
  return "18+";
}
