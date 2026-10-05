"use client";

import { createElement, useState } from "react";
import type { ComponentType } from "react";
import { Trophy, Lock, ChevronDown, ChevronUp } from "lucide-react";
import {
  TROPHY_GROUPS,
  TROPHY_LIST,
  trophyGroupForId,
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

/** Icon lookup for trophy case cards and the Academy trophy modal. */
export function getTrophyIconComponent(id: string): ComponentType<{ className?: string }> {
  return TROPHY_LIST.find((t) => t.id === id)?.icon ?? Trophy;
}

function TrophyIcon({ id, className }: { id: string; className: string }) {
  return createElement(getTrophyIconComponent(id), { className, "aria-hidden": true } as { className?: string });
}

const ACCENT_BADGE: Record<UnlockedAccent, string> = {
  gold: "bg-gradient-to-br from-amber-300 to-amber-500 text-white ring-2 ring-amber-200",
  emerald: "bg-gradient-to-br from-emerald-600 to-[#014421] text-white ring-2 ring-emerald-200",
  silver: "bg-gradient-to-br from-slate-300 to-slate-500 text-white ring-2 ring-slate-200",
};

export function accentForTrophyId(id: string): UnlockedAccent {
  const def = TROPHY_LIST.find((t) => t.id === id);
  return def ? unlockedAccentForTrophy(def) : "silver";
}

const RING_RADIUS = 21;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Small round trophy medallion; locked trophies show an orange progress ring. */
export function TrophyMedal({
  id,
  isEarned,
  percentage,
  size = "md",
}: {
  id: string;
  isEarned: boolean;
  percentage: number;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "h-16 w-16" : size === "sm" ? "h-8 w-8" : "h-12 w-12";
  const icon = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";

  if (isEarned) {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-full shadow-sm ${box} ${ACCENT_BADGE[accentForTrophyId(id)]}`}>
        <TrophyIcon id={id} className={icon} />
      </span>
    );
  }

  const pct = Math.max(0, Math.min(100, percentage));
  return (
    <span className={`relative flex shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-400 ${box}`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={RING_RADIUS} fill="none" stroke="#e7e5e4" strokeWidth="3" />
        {pct > 0 && (
          <circle
            cx="24"
            cy="24"
            r={RING_RADIUS}
            fill="none"
            stroke="#FFA500"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * RING_LENGTH} ${RING_LENGTH}`}
          />
        )}
      </svg>
      {pct > 0 ? <TrophyIcon id={id} className={icon} /> : <Lock className={icon} aria-hidden />}
    </span>
  );
}

type TrophyGridProps = {
  cards: readonly TrophyCaseCardTrophy[];
  /** Times collected per trophy id; drives the × badge. */
  collectionCountById: ReadonlyMap<string, number>;
  progressById: ReadonlyMap<string, number>;
  onSelectTrophy: (trophy: TrophyCaseCardTrophy) => void;
};

