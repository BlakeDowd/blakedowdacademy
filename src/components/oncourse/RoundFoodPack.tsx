"use client";

import { Check, RotateCcw, ShoppingBag } from "lucide-react";
import { useStoredChecklist } from "@/lib/useStoredChecklist";
import type { PerformanceFuelMetrics } from "@/lib/performanceFuelPlanner";

type Segment = "front" | "turn" | "back" | "drinks" | "backup";

type PackItem = {
  id: string;
  name: string;
  detail: string;
  segment: Segment;
  carbsG: number;
};

const SEGMENTS: { id: Segment; title: string; when: string }[] = [
  { id: "front", title: "Front 9", when: "Holes 1–8" },
  { id: "turn", title: "The turn", when: "Holes 9–10" },
  { id: "back", title: "Back 9", when: "Holes 11–18" },
  { id: "drinks", title: "Drinks", when: "Every hole" },
  { id: "backup", title: "Backup", when: "Stays in the bag" },
];

/** Added in this order until the food plus sports drinks covers the round's carb target. */
const FOODS: readonly PackItem[] = [
  { id: "banana", name: "Ripe banana", detail: "Holes 3–4. Easy on the stomach, steady energy.", segment: "front", carbsG: 25 },
  { id: "jam-sandwich", name: "Jam or honey sandwich on white bread", detail: "At the turn: your biggest carb hit of the round.", segment: "turn", carbsG: 45 },
  { id: "jelly-babies", name: "5 Allen's Jelly Babies", detail: "Holes 13–15, quick sugar when focus starts to fade.", segment: "back", carbsG: 22 },
  { id: "muesli-bar", name: "Uncle Tobys chewy muesli bar", detail: "Holes 6–7.", segment: "front", carbsG: 19 },
  { id: "pretzels", name: "Salted pretzels or rice crackers (30 g)", detail: "Holes 11–12. The salt helps on hot days.", segment: "back", carbsG: 22 },
  { id: "gel", name: "Sports gel (e.g. Koda)", detail: "Holes 15–16 for the closing stretch. Take it with water.", segment: "back", carbsG: 25 },
  { id: "dried-fruit", name: "Dried mango or sultanas (30 g)", detail: "Holes 1–2 if breakfast was early.", segment: "front", carbsG: 20 },
];

const PROTEIN: PackItem = {
  id: "protein",
  name: "Small handful of almonds or beef jerky",
  detail: "With your sandwich. Protein and fat keep hunger away for the back 9.",
  segment: "turn",
  carbsG: 3,
};

const BACKUP: PackItem = {
  id: "backup",
  name: "Spare gel or bag of Jelly Babies",
  detail: "For slow play, a playoff, or if you're feeling flat. Don't count it in your plan.",
  segment: "backup",
  carbsG: 0,
};

const SPORTS_DRINK_L = 0.6;
const SPORTS_DRINK_CARBS_G = 36;

export function buildRoundFoodPack(metrics: PerformanceFuelMetrics, tempC: number) {
  const targetCarbsG = metrics.totalOnCourseCarbsG;
  const fluidL = metrics.totalOnCourseFluidL;

  // About half the round's fluid as sports drink (alternate with water every second hole).
  const sportsDrinks = Math.max(1, Math.round(fluidL / 2 / SPORTS_DRINK_L));
  const drinkCarbsG = sportsDrinks * SPORTS_DRINK_CARBS_G;
  const waterL = Math.max(0.5, Math.round((fluidL - sportsDrinks * SPORTS_DRINK_L) * 10) / 10);
  const electrolyteTabs = tempC > 30 ? 3 : tempC > 25 ? 2 : 1;

  const foods: PackItem[] = [PROTEIN];
  let foodCarbsG = PROTEIN.carbsG;
  for (const food of FOODS) {
    if (foods.length > 1 && foodCarbsG + drinkCarbsG >= targetCarbsG * 0.95) break;
    foods.push(food);
    foodCarbsG += food.carbsG;
  }

  const drinks: PackItem[] = [
    {
      id: "sports-drink",
      name: `${sportsDrinks} × 600 ml sports drink (Gatorade/Powerade)`,
      detail: "Alternate sips with water every second hole.",
      segment: "drinks",
      carbsG: drinkCarbsG,
    },
    {
      id: "water",
      name: `${waterL} L of water`,
      detail: "Fill up at the course taps on the way round.",
      segment: "drinks",
      carbsG: 0,
    },
    {
      id: "electrolytes",
      name: `${electrolyteTabs} electrolyte tablet${electrolyteTabs > 1 ? "s" : ""} (e.g. Hydralyte or Musashi)`,
      detail: tempC > 25 ? "Dissolve in your water. Hot days need the extra salt." : "Dissolve in your water to replace salt lost in sweat.",
      segment: "drinks",
      carbsG: 0,
    },
  ];

  const items = [...foods.slice(1), PROTEIN, ...drinks, BACKUP];
  return { items, targetCarbsG, packedCarbsG: foodCarbsG + drinkCarbsG, fluidL };
}

const STORAGE_KEY = "oncourse_round_food_pack";

export function RoundFoodPack({
  metrics,
  tempC,
  perRound = false,
}: {
  metrics: PerformanceFuelMetrics;
  tempC: number;
  /** Tournament mode: the same pack goes in the bag every morning. */
  perRound?: boolean;
}) {
  const { items, targetCarbsG, packedCarbsG, fluidL } = buildRoundFoodPack(metrics, tempC);
  const { checked, toggle, clear } = useStoredChecklist(STORAGE_KEY);
  const done = items.filter((i) => checked.has(i.id)).length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
          <div>
            <p className="text-sm font-bold text-gray-900">{perRound ? "Pack for each round" : "Pack for the round"}</p>
            <p className="text-xs text-gray-500">
              {packedCarbsG} g carbs (target {targetCarbsG} g) · {fluidL} L fluids
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={clear}
          disabled={done === 0}
          className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Clear
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {SEGMENTS.map((segment) => {
          const segmentItems = items.filter((i) => i.segment === segment.id);
          if (segmentItems.length === 0) return null;
          return (
            <div key={segment.id}>
              <p className="mb-1.5 flex items-baseline gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {segment.title}
                <span className="font-medium normal-case tracking-normal text-gray-400">{segment.when}</span>
              </p>
              <ul className="space-y-1.5">
                {segmentItems.map((item) => {
                  const isChecked = checked.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isChecked}
                        onClick={() => toggle(item.id)}
                        className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          isChecked ? "border-green-100 bg-green-50/60" : "border-gray-100 bg-gray-50/60 hover:border-gray-200"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                            isChecked ? "border-[#014421] bg-[#014421] text-white" : "border-gray-300 bg-white"
                          }`}
                          aria-hidden
                        >
                          {isChecked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                        <span className={`min-w-0 flex-1 ${isChecked ? "opacity-60" : ""}`}>
                          <span className={`block text-sm font-semibold text-gray-900 ${isChecked ? "line-through decoration-gray-400" : ""}`}>
                            {item.name}
                          </span>
                          <span className="block text-xs leading-snug text-gray-500">{item.detail}</span>
                        </span>
                        {item.carbsG >= 10 && (
                          <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-950">
                            {item.carbsG} g
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-snug text-gray-400">
        Carb counts are approximate. Eat a little every few holes rather than all at once, and test new foods at practice, not in a
        tournament.
      </p>
    </section>
  );
}
