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
import { TeeShotHazardReport } from "@/components/TeeShotHazardRunner";
import { parseTeeHazardShots, teeShotHazardConfig } from "@/lib/teeShotHazardConfig";
import { DriverFlightReport } from "@/components/DriverFlightTestRunner";
import { driverFlightTestConfig, parseDriverFlightShots } from "@/lib/driverFlightTestConfig";
import { BunkerLiesReport } from "@/components/BunkerLiesRunner";
import { BUNKER_LIES_PAR, bunkerLiesConfig, formatToPar, parseBunkerLieHoles } from "@/lib/bunkerLiesConfig";
import { MobilityScreenReport } from "@/components/mobility/MobilityScreenRunner";
import { mobilityScreenConfig, parseMobilityChecks } from "@/lib/mobilityScreenConfig";
import {
  PuttingSessionReport,
  parsePuttingSavedHole,
  type PuttingCombineFormat,
  type PuttingCombineHoleRecord,
} from "@/components/combine/PuttingCombineRunner";
import { putting18HoleFormat } from "@/components/PuttingTestRunner";
import { putting9HoleFormat } from "@/components/PuttingTest9Runner";
import { putting3To6Format } from "@/components/PuttingTest3To6ftRunner";
import { putting8To20Format } from "@/components/PuttingTest8To20Runner";
import { putting20To40Format } from "@/components/PuttingTest20To40Runner";
import { aimpoint6ftCombineConfig } from "@/lib/aimpoint6ftCombineConfig";
import { midRangeSlopeSensingConfig } from "@/lib/midRangeSlopeSensingConfig";
import { aimpointLongRange2040Config } from "@/lib/aimpointLongRange2040Config";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";
import { bunker9HoleChallengeConfig } from "@/lib/bunker9HoleChallengeConfig";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";
import { flopShotCombineConfig } from "@/lib/flopShotCombineConfig";
import { standardChippingCombineConfig } from "@/lib/standardChippingCombineConfig";
import { lowChipCombineConfig } from "@/lib/lowChipCombineConfig";
import { survival20Config } from "@/lib/survival20Config";
import { bunkerProximityProtocolConfig } from "@/lib/bunkerProximityProtocolConfig";
import { strikeAndSpeedControlTestConfig } from "@/lib/strikeAndSpeedControlTestConfig";
import { startLineAndSpeedControlTestConfig } from "@/lib/startLineAndSpeedControlTestConfig";
import { approachShotSimConfig } from "@/lib/approachShotSimConfig";
import { ApproachShotSimReport, parseApproachShots } from "@/components/practice/ApproachShotSimReport";

/** Report ids: every combine leaderboard test plus screens that are not on the leaderboard. */
export type CombineReportId =
  | CombineLeaderboardTestId
  | typeof mobilityScreenConfig.practiceLogType
  | "strike_speed_control"
  | "start_line_speed_test"
  | "tee_shot_dispersion_combine"
  | "bunker_9_hole_challenge"
  | "low_chip";

type Session = { id: string; at: string; score: string; report: ReactNode | null };
type Row = Record<string, unknown> & { id: string; created_at: string };
type Loader = (supabase: SupabaseClient, playerId: string) => Promise<Session[]>;

const SESSION_LIMIT = 12;

const points = (v: unknown, unit = "pts") => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? `${Math.round(n)} ${unit}` : "";
};

function finite(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function scoreOnly(id: string, at: string, score: string): Session {
  return { id, at, score, report: null };
}

/** Putting tests save one practice row per hole. Group them back into rounds. */
async function loadPuttingSessions(supabase: SupabaseClient, playerId: string, format: PuttingCombineFormat): Promise<Session[]> {
  const { data, error } = await supabase
    .from("practice")
    .select("id, created_at, notes")
    .eq("user_id", playerId)
    .eq("type", format.practiceType)
    .order("created_at", { ascending: false })
    .limit(360);
  if (error) throw error;
  const rows: { id: string; at: string; hole: PuttingCombineHoleRecord }[] = [];
  for (const r of (data ?? []) as Row[]) {
    const hole = parsePuttingSavedHole(r.notes);
    if (hole) rows.push({ id: r.id, at: r.created_at, hole });
  }
  rows.sort((a, b) => a.at.localeCompare(b.at) || a.hole.holeIndex - b.hole.holeIndex);
  const groups: (typeof rows)[] = [];
  let current: typeof rows = [];
  for (const row of rows) {
    if (row.hole.holeIndex === 0 && current.length > 0) {
      groups.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  }
  if (current.length) groups.push(current);
  return groups
    .reverse()
    .slice(0, SESSION_LIMIT)
    .map((group) => {
      const byIndex = new Map<number, PuttingCombineHoleRecord>();
      for (const row of group) byIndex.set(row.hole.holeIndex, row.hole);
      const holes = [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, hole]) => hole);
      const total = holes.reduce((sum, hole) => sum + hole.points, 0);
      const finished = holes.length === format.holeCount && holes.every((hole, index) => hole.holeIndex === index);
      return {
        id: group[0]!.id,
        at: group[group.length - 1]!.at,
        score: finished ? `${total} pts` : `${total} pts · ${holes.length}/${format.holeCount}`,
        report: <PuttingSessionReport format={format} holes={holes} />,
      };
    });
}

