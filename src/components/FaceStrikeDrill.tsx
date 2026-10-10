"use client";

import { useState, type PointerEvent } from "react";
import { RotateCcw, Target, Undo2 } from "lucide-react";
import {
  FACE_COLS,
  FACE_ROWS,
  FACE_STRIKE_MAX_SCORE,
  FACE_STRIKE_SHOTS,
  buildFaceStrikeSequence,
  faceStrikeDetails,
  missTendency,
  scoreStrike,
  zoneKey,
  zoneLabel,
  type FaceStrikeDetails,
  type FaceStrikePoint,
  type FaceStrikeShot,
  type FaceZone,
} from "@/lib/faceStrikeDrill";

const LEFTY_KEY = "face-strike-lefty";

/** SVG geometry, drawn for a right-hander looking at the face (toe on the left, hosel on the right). */
const VIEW_W = 320;
const VIEW_H = 210;
const GRID = { x: 50, y: 40, w: 220, h: 136 };
const FACE_PATH =
  "M 54 60 C 64 34 118 30 170 30 C 222 30 258 36 270 58 C 280 82 281 140 270 160 C 257 180 212 186 160 186 C 104 186 60 180 47 160 C 36 138 40 88 54 60 Z";
const HOSEL_PATH = "M 252 40 L 282 4 L 298 13 L 272 54 Z";

const POINT_COLOURS = ["#dc2626", "#f59e0b", "#16a34a"] as const;
const POINT_LABELS = ["Missed", "Close", "On target"] as const;

function toSvg(p: FaceStrikePoint): { x: number; y: number } {
  return { x: GRID.x + (1 - p.h) * GRID.w, y: GRID.y + (1 - p.v) * GRID.h };
}

function zoneRect(zone: FaceZone) {
  const col = FACE_COLS.indexOf(zone.col);
  const row = FACE_ROWS.indexOf(zone.row);
  const w = GRID.w / 3;
  const h = GRID.h / 3;
  return { x: GRID.x + (2 - col) * w, y: GRID.y + row * h, w, h };
}

