"use client";

import { useMemo } from "react";
import {
  aggregateLivePuttingStats,
  LIVE_PUTT_BREAK_OPTIONS,
  PUTTING_DISTANCE_BUCKETS,
} from "@/lib/roundPuttingLogs";

type RoundLike = {
  holes?: number;
  puttingLogs?: unknown;
  putting_logs?: unknown;
};

type Props = {
  rounds: RoundLike[];
  holeFilter: "9" | "18";
  className?: string;
};

function BarRow({
  label,
  count,
  total,
  color = "bg-emerald-500",
}: {
  label: string;
  count: number;
  total: number;
  color?: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-semibold text-gray-800">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%`, minWidth: count > 0 ? "4px" : 0 }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-xs font-bold tabular-nums text-gray-700">
        {count}
        {total > 0 ? ` (${pct}%)` : ""}
      </span>
    </div>
  );
}

export function LivePuttingBreakdownPanel({ rounds, holeFilter, className = "" }: Props) {
  const filteredRounds = useMemo(
    () => rounds.filter((r) => r.holes === (holeFilter === "9" ? 9 : 18)),
    [rounds, holeFilter],
  );

  const agg = useMemo(() => aggregateLivePuttingStats(filteredRounds), [filteredRounds]);

  if (agg.totalPutts === 0) {
    return (
      <div
        className={`rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-5 text-center ${className}`.trim()}
      >
        <p className="text-xs leading-relaxed text-gray-600">
          No live putting detail for {holeFilter}-hole rounds yet. Finish a round with{" "}
          <span className="font-semibold text-gray-800">Live Entry</span> and log distances,
          break reads, and miss line / speed to see breakdowns here.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${className}`.trim()}>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-2 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
            Logged putts
          </div>
          <div className="text-xl font-bold tabular-nums text-emerald-900">{agg.totalPutts}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Rounds with data
          </div>
          <div className="text-xl font-bold tabular-nums text-slate-900">{agg.roundsWithData}</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
          Make % by distance
        </div>
        <div className="space-y-2">
          {PUTTING_DISTANCE_BUCKETS.map((bucket) => {
            const row = agg.distanceBuckets[bucket.id];
            return (
              <div
                key={bucket.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2"
              >
                <span className="text-xs font-semibold text-gray-800">{bucket.label}</span>
                <div className="text-right">
                  <span className="text-sm font-bold tabular-nums text-[#FF9800]">
                    {row.attempts > 0 ? `${row.makePct}%` : "—"}
                  </span>
                  <span className="ml-2 text-[10px] text-gray-500 tabular-nums">
                    {row.makes}/{row.attempts}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {agg.breakTotal > 0 ? (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Break reads (L → R, straight, etc.)
          </div>
          <div className="space-y-1.5">
            {LIVE_PUTT_BREAK_OPTIONS.map((option) => (
              <BarRow
                key={option.id}
                label={option.label}
                count={agg.breakCounts[option.id]}
                total={agg.breakTotal}
                color="bg-teal-500"
              />
            ))}
          </div>
        </div>
      ) : null}

      {agg.missStartLine.total > 0 ? (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Missed putts — start line
          </div>
          <div className="space-y-1.5">
            <BarRow
              label="High"
              count={agg.missStartLine.high}
              total={agg.missStartLine.total}
              color="bg-amber-500"
            />
            <BarRow
              label="Low"
              count={agg.missStartLine.low}
              total={agg.missStartLine.total}
              color="bg-amber-500"
            />
          </div>
        </div>
      ) : null}

      {agg.missSpeed.total > 0 ? (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Missed putts — speed
          </div>
          <div className="space-y-1.5">
            <BarRow
              label="Long"
              count={agg.missSpeed.long}
              total={agg.missSpeed.total}
              color="bg-sky-500"
            />
            <BarRow
              label="Short"
              count={agg.missSpeed.short}
              total={agg.missSpeed.total}
              color="bg-sky-500"
            />
          </div>
        </div>
      ) : null}

      <p className="text-center text-[10px] text-gray-400">
        From live putting logs · {filteredRounds.length} {holeFilter}-hole round
        {filteredRounds.length !== 1 ? "s" : ""} in view
      </p>
    </div>
  );
}
