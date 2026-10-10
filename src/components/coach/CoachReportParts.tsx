"use client";

import type { ReactNode } from "react";

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** One white card on the coach player report, titled like the My Stats cards. */
export function ReportSection({
  id,
  title,
  subtitle,
  aside,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="min-w-0 rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm sm:px-5 print:break-inside-avoid print:shadow-none"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[#014421]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function ReportEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-stone-50 px-3 py-4 text-center text-xs leading-relaxed text-stone-500">{children}</p>;
}

export function ReportSubLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{children}</p>;
}

/** Number tile; "–" when there's no data. */
export function ReportTile({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="coach-deepdive-stat-card flex min-w-0 flex-col rounded-2xl bg-stone-50 p-3">
      <p className="flex-1 text-[11px] font-medium leading-tight text-stone-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${value == null ? "text-stone-300" : "text-stone-900"}`}>
        {value ?? "–"}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-stone-400">{sub}</p>}
    </div>
  );
}

/** Label on the left, value on the right. */
export function ReportRow({ label, sub, value }: { label: string; sub?: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-800">{label}</p>
        {sub && <p className="mt-0.5 text-[11px] text-stone-500">{sub}</p>}
      </div>
      <div className="shrink-0 text-right text-base font-semibold tabular-nums text-stone-900">{value}</div>
    </div>
  );
}
