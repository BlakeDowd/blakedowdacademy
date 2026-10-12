"use client";

import { useEffect, useState } from "react";
import { ChevronRight, PersonStanding } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mobilityScreenConfig } from "@/lib/mobilityScreenConfig";
import { ReportEmpty, ReportSection } from "@/components/coach/CoachReportParts";
import { CombineReportSheet } from "@/components/coaching/CombineReportSheet";

type Screen = { id: string; at: string; pct: number };
type State = { status: "loading" } | { status: "error" } | { status: "ready"; screens: Screen[] };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** A player's saved mobility screens, newest first, with the full report for each. */
export function PlayerMobilityScreens({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("practice_logs")
      .select("id, created_at, score")
      .eq("user_id", playerId)
      .eq("log_type", mobilityScreenConfig.practiceLogType)
      .order("created_at", { ascending: false })
      .limit(12)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ status: "error" });
          return;
        }
        const screens = (data ?? [])
          .map((r) => ({ id: String(r.id), at: String(r.created_at), pct: Math.round(Number(r.score)) }))
          .filter((s) => Number.isFinite(s.pct));
        setState({ status: "ready", screens });
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const screens = state.status === "ready" ? state.screens : [];
  const latest = screens[0];
  const diff = latest && screens[1] ? latest.pct - screens[1].pct : null;

  return (
    <ReportSection title="Mobility screens" subtitle="Tests passed on each screen, newest first">
      {state.status === "loading" ? (
        <p className="text-xs text-stone-500">Loading…</p>
      ) : state.status === "error" ? (
        <p className="text-xs text-stone-500">Couldn&apos;t load screens right now.</p>
      ) : !latest ? (
        <ReportEmpty>
          No mobility screens yet. Tap Test {playerName.split(" ")[0] || "player"} and pick Mobility Screen to run one.
        </ReportEmpty>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5 text-left hover:bg-stone-100"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#014421]/10 text-[#014421]">
            <PersonStanding className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-stone-800">
              Latest {latest.pct}%
              {diff != null && diff !== 0 && (
                <span className={`ml-1.5 text-xs font-bold ${diff > 0 ? "text-[#014421]" : "text-red-600"}`}>
                  {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}%
                </span>
              )}
            </span>
            <span className="block truncate text-[11px] text-stone-500">
              {screens.map((s) => `${shortDate(s.at)} ${s.pct}%`).join(" · ")}
            </span>
            <span className="block text-[11px] font-semibold text-[#014421]">
              View {screens.length === 1 ? "report" : `all ${screens.length} reports`}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
        </button>
      )}
      {open && (
        <CombineReportSheet
          playerId={playerId}
          playerName={playerName}
          testId={mobilityScreenConfig.practiceLogType}
          label={mobilityScreenConfig.testName}
          onClose={() => setOpen(false)}
        />
      )}
    </ReportSection>
  );
}
