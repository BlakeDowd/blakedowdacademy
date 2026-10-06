"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import { Medal, Crown } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { getEmblem } from "@/components/emblems/EmblemBadge";
import { isPhotoPicture } from "@/lib/profilePicture";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchUserProfiles,
  formatLeaderboardValue,
  getLeaderboardData,
  getMockLeaderboard,
} from "@/lib/academyLeaderboard";
import { fetchAllLibraryCompletions, type LibraryCompletionRow } from "@/lib/libraryCompletions";
import { keepElementInView } from "@/hooks/useKeepInView";

export const HALL_OF_FAME_LEADERBOARD_ID = "hall-of-fame-leaderboard";

type LeaderboardMetric =
  | "xp"
  | "library"
  | "practice"
  | "rounds"
  | "drills"
  | "lowGross"
  | "lowNett"
  | "birdies"
  | "eagles"
  | "lowestPutts"
  | "bogeyFreeRounds"
  | "doubleFreeRounds";

type TimeFilter = "week" | "month" | "year" | "allTime";

const METRIC_OPTIONS: { value: LeaderboardMetric; label: string }[] = [
  { value: "xp", label: "Overall (Total XP)" },
  { value: "practice", label: "Practice Hours" },
  { value: "library", label: "Library Lessons" },
  { value: "rounds", label: "Rounds Entered" },
  { value: "drills", label: "Drills" },
  { value: "lowGross", label: "Low Gross" },
  { value: "lowNett", label: "Low Nett" },
  { value: "birdies", label: "Birdies" },
  { value: "eagles", label: "Eagles" },
  { value: "lowestPutts", label: "Lowest Putts" },
  { value: "bogeyFreeRounds", label: "Bogey Free Rounds" },
  { value: "doubleFreeRounds", label: "Double Free Rounds" },
];

const TIME_LABELS: Record<TimeFilter, string> = {
  week: "This Week",
  month: "This Month",
  year: "This Year",
  allTime: "All-Time",
};

const COMPACT_TOP_COUNT = 3;

function collectLeaderboardUserIds(...sources: unknown[][]) {
  const ids = sources.flatMap((rows) =>
    (rows || []).map((r) => (r as { user_id?: string }).user_id).filter(Boolean),
  );
  return Array.from(new Set(ids)) as string[];
}

export type HallOfFameLeaderboardProps = {
  id?: string;
  className?: string;
  /** Show only the top 3 and the current user until expanded. */
  compact?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

function CircularAvatar({
  initial,
  iconId,
  size = 60,
  bgColor = "#FFA500",
}: {
  initial: string;
  iconId?: string;
  size?: number;
  bgColor?: string;
}) {
  if (isPhotoPicture(iconId) || getEmblem(iconId)) {
    return <ProfileAvatar picture={iconId} name={initial} size={size} />;
  }

  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        backgroundColor: bgColor,
        fontSize: size * 0.4,
      }}
    >
      <span
        className="text-white font-bold"
        style={{ fontSize: size * 0.4 }}
      >
        {initial}
      </span>
    </div>
  );
}