export default function TrophyCase({ cards, collectionCountById, progressById, onSelectTrophy }: TrophyGridProps) {
  const orderIndex = (id: string) => TROPHY_LIST.findIndex((x) => x.id === id);

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl bg-stone-50 py-6 text-center">
        <Trophy className="mx-auto mb-2 h-8 w-8 text-stone-300" aria-hidden />
        <p className="text-sm text-stone-500">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {TROPHY_GROUPS.map(({ id: group, label }) => {
        const inGroup = cards
          .filter((t) => trophyGroupForId(t.id) === group)
          .sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
        if (inGroup.length === 0) return null;
        const earnedInGroup = inGroup.filter((t) => t.isEarned).length;

        return (
          <div key={group}>
            <div className="mb-2 flex items-baseline justify-between px-0.5">
              <h4 className="text-xs font-bold text-stone-700">{label}</h4>
              <span className="text-[11px] font-medium text-stone-400">
                {earnedInGroup}/{inGroup.length}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-6">
              {inGroup.map((trophy) => {
                const count = collectionCountById.get(trophy.id) ?? 0;
                return (
                  <button
                    key={trophy.id}
                    type="button"
                    onClick={() => onSelectTrophy(trophy)}
                    className="group relative flex flex-col items-center gap-1 rounded-xl p-1 text-center transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#014421]/35"
                    aria-label={`${trophy.trophy_name}${trophy.isEarned ? " (earned)" : " (locked)"}`}
                  >
                    <span className="relative transition-transform group-hover:scale-105">
                      <TrophyMedal
                        id={trophy.id}
                        isEarned={trophy.isEarned}
                        percentage={progressById.get(trophy.id) ?? 0}
                      />
                      {trophy.isEarned && count >= 2 && (
                        <span className="absolute -right-1.5 -top-1 rounded-full bg-[#FFA500] px-1 text-[9px] font-black leading-4 text-white shadow">
                          ×{count}
                        </span>
                      )}
                    </span>
                    <span
                      className={`line-clamp-2 text-[10px] font-semibold leading-tight ${
                        trophy.isEarned ? "text-stone-800" : "text-stone-400"
                      }`}
                    >
                      {trophy.trophy_name}
                    </span>
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

type CommunityRankingProps = {
  leaderboard: readonly TrophyCollectionLeaderboardRow[];
  loading: boolean;
  error: string | null;
  viewerId: string | null;
  viewerRank: number | null;
  viewerTotalDb: number;
  earnedTrophyCount: number;
};

/** Academy-wide trophy collection ranking, collapsed to a single row by default. */
export function TrophyCommunityRanking({
  leaderboard,
  loading,
  error,
  viewerId,
  viewerRank,
  viewerTotalDb,
  earnedTrophyCount,
}: CommunityRankingProps) {
  const [expanded, setExpanded] = useState(false);
  const viewerRow = viewerId ? leaderboard.find((r) => r.userId === viewerId) : undefined;

  const summary = loading
    ? "Loading…"
    : error
      ? "Unavailable"
      : viewerRank != null
        ? `You're #${viewerRank} · ${viewerRow?.totalCollections ?? viewerTotalDb} trophies`
        : leaderboard.length > 0
          ? "Earn a trophy to get on the board"
          : "No rankings yet";

  return (
    <div className="rounded-2xl bg-stone-50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block text-xs font-bold text-stone-800">Community ranking</span>
          <span className="block truncate text-[11px] text-stone-500">{summary}</span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
        )}
      </button>

      {expanded && (
        <div className="border-t border-stone-200 px-3 pb-3 pt-2.5">
          {loading ? (
            <p className="text-center text-[11px] text-stone-500">Loading rankings…</p>
          ) : error ? (
            <p
              className={`whitespace-pre-wrap text-center text-[11px] leading-snug ${
                isMissingLeaderboardRpcError(error) ? "text-amber-900/95" : "text-red-700/90"
              }`}
            >
              {formatCommunityLeaderboardErrorMessage(error)}
            </p>
          ) : leaderboard.length === 0 ? (
            <div className="space-y-2 text-center text-[11px] leading-snug text-stone-600">
              <p>
                {earnedTrophyCount > 0
                  ? "Your trophies are saved. Player names will appear here when shared rankings are on."
                  : "Player names will appear here once there are trophies to rank."}
              </p>
              <details className="rounded-lg bg-white px-2 py-2 text-left ring-1 ring-stone-200/80">
                <summary className="cursor-pointer list-none text-[10px] font-semibold text-stone-600 [&::-webkit-details-marker]:hidden">
                  For admins: turn on shared rankings
                </summary>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-left text-[10px] text-stone-700">
                  <li>In your Supabase project, SQL Editor: run each file below in order.</li>
                  <li>Project Settings → API → Reload schema.</li>
                  <li>Refresh this page.</li>
                </ol>
                {[TROPHY_LEADERBOARD_MIGRATION, TROPHY_ACHIEVEMENTS_BACKFILL_MIGRATION, TROPHY_LEADERBOARD_MERGE_MIGRATION].map(
                  (file) => (
                    <code key={file} className="mt-1 block break-all font-mono text-[10px] text-stone-800">
                      supabase/migrations/{file}
                    </code>
                  ),
                )}
              </details>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[11px] leading-snug text-stone-500">
                Ranked by unique trophies collected. Same rules for everyone.
              </p>
              <ol className="max-h-52 list-none space-y-1 overflow-y-auto pr-0.5 text-[11px]">
                {leaderboard.map((row) => {
                  const isViewer = Boolean(viewerId && row.userId === viewerId);
                  return (
                    <li
                      key={row.userId}
                      className={`flex items-baseline gap-2 rounded-lg px-2 py-1.5 ${
                        isViewer ? "bg-[#014421]/10 ring-1 ring-[#014421]/30" : "bg-white"
                      }`}
                    >
                      <span className="w-7 shrink-0 font-bold tabular-nums text-stone-500">#{row.boardRank}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-stone-900">{row.displayName}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-stone-700">{row.totalCollections}</span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
