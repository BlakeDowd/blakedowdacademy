"use client";

import { useMemo, type ReactNode } from "react";
import {
  aggregateAdvancedApproach,
  APPROACH_MATRIX_ROWS,
  type ApproachResultKey,
} from "@/lib/advancedApproachAggregates";
import {
  Check,
  MoveDown,
  MoveDownLeft,
  MoveDownRight,
  MoveLeft,
  MoveRight,
  MoveUp,
  MoveUpLeft,
  MoveUpRight,
  type LucideIcon,
} from "lucide-react";

const RESULT_ICONS: Record<ApproachResultKey, LucideIcon> = {
  "top-left": MoveUpLeft,
  top: MoveUp,
  "top-right": MoveUpRight,
  left: MoveLeft,
  gir: Check,
  right: MoveRight,
  "bottom-left": MoveDownLeft,
  bottom: MoveDown,
  "bottom-right": MoveDownRight,
};

/** StatsContext rows or raw Supabase `rounds` (snake_case). */
type RoundLike = {
  holes?: number;
  approachDirectionalShots?: unknown;
  approach_directional_shots?: unknown;
};

type Props = {
  rounds: RoundLike[];
  holeFilter: "9" | "18";
  /** When set, replaces the default subtitle under the section title. */
  description?: string;
  /** e.g. 9/18 filter controls on coach deep dive */
  headerEnd?: ReactNode;
  className?: string;
};

export function AdvancedApproachStatsPanel({
  rounds,
  holeFilter,
  description,
  headerEnd,
  className = "",
}: Props) {
  const normalizedRounds = useMemo(
    () =>
      rounds.map((r) => ({
        holes: typeof r.holes === "number" && Number.isFinite(r.holes) ? r.holes : 18,
        approachDirectionalShots:
          r.approachDirectionalShots ?? r.approach_directional_shots ?? [],
      })),
    [rounds],
  );

  const filteredRounds = useMemo(
    () =>
      normalizedRounds.filter((r) => r.holes === (holeFilter === "9" ? 9 : 18)),
    [normalizedRounds, holeFilter],
  );

  const agg = useMemo(
    () => aggregateAdvancedApproach(filteredRounds),
    [filteredRounds],
  );

  const girRate = agg.total > 0 ? Math.round((agg.girCount / agg.total) * 1000) / 10 : 0;

  return (
    <div
      className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 ${className}`.trim()}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wide text-black">
            Advanced approach
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {description ??
              `From directional logs on round entry (${holeFilter}-hole rounds only).`}
          </p>
        </div>
        {headerEnd ? <div className="shrink-0">{headerEnd}</div> : null}
      </div>

      {agg.total === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 py-6 px-3 text-center">
          <p className="text-xs text-gray-600 leading-relaxed">
            No advanced approach data yet for {holeFilter}-hole rounds. Use{" "}
            <span className="font-semibold text-gray-800">Add Directional Misses</span> when logging
            a round to build your miss pattern and GIR map here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 px-2 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                Logged shots
              </div>
              <div className="text-xl font-bold text-emerald-900 tabular-nums">{agg.total}</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                GIR (center)
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums">{agg.girCount}</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                GIR rate
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums">{girRate}%</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              Miss pattern (all logged taps)
            </div>
            <div className="mx-auto grid w-full max-w-[240px] grid-cols-3 gap-2.5">
              {APPROACH_MATRIX_ROWS.flatMap((row) =>
                row.map((result) => {
                  const count = agg.byResult[result];
                  const intensity = agg.maxCellCount > 0 ? count / agg.maxCellCount : 0;
                  const Icon = RESULT_ICONS[result];
                  const bg = `rgba(16, 185, 129, ${0.08 + intensity * 0.42})`;
                  return (
                    <div
                      key={result}
                      className="flex aspect-square w-full max-w-[4.5rem] flex-col items-center justify-center justify-self-center rounded-full border-2 border-slate-200 text-slate-700 shadow-sm"
                      style={{ backgroundColor: bg }}
                      title={`${result}: ${count}`}
                    >
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.75} />
                      <span className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-900">
                        {count}
                      </span>
                    </div>
                  );
                }),
              )}
            </div>
          </div>

          {agg.topClubs.length > 0 ? (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                Most-used clubs
              </div>
              <div className="space-y-1.5">
                {agg.topClubs.map(({ club, count }) => {
                  const pct = agg.total > 0 ? Math.round((count / agg.total) * 100) : 0;
                  return (
                    <div key={club} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-xs font-semibold text-gray-800 truncate">
                        {club}
                      </span>
                      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${pct}%`, minWidth: count > 0 ? "4px" : 0 }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs font-bold text-gray-700 tabular-nums">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <p className="text-[10px] text-center text-gray-400">
            Based on {agg.roundsWithData} round{agg.roundsWithData !== 1 ? "s" : ""} with at least one
            entry · {filteredRounds.length} total {holeFilter}-hole rounds in view
          </p>
        </div>
      )}
    </div>
  );
}
