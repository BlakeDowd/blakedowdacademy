"use client";

import { useState } from "react";
import { Check, RotateCcw, Target, Undo2, X } from "lucide-react";
import {
  ALTERNATE_TEE_SHOTS,
  TEE_HEIGHTS,
  alternateTeeDetails,
  buildAlternateTeeSequence,
  teeHeightBreakdown,
  teeHeightById,
  type AlternateTeeDetails,
  type AlternateTeeShot,
  type TeeHeightId,
  type TeeShotResult,
} from "@/lib/alternateTeeHeightDrill";

/** Relative tee graphic — ball + peg scale by height id. */
function TeeGraphic({ heightId }: { heightId: TeeHeightId }) {
  const peg = { ground: 4, low: 14, mid: 22, high: 30, very_high: 40 }[heightId];
  const ballY = 78 - peg - 18;
  return (
    <svg viewBox="0 0 120 96" className="mx-auto h-24 w-28" aria-hidden>
      <ellipse cx="60" cy="88" rx="42" ry="6" fill="#d6d3d1" />
      {heightId !== "ground" && (
        <rect x="57" y={88 - peg} width="6" height={peg} rx="2" fill="#a8a29e" />
      )}
      <circle cx="60" cy={ballY} r="16" fill="#f5f5f4" stroke="#292524" strokeWidth="2.5" />
      <circle cx="54" cy={ballY - 4} r="3" fill="#e7e5e4" />
    </svg>
  );
}

export default function AlternateTeeHeightDrill({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (score: number, reps: number, details: AlternateTeeDetails) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<"intro" | "shots" | "done">("intro");
  const [sequence, setSequence] = useState<TeeHeightId[]>([]);
  const [shots, setShots] = useState<AlternateTeeShot[]>([]);
  const [saved, setSaved] = useState(false);

  const start = () => {
    setSequence(buildAlternateTeeSequence());
    setShots([]);
    setSaved(false);
    setPhase("shots");
  };

  const made = shots.filter((s) => s.result === "make").length;
  const current = sequence[shots.length] ?? null;
  const currentMeta = current ? teeHeightById(current) : null;

  const record = (result: TeeShotResult) => {
    if (!current || !currentMeta) return;
    const next = [
      ...shots,
      { height: current, label: currentMeta.label, result },
    ];
    setShots(next);
    if (next.length >= ALTERNATE_TEE_SHOTS) setPhase("done");
  };

  const undo = () => {
    if (!shots.length) return;
    setShots(shots.slice(0, -1));
    if (phase === "done") setPhase("shots");
  };

  if (phase === "intro") {
    return (
      <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-gray-900">Alternate tee height</p>
        <ol className="list-decimal space-y-1 pl-4 text-xs leading-snug text-gray-600">
          <li>The app calls a random tee height — set the ball that way.</li>
          <li>Hit the drive. Tap <span className="font-semibold text-gray-800">Made</span> for a solid centre-face strike, or <span className="font-semibold text-gray-800">Missed</span> if it was thin, fat, or off the face.</li>
          <li>{ALTERNATE_TEE_SHOTS} shots — each height twice. Score and history save so you can beat your best.</li>
        </ol>
        <div className="flex flex-wrap gap-1.5">
          {TEE_HEIGHTS.map((h) => (
            <span
              key={h.id}
              className="rounded-md bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200"
            >
              {h.label}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={start}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320]"
        >
          <Target className="h-4 w-4" aria-hidden />
          Start {ALTERNATE_TEE_SHOTS} shots
        </button>
      </div>
    );
  }

  if (phase === "shots" && currentMeta) {
    return (
      <div className="space-y-2.5 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Shot {shots.length + 1} of {ALTERNATE_TEE_SHOTS}
          </p>
          <p className="text-xs font-semibold tabular-nums text-gray-500">
            {made} made
          </p>
        </div>

        <div className="rounded-xl bg-[#014421]/[0.04] px-3 py-3 text-center ring-1 ring-[#014421]/15">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#014421]/70">Tee height</p>
          <TeeGraphic heightId={currentMeta.id} />
          <p className="text-2xl font-extrabold text-[#014421]">{currentMeta.label}</p>
          <p className="mt-0.5 text-xs text-gray-500">{currentMeta.hint}</p>
        </div>

        {shots.length > 0 && (
          <div className="flex flex-wrap gap-1" aria-label="Results so far">
            {shots.map((s, i) => (
              <span
                key={`${i}-${s.height}`}
                title={`${s.label}: ${s.result === "make" ? "Made" : "Missed"}`}
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[11px] font-bold tabular-nums ${
                  s.result === "make"
                    ? "bg-[#014421] text-white"
                    : "bg-red-50 text-red-700 ring-1 ring-red-100"
                }`}
              >
                {i + 1}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => record("make")}
            className="rounded-xl bg-[#014421] px-3 py-4 text-base font-extrabold text-white transition-transform hover:bg-[#013320] active:scale-[0.98]"
          >
            <Check className="mx-auto mb-1 h-5 w-5" aria-hidden />
            Made
          </button>
          <button
            type="button"
            onClick={() => record("miss")}
            className="rounded-xl border-2 border-gray-200 bg-white px-3 py-4 text-base font-extrabold text-gray-800 transition-transform hover:border-red-300 active:scale-[0.98]"
          >
            <X className="mx-auto mb-1 h-5 w-5 text-red-500" aria-hidden />
            Missed
          </button>
        </div>

        <button
          type="button"
          onClick={undo}
          disabled={!shots.length}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-[#014421] disabled:opacity-30"
        >
          <Undo2 className="h-3 w-3" aria-hidden />
          Undo last
        </button>
      </div>
    );
  }

  const breakdown = teeHeightBreakdown(shots);
  const finalMade = shots.filter((s) => s.result === "make").length;

  return (
    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Session score</p>
        <p className="text-3xl font-extrabold tabular-nums text-[#014421]">
          {finalMade}
          <span className="text-base font-bold text-gray-400">/{ALTERNATE_TEE_SHOTS}</span>
        </p>
        <p className="text-xs text-gray-500">Solid centre strikes</p>
      </div>

      <div className="space-y-1">
        {breakdown.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs"
          >
            <span className="font-semibold text-gray-700">{row.label}</span>
            <span className="tabular-nums font-bold text-gray-900">
              {row.made}/{row.total}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1" aria-label="Shot log">
        {shots.map((s, i) => (
          <span
            key={`sum-${i}`}
            className={`rounded-md px-1.5 py-1 text-[10px] font-semibold ${
              s.result === "make" ? "bg-[#014421] text-white" : "bg-red-50 text-red-700"
            }`}
          >
            {i + 1}. {s.label.split(" ")[0]}
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={start}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {saved ? "Go again" : "Restart"}
        </button>
        {!saved && (
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (await onSave(finalMade, shots.length, alternateTeeDetails(shots))) setSaved(true);
            }}
            className="flex-1 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save score"}
          </button>
        )}
      </div>
    </div>
  );
}
