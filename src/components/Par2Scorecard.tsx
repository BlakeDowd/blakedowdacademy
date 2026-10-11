"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  PAR2_HOLE_PAR,
  PAR2_STROKE_OPTIONS,
  par2Summary,
  strokeLabel,
  toParText,
  type Par2Details,
  type Par2Game,
} from "@/lib/par2Drill";

type Card = (number | null)[];

function emptyCard(holes: number): Card {
  return Array.from({ length: holes }, () => null);
}

function loadCard(storageKey: string, holes: number): Card {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (Array.isArray(raw) && raw.length === holes) return raw.map((v) => (typeof v === "number" ? v : null));
  } catch {
    /* storage unavailable */
  }
  return emptyCard(holes);
}

function storeCard(storageKey: string, card: Card | null) {
  try {
    if (card) localStorage.setItem(storageKey, JSON.stringify(card));
    else localStorage.removeItem(storageKey);
  } catch {
    /* storage unavailable */
  }
}

function scoreTone(strokes: number | null): string {
  if (strokes == null) return "text-gray-300";
  if (strokes < PAR2_HOLE_PAR) return "rounded-full bg-green-600 text-white";
  if (strokes === PAR2_HOLE_PAR) return "text-gray-900";
  if (strokes === PAR2_HOLE_PAR + 1) return "rounded-sm ring-1 ring-amber-500 text-amber-700";
  return "rounded-sm bg-red-600 text-white";
}

function sumOf(card: Card): number {
  return card.reduce<number>((sum, s) => sum + (s ?? 0), 0);
}

function Nine({
  label,
  card,
  offset,
  current,
  onPick,
}: {
  label: string;
  card: Card;
  offset: number;
  current: number;
  onPick: (hole: number) => void;
}) {
  const played = card.filter((s) => s != null).length;
  return (
    <div className="grid grid-cols-[2.6rem_repeat(9,minmax(0,1fr))_2.4rem] overflow-hidden rounded-lg text-center text-xs ring-1 ring-gray-200">
      <div className="bg-[#014421] py-1 text-left pl-1.5 text-[10px] font-semibold text-white/80">Hole</div>
      {card.map((_, i) => (
        <div key={i} className="bg-[#014421] py-1 font-bold text-white">
          {offset + i + 1}
        </div>
      ))}
      <div className="bg-[#014421] py-1 text-[10px] font-bold text-white">{label}</div>

      <div className="bg-gray-50 py-1 text-left pl-1.5 text-[10px] font-semibold text-gray-500">Par</div>
      {card.map((_, i) => (
        <div key={i} className="bg-gray-50 py-1 text-gray-500">
          {PAR2_HOLE_PAR}
        </div>
      ))}
      <div className="bg-gray-50 py-1 font-semibold text-gray-500">{card.length * PAR2_HOLE_PAR}</div>

      <div className="py-1.5 text-left pl-1.5 text-[10px] font-semibold text-gray-700">Score</div>
      {card.map((s, i) => {
        const hole = offset + i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(hole)}
            aria-label={`Hole ${hole + 1}${s != null ? `, ${s}` : ""}`}
            className={`flex items-center justify-center py-1 ${hole === current ? "bg-[#FFA500]/20" : ""}`}
          >
            <span className={`flex h-6 w-6 items-center justify-center text-sm font-bold tabular-nums ${scoreTone(s)}`}>
              {s ?? "·"}
            </span>
          </button>
        );
      })}
      <div className="flex items-center justify-center py-1 text-sm font-extrabold tabular-nums text-gray-900">
        {played ? sumOf(card) : "–"}
      </div>
    </div>
  );
}

/** Tap-to-fill scorecard for the par 2 games. The card survives closing the drill until it's saved. */
export default function Par2Scorecard({
  game,
  storageKey,
  saving,
  onSave,
}: {
  game: Par2Game;
  storageKey: string;
  saving: boolean;
  onSave: (score: number, reps: number, details: Par2Details) => Promise<boolean>;
}) {
  const { holes } = game;
  const [card, setCard] = useState<Card>(() => loadCard(storageKey, holes));
  const [current, setCurrent] = useState(() => {
    const next = card.findIndex((s) => s == null);
    return next < 0 ? 0 : next;
  });
  const [saved, setSaved] = useState(false);

  const update = (next: Card) => {
    setCard(next);
    storeCard(storageKey, next);
  };

  const enter = (strokes: number) => {
    const next = card.map((s, i) => (i === current ? strokes : s));
    update(next);
    const after = next.findIndex((s, i) => i > current && s == null);
    const any = next.findIndex((s) => s == null);
    setCurrent(after >= 0 ? after : any >= 0 ? any : current);
  };

  const restart = () => {
    update(emptyCard(holes));
    storeCard(storageKey, null);
    setCurrent(0);
    setSaved(false);
  };

  const played = card.filter((s): s is number => s != null);
  const done = played.length === holes;
  const summary = par2Summary(played);
  const nines = holes === 18 ? [card.slice(0, 9), card.slice(9)] : [card];

  return (
    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-gray-900">{game.title}</p>
        <p className="text-xs font-semibold tabular-nums text-gray-500">
          {played.length ? (
            <>
              Thru {played.length} ·{" "}
              <span className={summary.toPar > 0 ? "text-red-600" : summary.toPar < 0 ? "text-green-700" : "text-gray-900"}>
                {toParText(summary.toPar)}
              </span>
            </>
          ) : (
            `Up and down = par · ${game.birdie.toLowerCase()} = birdie`
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        {nines.map((nine, n) => (
          <Nine
            key={n}
            label={holes === 9 ? "Tot" : n === 0 ? "Out" : "In"}
            card={nine}
            offset={n * 9}
            current={saved ? -1 : current}
            onPick={(hole) => !saved && setCurrent(hole)}
          />
        ))}
      </div>

      {!saved && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Hole {current + 1} · strokes
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {PAR2_STROKE_OPTIONS.map((n) => {
              const on = card[current] === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => enter(n)}
                  className={`rounded-lg py-2 text-center ring-1 transition-colors ${
                    on ? "bg-[#014421] text-white ring-[#014421]" : "bg-white text-gray-800 ring-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-base font-extrabold tabular-nums">{n === 6 ? "6+" : n}</p>
                  <p className={`text-[9px] font-semibold leading-tight ${on ? "text-white/80" : "text-gray-500"}`}>
                    {strokeLabel(n, game.birdie)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {done && (
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            { label: "Total", value: `${summary.total} (${toParText(summary.toPar)})` },
            { label: "Up & downs", value: `${summary.upAndDowns}/${holes}` },
            { label: game.birdies, value: String(summary.birdies) },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-gray-50 py-1.5 ring-1 ring-gray-200">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{s.label}</p>
              <p className="text-sm font-bold tabular-nums text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={restart}
          disabled={saving || (!played.length && !saved)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {saved ? "New round" : "Clear card"}
        </button>
        {!saved && (
          <button
            type="button"
            disabled={saving || !done}
            onClick={async () => {
              if (await onSave(summary.total, holes, { kind: "par2_scorecard", holes: played })) {
                setSaved(true);
                storeCard(storageKey, null);
              }
            }}
            className="flex-1 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
          >
            {saving ? "Saving…" : done ? `Save ${summary.total}` : `${holes - played.length} holes to go`}
          </button>
        )}
      </div>
    </div>
  );
}