function HallOfFameLeaderboardInner(
  {
    id = HALL_OF_FAME_LEADERBOARD_ID,
    className = "mb-6 w-full px-4 scroll-mt-4",
    compact = false,
    expanded = false,
    onExpandedChange,
  }: HallOfFameLeaderboardProps,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const showCompact = compact && !expanded;
  const { communityRounds, drills, practiceSessions, practiceLogs } = useStats();
  const { user } = useAuth();

  const practiceLogsIdentity = useMemo(() => {
    const rows = practiceLogs || [];
    const ids = [...new Set(rows.map((p: { user_id?: string }) => p.user_id).filter(Boolean))].sort();
    return `${rows.length}:${ids.join(",")}`;
  }, [practiceLogs]);

  const [userProfiles, setUserProfiles] = useState<
    Map<string, { full_name?: string; preferred_icon_id?: string; xp?: number }>
  >(new Map());

  const [libraryCompletions, setLibraryCompletions] = useState<LibraryCompletionRow[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void fetchAllLibraryCompletions().then((rows) => {
      if (!cancelled) setLibraryCompletions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>("xp");
  const [cachedLeaderboard, setCachedLeaderboard] = useState<{
    top3: unknown[];
    all: unknown[];
    userRank: number;
    userValue: number;
  } | null>(null);

  const userName = useMemo(() => {
    if (user?.fullName) return user.fullName;
    if (user?.email) return user.email;
    return "";
  }, [user?.fullName, user?.email]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const uniqueUserIds = collectLeaderboardUserIds(
        communityRounds || [],
        drills || [],
        practiceSessions || [],
        practiceLogs || [],
        libraryCompletions,
      );

      if (uniqueUserIds.length === 0) return;

      const profiles = await fetchUserProfiles(uniqueUserIds);
      setUserProfiles(profiles);
    };

    void fetchProfiles();
  }, [
    communityRounds?.length ?? 0,
    drills?.length ?? 0,
    practiceSessions?.length ?? 0,
    practiceLogsIdentity,
    libraryCompletions,
  ]);

  useEffect(() => {
    const handleXPUpdate = () => {
      const fetchProfiles = async () => {
        const uniqueUserIds = collectLeaderboardUserIds(
          communityRounds || [],
          drills || [],
          practiceSessions || [],
          practiceLogs || [],
          libraryCompletions,
        );

        if (uniqueUserIds.length > 0) {
          const profiles = await fetchUserProfiles(uniqueUserIds);
          setUserProfiles(profiles);
        }
      };
      void fetchProfiles();
    };

    window.addEventListener("xpUpdated", handleXPUpdate);
    return () => {
      window.removeEventListener("xpUpdated", handleXPUpdate);
    };
  }, [
    communityRounds?.length ?? 0,
    drills?.length ?? 0,
    practiceSessions?.length ?? 0,
    practiceLogsIdentity,
    libraryCompletions,
  ]);

  useEffect(() => {
    if (!user?.id) return;

    try {
      const totalXP = user?.totalXP || 0;

      const metrics = [
        "lowGross",
        "lowNett",
        "birdies",
        "eagles",
        "lowestPutts",
        "bogeyFreeRounds",
        "doubleFreeRounds",
      ] as const;
      const scoreBasedLeaderboards: Record<string, ReturnType<typeof getLeaderboardData>> = {};

      metrics.forEach((metric) => {
        scoreBasedLeaderboards[metric] = getLeaderboardData(
          metric,
          timeFilter,
          communityRounds,
          totalXP,
          userName,
          user,
          userProfiles,
          practiceSessions,
          drills,
          practiceLogs || [],
        );
      });

      const currentMetric = leaderboardMetric;
      if (
        currentMetric === "lowGross" ||
        currentMetric === "lowNett" ||
        currentMetric === "birdies" ||
        currentMetric === "eagles" ||
        currentMetric === "lowestPutts" ||
        currentMetric === "bogeyFreeRounds" ||
        currentMetric === "doubleFreeRounds"
      ) {
        const scoreBasedLeaderboard = scoreBasedLeaderboards[currentMetric];
        const newLeaderboardStr = JSON.stringify(scoreBasedLeaderboard);
        const cachedLeaderboardStr = JSON.stringify(cachedLeaderboard);
        if (newLeaderboardStr !== cachedLeaderboardStr) {
          setCachedLeaderboard(scoreBasedLeaderboard);
        }
      }
    } catch (error) {
      console.error("HallOfFame: Error calculating score-based leaderboard:", error);
    }
  }, [
    user?.id,
    communityRounds?.length,
    drills?.length,
    practiceSessions?.length,
    practiceLogsIdentity,
    timeFilter,
    user?.totalXP,
    userName,
    userProfiles,
    leaderboardMetric,
  ]);

  const currentLeaderboard = useMemo(() => {
    if (
      leaderboardMetric === "xp" ||
      leaderboardMetric === "lowGross" ||
      leaderboardMetric === "lowNett" ||
      leaderboardMetric === "birdies" ||
      leaderboardMetric === "eagles" ||
      leaderboardMetric === "lowestPutts" ||
      leaderboardMetric === "bogeyFreeRounds" ||
      leaderboardMetric === "doubleFreeRounds"
    ) {
      if (cachedLeaderboard && leaderboardMetric !== "xp") {
        return cachedLeaderboard;
      }
      if (user?.id) {
        const totalXP = user?.totalXP || 0;
        return getLeaderboardData(
          leaderboardMetric,
          timeFilter,
          communityRounds,
          totalXP,
          userName,
          user,
          userProfiles,
          practiceSessions,
          drills,
          practiceLogs || [],
        );
      }
      return { top3: [], all: [], userRank: 0, userValue: 0 };
    }

    const emptyFour = { top3: [], all: [], userRank: 0, userValue: 0 };
    if (!userName) return emptyFour;

    switch (leaderboardMetric) {
      case "library":
      case "practice":
      case "rounds":
      case "drills":
        return getMockLeaderboard(
          leaderboardMetric,
          timeFilter,
          communityRounds,
          userName,
          user,
          userProfiles,
          drills,
          practiceSessions,
          libraryCompletions,
        );
      default:
        return emptyFour;
    }
  }, [
    cachedLeaderboard,
    leaderboardMetric,
    timeFilter,
    communityRounds,
    userName,
    user,
    userProfiles,
    practiceSessions,
    drills,
    practiceLogs,
    libraryCompletions,
  ]);

  return (
    <div ref={ref} id={id} className={className}>
      <div className="rounded-2xl overflow-hidden border-2 border-amber-200/60 bg-gradient-to-b from-stone-50 via-white to-amber-50/30 shadow-md w-full flex flex-col">
        {showCompact ? (
          <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Medal className="w-5 h-5 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <h3 className="text-base font-bold text-stone-900 leading-tight">Leaderboard</h3>
                <p className="text-xs text-stone-500 truncate">
                  {METRIC_OPTIONS.find((m) => m.value === leaderboardMetric)?.label} ·{" "}
                  {TIME_LABELS[timeFilter]}
                </p>
              </div>
            </div>
          </div>
        ) : (
        <div className="px-5 pt-5 pb-3 text-center border-b border-amber-100/80 bg-stone-900/[0.03]">
          <div className="inline-flex items-center gap-2 text-amber-800/90 mb-1">
            <Medal className="w-5 h-5" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em]">Hall Of Fame</p>
          </div>
          <h3 className="text-xl font-bold text-stone-900 font-serif tracking-tight">
            Academy Leaderboard
          </h3>
          <p className="text-xs text-stone-600 mt-1 max-w-md mx-auto">
            Pick a category to compare academy-wide rankings.
          </p>
        </div>
        )}

        {!showCompact ? (
        <>
        <div className="px-4 pb-3 pt-4 max-w-xl mx-auto w-full">
          <label
            htmlFor="stats-category-select"
            className="block text-xs font-semibold uppercase tracking-wide text-stone-600 mb-1.5"
          >
            Category
          </label>
          <select
            id="stats-category-select"
            value={leaderboardMetric}
            onChange={(e) => {
              setLeaderboardMetric(e.target.value as LeaderboardMetric);
            }}
            className="w-full px-3 py-2.5 rounded-xl text-sm font-medium text-stone-900 bg-white border border-stone-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#014421]/30 focus:border-[#014421]"
          >
            {METRIC_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="px-4 pb-4 w-full">
          <div className="flex items-center justify-center gap-2 sm:gap-2.5 flex-wrap max-w-xl mx-auto">
            {(() => {
              return (["week", "month", "year", "allTime"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setTimeFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                    timeFilter === filter
                      ? "text-white bg-[#014421]"
                      : "text-stone-600 bg-stone-100 hover:bg-stone-200"
                  }`}
                >
                  {TIME_LABELS[filter]}
                </button>
              ));
            })()}
          </div>
        </div>
        </>
        ) : null}

        <div className={`px-3 sm:px-5 ${compact ? "pb-3" : "pb-5"}`}>
          {(() => {
              const dataToRender =
                leaderboardMetric === "xp"
                  ? getLeaderboardData(
                      "xp",
                      timeFilter,
                      communityRounds || [],
                      user?.totalXP || 0,
                      userName || "Academy Member",
                      user,
                      userProfiles,
                      practiceSessions || [],
                      drills || [],
                      practiceLogs || [],
                    )
                  : currentLeaderboard;

              if (!dataToRender || !dataToRender.all || dataToRender.all.length === 0) {
                const timeLabels = {
                  week: "this week",
                  month: "this month",
                  year: "this year",
                  allTime: "yet",
                };
                return (
                  <div
                    className={`text-center flex-1 flex flex-col items-center justify-center ${
                      showCompact ? "min-h-[72px]" : "min-h-[160px]"
                    }`}
                  >
                    <p className="text-sm text-stone-500">
                      No data for {timeLabels[timeFilter]}. Start logging to take the lead!
                    </p>
                  </div>
                );
              }

              const topCount = showCompact ? COMPACT_TOP_COUNT : 20;
              const top20 = dataToRender.all.slice(0, topCount);
              const meEntry = dataToRender.all.find((e: { isCurrentUser?: boolean }) => e.isCurrentUser);
              const meInTop20 = top20.some((e: { isCurrentUser?: boolean }) => e.isCurrentUser);
              const meRank =
                meEntry != null
                  ? dataToRender.all.findIndex((e: { isCurrentUser?: boolean }) => e.isCurrentUser) + 1
                  : 0;

              const renderRow = (
                entry: {
                  id?: string;
                  full_name?: string;
                  display_name?: string;
                  email?: string;
                  name?: string;
                  isCurrentUser?: boolean;
                  value?: number;
                  avatar?: string;
                },
                rank: number,
                keySuffix: string,
              ) => {
                const displayName =
                  entry.full_name ||
                  entry.display_name ||
                  (entry.email?.includes("@")
                    ? entry.email.split("@")[0]
                    : entry.email) ||
                  (entry.name?.includes("@")
                    ? entry.name.split("@")[0]
                    : entry.name) ||
                  "Academy Member";
                const isMe = entry.isCurrentUser;
                const displayValue = formatLeaderboardValue(
                  entry.value ?? 0,
                  leaderboardMetric as Parameters<typeof formatLeaderboardValue>[1],
                );
                const podium =
                  rank === 1
                    ? "border-l-4 border-amber-400 bg-amber-50/50 ring-1 ring-amber-200/50"
                    : rank === 2
                      ? "border-l-4 border-slate-400 bg-slate-50/90 ring-1 ring-slate-200/60"
                      : rank === 3
                        ? "border-l-4 border-amber-800/50 bg-orange-50/50 ring-1 ring-orange-200/50"
                        : "border-l-4 border-transparent bg-white/60";
                return (
                  <div
                    key={entry.id ? `${entry.id}-${keySuffix}` : `rank-${rank}-${keySuffix}`}
                    className={`grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,5.5rem)] gap-1 sm:gap-2 items-center px-2 py-2 rounded-xl transition-all ${podium} ${
                      isMe ? "ring-2 ring-[#014421]/40" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-bold tabular-nums text-center ${
                        rank === 1
                          ? "text-amber-600"
                          : rank === 2
                            ? "text-slate-500"
                            : rank === 3
                              ? "text-orange-800/80"
                              : "text-stone-700"
                      }`}
                    >
                      {rank}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="shrink-0 relative">
                        {rank === 1 && keySuffix === "top" && (
                          <Crown className="w-4 h-4 absolute -top-2 -right-1 text-amber-500" />
                        )}
                        <CircularAvatar
                          initial={displayName[0]}
                          iconId={entry.avatar || undefined}
                          size={36}
                          bgColor={isMe ? "#014421" : rank <= 3 ? "#b45309" : "#78716c"}
                        />
                      </div>
                      <span className="text-sm font-semibold text-stone-900 truncate" title={displayName}>
                        {displayName}
                        {isMe && (
                          <span className="text-[10px] font-bold text-[#014421] ml-1">(You)</span>
                        )}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-[#014421] text-right tabular-nums leading-tight">
                      {displayValue}
                    </span>
                  </div>
                );
              };

              return (
                <div className="mx-auto w-full max-w-xl space-y-2">
                  {top20.map((entry: unknown, index: number) =>
                    renderRow(entry as Parameters<typeof renderRow>[0], index + 1, "top"),
                  )}
                  {user?.id && meEntry && !meInTop20 && meRank > 0 ? (
                    <div className="pt-2 mt-1 border-t border-stone-200">
                      <p className="text-xs text-stone-500 mb-2 text-center">
                        {showCompact
                          ? `Your rank: #${meRank}`
                          : `Your rank (#${meRank}) — not in the top 20 for this filter`}
                      </p>
                      {renderRow(meEntry as Parameters<typeof renderRow>[0], meRank, "you")}
                    </div>
                  ) : null}
                </div>
              );
            })()}
          {compact ? (
            <button
              type="button"
              onClick={(e) => {
                onExpandedChange?.(!expanded);
                keepElementInView(e.currentTarget.closest(`#${id}`));
              }}
              className="mt-3 w-full rounded-xl py-2 text-sm font-semibold text-[#014421] hover:bg-stone-100"
            >
              {expanded ? "Show less" : "See full leaderboard"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const HallOfFameLeaderboard = forwardRef(HallOfFameLeaderboardInner);
HallOfFameLeaderboard.displayName = "HallOfFameLeaderboard";
