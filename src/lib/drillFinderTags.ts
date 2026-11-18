"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FINDER_SCORE_BANDS,
  FINDER_STYLES,
} from "@/lib/practiceFinder";

export type PracticeKindId = "mechanics" | "skill" | "performance";
export type ScoreBandId = "100-plus" | "90-100" | "80-90" | "70-80" | "below-par";

export type DrillFinderTags = {
  practiceKinds: PracticeKindId[];
  scoreBands: ScoreBandId[];
};

export const PRACTICE_KIND_OPTIONS: { id: PracticeKindId; label: string }[] = FINDER_STYLES.map((s) => ({
  id: s.id as PracticeKindId,
  label: s.label,
}));

export const SCORE_BAND_OPTIONS: { id: ScoreBandId; label: string }[] = FINDER_SCORE_BANDS.map((b) => ({
  id: b.id as ScoreBandId,
  label: b.label,
}));

const KIND_SET = new Set<string>(PRACTICE_KIND_OPTIONS.map((o) => o.id));
const BAND_SET = new Set<string>(SCORE_BAND_OPTIONS.map((o) => o.id));

export const DRILL_FINDER_TAGS_MIGRATION_HINT =
  "Run supabase/migrations/20261117120000_drill_finder_tags.sql in Supabase first.";

type TagsState = {
  byKey: ReadonlyMap<string, DrillFinderTags>;
  loaded: boolean;
  available: boolean;
};

const EMPTY_TAGS: DrillFinderTags = { practiceKinds: [], scoreBands: [] };
const EMPTY: TagsState = { byKey: new Map(), loaded: false, available: true };
let state = EMPTY;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const normalizeKey = (drillKey: string) => drillKey.trim().toLowerCase();

function emit(next: TagsState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function parseKinds(raw: unknown): PracticeKindId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is PracticeKindId => typeof x === "string" && KIND_SET.has(x));
}

function parseBands(raw: unknown): ScoreBandId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is ScoreBandId => typeof x === "string" && BAND_SET.has(x));
}

function load(): Promise<void> {
  loading ??= (async () => {
    const { data, error } = await createClient()
      .from("drill_finder_tags")
      .select("drill_key, practice_kinds, score_bands");
    if (error) {
      emit({ ...state, loaded: true, available: false });
      return;
    }
    const byKey = new Map<string, DrillFinderTags>();
    for (const row of (data ?? []) as {
      drill_key: string;
      practice_kinds: unknown;
      score_bands: unknown;
    }[]) {
      byKey.set(normalizeKey(row.drill_key), {
        practiceKinds: parseKinds(row.practice_kinds),
        scoreBands: parseBands(row.score_bands),
      });
    }
    emit({ byKey, loaded: true, available: true });
  })();
  return loading;
}

export function useDrillFinderTags(): TagsState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useEffect(() => {
    void load();
  }, []);
  return snapshot;
}

export function drillFinderTagsFor(tags: TagsState, drillKey: string): DrillFinderTags {
  return tags.byKey.get(normalizeKey(drillKey)) ?? EMPTY_TAGS;
}

/** Snapshot for non-React callers (e.g. session builder after tags have loaded). */
export function getDrillFinderTagsMap(): ReadonlyMap<string, DrillFinderTags> {
  return state.byKey;
}

export function drillFinderTagsAvailable(): boolean {
  return state.available;
}

export async function saveDrillFinderTags(
  drillKey: string,
  tags: DrillFinderTags,
): Promise<string | null> {
  const key = normalizeKey(drillKey);
  const practiceKinds = tags.practiceKinds.filter((k) => KIND_SET.has(k));
  const scoreBands = tags.scoreBands.filter((b) => BAND_SET.has(b));
  const previous = state.byKey;
  const byKey = new Map(previous);
  const empty = practiceKinds.length === 0 && scoreBands.length === 0;
  if (empty) byKey.delete(key);
  else byKey.set(key, { practiceKinds, scoreBands });
  emit({ ...state, byKey });

  const supabase = createClient();
  const { error } = empty
    ? await supabase.from("drill_finder_tags").delete().eq("drill_key", key)
    : await supabase.from("drill_finder_tags").upsert({
        drill_key: key,
        practice_kinds: practiceKinds,
        score_bands: scoreBands,
        updated_at: new Date().toISOString(),
      });

  if (!error) return null;

  emit({ ...state, byKey: previous });
  if (/drill_finder_tags|schema cache|does not exist/i.test(error.message)) {
    return DRILL_FINDER_TAGS_MIGRATION_HINT;
  }
  if (/row-level security|permission/i.test(error.message)) {
    return "Only coaches can change drill finder tags.";
  }
  return error.message;
}

/** Weight boost when a drill's tags match the finder answers. Untagged drills stay at 1. */
export function finderTagBoost(
  tags: DrillFinderTags | undefined,
  opts: { scoreBandId?: string | null; styleIds?: string[] },
): number {
  if (!tags) return 1;
  let boost = 1;
  const band = opts.scoreBandId;
  if (band && tags.scoreBands.length > 0) {
    boost *= tags.scoreBands.includes(band as ScoreBandId) ? 4 : 0.15;
  }
  const styles = opts.styleIds ?? [];
  if (styles.length > 0 && tags.practiceKinds.length > 0) {
    const hit = styles.some((s) => tags.practiceKinds.includes(s as PracticeKindId));
    boost *= hit ? 3 : 0.2;
  }
  return boost;
}
