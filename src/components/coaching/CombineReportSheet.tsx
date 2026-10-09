"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { CombineLeaderboardTestId } from "@/lib/academyCombinesLeaderboard";
import { parseNotes } from "@/lib/combineReportData";
import { ironPrecisionProtocolConfig } from "@/lib/ironPrecisionProtocolConfig";
import { ironFaceControlConfig } from "@/lib/ironFaceControlConfig";
import { threeStrikesWedgeConfig } from "@/lib/threeStrikesWedgeConfig";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import { IronPrecisionReport, parseIronPrecisionShots } from "@/components/IronPrecisionProtocolRunner";
import { IronFaceControlReport, parseIronFaceShots } from "@/components/IronFaceControlRunner";
import { IronSafeSideReport, parseSafeSideShots } from "@/components/IronSafeSideRunner";
import { ironSafeSideConfig } from "@/lib/ironSafeSideConfig";
import { IronFadeDrawReport, parseFadeDrawShots } from "@/components/IronFadeDrawRunner";
import { ironFadeDrawConfig } from "@/lib/ironFadeDrawConfig";
import { ThreeStrikesReport, parseThreeStrikesShots } from "@/components/ThreeStrikesWedgeRunner";
import { WedgeLateral9Report, parseWedgeLateral9Shots } from "@/components/WedgeLateral9Runner";

type Session = { id: string; at: string; score: string; report: ReactNode | null };
type Row = Record<string, unknown> & { id: string; created_at: string };
type Loader = (supabase: SupabaseClient, playerId: string) => Promise<Session[]>;

const SESSION_LIMIT = 12;

const points = (v: unknown, unit = "pts") => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? `${Math.round(n)} ${unit}` : "";
};

