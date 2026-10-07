"use client";

import type { CountLight } from "@/lib/tempoSound";

const LIGHTS: { id: CountLight; on: string; label: string }[] = [
  { id: "red", on: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]", label: "Ready" },
  { id: "amber", on: "bg-[#FFA500] shadow-[0_0_8px_rgba(255,165,0,0.8)]", label: "Set" },
  { id: "green", on: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]", label: "Go" },
];

const SIZES = {
  sm: { light: "h-3.5 w-3.5", text: "text-[8px]", gap: "gap-1", pad: "px-1.5 py-1" },
  md: { light: "h-5 w-5", text: "text-[8px]", gap: "gap-1.5", pad: "px-2 py-1" },
  lg: { light: "h-8 w-8", text: "text-[10px]", gap: "gap-2", pad: "px-3 py-1.5" },
} as const;

export function CountInToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
      <span>
        <span className="block text-xs font-semibold text-gray-800">Count-in lights</span>
        <span className="block text-[11px] text-gray-500">Red, amber, then go on green with the beat</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[#014421]" : "bg-gray-300"}`}
      >
        <span
          className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`}
        />
        <span className="sr-only">Count-in lights</span>
      </button>
    </label>
  );
}

/** Traffic-light count-in: red and amber on the lead-in beats, green on the takeaway. */
export function CountInLights({ light, size = "md" }: { light: CountLight | null; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <div className={`inline-flex items-center rounded-full bg-gray-900 ${s.gap} ${s.pad}`} aria-hidden>
      {LIGHTS.map((l) => (
        <span key={l.id} className="flex flex-col items-center gap-0.5">
          <span
            className={`block rounded-full transition-colors duration-75 ${s.light} ${light === l.id ? l.on : "bg-gray-700"}`}
          />
          <span className={`font-bold uppercase leading-none ${s.text} ${light === l.id ? "text-white" : "text-gray-500"}`}>
            {l.label}
          </span>
        </span>
      ))}
    </div>
  );
}
