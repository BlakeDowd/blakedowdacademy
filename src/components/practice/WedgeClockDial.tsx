"use client";

import {
  CHART_CLOCKS,
  chartDistance,
  clockHoursToSvgDegrees,
  clockLabelToHours,
  type WedgeClockChart,
} from "@/lib/wedgeClockChart";
import type { DistanceUnit } from "@/lib/wedgeClockLog";

type Props = {
  club: string;
  selectedClock: string;
  chart: WedgeClockChart;
  unit: DistanceUnit;
  measuredHours?: number | null;
  onSelectClock: (clock: string) => void;
};

function polar(cx: number, cy: number, r: number, svgDeg: number) {
  const rad = ((svgDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function LeadArmOnly({
  sx,
  sy,
  degrees,
  skin,
  glove,
  opacity,
}: {
  sx: number;
  sy: number;
  degrees: number;
  skin: string;
  glove: string;
  opacity: number;
}) {
  return (
    <g transform={`rotate(${degrees} ${sx} ${sy})`} opacity={opacity}>
      <line
        x1={sx}
        y1={sy}
        x2={sx}
        y2={sy - 34}
        stroke={skin}
        strokeWidth={12}
        strokeLinecap="round"
      />
      <circle cx={sx} cy={sy - 34} r={6.5} fill={skin} />
      <line
        x1={sx}
        y1={sy - 34}
        x2={sx}
        y2={sy - 58}
        stroke={skin}
        strokeWidth={10}
        strokeLinecap="round"
      />
      <circle cx={sx} cy={sy - 58} r={5} fill={skin} />
      <line
        x1={sx}
        y1={sy - 54}
        x2={sx}
        y2={sy - 80}
        stroke="#57534e"
        strokeWidth={2.75}
        strokeLinecap="round"
      />
      <rect x={sx - 6.5} y={sy - 68} width={13} height={11} rx={4.5} fill={glove} />
      <circle cx={sx} cy={sy - 68} r={6} fill={glove} />
    </g>
  );
}

/** Cropped golfer: head + shoulder + torso stub; only lead arm points. */
function GolferShoulder({
  sx,
  sy,
  degrees,
  measuredDegrees,
}: {
  sx: number;
  sy: number;
  degrees: number;
  measuredDegrees: number | null;
}) {
  const skin = "#d4a574";
  const shirt = "#014421";
  const glove = "#292524";

  return (
    <g>
      {/* Short torso stub — clipped by zoom */}
      <path
        d={`M ${sx - 2} ${sy + 4}
            Q ${sx - 4} ${sy + 22} ${sx + 4} ${sy + 36}
            L ${sx + 16} ${sy + 34}
            Q ${sx + 18} ${sy + 18} ${sx + 12} ${sy + 4}
            Z`}
        fill={shirt}
      />

      {/* Neck — short, head sits closer to shoulder */}
      <line
        x1={sx + 3}
        y1={sy + 2}
        x2={sx + 4}
        y2={sy - 4}
        stroke={skin}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <circle cx={sx + 4} cy={sy - 10} r={8.5} fill={skin} />
      <path
        d={`M ${sx - 3.5} ${sy - 12}
            A 8.5 8.5 0 0 1 ${sx + 11.5} ${sy - 12}
            Q ${sx + 4} ${sy - 21} ${sx - 3.5} ${sy - 12}
            Z`}
        fill="#014421"
      />

      {measuredDegrees != null && (
        <LeadArmOnly
          sx={sx}
          sy={sy}
          degrees={measuredDegrees}
          skin="#F0B84A"
          glove="#9a3412"
          opacity={0.45}
        />
      )}
      <LeadArmOnly sx={sx} sy={sy} degrees={degrees} skin={skin} glove={glove} opacity={1} />

      <circle cx={sx} cy={sy} r={8} fill={shirt} />
      <circle cx={sx} cy={sy} r={3.5} fill="#FFA500" />
    </g>
  );
}

export default function WedgeClockDial({
  club,
  selectedClock,
  chart,
  unit,
  measuredHours = null,
  onSelectClock,
}: Props) {
  // Hub (shoulder) a touch lower-left in the zoom frame
  const sx = 152;
  const sy = 168;
  const dialR = 132;
  const labelR = 108;

  const selectedHours = clockLabelToHours(selectedClock) ?? 9;
  const selectedDeg = clockHoursToSvgDegrees(selectedHours);
  const measuredDeg =
    measuredHours != null && Number.isFinite(measuredHours)
      ? clockHoursToSvgDegrees(measuredHours)
      : null;

  // Tight 9–12 zoom (same as before full golfer)
  const viewX = 8;
  const viewY = 8;
  const viewW = 198;
  const viewH = 198;

  return (
    <div className="relative mx-auto w-full max-w-[360px]">
      <svg
        viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`Wedge clock for ${club}, selected ${selectedClock}`}
      >
        <defs>
          <radialGradient id="wedgeDialFace" cx="62%" cy="62%" r="70%">
            <stop offset="0%" stopColor="#fafaf9" />
            <stop offset="100%" stopColor="#e7e5e4" />
          </radialGradient>
          <clipPath id="wedgeDialZoom">
            <rect x={viewX} y={viewY} width={viewW} height={viewH} />
          </clipPath>
        </defs>

        <g clipPath="url(#wedgeDialZoom)">
          <circle cx={sx} cy={sy} r={dialR + 18} fill="#014421" opacity={0.07} />
          <circle
            cx={sx}
            cy={sy}
            r={dialR}
            fill="url(#wedgeDialFace)"
            stroke="#d6d3d1"
            strokeWidth={2.5}
          />

          {Array.from({ length: 12 }, (_, i) => {
            const hour = i === 0 ? 12 : i;
            const deg = clockHoursToSvgDegrees(hour === 12 ? 0 : hour);
            const outer = polar(sx, sy, dialR - 4, deg);
            const inner = polar(sx, sy, dialR - (hour % 3 === 0 ? 20 : 12), deg);
            const inArc = hour === 12 || (hour >= 9 && hour <= 11);
            return (
              <line
                key={`tick-${hour}`}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke={inArc ? "#014421" : "#a8a29e"}
                strokeWidth={hour % 3 === 0 ? 3 : 1.5}
                strokeLinecap="round"
                opacity={inArc ? 1 : 0.25}
              />
            );
          })}

          <path
            d={describeArc(sx, sy, dialR - 26, clockHoursToSvgDegrees(9), clockHoursToSvgDegrees(0))}
            fill="none"
            stroke="#FFA500"
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.45}
          />

          <GolferShoulder
            sx={sx}
            sy={sy}
            degrees={selectedDeg}
            measuredDegrees={measuredDeg}
          />

          {CHART_CLOCKS.map((label) => {
            const hours = clockLabelToHours(label);
            if (hours == null) return null;
            const deg = clockHoursToSvgDegrees(hours);
            const p = polar(sx, sy, labelR, deg);
            const selected = label === selectedClock;
            const short = label.endsWith(":00") ? label.slice(0, -3) : label;
            return (
              <g key={label} className="cursor-pointer" onClick={() => onSelectClock(label)}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={selected ? 20 : 16}
                  fill={selected ? "#014421" : "#fff"}
                  stroke={selected ? "#014421" : "#d6d3d1"}
                  strokeWidth={selected ? 2.5 : 1.5}
                />
                <text
                  x={p.x}
                  y={p.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none"
                  fill={selected ? "#fff" : "#1c1917"}
                  fontSize={selected ? 13 : 12}
                  fontWeight={700}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {short}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Distances off the dial — easy to scan */}
      <div className="mt-3 overflow-hidden rounded-xl bg-white ring-1 ring-stone-200">
        <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
          <p className="text-xs font-semibold text-stone-800">{club} distances</p>
          <p className="text-[11px] font-medium text-stone-500">{unit}</p>
        </div>
        <div className="divide-y divide-stone-100">
          {CHART_CLOCKS.map((label) => {
            const dist = chartDistance(chart, club, label);
            const selected = label === selectedClock;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onSelectClock(label)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition ${
                  selected ? "bg-[#014421]/8" : "hover:bg-stone-50"
                }`}
              >
                <span
                  className={`min-w-[3.25rem] text-sm font-bold tabular-nums ${
                    selected ? "text-[#014421]" : "text-stone-700"
                  }`}
                >
                  {label}
                </span>
                <span
                  className={`text-base font-semibold tabular-nums ${
                    dist != null ? "text-stone-900" : "text-stone-300"
                  }`}
                >
                  {dist != null ? dist : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  let end = endDeg;
  if (end <= startDeg) end += 360;
  const start = polar(cx, cy, r, startDeg);
  const finish = polar(cx, cy, r, end % 360);
  const large = end - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${finish.x} ${finish.y}`;
}
