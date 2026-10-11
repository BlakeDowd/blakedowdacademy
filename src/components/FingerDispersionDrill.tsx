"use client";

import { useState } from "react";
import { RotateCcw, Target, Undo2 } from "lucide-react";
import { FlightPicture, HandToggle, MarkRow, useLefty } from "@/components/BallFlightDrill";
import {
  BALL_FLIGHT_SHOTS,
  FLIGHT_HEIGHTS,
  FLIGHT_SHAPES,
  buildBallFlightSequence,
  flightInstruction,
  flightKey,
  flightLabel,
  type BallFlight,
} from "@/lib/ballFlightDrill";
import {
  FINGER_DISPERSION_MAX_SCORE,
  FINGER_MARKS,
  FINGER_MARK_LABELS,
  FINGER_RAW_MAX,
  FINGER_WINDOWS,
  FINGER_WINDOW_LABELS,
  fingerDispersionDetails,
  fingerMultiplier,
  fingerRawScore,
  fingerShotPoints,
  fingerWeakSpots,
  fingerWindowLabel,
  type FingerDispersionDetails,
  type FingerMark,
  type FingerShot,
  type FingerWindow,
} from "@/lib/fingerDispersionDrill";

type Marks = Record<FingerMark, boolean | null>;
const NO_MARKS: Marks = { shape: null, window: null };

function isComplete(marks: Marks): marks is Record<FingerMark, boolean> {
  return FINGER_MARKS.every((m) => marks[m] != null);
}

