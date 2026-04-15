"use client";

import { Activity } from "lucide-react";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type RoundTrendPoint = { sortAt: number; y: number };

function formatTick(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPointLabel(value: unknown, dataKey: "gross" | "handicap"): string {
  const v = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(v)) return "";
  if (dataKey === "gross" && Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function formatPrintCell(ts: number, y: number, dataKey: "gross" | "handicap") {
  const dateStr = new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const val =
    dataKey === "gross" && Number.isInteger(y) ? String(y) : Number.isFinite(y) ? y.toFixed(1) : "—";
  return { dateStr, val };
}

function TrendCard({
  title,
  subtitle,
  data,
  dataKey,
  stroke,
  emptyMessage,
  yLabel,
}: {
  title: string;
  subtitle: string;
  data: RoundTrendPoint[];
  dataKey: "gross" | "handicap";
  stroke: string;
  emptyMessage: string;
  yLabel: string;
}) {
  const chartData = data.map((d) => ({ sortAt: d.sortAt, [dataKey]: d.y }));
  const lineClass =
    dataKey === "gross" ? "coach-deepdive-chart-gross" : "coach-deepdive-chart-handicap";
  const labelSize = data.length > 16 ? 10 : data.length > 10 ? 11 : 12;
  const sortAts = data.map((d) => d.sortAt);
  const dayMs = 86_400_000;
  /** Oldest→newest: leftmost two dots are tight in x when those rounds are close in time. */
  const firstGapMs =
    sortAts.length >= 2 ? Math.abs(sortAts[1]! - sortAts[0]!) : Number.POSITIVE_INFINITY;
  const firstPairStackLabels =
    sortAts.length >= 2 && Number.isFinite(firstGapMs) && firstGapMs < 56 * dayMs;
  const numericYs = data.map((d) => d.y);
  /** Headroom for labels just above dots; extra when the first two labels stack vertically. */
  const chartTopMargin =
    30 + (data.length > 10 ? 8 : 0) + (data.length > 16 ? 6 : 0) + (firstPairStackLabels ? 14 : 0);

  return (
    <div className="coach-deepdive-trend-card rounded-2xl border border-stone-200 bg-white p-4 shadow-md sm:p-5 print:break-inside-avoid print:shadow-none print:rounded-xl print:border-stone-400 print:p-3">
      <div className="mb-4 print:mb-2">
        <h3 className="text-base font-semibold tracking-tight text-stone-900 print:text-[13pt] print:text-black">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-stone-500 print:text-[9pt] print:text-stone-700 print:max-w-none">
          {subtitle}
        </p>
      </div>
      {chartData.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 py-10 text-center text-xs text-stone-500 print:border-stone-400 print:bg-white print:text-stone-700">
          {emptyMessage}
        </p>
      ) : (
        <>
          <div className="coach-deepdive-chart-wrap h-[248px] w-full min-w-0 print:h-[280px] print:min-h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: chartTopMargin, right: 14, left: 6, bottom: 8 }}
                className="coach-deepdive-recharts-surface"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis
                  dataKey="sortAt"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={formatTick}
                  tick={{ fontSize: 11, fill: "#57534e" }}
                  axisLine={{ stroke: "#a8a29e" }}
                  tickMargin={8}
                />
                <YAxis
                  width={42}
                  tick={{ fontSize: 11, fill: "#57534e" }}
                  axisLine={{ stroke: "#a8a29e" }}
                  tickMargin={6}
                  label={{
                    value: yLabel,
                    angle: -90,
                    position: "insideLeft",
                    fill: "#57534e",
                    fontSize: 11,
                    style: { textAnchor: "middle" },
                  }}
                />
                <Tooltip
                  wrapperClassName="print:hidden"
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e7e5e4",
                    fontSize: "12px",
                  }}
                  labelFormatter={(ts) => formatTick(Number(ts))}
                  formatter={(value: number | string | undefined) => {
                    if (typeof value !== "number" || !Number.isFinite(value))
                      return [value === undefined ? "—" : String(value), yLabel];
                    const shown = dataKey === "gross" && Number.isInteger(value) ? String(value) : value.toFixed(1);
                    return [shown, yLabel];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={dataKey}
                  stroke={stroke}
                  strokeWidth={2.25}
                  className={lineClass}
                  dot={{ r: 3.5, fill: stroke, stroke: "#fff", strokeWidth: 1 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey={dataKey}
                    content={(raw) => {
                      const x = raw.x;
                      const y = raw.y;
                      const index = raw.index;
                      const value = raw.value;
                      if (typeof x !== "number" || typeof y !== "number" || typeof index !== "number") {
                        return null;
                      }
                      const str = formatPointLabel(value, dataKey);
                      const fill = dataKey === "gross" ? "#022c15" : "#9a3412";
                      const v = typeof value === "number" ? value : Number(value);
                      const prev = index > 0 ? numericYs[index - 1] : null;
                      const next = index < numericYs.length - 1 ? numericYs[index + 1] : null;
                      const valueClose =
                        Number.isFinite(v) &&
                        ((prev != null && Math.abs(v - prev) <= (dataKey === "gross" ? 3 : 0.6)) ||
                          (next != null && Math.abs(v - next) <= (dataKey === "gross" ? 3 : 0.6)));
                      /** Recharts passes dot-center (x,y); keep dx=0 so labels stay centered on the dot. */
                      const baseLift = 12;
                      let dx = 0;
                      let dy: number;
                      if (firstPairStackLabels && index === 0) {
                        dy = -baseLift;
                      } else if (firstPairStackLabels && index === 1) {
                        /** Second of a tight left pair: lift a bit more so values do not overlap, without sliding sideways off the dot. */
                        dy = -(baseLift + 14);
                      } else {
                        const extraLift = valueClose ? (index % 2) * 10 : 0;
                        dy = -(baseLift + extraLift);
                        if (valueClose) {
                          dx = index % 3 === 0 ? -18 : index % 3 === 1 ? 0 : 18;
                        }
                      }
                      return (
                        <text
                          x={x}
                          y={y}
                          dx={dx}
                          dy={dy}
                          textAnchor="middle"
                          dominantBaseline="auto"
                          fill={fill}
                          fontSize={labelSize}
                          fontWeight={700}
                          className="coach-deepdive-point-value"
                        >
                          {str}
                        </text>
                      );
                    }}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Print/PDF: numeric table so values stay legible if the chart rasterizes poorly */}
          <div className="mt-3 hidden print:block">
            <p className="mb-1.5 text-[9pt] font-bold uppercase tracking-wide text-stone-800">Data (same as chart)</p>
            <table className="w-full border-collapse border border-stone-400 text-left text-[9pt] text-black">
              <thead>
                <tr className="border-b border-stone-400 bg-stone-100">
                  <th className="border-r border-stone-400 px-2 py-1 font-semibold">Date</th>
                  <th className="px-2 py-1 font-semibold">{yLabel === "Gross" ? "Gross score" : "Handicap"}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const { dateStr, val } = formatPrintCell(row.sortAt, row.y, dataKey);
                  return (
                    <tr key={`${row.sortAt}-${i}`} className="border-b border-stone-300">
                      <td className="border-r border-stone-300 px-2 py-0.5 tabular-nums">{dateStr}</td>
                      <td className="px-2 py-0.5 font-semibold tabular-nums">{val}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

type Props = {
  grossPoints: RoundTrendPoint[];
  handicapPoints: RoundTrendPoint[];
  rangeCaption: string;
};

export function CoachDeepDiveRoundTrendCharts({ grossPoints, handicapPoints, rangeCaption }: Props) {
  return (
    <section id="coach-deepdive-round-charts" className="mb-10 space-y-6 print:mb-6">
      <div className="mb-5 flex items-center gap-3 sm:mb-6 print:mb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700 print:border print:border-stone-400 print:bg-white">
          <Activity className="h-4 w-4 print:h-5 print:w-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-stone-900 print:text-[14pt] print:text-black">
            Round trends
          </h2>
          <p className="text-xs text-stone-500 print:text-[9pt] print:text-stone-800">{rangeCaption}</p>
        </div>
      </div>

      <div className="flex flex-col gap-7 sm:gap-8">
        <TrendCard
          title="Gross score by round"
          subtitle="Total gross score for each logged round in the selected window."
          data={grossPoints}
          dataKey="gross"
          stroke="#014421"
          emptyMessage="No rounds with a gross score in this date range."
          yLabel="Gross"
        />
        <TrendCard
          title="Handicap index"
          subtitle="Uses official handicap history when available; otherwise handicap entered on each round."
          data={handicapPoints}
          dataKey="handicap"
          stroke="#ea580c"
          emptyMessage="No handicap entries in this window (log handicap on rounds or via handicap updates)."
          yLabel="Hcp"
        />
      </div>
    </section>
  );
}
