"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import {
  collectCombineAttempts,
  type CombineLeaderboardTestId,
} from "@/lib/academyCombinesLeaderboard";
import { formatSelfCompare } from "@/components/combine/CombineGradeSummary";
import { PRACTICE_HANDICAP_RECENT_ATTEMPTS } from "@/lib/practiceHandicap";

/**
 * Compare the just-finished score to the player's prior attempts (up to last 3).
 * When `excludeLatest` is true (default), skips the newest attempt so a just-saved
 * row doesn't compare against itself.
 */
export function useCombineSelfCompare(
  testId: CombineLeaderboardTestId | null,
  currentScore: number | null,
  opts?: {
    higherIsBetter?: boolean;
    unit?: string;
    excludeLatest?: boolean;
  },
) {
  const { user } = useAuth();
  const { practiceSessions, practiceLogs } = useStats();
  const higherIsBetter = opts?.higherIsBetter ?? true;
  const unit = opts?.unit ?? "pts";
  const excludeLatest = opts?.excludeLatest ?? true;

  return useMemo(() => {
    if (!testId || currentScore == null || !Number.isFinite(currentScore) || !user?.id) {
      return null;
    }
    const mine = collectCombineAttempts(testId, practiceSessions, practiceLogs, "allTime")
      .filter((a) => a.userId === user.id)
      .sort((a, b) => b.dateMs - a.dateMs);
    const prior = (excludeLatest ? mine.slice(1) : mine).slice(0, PRACTICE_HANDICAP_RECENT_ATTEMPTS);
    return formatSelfCompare({
      current: currentScore,
      recent: prior.map((a) => a.sortValue),
      higherIsBetter,
      unit,
    });
  }, [
    testId,
    currentScore,
    user?.id,
    practiceSessions,
    practiceLogs,
    higherIsBetter,
    unit,
    excludeLatest,
  ]);
}
