"use client";

import { useRef, useState, type PointerEvent } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { getBenchmarkGoals } from "@/lib/benchmarkGoals";
import { Segmented, fmtStat } from "@/components/profile/ProfileStatsParts";
import {
  fairwaysPossibleFor,
  roundTracksStat,
  onlyEighteenHoleRounds,
  sandSaveAttempts,
  upAndDownAttempts,
  type RoundStatKey,
} from "@/lib/roundStatTracking";

type Goals = ReturnType<typeof getBenchmarkGoals>;

export type TrendRound = {
  date?: string | null;
  created_at?: string | null;
  holes?: number | null;
  score?: number | null;
  nett?: number | null;
  birdies?: number | null;
  pars?: number | null;
  bogeys?: number | null;
  doubleBogeys?: number | null;
  eagles?: number | null;
  totalPutts?: number | null;
  threePutts?: number | null;
  firHit?: number | null;
  firLeft?: number | null;
  firRight?: number | null;
  totalGir?: number | null;
  gir8ft?: number | null;
  gir20ft?: number | null;
  upAndDownConversions?: number | null;
  missed?: number | null;
  bunkerSaves?: number | null;
  bunkerAttempts?: number | null;
  chipInside6ft?: number | null;
  doubleChips?: number | null;
  totalPenalties?: number | null;
  fairwaysPossible?: number | null;
  stableford?: number | null;
  puttsPerGir?: number | null;
  trackedStats?: readonly string[] | null;
};

