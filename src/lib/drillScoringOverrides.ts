"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

/** Coach-chosen scoring per drill (`drill_scoring` table), shared by every drill card on the page. */
type OverridesState = {
  byKey: ReadonlyMap<string, string>;
  loaded: boolean;
  /** False when the table isn't there yet (migration not run). */
  available: boolean;
};

const EMPTY: OverridesState = { byKey: new Map(), loaded: false, available: true };
let state = EMPTY;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const normalizeKey = (drillKey: string) => drillKey.trim().toLowerCase();

function emit(next: OverridesState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function load(): Promise<void> {
  loading ??= (async () => {
    const { data, error } = await createClient().from("drill_scoring").select("drill_key, score_type");
    if (error) {
      emit({ ...state, loaded: true, available: false });
      return;
    }
    const byKey = new Map<string, string>();
    for (const row of (data ?? []) as { drill_key: string; score_type: string }[]) {
      byKey.set(normalizeKey(row.drill_key), row.score_type);
    }
    emit({ byKey, loaded: true, available: true });
  })();
  return loading;
}

export function useDrillScoringOverrides(): OverridesState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    void load();
  }, []);
  return snapshot;
}

export function drillScoringOverride(overrides: OverridesState, drillKey: string): string | null {
  return overrides.byKey.get(normalizeKey(drillKey)) ?? null;
}

/** Saves (or with null, clears) a drill's scoring for everyone. Returns an error message on failure. */
export async function saveDrillScoring(drillKey: string, scoreType: string | null): Promise<string | null> {
  const key = normalizeKey(drillKey);
  const previous = state.byKey;
  const byKey = new Map(previous);
  if (scoreType) byKey.set(key, scoreType);
  else byKey.delete(key);
  emit({ ...state, byKey });

  const supabase = createClient();
  const { error } = scoreType
    ? await supabase
        .from("drill_scoring")
        .upsert({ drill_key: key, score_type: scoreType, updated_at: new Date().toISOString() })
    : await supabase.from("drill_scoring").delete().eq("drill_key", key);
  if (!error) return null;

  emit({ ...state, byKey: previous });
  if (/drill_scoring|schema cache|does not exist/i.test(error.message)) {
    return "Run supabase/migrations/20261007150000_drill_scoring.sql in Supabase first.";
  }
  if (/row-level security|permission/i.test(error.message)) return "Only coaches can change a drill's scoring.";
  return error.message;
}
