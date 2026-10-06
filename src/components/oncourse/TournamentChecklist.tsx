"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useStoredChecklist } from "@/lib/useStoredChecklist";
import {
  Check,
  CloudRain,
  Crosshair,
  Droplets,
  HeartPulse,
  RotateCcw,
  Scale,
  ShieldAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export type ChecklistCategory = "rules" | "strategy" | "weather" | "nutrition" | "medical";

export type ChecklistItem = {
  id: string;
  category: ChecklistCategory;
  question: string;
  detail?: string;
  critical?: boolean;
};

export const CHECKLIST_CATEGORIES: { id: ChecklistCategory; label: string; title: string; icon: LucideIcon }[] = [
  { id: "rules", label: "Rules & Clubs", title: "Rules & Equipment", icon: Scale },
  { id: "strategy", label: "Tech & Strategy", title: "Tech & Strategy", icon: Crosshair },
  { id: "weather", label: "Weather", title: "Weather & Protection", icon: CloudRain },
  { id: "nutrition", label: "Nutrition", title: "Hydration & Nutrition", icon: Droplets },
  { id: "medical", label: "Care", title: "Care & Emergency", icon: HeartPulse },
];

export const TOURNAMENT_CHECKLIST: readonly ChecklistItem[] = [
  {
    id: "club-count",
    category: "rules",
    question: "Are there exactly 14 clubs (or fewer) in your bag?",
    detail: "Rule 4.1b: carrying 15+ clubs is a 2-stroke penalty for each hole where the breach happened, up to 4 strokes per round.",
    critical: true,
  },
  {
    id: "balls",
    category: "rules",
    question: "Are all tournament balls conforming and distinctly marked?",
    detail: "Pack 6–9 balls. Same brand and model if the One-Ball Rule (Model Local Rule G-4) is in effect. Mark each with a distinct Sharpie pattern.",
  },
  {
    id: "grooves-grips",
    category: "rules",
    question: "Are clubface grooves and grips clean and dry?",
    detail: "Clean grooves give predictable spin and launch.",
  },
  {
    id: "markers-tees",
    category: "rules",
    question: "Do you have flat ball markers, a pitch repair tool and extra tees?",
    detail: "A flat coin marker stays out of your playing partner's putting line.",
  },
  {
    id: "gloves",
    category: "rules",
    question: "Are 2–3 dry gloves and 1 pair of rain gloves packed?",
    detail: "Wet-weather gloves ready in case the grips get slippery.",
  },
  {
    id: "rangefinder",
    category: "strategy",
    question: "Is your rangefinder/GPS charged with SLOPE turned OFF?",
    detail: "Rule 4.3: measuring elevation changes during a round is a breach. 2-stroke penalty the first time, disqualification the second.",
    critical: true,
  },
  {
    id: "scorecard",
    category: "strategy",
    question: "Do you have a stiff scorecard holder and 2 pencils/pens?",
    detail: "Firm backing keeps the card readable in wind and rain.",
  },
  {
    id: "pin-sheet",
    category: "strategy",
    question: "Did you review the pin sheet and competition local rules?",
    detail: "Check drop zones, out-of-bounds boundaries and any preferred-lies rules.",
  },
  { id: "rain-gear", category: "weather", question: "Are a rain jacket, rain pants and tour umbrella in the bag?" },
  { id: "towels", category: "weather", question: "Do you have 2 towels (1 wet/dirt, 1 bone-dry in a plastic pocket)?" },
  { id: "sun-bugs", category: "weather", question: "Are sunscreen, lip balm and insect repellent packed?" },
  {
    id: "water",
    category: "nutrition",
    question: "Do you have 1.0–1.5 L of water with electrolytes ready?",
    detail: "Start sipping early, before you feel thirsty.",
  },
  {
    id: "snacks",
    category: "nutrition",
    question: "Are slow-burn snacks packed (nuts, bananas, jerky)?",
    detail: "Skip sugary foods that lead to a mid-round crash.",
  },
  { id: "blisters", category: "medical", question: "Do you have blister plasters and athletic tape handy?" },
  { id: "meds", category: "medical", question: "Are allergy tablets, eye drops or pain relievers packed?" },
];

const STORAGE_KEY = "oncourse_tournament_checklist";

type Filter = "all" | ChecklistCategory;

function ChecklistCard({ item, checked, onToggle }: { item: ChecklistItem; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition-colors ${
        checked ? "border-green-100 bg-green-50/60" : "border-gray-100 bg-white hover:border-gray-200"
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          checked ? "border-[#014421] bg-[#014421] text-white" : "border-gray-300 bg-white"
        }`}
        aria-hidden
      >
        {checked && <Check className="h-4 w-4" strokeWidth={3} />}
      </span>
      <span className={`min-w-0 flex-1 transition-opacity ${checked ? "opacity-60" : ""}`}>
        {item.critical && (
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <ShieldAlert className="h-3 w-3" aria-hidden />
            Rule alert
          </span>
        )}
        <span className={`block text-sm font-semibold text-gray-900 ${checked ? "line-through decoration-gray-400" : ""}`}>
          {item.question}
        </span>
        {item.detail && (
          <span className={`mt-1 block text-xs leading-relaxed ${item.critical && !checked ? "text-red-700" : "text-gray-500"}`}>
            {item.detail}
          </span>
        )}
      </span>
    </button>
  );
}

export function TournamentChecklist({ hideHeader = false }: { hideHeader?: boolean }) {
  const { checked, toggle, clear } = useStoredChecklist(STORAGE_KEY);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmReset, setConfirmReset] = useState(false);

  const total = TOURNAMENT_CHECKLIST.length;
  const done = TOURNAMENT_CHECKLIST.filter((i) => checked.has(i.id)).length;
  const percent = Math.round((done / total) * 100);
  const ready = done === total;

  const sections = CHECKLIST_CATEGORIES.filter((c) => filter === "all" || c.id === filter).map((c) => ({
    ...c,
    items: TOURNAMENT_CHECKLIST.filter((i) => i.category === c.id),
  }));

  const pills: { id: Filter; label: string; done: number; total: number }[] = [
    { id: "all", label: "All", done, total },
    ...CHECKLIST_CATEGORIES.map((c) => {
      const items = TOURNAMENT_CHECKLIST.filter((i) => i.category === c.id);
      return { id: c.id, label: c.label, done: items.filter((i) => checked.has(i.id)).length, total: items.length };
    }),
  ];

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {!hideHeader && <h2 className="truncate text-lg font-bold text-gray-900">Tournament Bag Prep</h2>}
          <span className="shrink-0 rounded-full bg-[#014421]/10 px-2.5 py-1 text-[11px] font-bold text-[#014421]">On-Course</span>
        </div>
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          disabled={done === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset
        </button>
      </div>

      <section
        className={`rounded-2xl border p-4 shadow-sm transition-colors ${
          ready ? "border-[#014421] bg-[#014421] text-white" : "border-gray-100 bg-white"
        }`}
        aria-live="polite"
      >
        {ready && (
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFA500]">
              <Trophy className="h-4 w-4 text-white" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-extrabold uppercase tracking-wide">Round Ready</p>
              <p className="text-xs text-white/80">Bag packed and rules checked. Go play.</p>
            </div>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-sm font-semibold ${ready ? "text-white" : "text-gray-900"}`}>
            {done} / {total} Completed
          </p>
          <p className={`text-2xl font-extrabold tabular-nums ${ready ? "text-white" : "text-[#014421]"}`}>{percent}%</p>
        </div>
        <div className={`mt-2 h-2.5 overflow-hidden rounded-full ${ready ? "bg-white/25" : "bg-gray-100"}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${ready ? "bg-[#FFA500]" : "bg-[#014421]"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </section>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Checklist categories">
        {pills.map((p) => {
          const active = filter === p.id;
          const complete = p.done === p.total;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(p.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                active ? "bg-[#014421] text-white shadow-sm" : "border border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              {p.label}
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                  active ? "bg-white/20 text-white" : complete ? "bg-green-100 text-[#014421]" : "bg-gray-100 text-gray-500"
                }`}
              >
                {p.done}/{p.total}
              </span>
            </button>
          );
        })}
      </div>

      {sections.map((s) => {
        const Icon = s.icon;
        return (
          <section key={s.id} className="space-y-2">
            <h3 className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wide text-gray-500">
              <Icon className="h-4 w-4 text-[#014421]" aria-hidden />
              {s.title}
            </h3>
            {s.items.map((item) => (
              <ChecklistCard key={item.id} item={item} checked={checked.has(item.id)} onToggle={() => toggle(item.id)} />
            ))}
          </section>
        );
      })}

      <p className="px-1 text-[11px] text-gray-400">Your ticks are saved on this device, so you won&apos;t lose them if you close the app.</p>

      {confirmReset &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setConfirmReset(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reset-checklist-title"
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="reset-checklist-title" className="text-lg font-bold text-gray-900">
                Reset checklist?
              </h3>
              <p className="mt-1 text-sm text-gray-600">This clears all {done} ticks so you can start fresh for your next event.</p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clear();
                    setConfirmReset(false);
                    setFilter("all");
                  }}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default TournamentChecklist;
