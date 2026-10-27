"use client";

import {
  FINGER_MISS_OPTIONS,
  fingerMissLabel,
  offlineMetresFromFingers,
  type FingerMissDirection,
  type FingerMissWidth,
} from "@/lib/fingerMissGeometry";

export function FingerMissInput({
  distanceM,
  unitLabel,
  toDisplay,
  direction,
  fingers,
  onDirectionChange,
  onFingersChange,
}: {
  distanceM: number;
  unitLabel: string;
  toDisplay: (m: number) => number;
  direction: FingerMissDirection | null;
  fingers: FingerMissWidth | null;
  onDirectionChange: (d: FingerMissDirection) => void;
  onFingersChange: (f: FingerMissWidth | null) => void;
}) {
  const offlinePreview =
    direction != null && (direction === "straight" || fingers != null)
      ? offlineMetresFromFingers(distanceM, direction, direction === "straight" ? 0 : fingers!)
      : null;

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold text-stone-700">Miss side (fingers at arm&apos;s length)</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: "left" as const, label: "Left" },
              { id: "straight" as const, label: "On line" },
              { id: "right" as const, label: "Right" },
            ] as const
          ).map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                onDirectionChange(d.id);
                onFingersChange(d.id === "straight" ? 0 : null);
              }}
              aria-pressed={direction === d.id}
              className={`rounded-xl py-2.5 text-sm font-bold transition ${
                direction === d.id ? "bg-[#014421] text-white" : "bg-white text-stone-800 ring-1 ring-stone-200"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {direction != null && direction !== "straight" && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-stone-700">How many fingers offline?</p>
          <div className="grid grid-cols-5 gap-1.5">
            {FINGER_MISS_OPTIONS.map((f) => {
              const active = fingers === f;
              return (
                <button
                  key={String(f)}
                  type="button"
                  onClick={() => onFingersChange(f)}
                  aria-pressed={active}
                  className={`rounded-xl py-2.5 text-sm font-bold tabular-nums transition ${
                    active
                      ? f === "outside"
                        ? "bg-red-500 text-white"
                        : "bg-[#014421] text-white"
                      : "bg-white text-stone-800 ring-1 ring-stone-200"
                  }`}
                >
                  {fingerMissLabel(f)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {offlinePreview != null && offlinePreview !== 0 && (
        <p className="text-center text-xs font-semibold text-stone-600">
          ≈ {toDisplay(Math.abs(offlinePreview))}
          {unitLabel} {offlinePreview > 0 ? "right" : "left"} of aim
        </p>
      )}
      {direction === "straight" && (
        <p className="text-center text-xs font-semibold text-stone-600">On line — finishes on your aim mark</p>
      )}
    </div>
  );
}

export function fingerMissReady(
  direction: FingerMissDirection | null,
  fingers: FingerMissWidth | null,
): boolean {
  if (!direction) return false;
  if (direction === "straight") return true;
  return fingers != null && fingers !== 0;
}
