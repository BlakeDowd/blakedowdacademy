"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, X, ChevronDown, ChevronUp, ArrowRight, CheckCircle2 } from "lucide-react";
import { TROPHY_LIST, type TrophyData, formatTrophyProgressLine, trophyEarnLink } from "@/lib/academyTrophies";
import {
  getTrophyMultiplierContributions,
  type TrophyContributionLine,
} from "@/lib/trophyMultiplierContributions";
import type { AcademyTrophyMultiplierStats } from "@/lib/trophyMultiplierContributions";
import TrophyCase, { TrophyCommunityRanking, TrophyMedal, type TrophyCaseCardTrophy } from "@/components/TrophyCase";
import { achievementContributionsForKey, type UserAchievementRow } from "@/lib/userAchievements";
import {
  fetchTrophyCollectionLeaderboard,
  fetchTrophyCollectionRankForUser,
  runBackfillMyAchievementsFromTrophies,
  type TrophyCollectionLeaderboardRow,
} from "@/lib/trophyCollectionLeaderboard";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AcademyTrophyDbRow = {
  achievement_id: string;
  earned_at?: string;
  /** Resolved from `TROPHY_LIST` for labels (not a DB column). */
  trophy_name: string;
  description?: string;
  id?: string;
  trophy_icon?: string;
};

export type AcademySelectedTrophy =
  | (TrophyData & {
      multiplierCount?: number;
      multiplierContributions?: TrophyContributionLine[];
    })
  | {
      achievement_id: string;
      trophy_name: string;
      description?: string;
      earned_at?: string;
      id?: string;
      trophy_icon?: string;
      isEarned?: boolean;
      requirement?: string;
      multiplierCount?: number;
      multiplierContributions?: TrophyContributionLine[];
    };

export type AcademyTrophyMultiplierMap = Map<string, ReturnType<typeof getTrophyMultiplierContributions>>;

type Props = {
  dbTrophies: AcademyTrophyDbRow[];
  showLocked: boolean;
  onShowLockedChange: (next: boolean) => void;
  selectedTrophy: AcademySelectedTrophy | null;
  onSelectTrophy: (t: AcademySelectedTrophy | null) => void;
  academyTrophyStats: AcademyTrophyMultiplierStats;
  trophyMultiplierById: AcademyTrophyMultiplierMap;
  achievementRows: readonly UserAchievementRow[];
  /** Counts from `public.user_achievements` keyed by `achievement_key` (trophy id). */
  achievementCountByKey: ReadonlyMap<string, number>;
};

type Filter = "all" | "earned" | "locked";

function formatEarnedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function AcademyTrophyCasePanel({
  dbTrophies,
  showLocked,
  onShowLockedChange,
  selectedTrophy,
  onSelectTrophy,
  academyTrophyStats,
  trophyMultiplierById,
  achievementRows,
  achievementCountByKey,
}: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>(showLocked ? "all" : "earned");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [communityLeaderboard, setCommunityLeaderboard] = useState<readonly TrophyCollectionLeaderboardRow[]>([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityViewerRank, setCommunityViewerRank] = useState<number | null>(null);
  const [communityViewerTotalDb, setCommunityViewerTotalDb] = useState(0);

  const earnedIds = useMemo(() => new Set(dbTrophies.map((t) => t.achievement_id)), [dbTrophies]);
  const earnedCount = earnedIds.size;
  const totalTrophies = TROPHY_LIST.length;
  const lockedCount = Math.max(0, totalTrophies - earnedCount);

  /** Times earned: max(`user_achievements` rows, heuristic count from activity) so the × badge matches reality. */
  const collectionCountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of TROPHY_LIST) {
      const table = achievementCountByKey.get(t.id) ?? 0;
      const legacy = trophyMultiplierById.get(t.id)?.count ?? 0;
      m.set(t.id, Math.max(table, legacy));
    }
    return m;
  }, [achievementCountByKey, trophyMultiplierById]);

  const progressById = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of TROPHY_LIST) {
      try {
        m.set(t.id, earnedIds.has(t.id) ? 100 : t.getProgress(academyTrophyStats).percentage || 0);
      } catch {
        m.set(t.id, 0);
      }
    }
    return m;
  }, [academyTrophyStats, earnedIds]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      setCommunityLoading(true);
      setCommunityError(null);
      try {
        const supabase = createClient();
        await runBackfillMyAchievementsFromTrophies(supabase);
        const rows = await fetchTrophyCollectionLeaderboard(supabase, 40);
        if (cancelled) return;
        setCommunityLeaderboard(rows);
      } catch (e: unknown) {
        if (!cancelled) {
          setCommunityLeaderboard([]);
          setCommunityError(e instanceof Error ? e.message : "Could not load rankings.");
        }
      } finally {
        if (!cancelled) setCommunityLoading(false);
      }
      if (cancelled || !user?.id) return;
      try {
        const v = await fetchTrophyCollectionRankForUser(createClient(), user.id);
        if (cancelled) return;
        setCommunityViewerRank(v.rank);
        setCommunityViewerTotalDb(v.totalDbEvents);
      } catch {
        if (!cancelled) {
          setCommunityViewerRank(null);
          setCommunityViewerTotalDb(0);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, achievementRows.length, earnedCount, expanded]);

  const allCards = useMemo(
    (): TrophyCaseCardTrophy[] =>
      TROPHY_LIST.map((trophy) => {
        const dbTrophy = dbTrophies.find((t) => t.achievement_id === trophy.id);
        return {
          id: trophy.id,
          achievement_id: trophy.id,
          trophy_name: trophy.name,
          description: trophy.requirement,
          earned_at: dbTrophy?.earned_at,
          isEarned: earnedIds.has(trophy.id),
          requirement: trophy.requirement,
        };
      }),
    [dbTrophies, earnedIds],
  );

  const visibleCards = useMemo(
    () =>
      filter === "earned"
        ? allCards.filter((c) => c.isEarned)
        : filter === "locked"
          ? allCards.filter((c) => !c.isEarned)
          : allCards,
    [allCards, filter],
  );

  const recentEarned = useMemo(
    () =>
      allCards
        .filter((c) => c.isEarned)
        .sort((a, b) => (b.earned_at ?? "").localeCompare(a.earned_at ?? ""))
        .slice(0, 6),
    [allCards],
  );

  const upNext = useMemo(
    () =>
      allCards
        .filter((c) => !c.isEarned)
        .map((c) => ({ card: c, pct: progressById.get(c.id) ?? 0 }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3),
    [allCards, progressById],
  );

  const changeFilter = (next: Filter) => {
    setFilter(next);
    onShowLockedChange(next !== "earned");
  };

  const handleSelect = useCallback(
    (trophy: TrophyCaseCardTrophy) => {
      const id = trophy.id.trim();
      const merged = collectionCountById.get(id) ?? 0;
      let multiplierContributions: TrophyContributionLine[] | undefined;
      if (merged > 1) {
        const fromTable = achievementContributionsForKey(achievementRows, id);
        multiplierContributions =
          fromTable.length > 0 ? fromTable : (trophyMultiplierById.get(id)?.contributions ?? fromTable);
      }
      setHistoryOpen(false);
      onSelectTrophy({ ...trophy, multiplierCount: merged > 1 ? merged : undefined, multiplierContributions });
    },
    [achievementRows, collectionCountById, onSelectTrophy, trophyMultiplierById],
  );

  const earnedPct = totalTrophies > 0 ? Math.round((earnedCount / totalTrophies) * 100) : 0;

  return (
    <>
      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-md sm:p-6">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="trophy-case-body"
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Trophy className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-stone-900">Trophy case</span>
            <span className="block text-xs text-stone-500">
              {earnedCount} of {totalTrophies} earned
            </span>
          </span>
          {expanded ? (
            <ChevronUp className="h-5 w-5 shrink-0 text-stone-400" aria-hidden />
          ) : (
            <ChevronDown className="h-5 w-5 shrink-0 text-stone-400" aria-hidden />
          )}
        </button>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-[#FFA500] transition-all" style={{ width: `${earnedPct}%` }} />
        </div>

        {!expanded && recentEarned.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-3 flex w-full items-center gap-1.5 text-left"
            aria-label="Open trophy case"
          >
            {recentEarned.map((c) => (
              <TrophyMedal key={c.id} id={c.id} isEarned percentage={100} size="sm" />
            ))}
            <span className="ml-1 text-xs font-semibold text-[#014421]">See all</span>
          </button>
        )}

        {expanded && (
          <div id="trophy-case-body" className="mt-5 space-y-5">
            {upNext.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-bold text-stone-900">Up next</h3>
                <ul className="space-y-2">
                  {upNext.map(({ card, pct }) => {
                    const def = TROPHY_LIST.find((t) => t.id === card.id);
                    const link = trophyEarnLink(card.id);
                    return (
                      <li key={card.id} className="flex items-center gap-3 rounded-2xl bg-stone-50 p-2.5">
                        <button
                          type="button"
                          onClick={() => handleSelect(card)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <TrophyMedal id={card.id} isEarned={false} percentage={pct} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-stone-900">
                              {card.trophy_name}
                            </span>
                            <span className="block truncate text-[11px] text-stone-500">
                              {def ? formatTrophyProgressLine(def, academyTrophyStats) : card.requirement}
                            </span>
                          </span>
                        </button>
                        <Link
                          href={link.href}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-[#014421] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#01331a]"
                        >
                          Go
                          <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter trophies">
                {(
                  [
                    ["all", `All ${totalTrophies}`],
                    ["earned", `Earned ${earnedCount}`],
                    ["locked", `Locked ${lockedCount}`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={filter === id}
                    onClick={() => changeFilter(id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      filter === id ? "bg-[#014421] text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <TrophyCase
                cards={visibleCards}
                collectionCountById={collectionCountById}
                progressById={progressById}
                onSelectTrophy={handleSelect}
              />
            </div>

            <TrophyCommunityRanking
              leaderboard={communityLeaderboard}
              loading={communityLoading}
              error={communityError}
              viewerId={user?.id ?? null}
              viewerRank={communityViewerRank}
              viewerTotalDb={communityViewerTotalDb}
              earnedTrophyCount={earnedCount}
            />
          </div>
        )}
      </section>

      {selectedTrophy &&
        (() => {
          const trophyId =
            "checkUnlocked" in selectedTrophy
              ? selectedTrophy.id
              : selectedTrophy.id || selectedTrophy.achievement_id;
          const def = TROPHY_LIST.find((t) => t.id === trophyId);
          if (!def) return null;
          const isEarned = earnedIds.has(def.id);
          const earnedAt = dbTrophies.find((t) => t.achievement_id === def.id)?.earned_at;
          const pct = Math.round(progressById.get(def.id) ?? 0);
          const link = trophyEarnLink(def.id);
          const multiplierCount = selectedTrophy.multiplierCount ?? 0;
          const contributions = selectedTrophy.multiplierContributions ?? [];

          return (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
              onClick={() => onSelectTrophy(null)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="trophy-detail-title"
            >
              <div
                className="relative w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onSelectTrophy(null)}
                  className="absolute right-3 top-3 rounded-full p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-4 pr-8">
                  <TrophyMedal id={def.id} isEarned={isEarned} percentage={pct} size="lg" />
                  <div className="min-w-0">
                    <h3 id="trophy-detail-title" className="text-lg font-bold leading-tight text-stone-900">
                      {def.name}
                    </h3>
                    {isEarned ? (
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#014421]">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        {earnedAt ? `Earned ${formatEarnedDate(earnedAt)}` : "Earned"}
                        {multiplierCount > 1 && <span className="text-[#FFA500]"> · ×{multiplierCount}</span>}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-stone-500">Locked · {pct}% there</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-stone-50 p-3">
                  <p className="text-[11px] font-bold text-stone-500">How to earn it</p>
                  <p className="mt-0.5 text-sm text-stone-900">{def.requirement}</p>
                  {!isEarned && (
                    <>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                        <div className="h-full rounded-full bg-[#FFA500]" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1.5 text-xs text-stone-600">
                        {formatTrophyProgressLine(def, academyTrophyStats)}
                      </p>
                    </>
                  )}
                </div>

                {multiplierCount > 1 && (
                  <div className="mt-3 rounded-2xl bg-stone-50">
                    <button
                      type="button"
                      onClick={() => setHistoryOpen((v) => !v)}
                      aria-expanded={historyOpen}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-bold text-stone-700"
                    >
                      Earned {multiplierCount} times
                      {historyOpen ? (
                        <ChevronUp className="h-4 w-4 text-stone-400" aria-hidden />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-stone-400" aria-hidden />
                      )}
                    </button>
                    {historyOpen && (
                      <div className="border-t border-stone-200 px-3 pb-3 pt-2">
                        {contributions.length > 0 ? (
                          <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
                            {contributions.map((row, i) => (
                              <li key={`${row.label}-${row.dateLabel}-${i}`} className="flex justify-between gap-3">
                                <span className="text-stone-700">{row.label}</span>
                                <span className="shrink-0 font-semibold text-stone-900">{row.dateLabel}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-stone-500">No per-session details for this trophy.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <Link
                  href={link.href}
                  onClick={() => onSelectTrophy(null)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#014421] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#01331a]"
                >
                  {link.label}
                  <ArrowRight className="h-4 w-4 text-[#FFA500]" aria-hidden />
                </Link>
              </div>
            </div>
          );
        })()}
    </>
  );
}
