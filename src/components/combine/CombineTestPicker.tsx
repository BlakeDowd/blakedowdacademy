"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { ChevronRight, Crosshair, Eye, Flag, Gauge, Ruler, Target, Trophy } from "lucide-react";
import {
  COMBINE_CATEGORY_IDS,
  COMBINE_TEST_CARDS,
  type CombineCategoryId,
  type CombineTestCard,
} from "@/lib/combineTestsCatalog";

const GROUP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "Full tests": Flag,
  "By distance": Ruler,
  "Skill tests": Gauge,
  "Green reading": Eye,
  Scramble: Flag,
  Proximity: Crosshair,
  Games: Trophy,
};

const FEATURED_GROUP = "Full tests";

function groupCards(cards: CombineTestCard[]): { group: string; cards: CombineTestCard[] }[] {
  const out: { group: string; cards: CombineTestCard[] }[] = [];
  for (const card of cards) {
    const last = out[out.length - 1];
    if (last && last.group === card.group) last.cards.push(card);
    else out.push({ group: card.group, cards: [card] });
  }
  return out;
}

function FeaturedCard({ card, href }: { card: CombineTestCard; href: string }) {
  return (
    <Link
      href={href}
      className="group relative flex min-h-[8.5rem] flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#014421] to-[#0b6b3a] p-3.5 text-white shadow-sm transition-transform active:scale-[0.98]"
    >
      <svg viewBox="0 0 60 80" className="pointer-events-none absolute -right-2 -top-1 h-20 w-16 opacity-25" aria-hidden>
        <path d="M30 72 C 10 52, 50 34, 30 14" fill="none" stroke="white" strokeWidth="2.5" strokeDasharray="1 6" strokeLinecap="round" />
        <circle cx="30" cy="12" r="5" fill="white" />
      </svg>
      <div className="pr-6">
        <p className="text-[15px] font-extrabold leading-tight">{card.title}</p>
        <p className="mt-1 text-[11px] leading-snug text-white/75">{card.blurb}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1">
        {card.meta.map((m) => (
          <span key={m} className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold">
            {m}
          </span>
        ))}
      </div>
    </Link>
  );
}

function RowCard({ card, href }: { card: CombineTestCard; href: string }) {
  const Icon = GROUP_ICONS[card.group] ?? Target;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-gray-200 transition-all hover:ring-[#FFA500] active:scale-[0.99]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#014421]/10 text-[#014421]">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-gray-900">{card.title}</span>
        <span className="block text-xs leading-snug text-gray-500">{card.blurb}</span>
        <span className="mt-1.5 flex flex-wrap gap-1">
          {card.meta.map((m) => (
            <span key={m} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
              {m}
            </span>
          ))}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
    </Link>
  );
}

export function CombineTestPicker({
  category,
  onCategoryChange,
  hrefFor = (href) => href,
}: {
  category: CombineCategoryId;
  onCategoryChange: (c: CombineCategoryId) => void;
  hrefFor?: (href: string) => string;
}) {
  const cards = COMBINE_TEST_CARDS.filter((c) => c.category === category);
  const groups = groupCards(cards);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Combine test categories">
        {COMBINE_CATEGORY_IDS.map((cat) => {
          const active = category === cat;
          const count = COMBINE_TEST_CARDS.filter((c) => c.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(cat)}
              className={`flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors ${
                active ? "bg-[#014421] text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"
              }`}
            >
              {cat}
              <span
                className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {cards.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-gray-500">Coming Soon To Online Academy.</p>
      ) : (
        groups.map(({ group, cards: groupCardsList }) => (
          <section key={group} className="space-y-2">
            <h3 className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{group}</h3>
            {group === FEATURED_GROUP ? (
              <div className="grid grid-cols-2 gap-2">
                {groupCardsList.map((card) => (
                  <FeaturedCard key={card.id} card={card} href={hrefFor(card.href)} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {groupCardsList.map((card) => (
                  <RowCard key={card.id} card={card} href={hrefFor(card.href)} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
