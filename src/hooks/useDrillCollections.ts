"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { stableDrillKey } from "@/lib/drillPersonalBests";

export type DrillList = { id: string; name: string; drillKeys: string[] };

type Snapshot = {
  userId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  favourites: ReadonlySet<string>;
  lists: DrillList[];
  error: string | null;
};

type DrillLike = { id: string; drill_id?: string };

/** How many times more likely a favourite is to be picked when the planner fills a session. */
export const FAVOURITE_DRILL_WEIGHT = 3;

const EMPTY: Snapshot = { userId: null, status: "idle", favourites: new Set(), lists: [], error: null };
const SAVE_ERROR = "Couldn't save that. Check your connection and try again.";

let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();

function setSnapshot(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function drillCollectionKey(drill: DrillLike): string {
  return stableDrillKey(drill).trim().toLowerCase();
}

/** Matches on the drill code or the row id, so library and planner copies of a drill line up. */
export function drillInKeys(keys: ReadonlySet<string> | readonly string[], drill: DrillLike): boolean {
  const has = (k: string) => (Array.isArray(keys) ? keys.includes(k) : (keys as ReadonlySet<string>).has(k));
  return has(drillCollectionKey(drill)) || has(String(drill.id).trim().toLowerCase());
}

async function load(userId: string) {
  setSnapshot({ userId, status: "loading", favourites: new Set(), lists: [], error: null });
  const supabase = createClient();
  const [favRes, listRes] = await Promise.all([
    supabase.from("drill_favourites").select("drill_key").eq("user_id", userId),
    supabase.from("drill_lists").select("id, name, drill_keys").eq("user_id", userId).order("created_at"),
  ]);
  if (snapshot.userId !== userId) return;
  if (favRes.error || listRes.error) {
    setSnapshot({ status: "error" });
    return;
  }
  setSnapshot({
    status: "ready",
    favourites: new Set((favRes.data ?? []).map((r) => String(r.drill_key).toLowerCase())),
    lists: (listRes.data ?? []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      drillKeys: Array.isArray(r.drill_keys) ? r.drill_keys.map((k: unknown) => String(k).toLowerCase()) : [],
    })),
  });
}

export async function toggleFavouriteDrill(drill: DrillLike) {
  const { userId, favourites } = snapshot;
  if (!userId) return;
  const key = drillCollectionKey(drill);
  const wasFavourite = drillInKeys(favourites, drill);
  const next = new Set(favourites);
  if (wasFavourite) {
    next.delete(key);
    next.delete(String(drill.id).trim().toLowerCase());
  } else {
    next.add(key);
  }
  setSnapshot({ favourites: next, error: null });

  const table = createClient().from("drill_favourites");
  const { error } = wasFavourite
    ? await table.delete().eq("user_id", userId).in("drill_key", [key, String(drill.id).trim().toLowerCase()])
    : await table.upsert({ user_id: userId, drill_key: key }, { onConflict: "user_id,drill_key" });
  if (error) setSnapshot({ favourites, error: SAVE_ERROR });
}

async function saveList(list: DrillList, previous: DrillList[]) {
  const { error } = await createClient()
    .from("drill_lists")
    .update({ name: list.name, drill_keys: list.drillKeys, updated_at: new Date().toISOString() })
    .eq("id", list.id);
  if (error) setSnapshot({ lists: previous, error: SAVE_ERROR });
}

/** Creates a list (optionally starting with one drill) and returns its id. */
export async function createDrillList(name: string, firstDrill?: DrillLike): Promise<string | null> {
  const { userId } = snapshot;
  const trimmed = name.trim().slice(0, 60);
  if (!userId || !trimmed) return null;
  const { data, error } = await createClient()
    .from("drill_lists")
    .insert({ user_id: userId, name: trimmed, drill_keys: firstDrill ? [drillCollectionKey(firstDrill)] : [] })
    .select("id, name, drill_keys")
    .single();
  if (error || !data) {
    setSnapshot({ error: SAVE_ERROR });
    return null;
  }
  const list: DrillList = { id: String(data.id), name: String(data.name), drillKeys: (data.drill_keys as string[]) ?? [] };
  setSnapshot({ lists: [...snapshot.lists, list], error: null });
  return list.id;
}

export async function renameDrillList(id: string, name: string) {
  const trimmed = name.trim().slice(0, 60);
  const previous = snapshot.lists;
  const list = previous.find((l) => l.id === id);
  if (!list || !trimmed || trimmed === list.name) return;
  const updated = { ...list, name: trimmed };
  setSnapshot({ lists: previous.map((l) => (l.id === id ? updated : l)), error: null });
  await saveList(updated, previous);
}

export async function deleteDrillList(id: string) {
  const previous = snapshot.lists;
  setSnapshot({ lists: previous.filter((l) => l.id !== id), error: null });
  const { error } = await createClient().from("drill_lists").delete().eq("id", id);
  if (error) setSnapshot({ lists: previous, error: SAVE_ERROR });
}

export async function toggleDrillInList(id: string, drill: DrillLike) {
  const previous = snapshot.lists;
  const list = previous.find((l) => l.id === id);
  if (!list) return;
  const key = drillCollectionKey(drill);
  const rowId = String(drill.id).trim().toLowerCase();
  const inList = drillInKeys(list.drillKeys, drill);
  const updated = {
    ...list,
    drillKeys: inList ? list.drillKeys.filter((k) => k !== key && k !== rowId) : [...list.drillKeys, key],
  };
  setSnapshot({ lists: previous.map((l) => (l.id === id ? updated : l)), error: null });
  await saveList(updated, previous);
}

export function dismissDrillCollectionsError() {
  setSnapshot({ error: null });
}

/** The signed-in player's favourite drills and drill lists, shared across the Practice page. */
export function useDrillCollections(): Snapshot {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);

  useEffect(() => {
    if (!userId) return;
    if (snapshot.userId === userId) return;
    void load(userId);
  }, [userId]);

  return state.userId === userId ? state : EMPTY;
}
