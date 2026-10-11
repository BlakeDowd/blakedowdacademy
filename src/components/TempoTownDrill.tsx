"use client";

import { useState } from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import { LONG_GAME_TEMPO_CONFIG } from "@/components/tempo/LongGameTempoTrainer";
import { SwingTempoTrainer, type TempoPreset } from "@/components/tempo/SwingTempoTrainer";
import type { TempoTownDetails } from "@/lib/tempoTownDrill";

/** Full Swing Tempo trainer that counts every rep; the player trims the count to the swings they made, then logs it. */
export default function TempoTownDrill({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (score: number, reps: number, details: TempoTownDetails) => Promise<boolean>;
}) {
  const [tempos, setTempos] = useState<Record<string, number>>({});
  const [adjust, setAdjust] = useState(0);
  const [saved, setSaved] = useState<number | null>(null);

  const counted = Object.values(tempos).reduce((sum, n) => sum + n, 0);
  const total = Math.max(0, counted + adjust);

  const onRep = (p: TempoPreset) => {
    if (saved != null) return;
    const key = `${p.back}/${p.down}`;
    setTempos((t) => ({ ...t, [key]: (t[key] ?? 0) + 1 }));
  };

  const reset = () => {
    setTempos({});
    setAdjust(0);
    setSaved(null);
  };

  const log = async () => {
    if (await onSave(total, total, { kind: "tempo_town", tempos })) setSaved(total);
  };

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
        {saved != null ? (
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
              <Check className="h-5 w-5" aria-hidden />
            </div>
            <p className="flex-1 text-sm font-semibold text-gray-900">
              {saved} rep{saved === 1 ? "" : "s"} logged
            </p>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              New session
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-900">Tempo town session</p>
            <p className="mt-0.5 text-xs leading-snug text-gray-600">
              Press Play and swing on the beat. Every &ldquo;Hit!&rdquo; counts as a rep. Fix the count if you skipped any.
            </p>
            <div className="mt-3 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setAdjust((a) => (total > 0 ? a - 1 : a))}
                disabled={total === 0}
                aria-label="One less rep"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-30"
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <div className="min-w-[5rem] text-center">
                <p className="text-3xl font-extrabold tabular-nums text-[#014421]">{total}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Reps</p>
              </div>
              <button
                type="button"
                onClick={() => setAdjust((a) => a + 1)}
                aria-label="One more rep"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={log}
              disabled={saving || total === 0}
              className="mt-3 w-full rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
            >
              {saving ? "Saving…" : `Log ${total} rep${total === 1 ? "" : "s"}`}
            </button>
          </>
        )}
      </div>
      <SwingTempoTrainer hideHeader config={LONG_GAME_TEMPO_CONFIG} onRep={onRep} />
    </div>
  );
}