async function loadPracticeScores(
  supabase: SupabaseClient,
  playerId: string,
  type: string,
  scoreOf: (notes: Record<string, unknown> | null) => string,
): Promise<Session[]> {
  const { data, error } = await supabase
    .from("practice")
    .select("id, created_at, notes")
    .eq("user_id", playerId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(SESSION_LIMIT);
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => scoreOnly(r.id, r.created_at, scoreOf(parseNotes(r.notes))));
}

async function loadLogScores(
  supabase: SupabaseClient,
  playerId: string,
  logType: string,
  scoreOf: (row: Row) => string,
  subType?: string,
): Promise<Session[]> {
  let query = supabase
    .from("practice_logs")
    .select("id, created_at, score, total_points, matrix_score_average, sub_type")
    .eq("user_id", playerId)
    .eq("log_type", logType)
    .order("created_at", { ascending: false })
    .limit(subType ? SESSION_LIMIT : 40);
  if (subType) query = query.eq("sub_type", subType);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Row[])
    .filter((r) => {
      if (subType) return true;
      if (logType !== standardChippingCombineConfig.practiceLogType) return true;
      const sub = String(r.sub_type ?? "").trim().toLowerCase();
      return sub === "" || sub === standardChippingCombineConfig.practiceLogSubType;
    })
    .slice(0, SESSION_LIMIT)
    .map((r) => scoreOnly(r.id, r.created_at, scoreOf(r)));
}

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

