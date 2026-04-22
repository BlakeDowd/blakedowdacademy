"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { CombineHighlightDefinition, ParsedPuttingHole } from "@/lib/combinePageLeaderboard";
import {
  bestSessionPerUser,
  clusterPuttingSessions,
  computeMostImproved,
  extractPracticeLogsScore,
  extractPracticeScoreForHighlight,
  formatImprovementLine,
  parsePuttingHoleRow,
  sortLeaderboardEntries,
  stonecuttersDisplayName,
  type LeaderboardEntry,
} from "@/lib/combinePageLeaderboard";

const LEADERBOARD_PLACEHOLDER =
  "Check back soon for the weekly leaderboard!";
const IMPROVEMENT_PLACEHOLDER = "Check back soon for improvement highlights!";

type ProfileMap = Map<string, string | null>;

async function fetchProfiles(userIds: string[]): Promise<ProfileMap> {
  const map: ProfileMap = new Map();
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return map;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unique);
    if (error) {
      console.warn("[CombineCommunityHighlights] profiles:", error.message);
      return map;
    }
    for (const row of data ?? []) {
      const id = typeof row.id === "string" ? row.id : null;
      if (id) map.set(id, typeof row.full_name === "string" ? row.full_name : null);
    }
  } catch (e) {
    console.warn("[CombineCommunityHighlights] profiles fetch failed", e);
  }
  return map;
}

function displayForUser(
  userId: string,
  viewerId: string | undefined,
  profiles: ProfileMap,
): string {
  if (viewerId && userId === viewerId) return "You";
  return stonecuttersDisplayName(profiles.get(userId) ?? null);
}