async function practiceLogs(supabase: SupabaseClient, playerId: string, logTypes: string[], columns: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from("practice_logs")
    .select(`id, created_at, total_points, ${columns}`)
    .eq("user_id", playerId)
    .in("log_type", logTypes)
    .order("created_at", { ascending: false })
    .limit(SESSION_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

const LOADERS: Partial<Record<CombineLeaderboardTestId, Loader>> = {
  ironPrecisionProtocol: async (supabase, playerId) => {
    const rows = await practiceLogs(
      supabase,
      playerId,
      [ironPrecisionProtocolConfig.practiceLogType, "ironPrecisionProtocol"],
      "strike_data",
    );
    return rows.map((r) => {
      const shots = parseIronPrecisionShots(r.strike_data);
      return { id: r.id, at: r.created_at, score: points(r.total_points), report: shots && <IronPrecisionReport shots={shots} /> };
    });
  },
  iron_face_control: async (supabase, playerId) => {
    const rows = await practiceLogs(supabase, playerId, [ironFaceControlConfig.practiceLogType], "strike_data");
    return rows.map((r) => {
      const shots = parseIronFaceShots(r.strike_data);
      return { id: r.id, at: r.created_at, score: points(r.total_points), report: shots && <IronFaceControlReport shots={shots} /> };
    });
  },
  iron_safe_side: async (supabase, playerId) => {
    const rows = await practiceLogs(supabase, playerId, [ironSafeSideConfig.practiceLogType], "strike_data");
    return rows.map((r) => {
      const shots = parseSafeSideShots(r.strike_data);
      return { id: r.id, at: r.created_at, score: points(r.total_points), report: shots && <IronSafeSideReport shots={shots} /> };
    });
  },
  iron_fade_draw: async (supabase, playerId) => {
    const rows = await practiceLogs(supabase, playerId, [ironFadeDrawConfig.practiceLogType], "strike_data");
    return rows.map((r) => {
      const shots = parseFadeDrawShots(r.strike_data);
      return { id: r.id, at: r.created_at, score: points(r.total_points), report: shots && <IronFadeDrawReport shots={shots} /> };
    });
  },
  three_strikes: async (supabase, playerId) => {
    const rows = await practiceLogs(supabase, playerId, [threeStrikesWedgeConfig.practiceLogType], "notes");
    return rows.map((r) => {
      const shots = parseThreeStrikesShots(r.notes);
      return { id: r.id, at: r.created_at, score: points(r.total_points, "hits"), report: shots && <ThreeStrikesReport shots={shots} /> };
    });
  },
  wedge_lateral_9: async (supabase, playerId) => {
    const { data, error } = await supabase
      .from("practice")
      .select("id, created_at, notes")
      .eq("user_id", playerId)
      .eq("type", wedgeLateral9Config.testType)
      .order("created_at", { ascending: false })
      .limit(SESSION_LIMIT);
    if (error) throw error;
    return ((data ?? []) as Row[]).map((r) => {
      const shots = parseWedgeLateral9Shots(r.notes);
      const total = shots ? shots.reduce((sum, s) => sum + s.points, 0) : parseNotes(r.notes)?.total_points;
      return { id: r.id, at: r.created_at, score: points(total), report: shots && <WedgeLateral9Report shots={shots} /> };
    });
  },
};

export function hasCombineReport(testId: CombineLeaderboardTestId): boolean {
  return testId in LOADERS;
}

function sessionLabel(at: string): string {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${time}`;
}

type State = { status: "loading" } | { status: "error" } | { status: "ready"; sessions: Session[] };

/** Full-screen results report for a player's saved combine sessions, newest first. */
export function CombineReportSheet({
  playerId,
  playerName,
  testId,
  label,
  onClose,
}: {
  playerId: string;
  playerName: string;
  testId: CombineLeaderboardTestId;
  label: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [picked, setPicked] = useState(0);

  useEffect(() => {
    const load = LOADERS[testId];
    if (!load) return;
    let cancelled = false;
    load(createClient(), playerId)
      .then((sessions) => !cancelled && setState({ status: "ready", sessions }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [playerId, testId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const sessions = state.status === "ready" ? state.sessions : [];
  const session = sessions[picked] ?? null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex flex-col bg-[#f4f6f4]" role="dialog" aria-modal="true" aria-label={`${label} report`}>
      <header className="shrink-0 bg-[#014421] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-md items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white/75">{playerName}</p>
            <h2 className="truncate text-lg font-bold tracking-tight">{label}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close report">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {sessions.length > 1 && (
          <div className="mx-auto mt-2 flex max-w-md gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Session">
            {sessions.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPicked(i)}
                aria-pressed={i === picked}
                className={`shrink-0 rounded-full px-3 py-1 text-left text-[11px] font-semibold ${
                  i === picked ? "bg-white text-[#014421]" : "bg-white/10 text-white/85 hover:bg-white/20"
                }`}
              >
                {sessionLabel(s.at)}
                {s.score && <span className={i === picked ? "text-[#014421]/60" : "text-white/55"}> · {s.score}</span>}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md space-y-4">
          {state.status === "loading" ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-[#014421]/60" aria-hidden />
            </div>
          ) : state.status === "error" ? (
            <p className="py-16 text-center text-sm text-gray-500">Couldn&apos;t load this report right now.</p>
          ) : !session ? (
            <p className="py-16 text-center text-sm text-gray-500">No sessions saved for this test yet.</p>
          ) : (
            <>
              {sessions.length === 1 && <p className="text-xs font-semibold text-gray-500">{sessionLabel(session.at)}</p>}
              {session.report ?? (
                <div className="rounded-2xl bg-white p-4 text-sm text-gray-600 shadow-sm ring-1 ring-gray-100">
                  <p className="font-semibold text-gray-900">{session.score ? `Score: ${session.score}` : "Score only"}</p>
                  <p className="mt-1">
                    Only the score was saved for this session, so there&apos;s no shot-by-shot report. Sessions from now on keep the full report.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>,
    document.body,
  );
}
