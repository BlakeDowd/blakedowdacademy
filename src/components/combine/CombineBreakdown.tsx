"use client";

import type { ReactNode } from "react";
import { Lightbulb } from "lucide-react";

/** Titled white card used for each section of a results breakdown. */
export function BreakdownCard({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 p-3.5">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
        {aside && <span className="text-xs font-semibold text-gray-400">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

export type BarSegment = { label: string; value: number; tone: string };

/** One stacked bar with a legend underneath. Empty segments are hidden. */
export function BreakdownBar({ segments, label }: { segments: BarSegment[]; label?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div>
      {label && <p className="mb-1 text-xs font-semibold text-gray-800">{label}</p>}
      <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
        {shown.map((s) => (
          <div key={s.label} className={s.tone} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <span key={s.label} className={`flex items-center gap-1.5 text-xs ${s.value > 0 ? "text-gray-700" : "text-gray-300"}`}>
            <span className={`h-2 w-2 rounded-full ${s.value > 0 ? s.tone : "bg-gray-200"}`} />
            {s.label} <span className="font-bold tabular-nums">{Number.isInteger(s.value) ? s.value : s.value.toFixed(1)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Labelled progress row, e.g. "Through the gate 7/10". Bar colour: green 70%+, orange 40%+, red below. */
export function RateRow({ label, made, total, flag }: { label: string; made: number; total: number; flag?: string | null }) {
  const pct = total > 0 ? made / total : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-gray-800">
          {label}
          {flag && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">{flag}</span>}
        </span>
        <span className="font-bold tabular-nums text-gray-900">
          {made}/{total}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${pct >= 0.7 ? "bg-[#014421]" : pct >= 0.4 ? "bg-[#FFA500]" : "bg-red-500"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Row with a value bar scaled against `max`, for things like "average miss by distance". `lowerIsBetter` flips the colours. */
export function ValueRow({
  label,
  value,
  max,
  display,
  lowerIsBetter = false,
  flag,
}: {
  label: string;
  value: number;
  max: number;
  display: ReactNode;
  lowerIsBetter?: boolean;
  flag?: string | null;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const goodness = lowerIsBetter ? 1 - pct : pct;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-gray-800">
          {label}
          {flag && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">{flag}</span>}
        </span>
        <span className="font-bold tabular-nums text-gray-900">{display}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${goodness >= 0.7 ? "bg-[#014421]" : goodness >= 0.4 ? "bg-[#FFA500]" : "bg-red-500"}`}
          style={{ width: `${Math.max(pct, 0.03) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** "Focus next" tip box shown under the headline stats. */
export function FocusCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-orange-50 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFA500] text-white">
        <Lightbulb className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        {lines.map((l) => (
          <p key={l} className="mt-0.5 text-xs text-gray-700">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Collapsed "Every shot" list at the bottom of a breakdown. */
export function EveryShotList({ title = "Every shot", children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-gray-100">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
        <span className="text-xs font-medium normal-case tracking-normal text-[#014421] group-open:hidden">Show</span>
        <span className="hidden text-xs font-medium normal-case tracking-normal text-[#014421] group-open:inline">Hide</span>
      </summary>
      <ul className="divide-y divide-gray-100 px-3.5 pb-2">{children}</ul>
    </details>
  );
}
