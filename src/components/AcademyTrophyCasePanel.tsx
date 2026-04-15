"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Trophy,
  X,
  Lock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  TROPHY_LIST,
  type TrophyData,
  formatTrophyProgressLine,
} from "@/lib/academyTrophies";
import {
  getTrophyMultiplierContributions,
  type TrophyContributionLine,
} from "@/lib/trophyMultiplierContributions";
import type { AcademyTrophyMultiplierStats } from "@/lib/trophyMultiplierContributions";
import TrophyCase, { getTrophyIconComponent, type TrophyCaseCardTrophy } from "@/components/TrophyCase";
import {
  achievementContributionsForKey,
  type UserAchievementRow,
} from "@/lib/userAchievements";
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

export type AcademyTrophyMultiplierMap = Map<
  string,
  ReturnType<typeof getTrophyMultiplierContributions>
>;

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
  const [trophiesExpanded, setTrophiesExpanded] = useState(false);
  const [communityLeaderboard, setCommunityLeaderboard] = useState<readonly TrophyCollectionLeaderboardRow[]>([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityViewerRank, setCommunityViewerRank] = useState<number | null>(null);
  const [communityViewerTotalDb, setCommunityViewerTotalDb] = useState(0);
  const earnedCount = useMemo(() => dbTrophies.length, [dbTrophies]);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCommunityLoading(true);
      setCommunityError(null);
      setCommunityViewerRank(null);
      setCommunityViewerTotalDb(0);
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
        const supabase = createClient();
        const v = await fetchTrophyCollectionRankForUser(supabase, user.id);
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
  }, [user?.id, achievementRows.length, dbTrophies.length, trophiesExpanded]);

  const trophyCaseCards = useMemo((): TrophyCaseCardTrophy[] => {
    const earnedIds = new Set(dbTrophies.map((t) => t.achievement_id));
    const allTrophies: TrophyCaseCardTrophy[] = TROPHY_LIST.map((trophy) => {
      const isEarned = earnedIds.has(trophy.id);
      const dbTrophy = dbTrophies.find((t) => t.achievement_id === trophy.id);
      return {
        id: trophy.id,
        achievement_id: trophy.id,
        trophy_name: trophy.name,
        trophy_icon: undefined,
        description: trophy.requirement || dbTrophy?.description,
        earned_at: dbTrophy?.earned_at,
        isEarned,
        requirement: trophy.requirement,
      };
    });
    return showLocked ? allTrophies : allTrophies.filter((t) => t.isEarned);
  }, [dbTrophies, showLocked]);

  const handleTrophyCaseSelect = useCallback(
    (trophy: TrophyCaseCardTrophy) => {
      const id = trophy.id.trim();
      const merged = collectionCountById.get(id) ?? 0;
      const legacy = trophyMultiplierById.get(id);
      const multiplierCount = merged > 1 ? merged : undefined;
      let multiplierContributions: TrophyContributionLine[] | undefined;
      if (merged > 1) {
        const fromTable = achievementContributionsForKey(achievementRows, id);
        multiplierContributions =
          fromTable.length > 0 ? fromTable : legacy?.contributions ?? fromTable;
      }
      onSelectTrophy({
        ...trophy,
        multiplierCount,
        multiplierContributions,
      });
    },
    [achievementRows, collectionCountById, onSelectTrophy, trophyMultiplierById],
  );

  const collapseTrophyCase = () => {
    setTrophiesExpanded(false);
    onSelectTrophy(null);
    onShowLockedChange(false);
  };

  return (
    <>
      <div className="mb-6 w-full">
        <div
          className={`w-full rounded-2xl border border-stone-200/90 bg-gradient-to-b from-white via-stone-50/40 to-white shadow-md ${
            trophiesExpanded ? "p-6" : "p-4"
          }`}
        >
          {!trophiesExpanded ? (
            <button
              type="button"
              onClick={() => setTrophiesExpanded(true)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200/70 bg-white/70 px-3 py-3 text-left shadow-sm transition hover:border-stone-300 hover:bg-white"
              aria-expanded="false"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100/90 text-amber-800 ring-1 ring-amber-200/60">
                  <Trophy className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-bold tracking-tight text-stone-900 sm:text-lg">Trophy Case</h2>
                  <p className="text-xs text-stone-500">
                    {earnedCount} unlocked{lockedCount > 0 ? ` · ${lockedCount} locked hidden` : ""} · tap to open
                  </p>
                </div>
              </div>
              <ChevronDown className="h-5 w-5 shrink-0 text-stone-500" aria-hidden />
            </button>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight text-stone-900" id="academy-trophy-case-heading">
                  Trophy Case
                </h2>
                <button
                  type="button"
                  onClick={collapseTrophyCase}
                  className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm transition hover:border-stone-300 hover:bg-white"
                  aria-expanded="true"
                  aria-controls="academy-trophy-case-grid"
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                  Hide trophies
                </button>
              </div>
              {lockedCount > 0 && (
                <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => onShowLockedChange(!showLocked)}
                    className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm transition hover:border-stone-300 hover:bg-white"
                    aria-label={
                      showLocked
                        ? "Hide trophies you have not unlocked yet"
                        : `Show ${lockedCount} locked trophies you have not earned yet`
                    }
                  >
                    {showLocked ? (
                      <>
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        Hide locked ({lockedCount})
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        Show locked ({lockedCount})
                      </>
                    )}
                  </button>
                </div>
              )}

              <div id="academy-trophy-case-grid" role="region" aria-labelledby="academy-trophy-case-heading">
                <TrophyCase
                  cards={trophyCaseCards}
                  collectionCountById={collectionCountById}
                  onSelectTrophy={handleTrophyCaseSelect}
                  communityLeaderboard={communityLeaderboard}
                  communityLoading={communityLoading}
                  communityError={communityError}
                  communityViewerId={user?.id ?? null}
                  communityViewerRank={communityViewerRank}
                  communityViewerTotalDb={communityViewerTotalDb}
                  earnedTrophyCount={earnedCount}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {selectedTrophy &&
        (() => {
          const isDbTrophy = "achievement_id" in selectedTrophy && !("checkUnlocked" in selectedTrophy);
          const trophyId = isDbTrophy
            ? selectedTrophy.id || selectedTrophy.achievement_id
            : selectedTrophy.id;
          const trophyDef = TROPHY_LIST.find(
            (t) =>
              t.id === trophyId ||
              t.name === (isDbTrophy ? selectedTrophy.trophy_name : selectedTrophy.name),
          );

          const IconComponent = isDbTrophy
            ? selectedTrophy.trophy_icon
              ? Trophy
              : getTrophyIconComponent(trophyId || "")
            : (selectedTrophy as TrophyData).icon || Trophy;
          const displayIcon = isDbTrophy ? selectedTrophy.trophy_icon || null : null;
          const trophyName = isDbTrophy ? selectedTrophy.trophy_name : selectedTrophy.name;
          const isEarned = isDbTrophy ? (selectedTrophy as { isEarned?: boolean }).isEarned !== false : true;
          const description = isDbTrophy
            ? selectedTrophy.description || trophyDef?.requirement || "Achievement unlocked!"
            : selectedTrophy.requirement;
          const requirement = isDbTrophy
            ? (selectedTrophy as { requirement?: string }).requirement ||
              trophyDef?.requirement ||
              description
            : selectedTrophy.requirement;
          const earnedAt = isDbTrophy ? selectedTrophy.earned_at : undefined;

          return (
            <div
              className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/70 p-4 backdrop-blur-sm fade-in duration-200"
              onClick={() => onSelectTrophy(null)}
            >
              <div
                className="relative w-full max-w-md animate-in rounded-2xl bg-white p-8 shadow-2xl zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => onSelectTrophy(null)}
                  className="absolute right-4 top-4 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close modal"
                >
                  <X className="h-6 w-6" />
                </button>

                <div className="flex flex-col items-center text-center">
                  {displayIcon ? (
                    <div className="mb-6">
                      <span className="text-7xl">{displayIcon}</span>
                    </div>
                  ) : (
                    <div
                      className={`relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full shadow-lg ${
                        isEarned ? "ring-2 ring-amber-400/50" : "ring-2 ring-slate-400/50"
                      }`}
                      style={{
                        backgroundColor: isEarned ? "#f59e0b" : "#64748b",
                      }}
                    >
                      <IconComponent className="h-12 w-12 text-white" />
                      {!isEarned && (
                        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/35 backdrop-blur-[4px]">
                          <Lock className="h-10 w-10 text-white drop-shadow-lg" strokeWidth={2.25} aria-hidden />
                        </span>
                      )}
                    </div>
                  )}

                  <h3 className="mb-3 text-3xl font-bold text-gray-900">{trophyName}</h3>

                  {trophyDef && (
                    <div className="mb-6 w-full rounded-xl border border-stone-200 bg-gradient-to-b from-stone-50 to-white p-4 text-left shadow-sm">
                      <p className="text-[10px] font-bold capitalize tracking-wider text-stone-500">
                        Unlock criteria
                      </p>
                      <p className="mt-1 text-sm text-stone-800">{trophyDef.requirement}</p>
                      <p className="mt-4 text-[10px] font-bold capitalize tracking-wider text-stone-500">
                        Your progress
                      </p>
                      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-all"
                          style={{
                            width: `${Math.min(100, Math.round(trophyDef.getProgress(academyTrophyStats).percentage))}%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-medium text-stone-700">
                        {formatTrophyProgressLine(trophyDef, academyTrophyStats)}
                      </p>
                      <p className="mt-4 border-t border-stone-200/90 pt-3 text-[11px] leading-snug text-stone-500">
                        Progress uses your saved rounds and practice activity in the app.
                      </p>
                    </div>
                  )}

                  {"multiplierCount" in selectedTrophy &&
                    typeof selectedTrophy.multiplierCount === "number" &&
                    selectedTrophy.multiplierCount > 1 && (
                      <div className="mb-6 w-full rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-4 text-left shadow-sm">
                        <p className="text-[10px] font-bold capitalize tracking-wider text-emerald-800">
                          Success history{" "}
                          <span className="font-extrabold text-emerald-900">
                            (x{selectedTrophy.multiplierCount})
                          </span>
                        </p>
                        {(selectedTrophy.multiplierContributions?.length ?? 0) > 0 ? (
                          <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto text-sm">
                            {selectedTrophy.multiplierContributions!.map((row, i) => (
                              <li
                                key={`${row.label}-${row.dateLabel}-${i}`}
                                className="flex items-start justify-between gap-3 border-b border-emerald-100/80 pb-2 last:border-0 last:pb-0"
                              >
                                <span className="text-stone-700">{row.label}</span>
                                <span className="shrink-0 text-right text-xs font-semibold text-stone-900">
                                  {row.dateLabel}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-stone-600">
                            You have met this trophy&apos;s criteria multiple times; detailed per-session lines are
                            not available for this achievement.
                          </p>
                        )}
                      </div>
                    )}

                  {isEarned ? (
                    <p className="mb-6 px-2 text-base leading-relaxed text-gray-600">{description}</p>
                  ) : (
                    <div className="mb-6 rounded-xl border border-amber-200/60 bg-amber-50/50 p-4">
                      <p className="mb-2 flex items-center justify-center gap-2 text-sm font-semibold text-amber-900">
                        <Lock className="h-4 w-4 shrink-0" aria-hidden />
                        Locked
                      </p>
                      <p className="text-center text-base leading-relaxed text-stone-700">
                        Complete{" "}
                        <strong>{requirement || description || "this requirement"}</strong> to unlock.
                      </p>
                    </div>
                  )}

                  {earnedAt && (
                    <div className="mt-2 w-full border-t border-gray-200 pt-4">
                      <p className="text-sm text-gray-500">
                        Earned on{" "}
                        {new Date(earnedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
    </>
  );
}
