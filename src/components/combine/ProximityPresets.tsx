"use client";

/** Soft proximity bands so players aren't punished for measurement noise. */
export const PROXIMITY_PRESETS: { label: string; hint: string; cm: number }[] = [
  { label: "Holed", hint: "In the cup", cm: 0 },
  { label: "Stick", hint: "~1 club", cm: 45 },
  { label: "Inside 6 ft", hint: "~1.5 m", cm: 140 },
  { label: "Safety", hint: "~2.5 m", cm: 240 },
  { label: "Miss", hint: "3 m+", cm: 320 },
];

type Props = {
  valueCm: number | null;
  onSelect: (cm: number) => void;
  className?: string;
};

/** Quick proximity chips for chipping / bunker combines. */
export function ProximityPresets({ valueCm, onSelect, className = "" }: Props) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`.trim()}>
      {PROXIMITY_PRESETS.map((p) => {
        const active =
          valueCm != null &&
          ((p.cm === 0 && valueCm === 0) ||
            (p.cm === 45 && valueCm > 0 && valueCm <= 90) ||
            (p.cm === 140 && valueCm > 90 && valueCm <= 183) ||
            (p.cm === 240 && valueCm > 183 && valueCm <= 299) ||
            (p.cm === 320 && valueCm > 299));
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onSelect(p.cm)}
            className={`rounded-lg border px-2.5 py-1.5 text-left transition ${
              active
                ? "border-[#014421] bg-[#014421] text-white"
                : "border-stone-200 bg-white text-stone-800 hover:border-[#014421]/40"
            }`}
          >
            <span className="block text-[11px] font-bold leading-tight">{p.label}</span>
            <span className={`block text-[9px] ${active ? "text-white/70" : "text-stone-400"}`}>
              {p.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
