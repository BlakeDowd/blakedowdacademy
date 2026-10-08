"use client";

export type Finish = "holed" | "short" | "long" | "left" | "right";

export const FINISH_LABEL: Record<Finish, string> = {
  holed: "Holed",
  short: "Short",
  long: "Long",
  left: "Left",
  right: "Right",
};

const FINISH_CELLS: { key: Finish; hint: string; area: string }[] = [
  { key: "long", hint: "Past the hole", area: "col-start-2 row-start-1" },
  { key: "left", hint: "Missed left", area: "col-start-1 row-start-2" },
  { key: "holed", hint: "In the cup", area: "col-start-2 row-start-2" },
  { key: "right", hint: "Missed right", area: "col-start-3 row-start-2" },
  { key: "short", hint: "Didn't get there", area: "col-start-2 row-start-3" },
];

/** Bird's-eye cross around the hole: tap the side the ball finished on, or the hole itself. */
export function FinishPicker({
  value,
  onChange,
  caption,
}: {
  value: Finish | null;
  onChange: (f: Finish) => void;
  caption: string;
}) {
  return (
    <div className="rounded-3xl bg-gradient-to-b from-[#2f8f4e] to-[#14592c] p-3 shadow-inner">
      <div className="grid grid-cols-3 grid-rows-3 gap-2">
        {FINISH_CELLS.map((c) => {
          const active = value === c.key;
          const holed = c.key === "holed";
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onChange(c.key)}
              aria-pressed={active}
              className={`${c.area} flex min-h-[64px] flex-col items-center justify-center rounded-2xl px-1 py-2 text-center transition-all active:scale-[0.97] ${
                active
                  ? holed
                    ? "bg-[#FFA500] text-white"
                    : "bg-white text-[#014421]"
                  : holed
                    ? "bg-[#0b2e18] text-white ring-2 ring-white/40"
                    : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              <span className="text-sm font-bold">{FINISH_LABEL[c.key]}</span>
              <span className={`text-[10px] ${active && !holed ? "text-[#014421]/70" : "text-white/70"}`}>{c.hint}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[10px] text-white/60">{caption}</p>
    </div>
  );
}

/** Same cross as the picker, showing how many shots finished on each side. */
export function FinishMap({ counts, flagged }: { counts: Record<Finish, number>; flagged: (Finish | null)[] }) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
      {FINISH_CELLS.map((c) => {
        const count = counts[c.key];
        const tone =
          count === 0
            ? "bg-gray-50 text-gray-300"
            : c.key === "holed"
              ? "bg-[#014421] text-white"
              : flagged.includes(c.key)
                ? "bg-orange-100 text-orange-800"
                : "bg-[#014421]/10 text-[#014421]";
        return (
          <div key={c.key} className={`${c.area} rounded-xl px-1 py-2 text-center ${tone}`}>
            <p className="text-lg font-extrabold tabular-nums leading-tight">{count}</p>
            <p className="text-[10px] font-semibold">{FINISH_LABEL[c.key]}</p>
          </div>
        );
      })}
    </div>
  );
}
