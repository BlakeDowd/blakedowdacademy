"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CombineLeaderboardTestId } from "@/lib/academyCombinesLeaderboard";
import type { BenchmarkAnchors } from "@/lib/practiceHandicapBenchmarks";
import type { BenchmarkOverrides } from "@/lib/practiceHandicap";

/** Coach-tuned benchmarks (`practice_handicap_benchmarks` table), shared by every practice handicap card. */
type OverridesState = {
  byId: BenchmarkOverrides;
  loaded: boolean;
  /** False when the table isn't there yet (migration not run). */
  available: boolean;
};

const EMPTY: OverridesState = { byId: new Map(), loaded: false, available: true };
let state = EMPTY;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

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

function parseAnchors(raw: unknown): BenchmarkAnchors | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const out: [number, number][] = [];
  for (const pair of raw) {
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const [h, s] = pair.map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(s)) return null;
    out.push([h!, s!]);
  }
  return out;
}

function load(): Promise<void> {
  loading ??= (async () => {
    const { data, error } = await createClient().from("practice_handicap_benchmarks").select("test_id, anchors");
    if (error) {
      emit({ ...state, loaded: true, available: false });
      return;
    }
    const byId = new Map<CombineLeaderboardTestId, BenchmarkAnchors>();
    for (const row of (data ?? []) as { test_id: string; anchors: unknown }[]) {
      const anchors = parseAnchors(row.anchors);
      if (anchors) byId.set(row.test_id as CombineLeaderboardTestId, anchors);
    }
    emit({ byId, loaded: true, available: true });
  })();
  return loading;
}

export function usePracticeHandicapOverrides(): OverridesState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    void load();
  }, []);
  return snapshot;
}

/** Saves (or with null, resets to default) a combine's benchmarks for everyone. Returns an error message on failure. */
export async function savePracticeHandicapBenchmark(
  testId: CombineLeaderboardTestId,
  anchors: BenchmarkAnchors | null,
): Promise<string | null> {
  const previous = state.byId;
  const byId = new Map(previous);
  if (anchors) byId.set(testId, anchors);
  else byId.delete(testId);
  emit({ ...state, byId });

  const supabase = createClient();
  const { error } = anchors
    ? await supabase
        .from("practice_handicap_benchmarks")
        .upsert({ test_id: testId, anchors, updated_at: new Date().toISOString() })
    : await supabase.from("practice_handicap_benchmarks").delete().eq("test_id", testId);
  if (!error) return null;

  emit({ ...state, byId: previous });
  if (/practice_handicap_benchmarks|schema cache|does not exist/i.test(error.message)) {
    return "Run supabase/migrations/20261013100000_practice_handicap_benchmarks.sql in Supabase first.";
  }
  if (/row-level security|permission/i.test(error.message)) return "Only coaches can change benchmarks.";
  return error.message;
}
