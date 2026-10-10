"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { InfoBubble } from "@/components/InfoBubble";

const ROW = "flex min-h-[3.25rem] items-center justify-between gap-3 py-1.5";
const STEP_BTN =
  "flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition hover:bg-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-30";

function RowLabel({ label, info, dot }: { label: string; info?: ReactNode; dot?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {dot ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden /> : null}
      <span className="text-[15px] font-medium text-stone-800">{label}</span>
      {info ? (
        <InfoBubble
          content={info}
          buttonClassName="flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-stone-200 bg-stone-50 text-[9px] font-bold text-stone-400"
          tooltipClassName="-left-16 bottom-full mb-2 w-56 max-w-[14rem]"
        />
      ) : null}
    </div>
  );
}

/** One stat row with a − / + stepper. */
export function RoundStatCounter({
  label,
  value,
  onChange,
  max,
  info,
  dot,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  max?: number;
  info?: ReactNode;
  dot?: string;
}) {
  const atMax = max !== undefined && value >= max;
  return (
    <div className={ROW}>
      <RowLabel label={label} info={info} dot={dot} />
      <div className="flex shrink-0 items-center rounded-full bg-stone-100 p-0.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          className={STEP_BTN}
          aria-label={`Less ${label}`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span
          className={`w-9 text-center text-lg font-semibold tabular-nums ${
            value > 0 ? "text-[#014421]" : "text-stone-400"
          }`}
        >
          {value}
        </span>
        <button
          type="button"
          onClick={() => !atMax && onChange(value + 1)}
          disabled={atMax}
          className={STEP_BTN}
          aria-label={`More ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** One stat row with a typed number, for values like gross score or putts per GIR. */
export function RoundStatNumberField({
  label,
  text,
  onTextChange,
  placeholder = "–",
  info,
  decimal = false,
}: {
  label: string;
  text: string;
  onTextChange: (raw: string) => void;
  placeholder?: string;
  info?: ReactNode;
  decimal?: boolean;
}) {
  return (
    <div className={ROW}>
      <RowLabel label={label} info={info} />
      <input
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        aria-label={label}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={placeholder}
        className="w-[5.5rem] shrink-0 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-right text-lg font-semibold tabular-nums text-[#014421] placeholder:text-stone-300 focus:border-[#014421] focus:bg-white focus:outline-none"
      />
    </div>
  );
}

/** Read-only row for a worked-out value such as nett. */
export function RoundStatReadout({ label, value, info }: { label: string; value: string | null; info?: ReactNode }) {
  return (
    <div className={ROW}>
      <RowLabel label={label} info={info} />
      <span className="w-[5.5rem] shrink-0 px-3 text-right text-lg font-semibold tabular-nums text-stone-500">
        {value ?? "–"}
      </span>
    </div>
  );
}

/** Calculated results under a group, e.g. "FIR 57%". */
export function RoundCalcLine({ items }: { items: { label: string; value: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className="mt-1 grid gap-2 rounded-xl bg-stone-50 px-2 py-2.5"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((i) => (
        <div key={i.label} className="text-center">
          <p className={`text-base font-bold tabular-nums ${i.value ? "text-[#014421]" : "text-stone-300"}`}>
            {i.value ?? "–"}
          </p>
          <p className="text-[11px] font-medium text-stone-500">{i.label}</p>
        </div>
      ))}
    </div>
  );
}