function FaceDiagram({
  lefty,
  target,
  dots,
  onTap,
}: {
  lefty: boolean;
  target?: FaceZone | null;
  dots: { point: FaceStrikePoint; colour: string; label?: string }[];
  onTap?: (p: FaceStrikePoint) => void;
}) {
  const handle = (e: PointerEvent<SVGSVGElement>) => {
    if (!onTap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const sy = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const localX = lefty ? VIEW_W - sx : sx;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    onTap({ h: clamp(1 - (localX - GRID.x) / GRID.w), v: clamp(1 - (sy - GRID.y) / GRID.h) });
  };
  const targetRect = target ? zoneRect(target) : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className={`w-full touch-none select-none ${onTap ? "cursor-crosshair" : ""}`}
        onPointerDown={handle}
        role={onTap ? "button" : "img"}
        aria-label={onTap ? "Tap where the ball hit the face" : "Strike map"}
      >
        <defs>
          <clipPath id="face-strike-clip">
            <path d={FACE_PATH} />
          </clipPath>
        </defs>
        <g transform={lefty ? `translate(${VIEW_W},0) scale(-1,1)` : undefined}>
          <path d={HOSEL_PATH} fill="#44403c" />
          <path d={FACE_PATH} fill="#292524" stroke="#0c0a09" strokeWidth={3} />
          <g clipPath="url(#face-strike-clip)">
            {[1, 2].map((i) => (
              <line
                key={`v${i}`}
                x1={GRID.x + (GRID.w / 3) * i}
                x2={GRID.x + (GRID.w / 3) * i}
                y1={0}
                y2={VIEW_H}
                stroke="#ffffff"
                strokeOpacity={0.14}
                strokeDasharray="4 5"
              />
            ))}
            {[1, 2].map((i) => (
              <line
                key={`h${i}`}
                x1={0}
                x2={VIEW_W}
                y1={GRID.y + (GRID.h / 3) * i}
                y2={GRID.y + (GRID.h / 3) * i}
                stroke="#ffffff"
                strokeOpacity={0.14}
                strokeDasharray="4 5"
              />
            ))}
            {targetRect && (
              <rect
                x={targetRect.x + 3}
                y={targetRect.y + 3}
                width={targetRect.w - 6}
                height={targetRect.h - 6}
                rx={10}
                fill="#FFA500"
                fillOpacity={0.28}
                stroke="#FFA500"
                strokeWidth={2.5}
                strokeDasharray="6 4"
              />
            )}
          </g>
          {dots.map((d, i) => {
            const { x, y } = toSvg(d.point);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={9} fill={d.colour} stroke="#ffffff" strokeWidth={2.5} />
                {d.label && (
                  <text
                    x={x}
                    y={y + 3.5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#ffffff"
                    transform={lefty ? `translate(${2 * x},0) scale(-1,1)` : undefined}
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none flex justify-between px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        <span>{lefty ? "Heel" : "Toe"}</span>
        <span>{lefty ? "Toe" : "Heel"}</span>
      </div>
    </div>
  );
}

function ZoneGrid({ shots, lefty }: { shots: FaceStrikeShot[]; lefty: boolean }) {
  const byZone = new Map(shots.map((s) => [zoneKey(s.target), s] as const));
  const cols = lefty ? [...FACE_COLS] : [...FACE_COLS].reverse();
  return (
    <div className="grid grid-cols-3 gap-1">
      {FACE_ROWS.flatMap((row) =>
        cols.map((col) => {
          const shot = byZone.get(zoneKey({ row, col }));
          const pts = shot?.points ?? 0;
          return (
            <div
              key={`${row}-${col}`}
              className={`rounded-lg px-1 py-1.5 text-center ${
                pts === 2 ? "bg-green-100 text-green-800" : pts === 1 ? "bg-amber-100 text-amber-800" : "bg-red-50 text-red-700"
              }`}
            >
              <p className="text-[10px] font-semibold leading-tight">{zoneLabel({ row, col })}</p>
              <p className="text-xs font-bold tabular-nums">{shot ? `${pts}/2` : "–"}</p>
            </div>
          );
        }),
      )}
    </div>
  );
}

/** Calls each of the 9 face zones once; the player taps where the powder mark was. */
export default function FaceStrikeDrill({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (score: number, reps: number, details: FaceStrikeDetails) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<"intro" | "shots" | "done">("intro");
  const [sequence, setSequence] = useState<FaceZone[]>([]);
  const [shots, setShots] = useState<FaceStrikeShot[]>([]);
  const [pending, setPending] = useState<FaceStrikePoint | null>(null);
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
    setSequence(buildFaceStrikeSequence());
    setShots([]);
    setPending(null);
    setSaved(false);
    setPhase("shots");
  };

  const score = shots.reduce((sum, s) => sum + s.points, 0);
  const target = sequence[shots.length] ?? null;

  const confirm = () => {
    if (!pending || !target) return;
    const next = [...shots, { target, hit: pending, points: scoreStrike(target, pending) }];
    setShots(next);
    setPending(null);
    if (next.length >= FACE_STRIKE_SHOTS) setPhase("done");
  };

  const back = () => {
    if (!shots.length) return;
    setPending(shots[shots.length - 1]!.hit);
    setShots(shots.slice(0, -1));
  };

  if (phase === "intro") {
    return (
      <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-gray-900">Face strike session</p>
        <ol className="list-decimal space-y-1 pl-4 text-xs leading-snug text-gray-600">
          <li>Spray the face with foot powder (or use a dry-erase marker or impact tape).</li>
          <li>The app calls a spot on the face. Try to strike it there.</li>
          <li>Tap where the mark is, wipe the face, and go again. 9 shots, one for each spot.</li>
        </ol>
        <p className="text-[11px] text-gray-500">On the spot = 2 points, next to it = 1, anywhere else = 0. Out of {FACE_STRIKE_MAX_SCORE}.</p>
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
    const preview = pending ? scoreStrike(target, pending) : null;
    return (
      <div className="space-y-2.5 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Shot {shots.length + 1} of {FACE_STRIKE_SHOTS}
          </p>
          <p className="text-xs font-semibold tabular-nums text-gray-500">
            {score} pts
          </p>
        </div>
        <p className="text-center text-lg font-extrabold text-[#014421]">Aim: {zoneLabel(target)}</p>
        <FaceDiagram
          lefty={lefty}
          target={target}
          dots={pending ? [{ point: pending, colour: POINT_COLOURS[preview ?? 0] }] : []}
          onTap={setPending}
        />
        <p className="text-center text-xs text-gray-500">
          {pending && preview != null ? (
            <span className="font-semibold" style={{ color: POINT_COLOURS[preview] }}>
              {POINT_LABELS[preview]} · +{preview}
            </span>
          ) : (
            "Tap where the mark is on the face"
          )}
        </p>
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
            disabled={!pending}
            className="flex-1 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
          >
            {shots.length + 1 === FACE_STRIKE_SHOTS ? "Finish" : "Next shot"}
          </button>
        </div>
      </div>
    );
  }

  const tendency = missTendency(shots);
  const onTarget = shots.filter((s) => s.points === 2).length;
  return (
    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Face strike score</p>
        <p className="text-3xl font-extrabold tabular-nums text-[#014421]">
          {score}
          <span className="text-base font-bold text-gray-400">/{FACE_STRIKE_MAX_SCORE}</span>
        </p>
        <p className="text-xs text-gray-500">
          {onTarget} of {FACE_STRIKE_SHOTS} spots hit
        </p>
      </div>
      <FaceDiagram
        lefty={lefty}
        dots={shots.map((s, i) => ({ point: s.hit, colour: POINT_COLOURS[s.points], label: String(i + 1) }))}
      />
      <ZoneGrid shots={shots} lefty={lefty} />
      {tendency && <p className="text-xs leading-snug text-gray-600">{tendency}</p>}
      <p className="text-[11px] text-gray-400">
        Each square is the spot that was called; the numbered dots show where those shots landed.
      </p>
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
              if (await onSave(score, shots.length, faceStrikeDetails(shots))) setSaved(true);
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
