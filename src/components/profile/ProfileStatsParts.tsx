"use client";

import type { ComponentType, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** "50.0" → "50", "70.25" → "70.3". */
export function fmtStat(n: number, decimals = 1): string {
  return String(Number(n.toFixed(decimals)));
}

export function StatsCard({
  id,
  icon: Icon,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  id?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className="min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#014421]/10 text-[#014421]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-stone-900">{title}</span>
          {subtitle && <span className="block text-xs text-stone-500">{subtitle}</span>}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && <div className="mt-4">{children}</div>}
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

function StatusPill({ status }: { status: TargetStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        status.noData
          ? "bg-stone-100 text-stone-400"
          : status.met
            ? "bg-emerald-50 text-emerald-700"
            : "bg-orange-50 text-orange-700"
      }`}
    >
      {status.text}
    </span>
  );
}

/** One stat with a bar showing where it sits against the target marker. */
export function TargetStatRow({
  label,
  hint,
  value,
  goal,
  unit = "",
  lowerIsBetter = false,
}: {
  label: string;
  hint?: string;
  value: number;
  goal: number;
  unit?: "" | "%";
  lowerIsBetter?: boolean;
}) {
  const status = targetStatus(value, goal, lowerIsBetter, unit);
  const scaleMax = unit === "%" ? 100 : Math.max(value, goal, 0.1) * 1.3;
  const fillPct = status.noData ? 0 : Math.min(100, (Math.max(0, value) / scaleMax) * 100);
  const goalPct = Math.min(100, (Math.max(0, goal) / scaleMax) * 100);

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-stone-800">
          {label}
          {hint && <span className="ml-1 text-xs font-normal text-stone-400">{hint}</span>}
        </p>
        <p className="shrink-0 text-xl font-bold tabular-nums text-stone-900">
          {status.noData ? "–" : `${fmtStat(value)}${unit}`}
        </p>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-stone-100">
        <div
          className={`h-full rounded-full transition-all ${status.met ? "bg-[#014421]" : "bg-[#FFA500]"}`}
          style={{ width: `${fillPct}%` }}
        />
        <span
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-stone-700"
          style={{ left: `calc(${goalPct}% - 1px)` }}
          aria-hidden
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-[11px] text-stone-500">
          Target {fmtStat(goal)}
          {unit}
          {lowerIsBetter && goal > 0 ? " or less" : ""}
        </span>
        <StatusPill status={status} />
      </div>
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
