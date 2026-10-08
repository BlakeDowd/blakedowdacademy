"use client";

import type { ReactNode } from "react";
import { ArrowUp, ArrowUpLeft, ArrowUpRight, Check } from "lucide-react";
import { BRAND_ORANGE } from "@/components/combine/PuttingCombineUi";
import { IRON_TEST_CLUBS, IRON_TEST_MAX_CLUBS, IRON_TEST_MIN_CLUBS, IRON_TEST_SHOTS } from "@/lib/ironCombineClubs";

export type ShotCurve = "straight" | "draw" | "fade";

/** Bird's-eye view of an approach: ball at the bottom, flag on a green at the top, flight curving with the shape. */
export function IronShotDiagram({ curve = "straight", className = "" }: { curve?: ShotCurve; className?: string }) {
  const bend = curve === "draw" ? 24 : curve === "fade" ? -24 : 0;
  const path = `M50 106 C ${50 + bend} 80, ${50 + bend} 52, 50 34`;
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden>
      <defs>
        <linearGradient id="iron-fairway" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f8f4e" />
          <stop offset="100%" stopColor="#14592c" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="116" rx="22" fill="url(#iron-fairway)" />
      <rect x="2" y="44" width="96" height="16" fill="white" fillOpacity={0.05} />
      <rect x="2" y="76" width="96" height="16" fill="white" fillOpacity={0.05} />
      <ellipse cx="50" cy="30" rx="24" ry="14" fill="#3fae62" stroke="white" strokeOpacity={0.35} strokeWidth={1} />
      <ellipse cx="50" cy="30" rx="12" ry="7" fill="none" stroke="white" strokeOpacity={0.35} strokeWidth={1} />
      <path d={path} fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={3} strokeDasharray="1 6" strokeLinecap="round" />
      <line x1="50" y1="30" x2="50" y2="12" stroke="white" strokeWidth={1.5} />
      <path d="M50 12 L62 15 L50 18 Z" fill={BRAND_ORANGE} />
      <circle cx="50" cy="106" r="5" fill="white" />
    </svg>
  );
}

export function IronHeroArt({ curve }: { curve?: ShotCurve }) {
  return <IronShotDiagram curve={curve} className="absolute -right-3 -top-2 h-40 w-32 opacity-25" />;
}

/** Tick the clubs in the bag; the count line explains how 9 shots get filled. */
export function ClubPicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const count = selected.length;
  const full = count >= IRON_TEST_MAX_CLUBS;
  const toggle = (key: string) => {
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else if (!full) onChange([...selected, key]);
  };
  const groups = (["Irons", "Hybrids", "Woods"] as const).map((g) => ({
    group: g,
    clubs: IRON_TEST_CLUBS.filter((c) => c.group === g),
  }));
  const repeats = IRON_TEST_SHOTS - count;

  return (
    <div className="rounded-2xl border border-gray-100 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-base font-bold text-gray-900">Your clubs</p>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
            count >= IRON_TEST_MIN_CLUBS ? "bg-[#014421] text-white" : "bg-amber-100 text-amber-900"
          }`}
        >
          {count} picked
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        Tick {IRON_TEST_MIN_CLUBS} to {IRON_TEST_MAX_CLUBS} clubs you carry, from your PW up to your longest iron or hybrid.
      </p>

      <div className="mt-3 space-y-3">
        {groups.map(({ group, clubs }) => (
          <div key={group}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group}</p>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
              {clubs.map((c) => {
                const on = selected.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggle(c.key)}
                    disabled={!on && full}
                    aria-pressed={on}
                    className={`relative rounded-xl py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                      on ? "bg-[#014421] text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                    }`}
                  >
                    {c.key}
                    {on && <Check className="absolute right-1 top-1 h-3 w-3 text-[#FFA500]" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
        {count < IRON_TEST_MIN_CLUBS
          ? `Pick ${IRON_TEST_MIN_CLUBS - count} more to start.`
          : repeats > 0
            ? `${repeats} random club${repeats === 1 ? "" : "s"} from your picks will get a second shot, so it's still ${IRON_TEST_SHOTS} shots.`
            : `One shot with each club, ${IRON_TEST_SHOTS} shots in total.`}
      </p>
    </div>
  );
}

/** Row of equal buttons for a single choice. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; hint?: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`rounded-2xl border-2 px-1 py-2.5 transition-all active:scale-[0.97] ${
              active ? "border-[#014421] bg-[#014421] text-white" : "border-gray-100 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className="block text-sm font-bold">{o.label}</span>
            {o.hint && <span className={`block text-[10px] ${active ? "text-white/70" : "text-gray-400"}`}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export type MissSide = "left" | "straight" | "right";

const SIDE_ICON: Record<MissSide, ReactNode> = {
  left: <ArrowUpLeft className="h-6 w-6" aria-hidden />,
  straight: <ArrowUp className="h-6 w-6" aria-hidden />,
  right: <ArrowUpRight className="h-6 w-6" aria-hidden />,
};

/** Left / on line / right, as seen from behind the ball. */
export function MissSidePicker({ value, onChange }: { value: MissSide; onChange: (s: MissSide) => void }) {
  const options: { key: MissSide; title: string; hint: string }[] = [
    { key: "left", title: "Left", hint: "Missed left" },
    { key: "straight", title: "On line", hint: "Dead straight" },
    { key: "right", title: "Right", hint: "Missed right" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => {
        const active = value === o.key;
        const miss = o.key !== "straight";
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`flex flex-col items-center rounded-2xl border-2 px-1 py-2.5 transition-all active:scale-[0.97] ${
              active
                ? miss
                  ? "border-[#FFA500] bg-orange-50 text-gray-900"
                  : "border-[#014421] bg-[#014421] text-white"
                : "border-gray-100 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span className={active && miss ? "text-[#FFA500]" : ""}>{SIDE_ICON[o.key]}</span>
            <span className="mt-1 text-sm font-bold">{o.title}</span>
            <span className={`text-[10px] ${active && !miss ? "text-white/70" : "text-gray-400"}`}>{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Big yes/no tile for "did you achieve this?" questions. */
export function ToggleCard({
  icon,
  title,
  hint,
  points,
  on,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  points: number;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all active:scale-[0.99] ${
        on ? "border-[#014421] bg-[#014421]/5" : "border-gray-100 bg-white hover:border-gray-300"
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          on ? "bg-[#014421] text-white" : "bg-gray-100 text-gray-500"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
      <span
        className={`flex h-8 min-w-[3rem] shrink-0 items-center justify-center gap-1 rounded-full px-2 text-xs font-bold tabular-nums ${
          on ? "bg-[#FFA500] text-white" : "bg-gray-100 text-gray-400"
        }`}
      >
        {on && <Check className="h-3.5 w-3.5" aria-hidden />}+{points}
      </span>
    </button>
  );
}
