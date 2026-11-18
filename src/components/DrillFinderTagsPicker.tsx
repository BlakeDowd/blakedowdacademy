"use client";

import { useState } from "react";
import { Check, Tags } from "lucide-react";
import { useIsCoach } from "@/components/DrillScoringPicker";
import {
  DRILL_FINDER_TAGS_MIGRATION_HINT,
  PRACTICE_KIND_OPTIONS,
  SCORE_BAND_OPTIONS,
  drillFinderTagsFor,
  saveDrillFinderTags,
  useDrillFinderTags,
  type DrillFinderTags,
  type PracticeKindId,
  type ScoreBandId,
} from "@/lib/drillFinderTags";

function toggleIn<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Coach-only: tag a drill for Practice Finder (kinds + score bands). */
export default function DrillFinderTagsPicker({ drillKey }: { drillKey: string }) {
  const isCoach = useIsCoach();
  const store = useDrillFinderTags();
  const saved = drillFinderTagsFor(store, drillKey);
  const [open, setOpen] = useState(false);
  const [kinds, setKinds] = useState<PracticeKindId[]>(saved.practiceKinds);
  const [bands, setBands] = useState<ScoreBandId[]>(saved.scoreBands);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isCoach) return null;

  const summary = () => {
    const parts: string[] = [];
    if (saved.practiceKinds.length) {
      parts.push(
        saved.practiceKinds
          .map((id) => PRACTICE_KIND_OPTIONS.find((o) => o.id === id)?.label ?? id)
          .join(", "),
      );
    }
    if (saved.scoreBands.length) {
      parts.push(
        saved.scoreBands
          .map((id) => SCORE_BAND_OPTIONS.find((o) => o.id === id)?.label ?? id)
          .join(", "),
      );
    }
    return parts.length ? parts.join(" · ") : "Not tagged yet";
  };

  const startEditing = () => {
    setKinds([...saved.practiceKinds]);
    setBands([...saved.scoreBands]);
    setError(null);
    setOpen(true);
  };

  const save = async (next: DrillFinderTags) => {
    setSaving(true);
    const message = await saveDrillFinderTags(drillKey, next);
    setSaving(false);
    if (message) setError(message);
    else setOpen(false);
  };

  if (!store.available && store.loaded) {
    return (
      <p className="mt-2 text-[11px] text-amber-700">{DRILL_FINDER_TAGS_MIGRATION_HINT}</p>
    );
  }

  if (!open) {
    return (
      <div
        className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-[#014421]/30 bg-white px-2.5 py-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-gray-600">
          <Tags className="h-3.5 w-3.5 shrink-0 text-[#014421]" aria-hidden />
          <span className="truncate">
            <span className="font-semibold text-gray-800">Finder tags · </span>
            {summary()}
          </span>
        </span>
        <button
          type="button"
          onClick={startEditing}
          className="shrink-0 text-[11px] font-bold text-[#014421] underline"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div
      className="mt-2 space-y-3 rounded-xl border border-[#014421]/20 bg-stone-50 p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold text-stone-800">Practice Finder tags</p>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-stone-600">Practice kind</p>
        <div className="flex flex-wrap gap-1.5">
          {PRACTICE_KIND_OPTIONS.map((o) => {
            const on = kinds.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => setKinds((prev) => toggleIn(prev, o.id))}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  on
                    ? "bg-[#014421] text-white"
                    : "bg-white text-stone-600 ring-1 ring-stone-200"
                }`}
              >
                {on ? <Check className="h-3 w-3" aria-hidden /> : null}
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-stone-600">Suitable scores</p>
        <div className="flex flex-wrap gap-1.5">
          {SCORE_BAND_OPTIONS.map((o) => {
            const on = bands.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => setBands((prev) => toggleIn(prev, o.id))}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                  on
                    ? "bg-[#014421] text-white"
                    : "bg-white text-stone-600 ring-1 ring-stone-200"
                }`}
              >
                {on ? <Check className="h-3 w-3" aria-hidden /> : null}
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save({ practiceKinds: kinds, scoreBands: bands })}
          className="flex-1 rounded-xl bg-[#014421] py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save tags"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setOpen(false)}
          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