export function CombineCommunityHighlights({
  definition,
  emptyLeaderboardMessage = LEADERBOARD_PLACEHOLDER,
  emptyImprovementMessage = IMPROVEMENT_PLACEHOLDER,
}: {
  definition: CombineHighlightDefinition;
  /** Shown when the leaderboard query fails, returns nothing parseable, or has no rows (default: weekly copy). */
  emptyLeaderboardMessage?: string;
  emptyImprovementMessage?: string;
}) {
  const { user } = useAuth();
  const viewerId = user?.id;
  const [top3, setTop3] = useState<{ rank: number; userId: string; label: string; scoreLine: string }[]>([]);
  const [improvementLine, setImprovementLine] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      let sessionRows: { userId: string; created_at: string; sortValue: number; display: string }[] = [];
      let queryOk = false;

      if (definition.kind === "practice_by_test_type") {
        const tt = definition.testType;
        const { data, error: qErr } = await supabase
          .from("practice")
          .select("id,user_id,test_type,type,notes,created_at")
          .or(`test_type.eq.${tt},type.eq.${tt}`)
          .order("created_at", { ascending: false })
          .limit(3000);
        if (qErr) {
          console.warn("[CombineCommunityHighlights] practice query:", qErr.message);
        } else {
          queryOk = true;
          const rows = data ?? [];
          for (const row of rows) {
            const ex = extractPracticeScoreForHighlight(definition.testType, row);
            if (!ex || !row.user_id) continue;
            sessionRows.push({
              userId: String(row.user_id),
              created_at: String(row.created_at ?? ""),
              sortValue: ex.sortValue,
              display: ex.display,
            });
          }
        }
      } else if (definition.kind === "putting_practice") {
        const { data, error: qErr } = await supabase
          .from("practice")
          .select("user_id,created_at,notes")
          .eq("type", definition.practiceType)
          .order("created_at", { ascending: false })
          .limit(5000);
        if (qErr) {
          console.warn("[CombineCommunityHighlights] practice query:", qErr.message);
        } else {
          queryOk = true;
          const holes: ParsedPuttingHole[] = [];
          for (const row of data ?? []) {
            const p = parsePuttingHoleRow(row);
            if (p) holes.push(p);
          }
          const rounds = clusterPuttingSessions(holes, definition.lastHoleIndex);
          sessionRows = rounds.map((r) => ({
            userId: r.user_id,
            created_at: r.created_at,
            sortValue: r.totalPoints,
            display: `${Math.round(r.totalPoints)} pts`,
          }));
        }
      } else {
        const { data, error: qErr } = await supabase
          .from("practice_logs")
          .select("user_id,log_type,matrix_score_average,score,total_points,strike_data,created_at")
          .order("created_at", { ascending: false })
          .limit(3000);
        if (qErr) {
          console.warn("[CombineCommunityHighlights] practice_logs query:", qErr.message);
        } else {
          queryOk = true;
          for (const row of data ?? []) {
            const ex = extractPracticeLogsScore(row, definition.logType, definition.scoreMode);
            if (!ex || !row.user_id) continue;
            sessionRows.push({
              userId: String(row.user_id),
              created_at: String(row.created_at ?? ""),
              sortValue: ex.sortValue,
              display: ex.display,
            });
          }
        }
        // Iron protocol fallback for environments that could not write/read practice_logs.
        if (definition.logType.includes("iron_precision_protocol")) {
          const { data: practiceData, error: practiceErr } = await supabase
            .from("practice")
            .select("user_id,type,test_type,notes,created_at")
            .order("created_at", { ascending: false })
            .limit(3000);
          if (practiceErr) {
            console.warn("[CombineCommunityHighlights] iron practice fallback query:", practiceErr.message);
          } else {
            queryOk = true;
            for (const row of practiceData ?? []) {
              const tt = String(row?.test_type ?? row?.type ?? "").trim().toLowerCase();
              if (!tt.includes("iron_precision_protocol") && !tt.includes("ironprecisionprotocol")) {
                continue;
              }
              const ex = extractPracticeScoreForHighlight("iron_precision_protocol", row);
              const fallbackScore =
                ex?.sortValue ??
                (() => {
                  try {
                    const notes =
                      typeof row.notes === "string"
                        ? JSON.parse(row.notes)
                        : (row.notes as Record<string, unknown> | null);
                    const n = Number(
                      (notes as Record<string, unknown> | null)?.total_points ??
                        (notes as Record<string, unknown> | null)?.matrix_score_average,
                    );
                    return Number.isFinite(n) ? n : null;
                  } catch {
                    return null;
                  }
                })();
              if (fallbackScore == null || !row.user_id) continue;
              sessionRows.push({
                userId: String(row.user_id),
                created_at: String(row.created_at ?? ""),
                sortValue: fallbackScore,
                display: `${Math.round(fallbackScore)} pts`,
              });
            }
          }
        }
      }

      if (!queryOk) {
        setTop3([]);
        setImprovementLine(null);
        return;
      }

      const asEntries: LeaderboardEntry[] = sessionRows.map((r) => ({
        userId: r.userId,
        sortValue: r.sortValue,
        display: r.display,
      }));
      const bestByUser = bestSessionPerUser(asEntries, definition.higherIsBetter);
      const sorted = sortLeaderboardEntries(bestByUser, definition.higherIsBetter).slice(0, 3);

      const imp = computeMostImproved(sessionRows, definition.higherIsBetter);
      const needProfiles = [...sorted.map((s) => s.userId), ...(imp ? [imp.userId] : [])];
      const profiles = await fetchProfiles(needProfiles);

      setTop3(
        sorted.map((s, i) => ({
          rank: i + 1,
          userId: s.userId,
          label: displayForUser(s.userId, viewerId, profiles),
          scoreLine: s.display,
        })),
      );

      if (imp && imp.delta > 0) {
        const name = displayForUser(imp.userId, viewerId, profiles);
        setImprovementLine(formatImprovementLine(name, imp.delta, definition.improvementUnit));
      } else {
        setImprovementLine(null);
      }
    } catch (e) {
      console.warn("[CombineCommunityHighlights] load failed", e);
      setTop3([]);
      setImprovementLine(null);
    } finally {
      setLoading(false);
    }
  }, [definition, viewerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener("practiceSessionsUpdated", onRefresh);
    return () => window.removeEventListener("practiceSessionsUpdated", onRefresh);
  }, [load]);

  const showLeaderboardPlaceholder = !loading && top3.length === 0;
  const showImprovementPlaceholder = !loading && !improvementLine;

  return (
    <div className="mt-8 space-y-4 border-t border-gray-200 pt-6">
      <h2 className="text-sm font-semibold tracking-wide text-gray-500">Combine community</h2>

      <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-900 mb-3">Combine leaders</p>
        {loading && (
          <p className="text-center text-sm text-gray-400">Loading leaderboard…</p>
        )}
        {showLeaderboardPlaceholder && (
          <p className="text-center text-sm text-gray-400 leading-relaxed px-2">{emptyLeaderboardMessage}</p>
        )}
        {!loading && top3.length > 0 && (
          <ol className="space-y-2">
            {top3.map((row) => (
              <li
                key={row.userId + row.rank}
                className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 border border-gray-100"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{row.rank}</span>
                  {row.rank === 1 && <Trophy className="h-4 w-4 text-amber-500 shrink-0" aria-label="First place" />}
                  <span className="text-sm font-medium text-gray-900 truncate">{row.label}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-[#014421] shrink-0">{row.scoreLine}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Most improved</p>
        {loading && <p className="text-center text-sm text-gray-400">Loading…</p>}
        {!loading && improvementLine ? (
          <p className="text-sm text-gray-800 leading-relaxed">{improvementLine}</p>
        ) : null}
        {showImprovementPlaceholder && (
          <p className="text-center text-sm text-gray-400 leading-relaxed px-2">{emptyImprovementMessage}</p>
        )}
      </div>
    </div>
  );
}