const LOADERS: Partial<Record<CombineReportId, Loader>> = {
  mobility_screen: async (supabase, playerId) => {
    const rows = await practiceLogs(supabase, playerId, [mobilityScreenConfig.practiceLogType], "score, strike_data");
    const pctOf = (r: Row | undefined) => {
      const n = Number(r?.score);
      return r?.score != null && Number.isFinite(n) ? Math.round(n) : null;
    };
    return rows.map((r, i) => {
      const checks = parseMobilityChecks(r.strike_data);
      const pct = pctOf(r);
      const older = rows[i + 1];
      const olderPct = pctOf(older);
      const previous = older && olderPct != null ? { pct: olderPct, at: older.created_at } : null;
      return { id: r.id, at: r.created_at, score: pct != null ? `${pct}%` : "", report: checks && <MobilityScreenReport checks={checks} previous={previous} /> };
    });
  },
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
  approach_shot_sim: async (supabase, playerId) => {
    const rows = await practiceLogs(supabase, playerId, [approachShotSimConfig.practiceLogType], "score, strike_data");
    return rows.map((r) => {
      const shots = parseApproachShots(r.strike_data);
      return {
        id: r.id,
        at: r.created_at,
        score: points(r.score ?? r.total_points),
        report: shots && <ApproachShotSimReport shots={shots} />,
      };
    });
  },
  tee_shot_hazard: async (supabase, playerId) => {
    const rows = await practiceLogs(supabase, playerId, [teeShotHazardConfig.practiceLogType], "strike_data");
    return rows.map((r) => {
      const shots = parseTeeHazardShots(r.strike_data);
      return { id: r.id, at: r.created_at, score: points(r.total_points), report: shots && <TeeShotHazardReport shots={shots} /> };
    });
  },
  driver_flight_control: async (supabase, playerId) => {
    const rows = await practiceLogs(supabase, playerId, [driverFlightTestConfig.practiceLogType], "strike_data");
    return rows.map((r) => {
      const shots = parseDriverFlightShots(r.strike_data);
      return { id: r.id, at: r.created_at, score: points(r.total_points), report: shots && <DriverFlightReport shots={shots} /> };
    });
  },
  bunker_lies: async (supabase, playerId) => {
    const rows = await practiceLogs(supabase, playerId, [bunkerLiesConfig.practiceLogType], "strike_data");
    return rows.map((r) => {
      const holes = parseBunkerLieHoles(r.strike_data);
      const strokes = Number(r.total_points);
      const score = Number.isFinite(strokes) ? `${formatToPar(Math.round(strokes) - BUNKER_LIES_PAR)} (${Math.round(strokes)})` : "";
      return { id: r.id, at: r.created_at, score, report: holes && <BunkerLiesReport holes={holes} /> };
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
  puttingCombine: (supabase, playerId) => loadPuttingSessions(supabase, playerId, putting18HoleFormat),
  puttingTest9Holes: (supabase, playerId) => loadPuttingSessions(supabase, playerId, putting9HoleFormat),
  puttingTest3To6ft: (supabase, playerId) => loadPuttingSessions(supabase, playerId, putting3To6Format),
  puttingTest8To20: (supabase, playerId) => loadPuttingSessions(supabase, playerId, putting8To20Format),
  puttingTest20To40: (supabase, playerId) => loadPuttingSessions(supabase, playerId, putting20To40Format),
  aimpoint_6ft_combine: (supabase, playerId) =>
    loadPracticeScores(supabase, playerId, aimpoint6ftCombineConfig.testType, (notes) => {
      const pct = finite(notes?.calibration_score_pct);
      return pct != null ? `${pct.toFixed(1)}%` : points(notes?.total_points);
    }),
  slope_mid_20ft: (supabase, playerId) =>
    loadPracticeScores(supabase, playerId, midRangeSlopeSensingConfig.testType, (notes) => {
      const pct = finite(notes?.calibration_accuracy_pct);
      return pct != null ? `${pct.toFixed(1)}%` : points(notes?.total_points);
    }),
  aimpoint_long_40ft: (supabase, playerId) =>
    loadPracticeScores(supabase, playerId, aimpointLongRange2040Config.testType, (notes) => {
      const pct = finite(notes?.calibration_accuracy_pct);
      return pct != null ? `${pct.toFixed(1)}%` : points(notes?.total_points);
    }),
  chipping_combine_9: (supabase, playerId) =>
    loadPracticeScores(supabase, playerId, chippingCombine9Config.testType, (notes) => points(notes?.total_points)),
  bunker_9_hole_challenge: (supabase, playerId) =>
    loadPracticeScores(supabase, playerId, bunker9HoleChallengeConfig.testType, (notes) => points(notes?.total_points)),
  tee_shot_dispersion_combine: (supabase, playerId) =>
    loadPracticeScores(supabase, playerId, teeShotDispersionCombineConfig.testType, (notes) => points(notes?.total_points)),
  flop_shot: (supabase, playerId) =>
    loadLogScores(supabase, playerId, flopShotCombineConfig.practiceLogType, (row) => points(row.score ?? row.total_points)),
  chipping: (supabase, playerId) =>
    loadLogScores(supabase, playerId, standardChippingCombineConfig.practiceLogType, (row) => points(row.score ?? row.total_points)),
  low_chip: (supabase, playerId) =>
    loadLogScores(
      supabase,
      playerId,
      lowChipCombineConfig.practiceLogType,
      (row) => points(row.score ?? row.total_points),
      lowChipCombineConfig.practiceLogSubType,
    ),
  survival_20: (supabase, playerId) =>
    loadLogScores(supabase, playerId, survival20Config.practiceLogType, (row) => points(row.score ?? row.total_points, "shots")),
  bunker_protocol: (supabase, playerId) =>
    loadLogScores(supabase, playerId, bunkerProximityProtocolConfig.practiceLogType, (row) => points(row.score ?? row.total_points)),
  strike_speed_control: (supabase, playerId) =>
    loadLogScores(supabase, playerId, strikeAndSpeedControlTestConfig.practiceLogType, (row) => {
      const avg = finite(row.matrix_score_average);
      return avg != null ? `${avg.toFixed(1)} avg` : "";
    }),
  start_line_speed_test: (supabase, playerId) =>
    loadLogScores(supabase, playerId, startLineAndSpeedControlTestConfig.practiceLogType, (row) => {
      const avg = finite(row.matrix_score_average);
      return avg != null ? `${avg.toFixed(1)} avg` : "";
    }),
};

export function hasCombineReport(testId: CombineReportId): boolean {
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
  testId: CombineReportId;
  label: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [picked, setPicked] = useState(0);

  useEffect(() => {
    const load = LOADERS[testId];
    if (!load) {
      setState({ status: "ready", sessions: [] });
      return;
    }
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
              {sessions.length > 1 && session.score && sessions[picked + 1]?.score && (
                <p className="text-xs text-gray-500">
                  This result {session.score}. The one before was {sessions[picked + 1]!.score}.
                </p>
              )}
              {session.report ?? (
                <div className="rounded-2xl bg-white p-4 text-sm text-gray-600 shadow-sm ring-1 ring-gray-100">
                  <p className="font-semibold text-gray-900">{session.score ? `Score: ${session.score}` : "Saved session"}</p>
                  <p className="mt-1">
                    Every finished run stays here. Open another date above to see how the score has moved.
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
