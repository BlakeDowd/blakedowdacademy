"use client";

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";

export type PuttShape = "Straight" | "Left-to-Right" | "Right-to-Left";
export type MissSpot = "highLong" | "highShort" | "lowLong" | "lowShort";

export const BRAND_GREEN = "#014421";
export const BRAND_ORANGE = "#FFA500";

export function puttShapeLabel(shape: PuttShape): string {
  if (shape === "Left-to-Right") return "Breaks left to right";
  if (shape === "Right-to-Left") return "Breaks right to left";
  return "Straight";
}

export function puttShapeShort(shape: PuttShape): string {
  if (shape === "Left-to-Right") return "L → R";
  if (shape === "Right-to-Left") return "R → L";
  return "Straight";
}

/** The high side is the side the putt breaks from, e.g. left on a left-to-right putt. */
function highSideIsLeft(shape: PuttShape): boolean {
  return shape !== "Right-to-Left";
}

/** Bird's-eye view of the putt: ball at the bottom, hole at the top, line curving with the break. */
export function PuttLineDiagram({ shape, className = "" }: { shape: PuttShape; className?: string }) {
  const bend = shape === "Left-to-Right" ? -26 : shape === "Right-to-Left" ? 26 : 0;
  const path = `M50 104 C ${50 + bend} 78, ${50 + bend} 46, 50 22`;
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden>
      <defs>
        <radialGradient id="putt-green" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#2f8f4e" />
          <stop offset="100%" stopColor="#14592c" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="96" height="116" rx="22" fill="url(#putt-green)" />
      <path d={path} fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={3} strokeDasharray="1 6" strokeLinecap="round" />
      <line x1="50" y1="22" x2="50" y2="6" stroke="white" strokeWidth={1.5} />
      <path d="M50 6 L62 9 L50 12 Z" fill={BRAND_ORANGE} />
      <circle cx="50" cy="22" r="6.5" fill="#0b2e18" stroke="white" strokeOpacity={0.5} strokeWidth={1} />
      <circle cx="50" cy="104" r="5" fill="white" />
    </svg>
  );
}

export type HoleResult = { points: number; putts: number } | null;

function resultTone(r: NonNullable<HoleResult>): string {
  if (r.putts === 1) return "bg-[#014421] text-white";
  if (r.putts >= 3) return "bg-red-500 text-white";
  if (r.points >= 5) return "bg-green-200 text-[#014421]";
  return "bg-amber-200 text-amber-900";
}

export type TrackItem = { label: string; tone: string; ariaLabel: string } | null;

/** Progress markers: done items show their result, the current one is ringed. More than 10 wrap into two rows. */
export function ProgressTrack({ items, current, name = "Putt" }: { items: TrackItem[]; current: number; name?: string }) {
  const columns = items.length <= 10 ? items.length : Math.ceil(items.length / 2);
  return (
    <ol
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-label={`${name}s`}
    >
      {items.map((item, i) => {
        const isCurrent = i === current;
        return (
          <li
            key={i}
            className={`flex h-8 min-w-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums transition-colors ${
              item ? item.tone : isCurrent ? "bg-white text-[#014421] ring-2 ring-[#FFA500]" : "bg-gray-100 text-gray-400"
            }`}
            aria-current={isCurrent ? "step" : undefined}
            aria-label={item ? item.ariaLabel : `${name} ${i + 1}`}
          >
            {item ? item.label : i + 1}
          </li>
        );
      })}
    </ol>
  );
}

/** Hole markers coloured by points. */
export function HoleTrack({ results, current }: { results: HoleResult[]; current: number }) {
  const items: TrackItem[] = results.map((r, i) =>
    r
      ? { label: r.points > 0 ? `+${r.points}` : String(r.points), tone: resultTone(r), ariaLabel: `Hole ${i + 1}: ${r.points} points` }
      : null,
  );
  return <ProgressTrack items={items} current={current} name="Hole" />;
}