function ResultGrid({ shots }: { shots: FingerShot[] }) {
  const byFlight = new Map(shots.map((s) => [flightKey(s.target), s] as const));
  return (
    <div className="grid grid-cols-3 gap-1">
      {FLIGHT_HEIGHTS.flatMap((height) =>
        FLIGHT_SHAPES.map((shape) => {
          const shot = byFlight.get(flightKey({ shape, height }));
          const pts = shot ? fingerShotPoints(shot) : 0;
          return (
            <div
              key={`${height}-${shape}`}
              className={`rounded-lg px-1 py-1.5 text-center ${
                pts === FINGER_MARKS.length
                  ? "bg-green-100 text-green-800"
                  : pts > 0
                    ? "bg-amber-100 text-amber-800"
                    : "bg-red-50 text-red-700"
              }`}
            >
              <p className="text-[11px] font-semibold leading-tight">{flightLabel({ shape, height })}</p>
              {shot ? (
                <div className="mt-0.5 text-[10px] font-medium leading-tight">
                  <p>Shape {shot.shape ? "✓" : "✗"}</p>
                  <p>Window {shot.window ? "✓" : "✗"}</p>
                </div>
              ) : (
                <p className="text-[10px] font-medium leading-tight">–</p>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}

/** The 9 ball flights inside a chosen finger window; tighter windows multiply the points. */
export default function FingerDispersionDrill({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (score: number, reps: number, details: FingerDispersionDetails) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<"intro" | "shots" | "done">("intro");
  const [fingers, setFingers] = useState<FingerWindow>(3);
  const [sequence, setSequence] = useState<BallFlight[]>([]);
  const [shots, setShots] = useState<FingerShot[]>([]);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [saved, setSaved] = useState(false);
  const [lefty, setHand] = useLefty();

  const start = () => {
    setSequence(buildBallFlightSequence());
    setShots([]);
    setMarks(NO_MARKS);
    setSaved(false);
    setPhase("shots");
  };

  const multiplier = fingerMultiplier(fingers);
  const raw = fingerRawScore(shots);
  const score = raw * multiplier;
  const target = sequence[shots.length] ?? null;
  const windowName = fingerWindowLabel(fingers);

  const confirm = () => {
    if (!target || !isComplete(marks)) return;
    const next = [...shots, { target, ...marks }];
    setShots(next);
    setMarks(NO_MARKS);
    if (next.length >= BALL_FLIGHT_SHOTS) setPhase("done");
  };

  const back = () => {
    const last = shots[shots.length - 1];
    if (!last) return;
    setMarks({ shape: last.shape, window: last.window });
    setShots(shots.slice(0, -1));
  };

  if (phase === "intro") {
    return (
      <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-gray-900">Finger dispersion session</p>
        <ol className="list-decimal space-y-1 pl-4 text-xs leading-snug text-gray-600">
          <li>Pick a target and a finger window. Hold your fingers up at arm&apos;s length over the target.</li>
          <li>The app calls a flight. Hit it, then mark whether the shape came off and it finished inside the window.</li>
          <li>9 shots: draw, straight and fade, each high, mid and low. Use the same iron for all 9.</li>
        </ol>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Finger window</p>
          <div className="grid grid-cols-4 gap-1.5">
            {FINGER_WINDOWS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFingers(f)}
                className={`rounded-lg py-1.5 text-center ring-1 transition-colors ${
                  fingers === f ? "bg-[#014421] text-white ring-[#014421]" : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50"
                }`}
              >
                <p className="text-sm font-bold">{f}</p>
                <p className="text-[10px] font-medium leading-tight">{FINGER_WINDOW_LABELS[f]}</p>
                <p className={`text-[10px] font-semibold ${fingers === f ? "text-white/80" : "text-gray-400"}`}>
                  ×{fingerMultiplier(f)}
                </p>
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-gray-500">
          1 point for the shape and 1 for finishing in the window, times ×{multiplier} for {windowName}. Out of{" "}
          {FINGER_RAW_MAX * multiplier} ({FINGER_DISPERSION_MAX_SCORE} at 1 finger).
        </p>
        <HandToggle lefty={lefty} onChange={setHand} />
        <button
          type="button"
          onClick={start}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320]"
        >
          <Target className="h-4 w-4" aria-hidden />
          Start 9 shots
        </button>
      </div>
    );
  }

  if (phase === "shots" && target) {
    return (
      <div className="space-y-2.5 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Shot {shots.length + 1} of {BALL_FLIGHT_SHOTS} · {windowName}
          </p>
          <p className="text-xs font-semibold tabular-nums text-gray-500">{score} pts</p>
        </div>
        <p className="text-center text-lg font-extrabold text-[#014421]">{flightLabel(target)}</p>
        <FlightPicture flight={target} lefty={lefty} />
        <p className="text-center text-xs leading-snug text-gray-600">
          {flightInstruction(target, lefty)} Finish inside {windowName}.
        </p>
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Did it come off?</p>
          {FINGER_MARKS.map((m) => (
            <MarkRow key={m} label={FINGER_MARK_LABELS[m]} value={marks[m]} onChange={(v) => setMarks({ ...marks, [m]: v })} />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={back}
            disabled={!shots.length}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            Back
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!isComplete(marks)}
            className="flex-1 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
          >
            {shots.length + 1 === BALL_FLIGHT_SHOTS ? "Finish" : "Next shot"}
          </button>
        </div>
      </div>
    );
  }

  const weakSpots = fingerWeakSpots(shots);
  return (
    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Finger dispersion score</p>
        <p className="text-3xl font-extrabold tabular-nums text-[#014421]">
          {score}
          <span className="text-base font-bold text-gray-400">/{FINGER_DISPERSION_MAX_SCORE}</span>
        </p>
        <p className="text-xs text-gray-500">
          {raw}/{FINGER_RAW_MAX} points × {multiplier} for {windowName} ({FINGER_WINDOW_LABELS[fingers].toLowerCase()})
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-center">
        {FINGER_MARKS.map((m) => (
          <div key={m} className="rounded-lg bg-gray-50 py-1.5 ring-1 ring-gray-200">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{FINGER_MARK_LABELS[m]}</p>
            <p className="text-sm font-bold tabular-nums text-gray-900">
              {shots.filter((s) => s[m]).length}/{BALL_FLIGHT_SHOTS}
            </p>
          </div>
        ))}
      </div>
      <ResultGrid shots={shots} />
      {weakSpots.map((line) => (
        <p key={line} className="text-xs leading-snug text-gray-600">
          {line}
        </p>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPhase("intro")}
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
              if (await onSave(score, shots.length, fingerDispersionDetails(shots, fingers))) setSaved(true);
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
