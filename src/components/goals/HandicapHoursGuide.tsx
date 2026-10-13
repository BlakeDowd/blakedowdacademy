"use client";

import { AlertTriangle, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatHandicap } from "@/lib/practiceHandicap";

type Bracket = {
  id: string;
  name: string;
  range: string;
  /** Inclusive upper handicap limit. Plus handicaps are negative. */
  upTo: number;
  total: string;
  onCourse: string;
  onCourseNote: string;
  shortGame: string;
  rangeWork: string;
};

const BRACKETS: Bracket[] = [
  {
    id: "professional",
    name: "Professional level",
    range: "+2.1 and better",
    upTo: -2.1,
    total: "25–35+ hrs",
    onCourse: "10–14 hrs",
    onCourseNote: "3–4 rounds",
    shortGame: "8–12 hrs",
    rangeWork: "6–10 hrs",
  },
  {
    id: "elite",
    name: "Elite junior / scratch target",
    range: "+2.0 to 2.0",
    upTo: 2,
    total: "12–18+ hrs",
    onCourse: "6–8 hrs",
    onCourseNote: "1.5–2 rounds",
    shortGame: "4–6 hrs",
    rangeWork: "2–4 hrs",
  },
  {
    id: "competitive",
    name: "Competitive / squad level",
    range: "2.1 to 8.0",
    upTo: 8,
    total: "8–12 hrs",
    onCourse: "4–5 hrs",
    onCourseNote: "1 round + 9 holes",
    shortGame: "2.5–4 hrs",
    rangeWork: "1.5–3 hrs",
  },
  {
    id: "single",
    name: "Advancing single figure",
    range: "8.1 to 14.0",
    upTo: 14,
    total: "5–8 hrs",
    onCourse: "4 hrs",
    onCourseNote: "1 round",
    shortGame: "1.5–2.5 hrs",
    rangeWork: "1–2 hrs",
  },
  {
    id: "recreational",
    name: "Mid-to-high / recreational",
    range: "14.1 to 24.0+",
    upTo: Infinity,
    total: "2–4 hrs",
    onCourse: "4 hrs",
    onCourseNote: "Occasional round",
    shortGame: "< 30 mins",
    rangeWork: "1–2 hrs",
  },
];

function bracketFor(handicap: number | null): string | null {
  if (handicap == null) return null;
  return BRACKETS.find((b) => Math.round(handicap * 10) / 10 <= b.upTo)?.id ?? null;
}

function toHandicap(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Recommended weekly hours by handicap bracket, with the player's own bracket highlighted. */
export function HandicapHoursGuide() {
  const { user } = useAuth();
  const handicap = toHandicap(user?.currentHandicap) ?? toHandicap(user?.startingHandicap);
  const mine = bracketFor(handicap);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold text-stone-900">
        <Clock className="h-4 w-4 text-[#014421]" aria-hidden />
        Weekly hours for your handicap
      </h2>
      <p className="mt-0.5 text-xs leading-snug text-stone-500">
        {handicap != null
          ? `How much golf players at your level (${formatHandicap(handicap)}) do each week.`
          : "How much golf players at each level do each week."}
      </p>

      <ul className="mt-3 space-y-2">
        {BRACKETS.map((b) => {
          const isMine = b.id === mine;
          return (
            <li
              key={b.id}
              className={`rounded-xl border p-3 ${
                isMine ? "border-[#014421] bg-[#014421]/[0.04] ring-1 ring-[#014421]" : "border-stone-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-bold leading-tight text-stone-900">{b.name}</span>
                    {isMine && (
                      <span className="rounded-full bg-[#014421] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Your bracket
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-stone-500">Handicap {b.range}</span>
                </div>
                <span className="shrink-0 text-right">
                  <span className={`block text-base font-bold tabular-nums ${isMine ? "text-[#014421]" : "text-stone-900"}`}>
                    {b.total}
                  </span>
                  <span className="block text-[10px] text-stone-400">per week</span>
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-lg bg-stone-50 px-1.5 py-1.5">
                  <dt className="text-[10px] font-semibold leading-tight text-stone-500">On course</dt>
                  <dd className="mt-0.5 text-xs font-bold tabular-nums text-stone-900">{b.onCourse}</dd>
                  <dd className="text-[10px] leading-tight text-stone-400">{b.onCourseNote}</dd>
                </div>
                <div className="rounded-lg bg-stone-50 px-1.5 py-1.5">
                  <dt className="text-[10px] font-semibold leading-tight text-stone-500">Short game &amp; putting</dt>
                  <dd className="mt-0.5 text-xs font-bold tabular-nums text-stone-900">{b.shortGame}</dd>
                </div>
                <div className="rounded-lg bg-stone-50 px-1.5 py-1.5">
                  <dt className="text-[10px] font-semibold leading-tight text-stone-500">Range &amp; combines</dt>
                  <dd className="mt-0.5 text-xs font-bold tabular-nums text-stone-900">{b.rangeWork}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-tight text-amber-900">Stagnant / inconsistent (any handicap)</p>
          <p className="mt-0.5 text-xs leading-snug text-amber-800">
            Under 2 hrs a week: sporadic rounds, almost no short game, and 1 hr beating driver and irons. This is
            where handicaps stop moving.
          </p>
        </div>
      </div>
    </section>
  );
}
