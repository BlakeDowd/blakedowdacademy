"use client";

import { useState } from "react";
import { Check, RotateCcw, Target, Undo2, X } from "lucide-react";
import {
  BALL_FLIGHT_MAX_SCORE,
  BALL_FLIGHT_SHOTS,
  FLIGHT_HEIGHTS,
  FLIGHT_MARKS,
  FLIGHT_SHAPES,
  MARK_LABELS,
  ballFlightDetails,
  ballFlightWeakSpots,
  buildBallFlightSequence,
  flightInstruction,
  flightKey,
  flightLabel,
  shotPoints,
  type BallFlight,
  type BallFlightDetails,
  type BallFlightShot,
  type FlightMark,
} from "@/lib/ballFlightDrill";

const LEFTY_KEY = "ball-flight-lefty";

type Marks = Record<FlightMark, boolean | null>;
const NO_MARKS: Marks = { start: null, curve: null, height: null };

function isComplete(marks: Marks): marks is Record<FlightMark, boolean> {
  return FLIGHT_MARKS.every((m) => marks[m] != null);
}

/** Two panels: the shape from above (left) and the height from the side (right). */
const VIEW_W = 320;
const VIEW_H = 200;
const PANEL_W = 152;
const SIDE_X = VIEW_W - PANEL_W;
const PANEL_TOP = 20;

/** Top view: tee at the bottom, flag at the top. Positive lateral = right for a right-hander. */
const TOP = { cx: PANEL_W / 2, teeY: 182, flagY: 54 };
const CURVE = 100;
/** Side view: tee on the left, flag on the right. */
const SIDE = { x0: SIDE_X + 14, x1: VIEW_W - 22, groundY: 170 };
const APEX: Record<BallFlight["height"], number> = { high: 120, mid: 82, low: 46 };

function curveSign(shape: BallFlight["shape"]): number {
  return shape === "draw" ? 1 : shape === "fade" ? -1 : 0;
}