/** Green intro banner shared by every putting combine. */
export function CombineHero({ title, chips, shape = "Left-to-Right" }: { title: string; chips: string[]; shape?: PuttShape }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#014421] to-[#0b6b3a] p-5 text-white shadow-md">
      <PuttLineDiagram shape={shape} className="absolute -right-3 -top-2 h-40 w-32 opacity-25" />
      <p className="text-xs font-semibold uppercase tracking-wider text-[#FFA500]">Putting combine</p>
      <h2 className="mt-1 pr-16 text-2xl font-extrabold leading-tight">{title}</h2>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        {chips.map((c) => (
          <span key={c} className="rounded-full bg-white/15 px-3 py-1">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Numbered how-to steps for the intro screen. */
export function IntroSteps({ steps }: { steps: { icon: ReactNode; title: string; hint: string }[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.title} className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#014421] shadow-sm">
            {s.icon}
            <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#FFA500] text-[10px] font-bold text-white">
              {i + 1}
            </span>
          </span>
          <span>
            <span className="block text-sm font-bold text-gray-900">{s.title}</span>
            <span className="block text-xs text-gray-500">{s.hint}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Collapsible "How scoring works" panel. */
export function ScoringGuide({ title = "How points work", children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-gray-100">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800">
        {title}
        <span className="text-xs font-medium text-[#014421] group-open:hidden">Show</span>
        <span className="hidden text-xs font-medium text-[#014421] group-open:inline">Hide</span>
      </summary>
      <div className="px-4 pb-4 text-xs text-gray-700">{children}</div>
    </details>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl bg-[#014421] py-4 text-base font-bold text-white shadow-md transition-transform hover:bg-[#013320] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function StatTiles({ stats }: { stats: { label: string; value: ReactNode; sub?: string | null }[] }) {
  return (
    <div className="grid gap-2 text-center" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl bg-gray-50 px-2 py-3">
          <p className="text-xl font-extrabold tabular-nums text-gray-900">{s.value}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{s.label}</p>
          {s.sub && <p className="text-[10px] text-gray-400">{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** Quick-pick number chips plus an "Other" box. */
export function NumberChips({
  values,
  value,
  onChange,
  unit,
  formatChip,
  ariaLabel,
  columns = 5,
}: {
  values: readonly number[];
  value: string;
  onChange: (v: string) => void;
  unit: string;
  formatChip?: (v: number) => string | null;
  ariaLabel: string;
  columns?: number;
}) {
  const num = parseFloat(value);
  const isChip = values.some((c) => String(c) === value);
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {values.map((v) => {
        const active = value.trim() !== "" && num === v;
        const custom = formatChip?.(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(String(v))}
            className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition-colors ${
              active ? "bg-[#014421] text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
          >
            {custom ?? (
              <>
                {v}
                <span className={`text-[10px] font-semibold ${active ? "text-white/70" : "text-gray-400"}`}> {unit}</span>
              </>
            )}
          </button>
        );
      })}
      <input
        type="text"
        inputMode="decimal"
        placeholder="Other"
        aria-label={ariaLabel}
        value={isChip ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 rounded-xl border-2 border-gray-200 px-1 text-center text-sm font-bold focus:border-[#014421] focus:outline-none"
      />
    </div>
  );
}

/** Top-down gate: two posts with the ball between; the post that was hit glows orange. */
function GateIcon({ hit }: { hit: "left" | "right" | null }) {
  return (
    <svg viewBox="0 0 60 36" className="h-8 w-14" aria-hidden>
      <rect x="8" y="4" width="6" height="28" rx="3" fill={hit === "left" ? BRAND_ORANGE : "#9ca3af"} />
      <rect x="46" y="4" width="6" height="28" rx="3" fill={hit === "right" ? BRAND_ORANGE : "#9ca3af"} />
      <circle cx={hit === "left" ? 20 : hit === "right" ? 40 : 30} cy="18" r="6" fill="currentColor" />
    </svg>
  );
}

export type GateOption<K extends string> = { key: K; title: string; hint: string; hit: "left" | "right" | null };

/** Left post / through / right post, laid out the way the gate looks from behind the ball. */
export function GatePicker<K extends string>({
  options,
  value,
  onChange,
}: {
  options: GateOption<K>[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((s) => {
        const active = value === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            aria-pressed={active}
            className={`flex flex-col items-center rounded-2xl border-2 px-1 py-2.5 transition-all active:scale-[0.97] ${
              active
                ? s.hit
                  ? "border-[#FFA500] bg-orange-50 text-gray-900"
                  : "border-[#014421] bg-[#014421] text-white"
                : "border-gray-100 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <GateIcon hit={s.hit} />
            <span className="mt-1 text-sm font-bold">{s.title}</span>
            <span className={`text-[10px] ${active && !s.hit ? "text-white/70" : "text-gray-400"}`}>{s.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Score ring used on results screens. */
export function ScoreRing({ pct, value, caption }: { pct: number; value: ReactNode; caption: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div className="relative mx-auto mt-3 h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="white" strokeOpacity={0.15} strokeWidth={10} />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={BRAND_ORANGE}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - clamped)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold tabular-nums leading-none">{value}</span>
        <span className="mt-1 text-xs text-white/70">{caption}</span>
      </div>
    </div>
  );
}

export function ResultHero({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-gradient-to-br from-[#014421] to-[#0b6b3a] p-5 text-center text-white shadow-md">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#FFA500]">Test complete</p>
      {children}
    </div>
  );
}

export function PlayAgainButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#014421] py-3.5 font-bold text-[#014421] transition-colors hover:bg-[#014421]/5"
    >
      <RotateCcw className="h-4 w-4" aria-hidden />
      Play again
    </button>
  );
}

/** Save status line for combines that save once at the end. */
export function SaveStatus({ saved, error, onRetry }: { saved: boolean; error: string | null; onRetry?: () => void }) {
  if (error) {
    return (
      <div className="space-y-2 rounded-2xl bg-red-50 p-3 text-center">
        <p className="text-sm text-red-700">{error}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="text-sm font-bold text-[#014421] underline underline-offset-2">
            Try saving again
          </button>
        )}
      </div>
    );
  }
  if (saved) return <p className="text-center text-xs font-medium text-[#014421]">Saved to your history</p>;
  return null;
}

const SPOT_LABEL: Record<MissSpot, { title: string; hint: string }> = {
  highLong: { title: "Past · high side", hint: "Pro side, ran by" },
  lowLong: { title: "Past · low side", hint: "Not enough break" },
  highShort: { title: "Short · high side", hint: "Too much break" },
  lowShort: { title: "Short · low side", hint: "Not enough break" },
};

/** Straight putts have no high side, so the left column is logged as "high" and the right as "low". */
const STRAIGHT_SPOT_LABEL: Record<MissSpot, { title: string; hint: string }> = {
  highLong: { title: "Past · left", hint: "Ran by" },
  lowLong: { title: "Past · right", hint: "Ran by" },
  highShort: { title: "Short · left", hint: "Didn't get there" },
  lowShort: { title: "Short · right", hint: "Didn't get there" },
};

/**
 * Tap where the first putt finished. Columns follow the break so the high side is always the side the
 * ball breaks from.
 */
export function MissSpotPicker({ shape, onPick }: { shape: PuttShape; onPick: (spot: MissSpot) => void }) {
  const highLeft = highSideIsLeft(shape);
  const labels = shape === "Straight" ? STRAIGHT_SPOT_LABEL : SPOT_LABEL;
  const rows: MissSpot[][] = [
    highLeft ? ["highLong", "lowLong"] : ["lowLong", "highLong"],
    highLeft ? ["highShort", "lowShort"] : ["lowShort", "highShort"],
  ];
  const cell = (spot: MissSpot) => {
    const long = spot.endsWith("Long");
    const high = spot.startsWith("high");
    return (
      <button
        key={spot}
        type="button"
        onClick={() => onPick(spot)}
        className={`flex min-h-[84px] flex-col justify-center rounded-2xl px-3 py-3 text-left transition-transform active:scale-[0.97] ${
          long ? "bg-white/15 hover:bg-white/25" : "bg-black/15 hover:bg-black/25"
        }`}
      >
        <span className="text-sm font-bold text-white">{labels[spot].title}</span>
        <span className="mt-0.5 text-[11px] text-white/70">{labels[spot].hint}</span>
        {shape !== "Straight" && <span className="sr-only">{high ? "high side" : "low side"}</span>}
      </button>
    );
  };
  return (
    <div className="relative rounded-3xl bg-gradient-to-b from-[#2f8f4e] to-[#14592c] p-3 shadow-inner">
      <div className="grid grid-cols-2 gap-2">{rows[0]!.map(cell)}</div>
      <div className="pointer-events-none my-2 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/70">
        <span className="h-px flex-1 bg-white/20" />
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded-full bg-[#0b2e18] ring-2 ring-white/50" />
          Hole
        </span>
        <span className="h-px flex-1 bg-white/20" />
      </div>
      <div className="grid grid-cols-2 gap-2">{rows[1]!.map(cell)}</div>
      <p className="mt-2 text-center text-[10px] text-white/60">
        {shape === "Straight"
          ? "You're putting up the page"
          : "You're putting up the page · high side = the side it breaks from"}
      </p>
    </div>
  );
}

export function ChoiceCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white p-3.5 text-left shadow-sm transition-all hover:border-[#014421]/40 active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#014421]/10 text-[#014421]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </button>
  );
}

export function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1.5 rounded-full transition-all ${i < step ? "w-5 bg-[#FFA500]" : "w-1.5 bg-gray-200"}`} />
      ))}
    </span>
  );
}
