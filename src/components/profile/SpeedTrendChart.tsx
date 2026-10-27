"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Gauge } from "lucide-react";
import { Segmented } from "@/components/profile/ProfileStatsParts";
import {
  SPEED_KINDS,
  kindLabel,
  loadCarryUnit,
  loadSpeedLogForProfile,
  speedTrendPoints,
  type CarryUnit,
  type SpeedKind,
  type SpeedLogEntry,
  type SpeedTrendPoint,
} from "@/lib/speedLogging";

const W = 340;
const H = 196;
const PAD = { left: 34, right: 10, top: 14, bottom: 32 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const MAX_POINTS = 24;
const COMPARE_N = 5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayLabel = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fullDayLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const avg = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);

function readLogs(userId: string | null | undefined): SpeedLogEntry[] {
  return loadSpeedLogForProfile(userId);
}

export function SpeedTrendChart({ userId }: { userId?: string | null }) {
  const [kind, setKind] = useState<SpeedKind>("on_course");
  const [unit, setUnit] = useState<CarryUnit>("m");
  const [entries, setEntries] = useState<SpeedLogEntry[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const plotRef = useRef<SVGRectElement>(null);

  const refresh = () => {
    setEntries(readLogs(userId));
    setUnit(loadCarryUnit());
  };

  useEffect(() => {
    refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith("driver_speed_log") || e.key === "driver_speed_carry_unit") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
    };
  }, [userId]);

  const points = useMemo(() => speedTrendPoints(entries, kind), [entries, kind]);
  const recent = points.slice(-MAX_POINTS);
  const count = recent.length;

  const summary = useMemo(() => {
    if (!points.length) return null;
    const vals = points.map((p) => p.clubSpeedMph);
    const latest = vals[vals.length - 1]!;
    const recentAvg = avg(vals.slice(-COMPARE_N));
    const before = vals.slice(-COMPARE_N * 2, -COMPARE_N);
    const change = before.length ? recentAvg - avg(before) : null;
    const best = points.reduce((b, p) => (p.clubSpeedMph > b.clubSpeedMph ? p : b), points[0]!);
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const overall = last.clubSpeedMph - first.clubSpeedMph;
    return { latest, recentAvg, change, best, overall, first, last, n: points.length };
  }, [points]);

  if (!points.length) {
    const otherKind: SpeedKind = kind === "on_course" ? "max" : "on_course";
    const otherHas = speedTrendPoints(entries, otherKind).length > 0;
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            label="Swing type"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setSelected(null);
            }}
            options={SPEED_KINDS.map((k) => ({ id: k.id, label: k.label }))}
          />
        </div>
        <div className="rounded-2xl bg-stone-50 px-4 py-8 text-center">
          <Gauge className="mx-auto h-6 w-6 text-stone-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-stone-900">No {kindLabel(kind).toLowerCase()} yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-stone-500">
            {otherHas
              ? `You have ${kindLabel(otherKind).toLowerCase()} logged — switch above, or log ${kindLabel(kind).toLowerCase()} on Practice.`
              : "Log driver speeds under Practice → More tools → Speed Logging to track whether you're gaining speed."}
          </p>
          <Link
            href="/practice"
            className="mt-4 inline-flex rounded-xl bg-[#014421] px-4 py-2 text-sm font-semibold text-white"
          >
            Open Speed Logging
          </Link>
        </div>
      </div>
    );
  }

  const series = recent.map((p) => p.clubSpeedMph);
  const dataLo = Math.min(...series);
  const dataHi = Math.max(...series);
  const span = dataHi - dataLo || Math.max(4, dataHi * 0.05);
  const lo = Math.max(0, dataLo - span * 0.25);
  const hi = dataHi + span * 0.2;

  const y = (v: number) => PAD.top + PLOT_H - ((v - lo) / (hi - lo || 1)) * PLOT_H;
  const x = (i: number) =>
    count <= 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i / (count - 1)) * PLOT_W;

  const ticks = [hi, (hi + lo) / 2, lo];
  const tickLabel = (v: number) => String(Math.round(v));

  const activeIndex = Math.min(selected ?? count - 1, count - 1);
  const active = recent[activeIndex]!;

  const pickFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || count === 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setSelected(Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1)))));
  };

  const carryOf = (p: SpeedTrendPoint) => (unit === "m" ? p.carryMetres : p.carryYards);
  const carryUnit = unit === "m" ? "m" : "yd";

  const changeBetter = summary?.change != null && summary.change > 0.25;
  const changeWorse = summary?.change != null && summary.change < -0.25;
  const changeFlat = summary?.change != null && !changeBetter && !changeWorse;
  const overallBetter = summary != null && summary.overall > 0.25;
  const overallWorse = summary != null && summary.overall < -0.25;

  const xLabels = [0, ...(count >= 8 ? [Math.floor((count - 1) / 2)] : []), count - 1].filter(
    (i, idx, arr) => arr.indexOf(i) === idx,
  );

  return (
    <div className="space-y-3">
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-[11px] font-medium text-stone-500">Latest</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-stone-900">{summary.latest} mph</p>
            <p className="text-[11px] text-stone-500">{dayLabel(summary.last.at)}</p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-[11px] font-medium text-stone-500">Trend</p>
            {summary.change == null ? (
              <p className="mt-1 text-xs text-stone-400">Need more swings</p>
            ) : (
              <>
                <p
                  className={`mt-0.5 flex items-center gap-0.5 text-xl font-bold tabular-nums ${
                    changeFlat ? "text-stone-900" : changeBetter ? "text-emerald-700" : "text-orange-600"
                  }`}
                >
                  {!changeFlat &&
                    (summary.change > 0 ? (
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" aria-hidden />
                    ))}
                  {changeFlat ? "Steady" : `${Math.abs(summary.change).toFixed(1)} mph`}
                </p>
                <p className="text-[11px] text-stone-500">
                  {changeFlat ? "No real change" : changeBetter ? "Gaining speed" : "Losing speed"}
                </p>
              </>
            )}
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-[11px] font-medium text-stone-500">Best</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-stone-900">{summary.best.clubSpeedMph} mph</p>
            <p className="text-[11px] text-stone-500">{dayLabel(summary.best.at)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Swing type"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setSelected(null);
          }}
          options={SPEED_KINDS.map((k) => ({ id: k.id, label: k.label.replace(" speed", "") }))}
        />
        {summary && summary.n > 1 && (
          <span
            className={`text-[11px] font-semibold ${
              overallBetter ? "text-emerald-700" : overallWorse ? "text-orange-600" : "text-stone-500"
            }`}
          >
            {overallBetter ? "↑" : overallWorse ? "↓" : "→"}{" "}
            {Math.abs(summary.overall).toFixed(1)} mph since first log
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-stone-800">{fullDayLabel(active.at)}</p>
          <p className="text-[11px] text-stone-500">
            Est. carry {carryOf(active)} {carryUnit}
          </p>
        </div>
        <p className="shrink-0 text-lg font-bold tabular-nums text-stone-900">{active.clubSpeedMph} mph</p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={`${kindLabel(kind)} over time`}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#78716c">
              {tickLabel(t)}
            </text>
          </g>
        ))}

        {count > 1 && (
          <polyline
            fill="none"
            stroke="#014421"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={recent.map((p, i) => `${x(i)},${y(p.clubSpeedMph)}`).join(" ")}
          />
        )}

        {recent.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.clubSpeedMph)}
            r={i === activeIndex ? 5 : 3.5}
            fill={i === activeIndex ? "#FFA500" : "#014421"}
            stroke="#fff"
            strokeWidth={i === activeIndex ? 2 : 1}
          />
        ))}

        {count > 0 && (
          <line
            x1={x(activeIndex)}
            x2={x(activeIndex)}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="#a8a29e"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        )}

        {xLabels.map((i) => {
          const anchor = count > 1 ? (i === 0 ? "start" : i === count - 1 ? "end" : "middle") : "middle";
          return (
            <text
              key={i}
              x={x(i)}
              y={PAD.top + PLOT_H + 14}
              textAnchor={anchor}
              fontSize={10}
              fontWeight={i === activeIndex ? 700 : 400}
              fill={i === activeIndex ? "#1c1917" : "#78716c"}
            >
              {dayLabel(recent[i]!.at)}
            </text>
          );
        })}

        <rect
          ref={plotRef}
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
          onPointerDown={pickFromPointer}
          onPointerMove={pickFromPointer}
          style={{ cursor: "pointer" }}
        />
      </svg>

      <p className="text-[11px] text-stone-500">
        Each dot is a logged swing. Tap the chart to inspect a day. Higher is faster.
      </p>
    </div>
  );
}
