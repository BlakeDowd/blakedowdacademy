"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildCoachPlayerCombineSnapshot,
  type CoachCombineSnapshotRow,
} from "@/lib/coachPlayerCombineSnapshot";
import { CombineReportSheet, hasCombineReport } from "@/components/coaching/CombineReportSheet";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; rows: CoachCombineSnapshotRow[] };

/** Best result per Academy combine for a player, shown in the coach's view of their space. */
export function PlayerCombineScores({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState<CoachCombineSnapshotRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void Promise.all([
      supabase
        .from("practice_logs")
        .select("id, user_id, log_type, created_at, total_points, score, matrix_score_average, strike_data")
        .eq("user_id", playerId)
        .order("created_at", { ascending: false })
        .limit(900),
      supabase
        .from("practice")
        .select("*")
        .eq("user_id", playerId)
        .order("created_at", { ascending: false })
        .limit(1600),
    ]).then(([logsRes, practiceRes]) => {
      if (cancelled) return;
      if (logsRes.error && practiceRes.error) {
        setState({ status: "error" });
        return;
      }
      const rows = buildCoachPlayerCombineSnapshot(
        playerId,
        playerName,
        practiceRes.data ?? [],
        logsRes.data ?? [],
      ).filter((r) => r.scoreDisplay);
      setState({ status: "ready", rows });
    });
    return () => {
      cancelled = true;
    };
  }, [playerId, playerName]);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
          <Trophy className="h-4 w-4 text-[#FFA500]" aria-hidden />
          Combine scores
        </h3>
        <Link
          href={`/dashboard/coach/player/${playerId}`}
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#014421] hover:underline"
        >
          Full report
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {state.status === "loading" ? (
        <p className="text-xs text-stone-500">Loading…</p>
      ) : state.status === "error" ? (
        <p className="text-xs text-stone-500">Couldn&apos;t load scores right now.</p>
      ) : state.rows.length === 0 ? (
        <p className="text-xs text-stone-500">No combines logged yet. Tap Test {playerName.split(" ")[0]} to run one.</p>
      ) : (
        <ul className="space-y-2">
          {state.rows.map((row) => {
            const score = (
              <span className="shrink-0 rounded-lg bg-[#014421]/10 px-2.5 py-1 text-xs font-bold text-[#014421]">
                {row.scoreDisplay}
              </span>
            );
            return (
              <li key={row.id}>
                {hasCombineReport(row.id) ? (
                  <button
                    type="button"
                    onClick={() => setOpen(row)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2 text-left hover:bg-stone-100"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-stone-800">{row.label}</span>
                      <span className="block text-[11px] font-semibold text-[#014421]">View report</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {score}
                      <ChevronRight className="h-4 w-4 text-stone-400" aria-hidden />
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-medium text-stone-800">{row.label}</span>
                    {score}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {state.status === "ready" && state.rows.length > 0 && (
        <p className="mt-2 text-[11px] text-stone-400">Personal best for each combine.</p>
      )}
      {open && (
        <CombineReportSheet
          playerId={playerId}
          playerName={playerName}
          testId={open.id}
          label={open.label}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
