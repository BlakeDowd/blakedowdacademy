"use client";

import type { CSSProperties } from "react";
import type { ComponentType } from "react";
import {
  Trophy,
  Award,
  Medal,
  Crown,
  Target,
  BookOpen,
  Clock,
  Zap,
  Star,
  Flame,
  Lock,
  Crosshair,
} from "lucide-react";
import {
  TROPHY_LIST,
  trophyCaseRowForId,
  type TrophyCaseRow,
  unlockedAccentForTrophy,
  type UnlockedAccent,
} from "@/lib/academyTrophies";

export type TrophyCaseCardTrophy = {
  id: string;
  trophy_name: string;
  trophy_icon?: string;
  description?: string;
  unlocked_at?: string;
  isEarned: boolean;
  requirement?: string;
};

type TrophyCaseProps = {
  cards: readonly TrophyCaseCardTrophy[];
  /** Row counts from `public.user_achievements` grouped by `achievement_key` (same string as `trophy.id`). */
  achievementCountByKey: ReadonlyMap<string, number>;
  onSelectTrophy: (trophy: TrophyCaseCardTrophy) => void;
};

function unlockedCardStyle(accent: UnlockedAccent): CSSProperties {
  if (accent === "gold") {
    return {
      background:
        "radial-gradient(120% 85% at 28% 12%, rgba(251,191,36,0.42), transparent 52%), radial-gradient(90% 70% at 85% 88%, rgba(245,158,11,0.15), transparent 50%), linear-gradient(168deg, #fffdf8, #fff7e8)",
      boxShadow: "0 0 26px rgba(251, 191, 36, 0.32), 0 6px 18px rgba(15, 23, 42, 0.07)",
      borderColor: "rgba(251, 191, 36, 0.5)",
    };
  }
  if (accent === "emerald") {
    return {
      background:
        "radial-gradient(120% 85% at 22% 10%, rgba(16,185,129,0.32), transparent 50%), linear-gradient(168deg, #f0fdf4, #ffffff)",
      boxShadow: "0 0 22px rgba(16, 185, 129, 0.26), 0 6px 16px rgba(15, 23, 42, 0.06)",
      borderColor: "rgba(16, 185, 129, 0.42)",
    };
  }
  return {
    background:
      "radial-gradient(115% 80% at 30% 0%, rgba(148,163,184,0.38), transparent 50%), linear-gradient(168deg, #f8fafc, #ffffff)",
    boxShadow: "0 0 20px rgba(148, 163, 184, 0.28), 0 5px 14px rgba(15, 23, 42, 0.06)",
    borderColor: "rgba(148, 163, 184, 0.45)",
  };
}

/** Icon lookup for trophy case cards and the Academy trophy modal. */
export function getTrophyIconComponent(id: string): ComponentType<{ className?: string }> {
  const iconMap: Record<string, ComponentType<{ className?: string }>> = {
    "first-steps": Clock,
    dedicated: Clock,
    "practice-master": Target,
    "practice-legend": Flame,
    student: BookOpen,
    scholar: BookOpen,
    expert: BookOpen,
    "first-round": Trophy,
    consistent: Trophy,
    tracker: Trophy,
    "rising-star": Star,
    champion: Zap,
    elite: Crown,
    "goal-achiever": Medal,
    "birdie-hunter": Target,
    "breaking-90": Trophy,
    "breaking-80": Trophy,
    "breaking-70": Trophy,
    "eagle-eye": Star,
    "birdie-machine": Zap,
    "par-train": Trophy,
    "week-warrior": Flame,
    "monthly-legend": Crown,
    "putting-professor": BookOpen,
    "wedge-wizard": BookOpen,
    "coachs-pet": Award,
    "champion-putting-test-18": Crown,
    "combine-finisher": Crosshair,
  };
  return iconMap[id] || Trophy;
}

export default function TrophyCase({ cards, achievementCountByKey, onSelectTrophy }: TrophyCaseProps) {
  const rowMeta: { key: TrophyCaseRow; label: string }[] = [
    { key: "volume", label: "Volume (Hours)" },
    { key: "performance", label: "Performance (Scores)" },
    { key: "consistency", label: "Consistency (Streaks)" },
  ];

  const orderIndex = (id: string) => TROPHY_LIST.findIndex((x) => x.id === id);

  if (cards.length === 0) {
    return (
      <div className="py-10 text-center">
        <Trophy className="mx-auto mb-3 h-12 w-12 text-stone-300" />
        <p className="text-sm text-stone-500">No unlocked trophies yet. Keep practicing!</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {rowMeta.map(({ key, label }) => {
        const inRow = [...cards]
          .filter((t) => trophyCaseRowForId(t.id) === key)
          .sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
        if (inRow.length === 0) return null;
        return (
          <div key={key}>
            <h3 className="mb-2 px-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">
              {label}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4">
              {inRow.map((trophy, index) => {
                const isEarned = trophy.isEarned;
                const def = TROPHY_LIST.find((x) => x.id === trophy.id);
                const IconComponent = def?.icon ?? Trophy;
                const accent = def ? unlockedAccentForTrophy(def) : "silver";
                const eliteShine = isEarned && def && (def.id === "elite" || def.isRare === true);
                const achievementCount = achievementCountByKey.get(trophy.id) ?? 0;
                const showMultiplierBadge = isEarned && achievementCount > 1;

                return (
                  <button
                    key={trophy.id || `trophy-${key}-${index}`}
                    type="button"
                    onClick={() => onSelectTrophy(trophy)}
                    className={`group flex min-h-[96px] flex-col rounded-2xl border-2 p-0 text-center transition duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#014421]/35 ${
                      isEarned
                        ? "hover:-translate-y-0.5"
                        : "border-white/35 bg-slate-900/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md hover:border-white/50 hover:bg-slate-900/25"
                    }`}
                    style={isEarned ? unlockedCardStyle(accent) : undefined}
                  >
                    <div className="relative flex min-h-[96px] w-full flex-col items-center justify-center gap-1 overflow-visible p-2.5">
                      {eliteShine && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl trophy-case-elite-shine"
                        />
                      )}
                      {showMultiplierBadge && (
                        <span
                          className="absolute right-1 top-1 z-[3] rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-black text-slate-950 shadow-lg shadow-emerald-500/20"
                          title={`Unlocked ${achievementCount} times`}
                        >
                          x{achievementCount}
                        </span>
                      )}
                      {!isEarned && (
                        <div
                          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/25 to-slate-400/10"
                          aria-hidden
                        />
                      )}
                      <div className="relative z-[1] flex flex-col items-center gap-0.5">
                        <div className="relative flex h-9 w-9 items-center justify-center">
                          <IconComponent
                            className={`h-6 w-6 transition-transform duration-300 group-hover:scale-105 ${
                              isEarned
                                ? accent === "gold"
                                  ? "text-amber-700"
                                  : accent === "emerald"
                                    ? "text-emerald-700"
                                    : "text-slate-600"
                                : "text-slate-500/80"
                            }`}
                          />
                          {!isEarned && (
                            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/25 backdrop-blur-[2px]">
                              <Lock
                                className="h-4 w-4 text-white drop-shadow-md"
                                strokeWidth={2.25}
                              />
                            </span>
                          )}
                        </div>
                        <span
                          className={`line-clamp-2 w-full text-[10px] font-semibold leading-tight ${
                            isEarned ? "text-stone-900" : "text-stone-600"
                          }`}
                        >
                          {trophy.trophy_name}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
