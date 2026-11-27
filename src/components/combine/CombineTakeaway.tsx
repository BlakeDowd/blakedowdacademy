"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Lightbulb, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  officialDrillByCode,
  rememberRecommendedDrills,
  suggestDrillsForTheme,
  themeFromFocusTitle,
  type CombineFocusTheme,
  type SuggestedDrill,
} from "@/lib/combineDrillSuggestions";
import { addDrillToWeeklyPlanToday } from "@/lib/addDrillToWeeklyPlan";

type Props = {
  title: string;
  lines: string[];
  /** Prefer a stable theme; falls back to parsing the title. */
  theme?: CombineFocusTheme;
  className?: string;
};

/** Insight + suggested drills shown under combine results. */
export function CombineTakeaway({ title, lines, theme, className = "" }: Props) {
  const { user } = useAuth();
  const resolvedTheme = theme ?? themeFromFocusTitle(title);
  const drills = suggestDrillsForTheme(resolvedTheme, 2);
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    rememberRecommendedDrills(drills);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remember once per theme
  }, [resolvedTheme]);

  const onAdd = async (d: SuggestedDrill) => {
    if (added[d.drillId] || busy) return;
    setBusy(d.drillId);
    const row = officialDrillByCode(d.drillId);
    if (!row) {
      setBusy(null);
      return;
    }
    const result = await addDrillToWeeklyPlanToday(row, user?.id);
    setBusy(null);
    if (result.ok) setAdded((prev) => ({ ...prev, [d.drillId]: true }));
  };

  const isPerfect = resolvedTheme === "perfect";

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm ${className}`.trim()}
    >
      <div className={`px-4 py-3.5 ${isPerfect ? "bg-emerald-50" : "bg-orange-50"}`}>
        <div className="flex gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${
              isPerfect ? "bg-[#014421]" : "bg-[#FFA500]"
            }`}
          >
            <Lightbulb className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
              {isPerfect ? "Keep going" : "Your takeaway"}
            </p>
            <h3 className="text-base font-bold text-stone-900">{title.replace(/^Focus next:\s*/i, "")}</h3>
            {lines.map((l) => (
              <p key={l} className="mt-1 text-sm leading-snug text-stone-700">
                {l}
              </p>
            ))}
          </div>
        </div>
      </div>

      {drills.length > 0 && (
        <div className="space-y-2.5 border-t border-stone-100 px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
            Suggested drills
          </p>
          {drills.map((d) => {
            const isAdded = !!added[d.drillId];
            return (
              <div
                key={d.drillId}
                className="flex flex-col gap-2 rounded-xl bg-stone-50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-stone-900">{d.title}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {d.category} · ~{d.minutes} min · {d.why}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={isAdded || busy === d.drillId}
                    onClick={() => void onAdd(d)}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
                      isAdded
                        ? "bg-[#014421]/10 text-[#014421]"
                        : "border border-stone-200 bg-white text-stone-800 hover:border-[#014421]/40"
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden /> Added today
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" aria-hidden /> Add to today
                      </>
                    )}
                  </button>
                  <Link
                    href={d.href}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#014421] px-3 py-2 text-xs font-bold text-white"
                  >
                    Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Wrap long breakdown sections so the first screen stays about score + next step. */
export function CombineDetailsDisclosure({
  children,
  label = "Full breakdown",
  defaultOpen = false,
}: {
  children: React.ReactNode;
  label?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-stone-200 bg-white open:pb-1"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-sm font-bold text-stone-800">
        {label}
        <span className="text-xs font-semibold text-[#014421] group-open:hidden">Show</span>
        <span className="hidden text-xs font-semibold text-[#014421] group-open:inline">Hide</span>
      </summary>
      <div className="space-y-3 border-t border-stone-100 px-3 pb-3 pt-3">{children}</div>
    </details>
  );
}
