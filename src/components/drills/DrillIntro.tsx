"use client";

import type { ReactNode } from "react";
import { Brain, CircleDot, Flag, ListChecks, MapPin, Repeat, Target, Video } from "lucide-react";
import { PuttLineDiagram } from "@/components/combine/PuttingCombineUi";
import { IronShotDiagram } from "@/components/combine/IronCombineUi";
import { BunkerShotDiagram, ChipShotDiagram, HERO_ART_CLASS, TeeShotDiagram } from "@/components/combine/CombineArt";

function categoryKey(category: string): string {
  return category.toLowerCase();
}

/** Faded diagram in the hero corner, picked from the drill category. */
export function DrillHeroArt({ category }: { category: string }) {
  const c = categoryKey(category);
  if (c.includes("putt")) return <PuttLineDiagram shape="Left-to-Right" className={HERO_ART_CLASS} />;
  if (c.includes("bunker") || c.includes("sand")) return <BunkerShotDiagram className={HERO_ART_CLASS} />;
  if (c.includes("chip") || c.includes("short")) return <ChipShotDiagram className={HERO_ART_CLASS} />;
  if (c.includes("wedge")) return <IronShotDiagram curve="straight" className={HERO_ART_CLASS} />;
  if (c.includes("iron") || c.includes("approach")) return <IronShotDiagram curve="draw" className={HERO_ART_CLASS} />;
  if (c.includes("driv") || c.includes("tee")) return <TeeShotDiagram className={HERO_ART_CLASS} />;
  if (c.includes("mental")) return <Brain className="absolute -right-2 -top-2 h-32 w-32 text-white opacity-15" aria-hidden />;
  return <Flag className="absolute -right-2 -top-2 h-32 w-32 text-white opacity-15" aria-hidden />;
}

/** Green header card matching the combine intro screens. */
export function DrillHero({
  title,
  kicker,
  chips,
  category,
  action,
  compact = false,
}: {
  title: ReactNode;
  kicker: string;
  chips: string[];
  category: string;
  /** Top-right control, e.g. collapse or close. */
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#014421] to-[#0b6b3a] text-white shadow-md ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <DrillHeroArt category={category} />
      {action && <div className="absolute right-2 top-2 z-10">{action}</div>}
      <p className="text-xs font-semibold uppercase tracking-wider text-[#FFA500]">{kicker}</p>
      <h2 className={`mt-1 pr-16 font-extrabold leading-tight ${compact ? "text-xl" : "text-2xl"}`}>{title}</h2>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-white/15 px-3 py-1">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const BULLET = /^\s*(?:[-•*]|\d+[.)])\s+/;

/** Splits a free-text drill description into short steps: one per line or bullet, otherwise one per sentence. */
export function drillSteps(description: string): string[] {
  const text = description.trim();
  if (!text) return [];
  const lines = text
    .split(/\r?\n+/)
    .map((l) => l.replace(BULLET, "").trim())
    .filter(Boolean);
  const parts = lines.length > 1 ? lines : text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function stepIcon(step: string): ReactNode {
  const s = step.toLowerCase();
  const cls = "h-5 w-5";
  if (/video|phone|film|record/.test(s)) return <Video className={cls} />;
  if (/\b(score|count|keep|track|points?|in a row)\b/.test(s)) return <ListChecks className={cls} />;
  if (/\b(hit|hitting|land|landing|aim|target|flag|hole)\b/.test(s)) return <Target className={cls} />;
  if (/\b(place|set up|setup|tee|towel|mark|spot|station)\b/.test(s)) return <MapPin className={cls} />;
  if (/\b(repeat|again|until|each|every)\b/.test(s)) return <Repeat className={cls} />;
  return <CircleDot className={cls} />;
}

/** Numbered how-to cards in the combine intro style. */
export function DrillSteps({ description, compact = false }: { description: string; compact?: boolean }) {
  const steps = drillSteps(description);
  if (steps.length === 0) return null;
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={`${i}-${s.slice(0, 24)}`} className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#014421] shadow-sm">
            {stepIcon(s)}
            <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#FFA500] text-[10px] font-bold text-white">
              {i + 1}
            </span>
          </span>
          <span className={`${compact ? "text-xs" : "text-sm"} leading-snug text-gray-800`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Collapsible panel matching the combine "How points work" box. */
export function DrillGuide({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-2xl border border-gray-100" open={defaultOpen} onClick={(e) => e.stopPropagation()}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800">
        {title}
        <span className="text-xs font-medium text-[#014421] group-open:hidden">Show</span>
        <span className="hidden text-xs font-medium text-[#014421] group-open:inline">Hide</span>
      </summary>
      <div className="whitespace-pre-wrap px-4 pb-4 text-xs leading-relaxed text-gray-700">{children}</div>
    </details>
  );
}