type TrendMetric = {
  id: string;
  label: string;
  unit: "" | "%";
  lowerIsBetter: boolean;
  /** Rounds that didn't track these stats are left off the chart. */
  stats?: readonly RoundStatKey[];
  /** null = not recorded for this round, so it's left off the chart. */
  value: (r: TrendRound) => number | null;
  goal: (g: Goals) => number;
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const pct = (made: number, total: number) => (total > 0 ? (made / total) * 100 : null);
const positive = (v: number | null | undefined) => (typeof v === "number" && v > 0 ? v : null);

const upDownAttemptsOf = (r: TrendRound) =>
  upAndDownAttempts(n(r.upAndDownConversions), n(r.missed), r.created_at ?? r.date);

export const TREND_METRICS = [
  { id: "nettScore", label: "Nett score", unit: "", lowerIsBetter: true, value: (r) => positive(r.nett), goal: () => 72 },
  { id: "gross", label: "Gross score", unit: "", lowerIsBetter: true, value: (r) => positive(r.score), goal: (g) => g.score },
  {
    id: "stableford",
    label: "Stableford points",
    unit: "",
    lowerIsBetter: false,
    stats: ["stableford"],
    value: (r) => (typeof r.stableford === "number" ? r.stableford : null),
    goal: () => 36,
  },
  { id: "birdies", label: "Birdies", unit: "", lowerIsBetter: false, stats: ["distribution"], value: (r) => n(r.birdies), goal: (g) => g.birdies },
  { id: "pars", label: "Pars", unit: "", lowerIsBetter: false, stats: ["distribution"], value: (r) => n(r.pars), goal: (g) => g.pars },
  { id: "bogeys", label: "Bogeys", unit: "", lowerIsBetter: true, stats: ["distribution"], value: (r) => n(r.bogeys), goal: (g) => g.bogeys },
  { id: "doubleBogeys", label: "Double bogeys or worse", unit: "", lowerIsBetter: true, stats: ["distribution"], value: (r) => n(r.doubleBogeys), goal: (g) => g.doubleBogeys },
  { id: "eagles", label: "Eagles", unit: "", lowerIsBetter: false, stats: ["distribution"], value: (r) => n(r.eagles), goal: () => 0 },
  { id: "totalPutts", label: "Total putts", unit: "", lowerIsBetter: true, stats: ["putts"], value: (r) => positive(r.totalPutts), goal: (g) => g.putts },
  {
    id: "puttsPerGir",
    label: "Putts per GIR",
    unit: "",
    lowerIsBetter: true,
    stats: ["putts_per_gir"],
    value: (r) => positive(r.puttsPerGir),
    goal: () => 1.8,
  },
  { id: "threePutts", label: "3-putts", unit: "", lowerIsBetter: true, stats: ["three_putts"], value: (r) => n(r.threePutts), goal: (g) => Math.max(0, g.putts / 18 - 1) },
  {
    id: "fairwaysHit",
    label: "Fairways hit",
    unit: "%",
    lowerIsBetter: false,
    stats: ["fairways"],
    value: (r) => pct(n(r.firHit), fairwaysPossibleFor(n(r.firHit), n(r.firLeft), n(r.firRight), r.fairwaysPossible)),
    goal: (g) => g.fir,
  },
  { id: "gir", label: "Greens in regulation", unit: "%", lowerIsBetter: false, stats: ["gir"], value: (r) => pct(n(r.totalGir), 18), goal: (g) => g.gir },
  { id: "gir8ft", label: "Greens inside 8 ft", unit: "%", lowerIsBetter: false, stats: ["gir_proximity"], value: (r) => pct(n(r.gir8ft), 18), goal: (g) => g.within8ft },
  { id: "gir20ft", label: "Greens inside 20 ft", unit: "%", lowerIsBetter: false, stats: ["gir_proximity"], value: (r) => pct(n(r.gir20ft), 18), goal: (g) => g.within20ft },
  {
    id: "upAndDown",
    label: "Scrambling (up and downs)",
    unit: "%",
    lowerIsBetter: false,
    stats: ["scrambling"],
    value: (r) => pct(n(r.upAndDownConversions), upDownAttemptsOf(r)),
    goal: (g) => g.upAndDown,
  },
  {
    id: "bunkerSaves",
    label: "Sand saves",
    unit: "%",
    lowerIsBetter: false,
    stats: ["sand_saves"],
    value: (r) => pct(n(r.bunkerSaves), sandSaveAttempts(n(r.bunkerSaves), n(r.bunkerAttempts))),
    goal: (g) => g.bunkerSaves,
  },
  {
    id: "chipInside6ft",
    label: "Chips inside 6 ft",
    unit: "%",
    lowerIsBetter: false,
    stats: ["chipping", "scrambling"],
    value: (r) => pct(n(r.chipInside6ft), upDownAttemptsOf(r)),
    goal: (g) => g.chipsInside6ft,
  },
  { id: "doubleChips", label: "Double chips", unit: "", lowerIsBetter: true, stats: ["chipping"], value: (r) => n(r.doubleChips), goal: () => 0 },
  { id: "totalPenalties", label: "Penalties", unit: "", lowerIsBetter: true, stats: ["penalties"], value: (r) => n(r.totalPenalties), goal: (g) => g.totalPenalties },
] as const satisfies readonly TrendMetric[];

export type TrendMetricId = (typeof TREND_METRICS)[number]["id"];

type Point = { value: number; at: Date };

function roundPlayedAt(r: TrendRound): Date | null {
  const raw = r.date || r.created_at;
  if (!raw) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function buildPoints(rounds: readonly TrendRound[], metric: TrendMetric): Point[] {
  const out: Point[] = [];
  for (const r of rounds) {
    if (metric.stats && !metric.stats.every((k) => roundTracksStat(r, k))) continue;
    const at = roundPlayedAt(r);
    const value = metric.value(r);
    if (at && value !== null && Number.isFinite(value)) out.push({ value, at });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

const avg = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fullDayLabel = (d: Date) => `${dayLabel(d)} ${d.getFullYear()}`;

const W = 340;
const H = 196;
const PAD = { left: 34, right: 10, top: 14, bottom: 32 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const ROLLING = 5;
const MAX_ROUNDS = 20;
const MAX_MONTHS = 12;

type View = "rounds" | "months";

export function StatTrendChart({
  rounds,
  metricId,
  goals,
}: {
  rounds: readonly TrendRound[];
  metricId: TrendMetricId;
  goals: Goals;
}) {
  const metric: TrendMetric = TREND_METRICS.find((m) => m.id === metricId) ?? TREND_METRICS[0];
  const goal = metric.goal(goals);
  const isPct = metric.unit === "%";
  const fmt = (v: number) => (isPct ? `${Math.round(v)}%` : fmtStat(v));
  const isBetter = (a: number, b: number) => (metric.lowerIsBetter ? a < b : a > b);
  const meets = (v: number) => (metric.lowerIsBetter ? v <= goal : v >= goal);

  const points = buildPoints(onlyEighteenHoleRounds(rounds), metric);

  const [viewChoice, setViewChoice] = useState<View | null>(null);
  const view: View = viewChoice ?? (points.length > MAX_ROUNDS ? "months" : "rounds");
  const [selected, setSelected] = useState<number | null>(null);
  const plotRef = useRef<SVGRectElement>(null);

  const recentSlice = points.slice(-MAX_ROUNDS);
  const recentRounds = recentSlice.map((p, i) => {
    const window = recentSlice.slice(Math.max(0, i - ROLLING + 1), i + 1).map((x) => x.value);
    return { ...p, rolling: avg(window) };
  });

  const months = (() => {
    const byKey = new Map<string, { at: Date; values: number[] }>();
    for (const p of points) {
      const key = `${p.at.getFullYear()}-${String(p.at.getMonth() + 1).padStart(2, "0")}`;
      const entry = byKey.get(key) ?? { at: new Date(p.at.getFullYear(), p.at.getMonth(), 1), values: [] };
      entry.values.push(p.value);
      byKey.set(key, entry);
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-MAX_MONTHS)
      .map(([, m]) => ({ at: m.at, value: avg(m.values), count: m.values.length }));
  })();

  const summary = (() => {
    if (!points.length) return null;
    const vals = points.map((p) => p.value);
    const recent = vals.slice(-ROLLING);
    const before = vals.slice(-ROLLING * 2, -ROLLING);
    const best = points.reduce(
      (b, p) => ((metric.lowerIsBetter ? p.value < b.value : p.value > b.value) ? p : b),
      points[0]!,
    );
    return {
      recentAvg: avg(recent),
      recentCount: recent.length,
      change: before.length ? avg(recent) - avg(before) : null,
      best,
    };
  })();

  if (!points.length) {
    return (
      <p className="rounded-2xl bg-stone-50 px-4 py-10 text-center text-sm text-stone-500">
        No rounds with {metric.label.toLowerCase()} logged yet.
      </p>
    );
  }

  const series = view === "rounds" ? recentRounds.map((p) => p.value) : months.map((m) => m.value);
  const count = series.length;
  const extra = view === "rounds" && count > ROLLING ? recentRounds.map((p) => p.rolling) : [];
  const dataLo = Math.min(...series, ...extra, goal);
  const dataHi = Math.max(...series, ...extra, goal);
  const span = dataHi - dataLo || Math.max(1, Math.abs(dataHi) * 0.1);
  let lo = Math.max(0, dataLo - span * (view === "months" ? 0.6 : 0.15));
  let hi = dataHi + span * 0.15;
  if (isPct) hi = Math.min(100, hi);
  // Bars read best from zero unless the values sit far above it (e.g. scores in the 70s).
  if (view === "months" && lo < hi - lo) lo = 0;

  const y = (v: number) => PAD.top + PLOT_H - ((v - lo) / (hi - lo || 1)) * PLOT_H;
  const slotW = PLOT_W / Math.max(1, count);
  const x = (i: number) =>
    view === "months"
      ? PAD.left + slotW * (i + 0.5)
      : count <= 1
        ? PAD.left + PLOT_W / 2
        : PAD.left + (i / (count - 1)) * PLOT_W;

  const ticks = [hi, (hi + lo) / 2, lo];
  const tickLabel = (v: number) => (isPct ? `${Math.round(v)}%` : hi - lo >= 6 ? String(Math.round(v)) : fmtStat(v));

  const activeIndex = Math.min(selected ?? count - 1, count - 1);
  const showRolling = view === "rounds" && count > ROLLING;

  const pickFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || count === 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = view === "months" ? Math.floor(ratio * count) : Math.round(ratio * (count - 1));
    setSelected(Math.min(count - 1, Math.max(0, idx)));
  };

  const info = (() => {
    if (view === "months") {
      const m = months[activeIndex];
      if (!m) return null;
      return {
        title: m.at.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
        value: fmt(m.value),
        detail: `average of ${m.count} round${m.count === 1 ? "" : "s"}`,
        met: meets(m.value),
      };
    }
    const p = recentRounds[activeIndex];
    if (!p) return null;
    return {
      title: fullDayLabel(p.at),
      value: fmt(p.value),
      detail: showRolling ? `${ROLLING}-round average ${fmt(p.rolling)}` : `Round ${activeIndex + 1} of ${count}`,
      met: meets(p.value),
    };
  })();

  const xLabels: { i: number; text: string; sub?: string }[] =
    view === "months"
      ? months.map((m, i) => ({
          i,
          text: MONTHS[m.at.getMonth()]!,
          sub: i === 0 || m.at.getMonth() === 0 ? String(m.at.getFullYear()) : undefined,
        }))
      : [0, ...(count >= 8 ? [Math.floor((count - 1) / 2)] : []), count - 1]
          .filter((i, idx, arr) => arr.indexOf(i) === idx)
          .map((i) => ({ i, text: dayLabel(recentRounds[i]!.at) }));

  const changeBetter = summary?.change != null && summary.change !== 0 && isBetter(summary.change, 0);
  const changeFlat = summary?.change != null && Math.abs(summary.change) < (isPct ? 0.5 : 0.05);

  return (
    <div className="space-y-3">
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-[11px] font-medium text-stone-500">Last {summary.recentCount} avg</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-stone-900">{fmt(summary.recentAvg)}</p>
            <p className={`text-[11px] font-semibold ${meets(summary.recentAvg) ? "text-emerald-700" : "text-orange-600"}`}>
              {meets(summary.recentAvg) ? "On target" : `Target ${fmt(goal)}`}
            </p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-[11px] font-medium text-stone-500">Vs previous {ROLLING}</p>
            {summary.change == null ? (
              <p className="mt-1 text-xs text-stone-400">Log more rounds to compare</p>
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
                  {changeFlat ? "Steady" : fmt(Math.abs(summary.change))}
                </p>
                <p className="text-[11px] text-stone-500">
                  {changeFlat ? "No real change" : changeBetter ? "Improving" : "Slipping"}
                </p>
              </>
            )}
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-[11px] font-medium text-stone-500">Best round</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-stone-900">{fmt(summary.best.value)}</p>
            <p className="text-[11px] text-stone-500">{dayLabel(summary.best.at)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Chart view"
          value={view}
          onChange={(v) => {
            setViewChoice(v);
            setSelected(null);
          }}
          options={[
            {
              id: "rounds",
              label: points.length === 1 ? "Last round" : `Last ${Math.min(MAX_ROUNDS, points.length)} rounds`,
            },
            { id: "months", label: "By month" },
          ]}
        />
        <span className="flex items-center gap-1.5 text-[11px] text-stone-500">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-stone-500" aria-hidden />
          Target {fmt(goal)}
        </span>
      </div>

      {info && (
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-stone-800">{info.title}</p>
            <p className="text-[11px] text-stone-500">{info.detail}</p>
          </div>
          <p className={`shrink-0 text-lg font-bold tabular-nums ${info.met ? "text-emerald-700" : "text-stone-900"}`}>
            {info.value}
          </p>
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-pan-y select-none" role="img" aria-label={`${metric.label} trend`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#78716c">
              {tickLabel(t)}
            </text>
          </g>
        ))}

        {view === "months"
          ? months.map((m, i) => {
              const barW = Math.min(26, slotW * 0.62);
              const top = y(m.value);
              const active = i === activeIndex;
              return (
                <rect
                  key={i}
                  x={x(i) - barW / 2}
                  y={top}
                  width={barW}
                  height={Math.max(2, PAD.top + PLOT_H - top)}
                  rx={4}
                  fill={meets(m.value) ? "#014421" : "#FFA500"}
                  opacity={active ? 1 : 0.55}
                />
              );
            })
          : (
            <>
              {count > 1 && (
                <polyline
                  fill="none"
                  stroke={showRolling ? "#014421" : "#a8a29e"}
                  strokeWidth={showRolling ? 2.5 : 1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={recentRounds
                    .map((p, i) => `${x(i)},${y(showRolling ? p.rolling : p.value)}`)
                    .join(" ")}
                />
              )}
              {recentRounds.map((p, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={i === activeIndex ? 5 : 3.5}
                  fill={meets(p.value) ? "#014421" : "#FFA500"}
                  opacity={i === activeIndex || !showRolling ? 1 : 0.5}
                  stroke="#fff"
                  strokeWidth={i === activeIndex ? 2 : 1}
                />
              ))}
            </>
          )}

        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(goal)}
          y2={y(goal)}
          stroke="#57534e"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />

        {view === "rounds" && count > 0 && (
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

        {xLabels.map(({ i, text, sub }) => {
          const anchor =
            view === "rounds" && count > 1 ? (i === 0 ? "start" : i === count - 1 ? "end" : "middle") : "middle";
          const active = i === activeIndex;
          return (
            <g key={i}>
              <text
                x={x(i)}
                y={PAD.top + PLOT_H + 14}
                textAnchor={anchor}
                fontSize={view === "months" && count > 8 ? 9 : 10}
                fontWeight={active ? 700 : 400}
                fill={active ? "#1c1917" : "#78716c"}
              >
                {text}
              </text>
              {sub && (
                <text x={x(i)} y={PAD.top + PLOT_H + 26} textAnchor="middle" fontSize={8.5} fill="#a8a29e">
                  {sub}
                </text>
              )}
            </g>
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
        {view === "months"
          ? "Each bar is that month's average. Green bars hit the target. Tap a bar for details."
          : showRolling
            ? `Dots are single rounds (green = on target); the line is your ${ROLLING}-round average. Tap the chart to see a round.`
            : "Each dot is a round (green = on target). Tap the chart to see a round."}
      </p>
    </div>
  );
}
