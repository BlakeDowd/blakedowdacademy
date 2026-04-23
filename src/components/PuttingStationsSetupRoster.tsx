"use client";

type HoleRow = { distance: number; shape: string };

/**
 * Full run order for 9-/18-hole putting combines so players can set every station (tape / apps)
 * before switching to logging make/miss on hole 1.
 */
export function PuttingStationsSetupRoster({
  holes,
  shapeLabel,
  subtitle,
}: {
  holes: readonly HoleRow[];
  shapeLabel: (shape: string) => string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
      <p className="text-sm font-semibold text-gray-900">
        Full station list — set up each putt first
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600">
        {subtitle ??
          "Lay out balls in this order so you can measure distances and breaks with your app once, then come back here to log hole 1."}
      </p>
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-amber-100/90 bg-white/90 px-3 py-2 text-sm">
        {holes.map((h, i) => (
          <li
            key={`${i}-${h.distance}-${h.shape}`}
            className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-2 last:border-b-0"
          >
            <span className="shrink-0 font-semibold tabular-nums text-gray-500">Hole {i + 1}</span>
            <span className="min-w-0 text-right font-medium text-gray-900">
              {h.distance} ft · {shapeLabel(h.shape)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
