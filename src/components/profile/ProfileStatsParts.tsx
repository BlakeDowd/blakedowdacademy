"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** "50.0" → "50", "70.25" → "70.3". */
export function fmtStat(n: number, decimals = 1): string {
  return String(Number(n.toFixed(decimals)));
}

export function StatsCard({
  id,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className="min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 shadow-sm sm:px-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-[0.08em] text-[#014421]">{title}</span>
          {subtitle && <span className="mt-0.5 block text-xs text-stone-500">{subtitle}</span>}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-stone-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            value === o.id ? "bg-[#014421] text-white shadow-sm" : "text-stone-600 hover:text-stone-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type TargetStatus = { noData: boolean; met: boolean; text: string };

export function targetStatus(value: number, goal: number, lowerIsBetter: boolean, unit = ""): TargetStatus {
  if (!Number.isFinite(value) || value < 0) return { noData: true, met: false, text: "No data" };
  const met = lowerIsBetter ? value <= goal : value >= goal;
  if (met) return { noData: false, met, text: "On target" };
  const diff = `${fmtStat(Math.abs(value - goal))}${unit}`;
  return { noData: false, met, text: lowerIsBetter ? `${diff} over` : `${diff} to go` };
}

/** One stat as a summary row: label and target on the left, value on the right. */
export function TargetStatRow({
  label,
  hint,
  value,
  goal,
  unit = "",
  lowerIsBetter = false,
  display,
  sub,
  dot,
}: {
  label: string;
  hint?: string;
  value: number;
  goal?: number;
  unit?: "" | "%";
  lowerIsBetter?: boolean;
  /** Shown instead of the formatted value, e.g. "7.1 / 14". */
  display?: string;
  sub?: string;
  dot?: string;
}) {
  const noData = !Number.isFinite(value) || value < 0;
  const status = goal === undefined ? null : targetStatus(value, goal, lowerIsBetter, unit);

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[15px] font-medium text-stone-800">
          {dot && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />}
          <span className="min-w-0">
            {label}
            {hint && <span className="ml-1 text-xs font-normal text-stone-400">{hint}</span>}
          </span>
        </p>
        {status && goal !== undefined ? (
          <p className="mt-0.5 text-[11px] text-stone-500">
            Target {fmtStat(goal)}
            {unit}
            {lowerIsBetter && goal > 0 ? " or less" : ""}
            {!status.noData && (
              <span className={`font-semibold ${status.met ? "text-emerald-700" : "text-orange-600"}`}>
                {" "}
                · {status.text}
              </span>
            )}
          </p>
        ) : sub ? (
          <p className="mt-0.5 text-[11px] text-stone-500">{sub}</p>
        ) : null}
      </div>
      <p className={`shrink-0 text-lg font-semibold tabular-nums ${noData ? "text-stone-300" : "text-stone-900"}`}>
        {noData ? "–" : (display ?? `${fmtStat(value)}${unit}`)}
      </p>
    </div>
  );
}

/** Compact tile for the headline numbers. */
export function HeadlineStatTile({
  label,
  value,
  goal,
  unit = "",
  lowerIsBetter = false,
}: {
  label: string;
  value: number;
  goal: number;
  unit?: "" | "%";
  lowerIsBetter?: boolean;
}) {
  const status = targetStatus(value, goal, lowerIsBetter, unit);
  return (
    <div className="rounded-2xl bg-stone-50 p-3">
      <p className="text-[11px] font-medium text-stone-500">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-stone-900">
        {status.noData ? "–" : `${fmtStat(value)}${unit}`}
      </p>
      <p
        className={`mt-0.5 text-[11px] font-semibold ${
          status.noData ? "text-stone-400" : status.met ? "text-emerald-700" : "text-orange-600"
        }`}
      >
        {status.met ? "On target" : `Target ${fmtStat(goal)}${unit}`}
      </p>
    </div>
  );
}
