"use client";

import { useState } from "react";
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  TROPHY_LIST,
  trophyCaseRowForId,
  type TrophyCaseRow,
  unlockedAccentForTrophy,
  type UnlockedAccent,
} from "@/lib/academyTrophies";
import {
  formatCommunityLeaderboardErrorMessage,
  isMissingLeaderboardRpcError,
  TROPHY_ACHIEVEMENTS_BACKFILL_MIGRATION,
  TROPHY_LEADERBOARD_MERGE_MIGRATION,
  TROPHY_LEADERBOARD_MIGRATION,
  type TrophyCollectionLeaderboardRow,
} from "@/lib/trophyCollectionLeaderboard";

export type TrophyCaseCardTrophy = {
  /** Catalog slug; same as `achievement_id` stored in `user_trophies`. */
  id: string;
  achievement_id: string;
  trophy_name: string;
  trophy_icon?: string;
  description?: string;
  earned_at?: string;
  isEarned: boolean;
  requirement?: string;
};

type TrophyCaseProps = {
  cards: readonly TrophyCaseCardTrophy[];
  /** Times collected per trophy id (max of DB rows and heuristic); drives × badge on cards. */
  collectionCountById: ReadonlyMap<string, number>;
  onSelectTrophy: (trophy: TrophyCaseCardTrophy) => void;
  /** Academy-wide: merged distinct trophy / achievement keys per user (server RPC). */
  communityLeaderboard: readonly TrophyCollectionLeaderboardRow[];
  communityLoading: boolean;
  communityError: string | null;
  communityViewerId: string | null;
  communityViewerRank: number | null;
  communityViewerTotalDb: number;
  /** Unlocked trophies in `user_trophies` (drives friendlier copy when leaderboard is empty). */
  earnedTrophyCount: number;
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

export default function TrophyCase({
  cards,
  collectionCountById,
  onSelectTrophy,
  communityLeaderboard,
  communityLoading,
  communityError,
  communityViewerId,
  communityViewerRank,
  communityViewerTotalDb,
  earnedTrophyCount,
}: TrophyCaseProps) {
  const [communityBoardExpanded, setCommunityBoardExpanded] = useState(false);

  const viewerLeaderboardRow = communityViewerId
    ? communityLeaderboard.find((r) => r.userId === communityViewerId)
    : undefined;

  const rowMeta: { key: TrophyCaseRow; label: string }[] = [
    { key: "volume", label: "Volume (Hours)" },
    { key: "performance", label: "Performance (Scores)" },
    { key: "consistency", label: "Consistency (Streaks)" },
  ];

  const orderIndex = (id: string) => TROPHY_LIST.findIndex((x) => x.id === id);

  /** Body + admin section already explain sync; skip the extra footnote. */
  const suppressRankFootnote =
    Boolean(communityViewerId) &&
    communityViewerRank == null &&
    earnedTrophyCount > 0 &&
    communityLeaderboard.length === 0 &&
    !communityError;

  const hasLeaderboardList =
    !communityLoading && !communityError && communityLeaderboard.length > 0;

  /** With a list: hide footnote while collapsed (compact row / copy covers it); when expanded, hide if signed-in with a rank (row is in the list). */
  const showCommunityRankFootnote =
    !suppressRankFootnote &&
    (!hasLeaderboardList ||
      (hasLeaderboardList &&
        communityBoardExpanded &&
        (!communityViewerId || communityViewerRank == null)));

  const communityBlock = (
    <div className="rounded-xl border border-amber-100/80 bg-amber-50/50 px-3 py-3">
      <p className="text-center text-xs font-semibold text-stone-900">Community ranking</p>
      <p className="mt-0.5 text-center text-[11px] leading-snug text-stone-600">
        Higher unique trophy / achievement count ranks first (duplicate rows are not counted twice). Same rules for everyone.
      </p>
      {communityLoading ? (
        <p className="mt-3 text-center text-[11px] text-stone-500">Loading rankings…</p>
      ) : communityError ? (
        <p
          className={`mt-3 whitespace-pre-wrap text-center text-[11px] leading-snug ${
            isMissingLeaderboardRpcError(communityError) ? "text-amber-900/95" : "text-red-700/90"
          }`}
        >
          {formatCommunityLeaderboardErrorMessage(communityError)}
        </p>
      ) : communityLeaderboard.length === 0 ? (
        <div className="mt-3 space-y-2 text-center text-[11px] leading-snug text-stone-600">
          <p>
            {earnedTrophyCount > 0
              ? "No list yet. Your trophies are saved — player names will appear here when shared rankings are on."
              : "No list yet — player names will appear here once there are unique trophies to rank."}
          </p>
          <details className="rounded-lg bg-white/70 px-2 py-2 text-left ring-1 ring-stone-200/80">
            <summary className="cursor-pointer list-none text-[10px] font-semibold text-stone-600 [&::-webkit-details-marker]:hidden">
              For admins: turn on shared rankings
            </summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-left text-[10px] text-stone-700">
              <li>In your Supabase project, SQL Editor: run each file below in order (paste the full file from the repo).</li>
              <li>Project Settings → API → Reload schema.</li>
              <li>Refresh this page.</li>
            </ol>
            <p className="mt-2 text-[10px] font-medium text-stone-500">Files (in order)</p>
            <code className="mt-0.5 block break-all font-mono text-[10px] text-stone-800">
              supabase/migrations/{TROPHY_LEADERBOARD_MIGRATION}
            </code>
            <code className="mt-1 block break-all font-mono text-[10px] text-stone-800">
              supabase/migrations/{TROPHY_ACHIEVEMENTS_BACKFILL_MIGRATION}
            </code>
            <code className="mt-1 block break-all font-mono text-[10px] text-stone-800">
              supabase/migrations/{TROPHY_LEADERBOARD_MERGE_MIGRATION}
            </code>
          </details>
        </div>
      ) : !communityBoardExpanded ? (
        <div className="mt-2.5 space-y-2">
          {communityViewerId && communityViewerRank != null ? (
            <div className="flex items-baseline gap-2 rounded-lg bg-emerald-50/90 px-2 py-2 ring-1 ring-emerald-300/80 text-left text-[11px]">
              <span className="w-7 shrink-0 tabular-nums font-bold text-stone-500">#{communityViewerRank}</span>
              <span className="min-w-0 flex-1 font-semibold leading-snug text-stone-900">
                {viewerLeaderboardRow?.displayName ?? "You"}
              </span>
              <span className="shrink-0 tabular-nums font-semibold text-stone-700">
                {viewerLeaderboardRow?.totalCollections ?? communityViewerTotalDb}
              </span>
            </div>
          ) : (
            <p className="text-center text-[11px] leading-snug text-stone-600">
              {!communityViewerId
                ? "Sign in to see your place on the board."
                : earnedTrophyCount > 0
                  ? "Your rank will show here once trophy events sync to the shared list."
                  : "Earn a trophy to get on the board — then open the full list to see everyone."}
            </p>
          )}
          <button
            type="button"
            onClick={() => setCommunityBoardExpanded(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-200/90 bg-white/80 py-2 text-[11px] font-semibold text-stone-800 shadow-sm transition hover:bg-white"
          >
            Expand leaderboard
            <ChevronDown className="h-3.5 w-3.5 text-stone-500" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="mt-2.5 space-y-2">
          <ol className="max-h-52 list-none space-y-1 overflow-y-auto pr-0.5 text-left text-[11px]">
            {communityLeaderboard.map((row) => {
              const isViewer = Boolean(communityViewerId && row.userId === communityViewerId);
              return (
                <li
                  key={row.userId}
                  className={`flex items-baseline gap-2 rounded-lg px-2 py-1.5 ring-1 ring-stone-200/70 ${
                    isViewer ? "bg-emerald-50/90 ring-emerald-300/80" : "bg-white/60"
                  }`}
                >
                  <span className="w-7 shrink-0 tabular-nums font-bold text-stone-500">#{row.boardRank}</span>
                  <span className="min-w-0 flex-1 font-medium leading-snug text-stone-900">{row.displayName}</span>
                  <span className="shrink-0 tabular-nums font-semibold text-stone-700">{row.totalCollections}</span>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            onClick={() => setCommunityBoardExpanded(false)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white/90 py-2 text-[11px] font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50/90"
          >
            Collapse leaderboard
            <ChevronUp className="h-3.5 w-3.5 text-stone-500" aria-hidden />
          </button>
        </div>
      )}
      {showCommunityRankFootnote ? (
        <p className="mt-2.5 border-t border-amber-200/60 pt-2 text-center text-[11px] leading-snug text-stone-700">
          {!communityViewerId ? (
            <span className="text-stone-600">Sign in to see your rank among players.</span>
          ) : communityViewerRank != null ? (
            <>
              <span className="font-semibold text-stone-900">You are #{communityViewerRank}</span>
              {" · "}
              <span className="text-stone-600">{communityViewerTotalDb} toward rankings</span>
            </>
          ) : earnedTrophyCount > 0 ? (
            <span className="text-stone-600">
              Your rank will update as new trophy events are recorded.
            </span>
          ) : (
            <span className="text-stone-600">
              You are not on the board yet — earn a trophy so we can record your first event.
            </span>
          )}
        </p>
      ) : null}
    </div>
  );

  if (cards.length === 0) {
    return (
      <div className="space-y-5">
        {communityBlock}
        <div className="py-6 text-center">
          <Trophy className="mx-auto mb-3 h-12 w-12 text-stone-300" />
          <p className="text-sm text-stone-500">No unlocked trophies yet. Keep practicing!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {communityBlock}
      {rowMeta.map(({ key, label }) => {
        const inRow = [...cards]
          .filter((t) => trophyCaseRowForId(t.id) === key)
          .sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
        if (inRow.length === 0) return null;

        return (
          <div key={key}>
            <h3 className="mb-2 px-0.5 text-[10px] font-bold capitalize tracking-[0.18em] text-stone-500">
              {label}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4">
              {inRow.map((trophy, index) => {
                const isEarned = trophy.isEarned;
                const def = TROPHY_LIST.find((x) => x.id === trophy.id);
                const IconComponent = def?.icon ?? Trophy;
                const accent = def ? unlockedAccentForTrophy(def) : "silver";
                const eliteShine = isEarned && def && (def.id === "elite" || def.isRare === true);
                const collectionCount = collectionCountById.get((trophy.id || "").trim()) ?? 0;
                const showMultiplierBadge = isEarned && collectionCount >= 2;

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
                          title={`Collected ${collectionCount} times`}
                        >
                          ×{collectionCount}
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
