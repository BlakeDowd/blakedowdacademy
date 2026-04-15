"use client";

import { Award, Flag, TrendingUp, Trophy, User } from "lucide-react";
import type { AcademyTrophyDbRow } from "@/components/AcademyTrophyCasePanel";

export type CoachDeepDiveProfileHeroProps = {
  playerName: string;
  playerHandicap: number;
  totalXp: number | null;
  roundsInRange: number;
  practiceSessionsInRange: number;
  /** Shown after “Performance snapshot for” when `showPerformanceSnapshot` is true */
  dateRangeLabel?: string;
  unlockedTrophies: readonly AcademyTrophyDbRow[];
  /** Tighter layout when there is little activity / XP to show */
  heroCompact: boolean;
  /**
   * When false, hides the dated performance snapshot line (e.g. stats = all entered data, not a date window).
   * @default true
   */
  showPerformanceSnapshot?: boolean;
  /**
   * When true, rounds/practice pills say “logged” instead of “in range” (personal stats, not coach date filter).
   * @default false
   */
  allEnteredData?: boolean;
  /**
   * Merged distinct trophy/achievement total (e.g. from `trophy_collection_rank_for_user`). When omitted, derived from `unlockedTrophies`.
   */
  academyTrophyDistinctTotal?: number | null;
  /** Academy leaderboard rank when known (signed-in user only on stats). */
  academyTrophyLeaderboardRank?: number | null;
};

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Hero profile card (coach deep dive + stats Game overview). */
export function CoachDeepDiveProfileHero({
  playerName,
  playerHandicap,
  totalXp,
  roundsInRange,
  practiceSessionsInRange,
  dateRangeLabel = "",
  unlockedTrophies,
  heroCompact,
  showPerformanceSnapshot = true,
  allEnteredData = false,
  academyTrophyDistinctTotal,
  academyTrophyLeaderboardRank,
}: CoachDeepDiveProfileHeroProps) {
  const activityScope = allEnteredData ? "logged" : "in range";

  const derivedTrophyDistinct = new Set(
    unlockedTrophies.map((t) => (t.achievement_id || "").trim().toLowerCase()).filter(Boolean),
  ).size;
  const trophyTotalShown =
    academyTrophyDistinctTotal != null && Number.isFinite(academyTrophyDistinctTotal)
      ? Math.max(0, Math.floor(Number(academyTrophyDistinctTotal)))
      : derivedTrophyDistinct;
  const rankShown =
    academyTrophyLeaderboardRank != null &&
    Number.isFinite(academyTrophyLeaderboardRank) &&
    academyTrophyLeaderboardRank > 0
      ? Math.floor(Number(academyTrophyLeaderboardRank))
      : null;

  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl border border-stone-200/80 bg-gradient-to-br from-white via-stone-50/80 to-emerald-50/40 shadow-lg [word-break:normal]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#014421] via-emerald-600 to-teal-500" aria-hidden />
      <div className={heroCompact ? "p-4 sm:p-5" : "p-6 sm:p-8"}>
        <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6">
          <div className={`flex w-full min-w-0 items-start ${heroCompact ? "gap-3" : "gap-4"}`}>
            <div
              className={
                heroCompact
                  ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#014421] text-base font-bold tracking-tight text-white shadow-inner ring-2 ring-white/80"
                  : "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#014421] text-lg font-bold tracking-tight text-white shadow-inner ring-2 ring-white/80 sm:h-[4.25rem] sm:w-[4.25rem] sm:text-xl"
              }
              aria-hidden
            >
              {initials(playerName)}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="text-[10px] font-semibold tracking-wide text-stone-500">Player Profile</p>
              <h2
                className={`mt-1 break-words font-bold tracking-tight text-stone-900 ${heroCompact ? "text-lg sm:text-xl" : "text-2xl sm:text-3xl"}`}
              >
                {playerName || "Player"}
              </h2>
              {showPerformanceSnapshot ? (
                <p
                  className={`text-balance text-stone-600 [overflow-wrap:anywhere] ${heroCompact ? "mt-0.5 text-xs" : "mt-1 text-sm"}`}
                >
                  Performance snapshot for{" "}
                  <span className="font-semibold text-stone-800">{dateRangeLabel}</span>
                </p>
              ) : null}
              <div
                className={`flex w-full min-w-0 flex-wrap justify-start gap-2 ${
                  showPerformanceSnapshot
                    ? heroCompact
                      ? "mt-2"
                      : "mt-4"
                    : heroCompact
                      ? "mt-2"
                      : "mt-3 sm:mt-4"
                } sm:grid sm:max-w-xl sm:grid-cols-2 sm:gap-x-3 sm:gap-y-2`}
              >
                <span
                  className={
                    heroCompact
                      ? "inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-stone-800 shadow-sm"
                      : "inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-xs font-semibold text-stone-800 shadow-sm"
                  }
                >
                  <Flag className={heroCompact ? "h-3 w-3 text-[#014421]" : "h-3.5 w-3.5 text-[#014421]"} aria-hidden />
                  Hcp Index{" "}
                  {playerHandicap >= 0 ? Math.round(playerHandicap) : `+${Math.abs(Math.round(playerHandicap))}`}
                </span>
                {totalXp != null && totalXp > 0 ? (
                  <span
                    className={
                      heroCompact
                        ? "inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/90 px-2 py-0.5 text-[10px] font-semibold text-amber-950 shadow-sm"
                        : "inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1 text-xs font-semibold text-amber-950 shadow-sm"
                    }
                  >
                    <Award className={heroCompact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
                    {totalXp.toLocaleString()} XP
                  </span>
                ) : null}
                <span
                  className={
                    heroCompact
                      ? "inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-stone-700 shadow-sm"
                      : "inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-xs font-semibold text-stone-700 shadow-sm"
                  }
                >
                  <User className={heroCompact ? "h-3 w-3 text-stone-500" : "h-3.5 w-3.5 text-stone-500"} aria-hidden />
                  {roundsInRange} round{roundsInRange !== 1 ? "s" : ""} {activityScope}
                </span>
                <span
                  className={
                    heroCompact
                      ? "inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-stone-700 shadow-sm"
                      : "inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/90 px-3 py-1 text-xs font-semibold text-stone-700 shadow-sm"
                  }
                >
                  <TrendingUp className={heroCompact ? "h-3 w-3 text-emerald-600" : "h-3.5 w-3.5 text-emerald-600"} aria-hidden />
                  {practiceSessionsInRange} practice {practiceSessionsInRange === 1 ? "entry" : "entries"}{" "}
                  {activityScope}
                </span>
              </div>
            </div>
          </div>

          <div
            className={`w-full min-w-0 border-t border-stone-200/80 print:break-inside-avoid ${heroCompact ? "pt-3" : "pt-5"}`}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                <Trophy className="h-4 w-4" aria-hidden />
              </div>
              <p
                className={`font-semibold tracking-wide text-stone-600 ${heroCompact ? "text-[9px]" : "text-[10px]"}`}
              >
                Academy Trophies
              </p>
            </div>
            <p className={`mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 ${heroCompact ? "text-sm" : "text-base"}`}>
              <span className="text-2xl font-bold tabular-nums text-stone-900">{trophyTotalShown}</span>
              <span className="text-sm font-medium text-stone-600">unlocked</span>
              {rankShown != null ? (
                <>
                  <span className="text-stone-300" aria-hidden>
                    ·
                  </span>
                  <span className="text-sm font-medium text-stone-600">Rank</span>
                  <span className="text-xl font-bold tabular-nums text-[#014421]">#{rankShown}</span>
                  <span className="text-xs font-medium text-stone-500">Academy</span>
                </>
              ) : null}
            </p>
            {trophyTotalShown === 0 ? (
              <p className={`mt-1.5 text-stone-500 ${heroCompact ? "text-[11px]" : "text-xs"}`}>
                None yet — earn trophies in the Academy.
              </p>
            ) : rankShown == null && allEnteredData ? (
              <p className={`mt-1.5 text-stone-500 ${heroCompact ? "text-[10px]" : "text-[11px]"}`}>
                Academy rank shows when leaderboard sync is available.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
