"use client";

import { useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import {
  ALL_ROUND_STATS,
  DEFAULT_TRACKED_ROUND_STATS,
  MISCORE_ROUND_STATS,
  ROUND_STAT_GROUPS,
  type RoundStatKey,
} from "@/lib/roundStatTracking";

export function TrackedStatsSheet({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: RoundStatKey[];
  onClose: () => void;
  onSave: (stats: RoundStatKey[]) => void;
}) {
  if (!open) return null;
  return <TrackedStatsSheetBody initial={initial} onClose={onClose} onSave={onSave} />;
}

function TrackedStatsSheetBody({
  initial,
  onClose,
  onSave,
}: {
  initial: RoundStatKey[];
  onClose: () => void;
  onSave: (stats: RoundStatKey[]) => void;
}) {
  const [picked, setPicked] = useState<Set<RoundStatKey>>(() => new Set(initial));

  const toggle = (key: RoundStatKey) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setOnly = (keys: RoundStatKey[]) => setPicked(new Set(keys));

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-labelledby="tracked-stats-title"
        className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <h2 id="tracked-stats-title" className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <SlidersHorizontal className="h-5 w-5 text-[#014421]" aria-hidden />
              Stats I track
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">
              Gross and nett score are always included. The groups match the MiScore post-round summary, so
              you can copy your numbers straight across.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 px-5 pt-3">
          {(
            [
              { label: "All MiScore", keys: MISCORE_ROUND_STATS },
              { label: "Everything", keys: ALL_ROUND_STATS },
              { label: "Score + putts", keys: DEFAULT_TRACKED_ROUND_STATS },
            ] as const
          ).map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setOnly([...preset.keys])}
              className="rounded-full border border-[#014421]/30 px-3 py-1.5 text-xs font-semibold text-[#014421] hover:bg-[#014421]/5"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {ROUND_STAT_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                {group.title}
                {!group.miscore && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-gray-500">
                    Not in MiScore
                  </span>
                )}
              </p>
              <div className="space-y-1.5">
                {group.stats.map((stat) => {
                  const on = picked.has(stat.key);
                  return (
                    <button
                      key={stat.key}
                      type="button"
                      onClick={() => toggle(stat.key)}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                        on ? "border-[#014421] bg-[#014421]/5" : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                          on ? "border-[#014421] bg-[#014421] text-white" : "border-gray-300 bg-white"
                        }`}
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900">{stat.label}</span>
                        <span className="block text-[11px] text-gray-500">{stat.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-gray-100 px-5 pb-5 pt-3">
          <button
            type="button"
            onClick={() => onSave(ALL_ROUND_STATS.filter((k) => picked.has(k)))}
            className="w-full rounded-2xl bg-[#014421] py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#01361a]"
          >
            Save ({picked.size} {picked.size === 1 ? "stat" : "stats"})
          </button>
        </div>
      </div>
    </div>
  );
}