function sample(fn: (t: number) => { x: number; y: number }): string {
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const { x, y } = fn(i / 40);
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M ${pts.join(" L ")}`;
}

function topPath(shape: BallFlight["shape"]): string {
  const sign = curveSign(shape);
  return sample((t) => ({
    x: TOP.cx + sign * CURVE * t * (1 - t),
    y: TOP.teeY - (TOP.teeY - TOP.flagY) * t,
  }));
}

function sidePath(height: BallFlight["height"]): string {
  return sample((t) => ({
    x: SIDE.x0 + (SIDE.x1 - SIDE.x0) * t,
    y: SIDE.groundY - APEX[height] * Math.sin(Math.PI * Math.pow(t, 1.35)),
  }));
}

function Flag({ x, y }: { x: number; y: number }) {
  return (
    <>
      <line x1={x} y1={y} x2={x} y2={y - 20} stroke="#f5f5f4" strokeWidth={1.5} />
      <path d={`M ${x} ${y - 20} L ${x + 11} ${y - 16} L ${x} ${y - 12} Z`} fill="#dc2626" />
    </>
  );
}

function FlightPicture({ flight, lefty }: { flight: BallFlight; lefty: boolean }) {
  const sign = curveSign(flight.shape);
  const startFrac = 0.62;
  const start = {
    x: TOP.cx + sign * CURVE * startFrac,
    y: TOP.teeY - (TOP.teeY - TOP.flagY) * startFrac,
  };
  const id = flightKey(flight);
  const startArrow = (
    <line
      x1={TOP.cx}
      y1={TOP.teeY}
      x2={start.x}
      y2={start.y}
      stroke="#FFA500"
      strokeWidth={2.5}
      strokeDasharray="6 4"
      markerEnd={`url(#arrow-${id})`}
    />
  );
  const labelX = sign === 0 ? start.x + 22 : start.x;
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full select-none"
      role="img"
      aria-label={`${flightLabel(flight)} ball flight`}
    >
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 Z" fill="#FFA500" />
        </marker>
      </defs>

      <text x={PANEL_W / 2} y={12} textAnchor="middle" fontSize={11} fontWeight={700} fill="#6b7280">
        FROM ABOVE
      </text>
      <rect y={PANEL_TOP} width={PANEL_W} height={VIEW_H - PANEL_TOP} rx={10} fill="#3f7d3a" />
      <g transform={lefty ? `translate(${PANEL_W},0) scale(-1,1)` : undefined}>
        <path
          d={`M ${TOP.cx - 30} ${VIEW_H} L ${TOP.cx + 30} ${VIEW_H} L ${TOP.cx + 24} ${PANEL_TOP + 8} L ${TOP.cx - 24} ${PANEL_TOP + 8} Z`}
          fill="#5fa152"
        />
        <line x1={TOP.cx} y1={TOP.teeY} x2={TOP.cx} y2={TOP.flagY} stroke="#ffffff" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="3 5" />
        <circle cx={TOP.cx} cy={TOP.flagY} r={9} fill="#86c77a" />
        <Flag x={TOP.cx} y={TOP.flagY} />
        {sign !== 0 && startArrow}
        <path d={topPath(flight.shape)} fill="none" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" />
        {sign === 0 && startArrow}
        <circle cx={TOP.cx} cy={TOP.teeY} r={5} fill="#ffffff" stroke="#0f172a" strokeOpacity={0.3} />
      </g>
      <text
        x={lefty ? PANEL_W - labelX : labelX}
        y={sign === 0 ? start.y + 4 : start.y - 8}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill="#FFA500"
      >
        start
      </text>

      <text x={SIDE_X + PANEL_W / 2} y={12} textAnchor="middle" fontSize={11} fontWeight={700} fill="#6b7280">
        FROM THE SIDE
      </text>
      <rect x={SIDE_X} y={PANEL_TOP} width={PANEL_W} height={VIEW_H - PANEL_TOP} rx={10} fill={`url(#sky-${id})`} />
      <path
        d={`M ${SIDE_X} ${SIDE.groundY} H ${VIEW_W} V ${VIEW_H - 10} Q ${VIEW_W} ${VIEW_H} ${VIEW_W - 10} ${VIEW_H} H ${SIDE_X + 10} Q ${SIDE_X} ${VIEW_H} ${SIDE_X} ${VIEW_H - 10} Z`}
        fill="#5fa152"
      />
      {FLIGHT_HEIGHTS.filter((h) => h !== flight.height).map((h) => (
        <path key={h} d={sidePath(h)} fill="none" stroke="#0f172a" strokeOpacity={0.18} strokeWidth={1.5} strokeDasharray="3 4" />
      ))}
      <Flag x={SIDE.x1} y={SIDE.groundY} />
      <path d={sidePath(flight.height)} fill="none" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" />
      <path d={sidePath(flight.height)} fill="none" stroke="#014421" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx={SIDE.x0} cy={SIDE.groundY} r={5} fill="#ffffff" stroke="#0f172a" strokeOpacity={0.3} />
    </svg>
  );
}

function MarkRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="w-[4.5rem] shrink-0 text-xs font-semibold text-gray-700">{label}</p>
      {[true, false].map((v) => {
        const on = value === v;
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2.5 text-sm font-bold ring-1 transition-colors ${
              on
                ? v
                  ? "bg-green-600 text-white ring-green-600"
                  : "bg-red-600 text-white ring-red-600"
                : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"
            }`}
          >
            {v ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
            {v ? "Yes" : "No"}
          </button>
        );
      })}
    </div>
  );
}

function ResultGrid({ shots }: { shots: BallFlightShot[] }) {
  const byFlight = new Map(shots.map((s) => [flightKey(s.target), s] as const));
  return (
    <div className="grid grid-cols-3 gap-1">
      {FLIGHT_HEIGHTS.flatMap((height) =>
        FLIGHT_SHAPES.map((shape) => {
          const shot = byFlight.get(flightKey({ shape, height }));
          const pts = shot ? shotPoints(shot) : 0;
          return (
            <div
              key={`${height}-${shape}`}
              className={`rounded-lg px-1 py-1.5 text-center ${
                pts === FLIGHT_MARKS.length
                  ? "bg-green-100 text-green-800"
                  : pts > 0
                    ? "bg-amber-100 text-amber-800"
                    : "bg-red-50 text-red-700"
              }`}
            >
              <p className="text-[11px] font-semibold leading-tight">{flightLabel({ shape, height })}</p>
              {shot ? (
                <div className="mt-0.5 text-[10px] font-medium leading-tight">
                  {FLIGHT_MARKS.map((m) => (
                    <p key={m}>
                      {m === "start" ? "Start" : MARK_LABELS[m]} {shot[m] ? "✓" : "✗"}
                    </p>
                  ))}
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

/** Calls each of the 9 driver flights once; the player marks the start line, curve and height. */
export default function BallFlightDrill({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (score: number, reps: number, details: BallFlightDetails) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<"intro" | "shots" | "done">("intro");
  const [sequence, setSequence] = useState<BallFlight[]>([]);
  const [shots, setShots] = useState<BallFlightShot[]>([]);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [saved, setSaved] = useState(false);
  const [lefty, setLefty] = useState(() => {
    try {
      return localStorage.getItem(LEFTY_KEY) === "1";
    } catch {
      return false;
    }
  });

  const setHand = (next: boolean) => {
    setLefty(next);
    try {
      localStorage.setItem(LEFTY_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };

  const start = () => {
    setSequence(buildBallFlightSequence());
    setShots([]);
    setMarks(NO_MARKS);
    setSaved(false);
    setPhase("shots");
  };

  const score = shots.reduce((sum, s) => sum + shotPoints(s), 0);
  const target = sequence[shots.length] ?? null;

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
    setMarks({ start: last.start, curve: last.curve, height: last.height });
    setShots(shots.slice(0, -1));
  };

  if (phase === "intro") {
    return (
      <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-gray-900">9 ball flight session</p>
        <ol className="list-decimal space-y-1 pl-4 text-xs leading-snug text-gray-600">
          <li>Pick a target. The app calls a flight and shows the start line and curve.</li>
          <li>Hit it, then mark whether the start line, the curve and the height came off.</li>
          <li>9 shots: draw, straight and fade, each high, mid and low.</li>
        </ol>
        <p className="text-[11px] text-gray-500">
          1 point each for start line, curve and height. Out of {BALL_FLIGHT_MAX_SCORE}.
        </p>
        <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-gray-200">
          {[false, true].map((l) => (
            <button
              key={String(l)}
              type="button"
              onClick={() => setHand(l)}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${lefty === l ? "bg-[#014421] text-white" : "text-gray-600"}`}
            >
              {l ? "Left-handed" : "Right-handed"}
            </button>
          ))}
        </div>
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
            Shot {shots.length + 1} of {BALL_FLIGHT_SHOTS}
          </p>
          <p className="text-xs font-semibold tabular-nums text-gray-500">{score} pts</p>
        </div>
        <p className="text-center text-lg font-extrabold text-[#014421]">{flightLabel(target)}</p>
        <FlightPicture flight={target} lefty={lefty} />
        <p className="text-center text-xs leading-snug text-gray-600">{flightInstruction(target, lefty)}</p>
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Did it come off?</p>
          {FLIGHT_MARKS.map((m) => (
            <MarkRow key={m} label={MARK_LABELS[m]} value={marks[m]} onChange={(v) => setMarks({ ...marks, [m]: v })} />
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

  const fullHits = shots.filter((s) => shotPoints(s) === FLIGHT_MARKS.length).length;
  const weakSpots = ballFlightWeakSpots(shots);
  return (
    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ball flight score</p>
        <p className="text-3xl font-extrabold tabular-nums text-[#014421]">
          {score}
          <span className="text-base font-bold text-gray-400">/{BALL_FLIGHT_MAX_SCORE}</span>
        </p>
        <p className="text-xs text-gray-500">
          {fullHits} of {BALL_FLIGHT_SHOTS} flights fully hit
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {FLIGHT_MARKS.map((m) => (
          <div key={m} className="rounded-lg bg-gray-50 py-1.5 ring-1 ring-gray-200">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{MARK_LABELS[m]}</p>
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
              if (await onSave(score, shots.length, ballFlightDetails(shots))) setSaved(true);
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
