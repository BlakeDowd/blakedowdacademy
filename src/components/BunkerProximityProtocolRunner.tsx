"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { bunkerProximityProtocolConfig } from "@/lib/bunkerProximityProtocolConfig";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { insertPracticeLogCompat } from "@/lib/practiceLogsCompat";

type DistM = (typeof bunkerProximityProtocolConfig.stationDistancesM)[number];

type ShotLog = {
  shot: number;
  station_m: number;
  shot_in_station: number;
  distance_m: number | null;
  penalty: boolean;
  points: number;
};

type SessionSavePayload = {
  version: 1;
  station_distances_m: number[];
  shots_per_station: number;
  shots: ShotLog[];
};

type ShotCell = {
  distance: string;
  penalty: boolean;
};

const SHOT_LABELS = ["Shot 1", "Shot 2", "Shot 3", "Shot 4"];

const inputCls =
  "w-full rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 outline-none transition-[border-color,box-shadow] focus:border-[#014421] focus:ring-2 focus:ring-[#014421]/30";

function normalizeMetresInput(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot !== -1) {
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
  }
  return cleaned;
}

function parseDistanceMetres(raw: string): number | null {
  const s = raw.trim();
  if (s === "" || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function pointsForDistance(distanceM: number): number {
  return Math.max(0, 10 - distanceM * 1.5);
}

function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

async function persistSession(userId: string, shots: ShotLog[], totalScore: number): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const payload: SessionSavePayload = {
      version: 1,
      station_distances_m: [...bunkerProximityProtocolConfig.stationDistancesM],
      shots_per_station: bunkerProximityProtocolConfig.shotsPerStation,
      shots,
    };

    const insertRes = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: bunkerProximityProtocolConfig.practiceLogType,
      score: totalScore,
      total_points: totalScore,
      metadata: payload,
      strike_data: shots,
    });
    if (!insertRes.ok) return insertRes.message;

    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    return formatSupabaseWriteError(e);
  }
}

export function BunkerProximityProtocolRunner() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<DistM, ShotCell[]>>(() => {
    const blank = Array.from({ length: bunkerProximityProtocolConfig.shotsPerStation }, () => ({
      distance: "",
      penalty: false,
    }));
    return {
      5: blank.map((x) => ({ ...x })),
      10: blank.map((x) => ({ ...x })),
      20: blank.map((x) => ({ ...x })),
    };
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const persistAttemptedRef = useRef(false);

  const shotPoints = useCallback((cell: ShotCell): number | null => {
    if (cell.penalty) return -10;
    const d = parseDistanceMetres(cell.distance);
    if (d == null) return null;
    return pointsForDistance(d);
  }, []);

  const sectionTotals = useMemo(() => {
    const sumDist = (cells: ShotCell[]) =>
      roundOneDecimal(
        cells.reduce((sum, cell) => {
          const pts = shotPoints(cell);
          return sum + (pts ?? 0);
        }, 0),
      );
    return {
      5: sumDist(values[5]),
      10: sumDist(values[10]),
      20: sumDist(values[20]),
    };
  }, [values, shotPoints]);

  const totalScore = roundOneDecimal(sectionTotals[5] + sectionTotals[10] + sectionTotals[20]);

  const allFieldsValid = useMemo(() => {
    const validDist = (cells: ShotCell[]) => cells.every((cell) => cell.penalty || parseDistanceMetres(cell.distance) !== null);
    return validDist(values[5]) && validDist(values[10]) && validDist(values[20]);
  }, [values]);

  const shotLogs = useMemo(() => {
    const out: ShotLog[] = [];
    let shotNo = 1;
    bunkerProximityProtocolConfig.stationDistancesM.forEach((dist) => {
      values[dist].forEach((cell, idx) => {
        const d = parseDistanceMetres(cell.distance);
        const pts = cell.penalty ? -10 : d == null ? 0 : pointsForDistance(d);
        out.push({
          shot: shotNo,
          station_m: dist,
          shot_in_station: idx + 1,
          distance_m: cell.penalty ? null : d,
          penalty: cell.penalty,
          points: roundOneDecimal(pts),
        });
        shotNo += 1;
      });
    });
    return out;
  }, [values]);

  const setCellDistance = useCallback((dist: DistM, idx: number, raw: string) => {
    setSaved(false);
    persistAttemptedRef.current = false;
    setSaveError(null);
    setValues((prev) => {
      const next = { ...prev, [dist]: [...prev[dist]] };
      next[dist][idx] = {
        ...next[dist][idx],
        distance: normalizeMetresInput(raw),
      };
      if (next[dist][idx].distance.trim() !== "") {
        next[dist][idx].penalty = false;
      }
      return next;
    });
  }, []);

  const togglePenalty = useCallback((dist: DistM, idx: number) => {
    setSaved(false);
    persistAttemptedRef.current = false;
    setSaveError(null);
    setValues((prev) => {
      const next = { ...prev, [dist]: [...prev[dist]] };
      const cur = next[dist][idx];
      next[dist][idx] = {
        ...cur,
        penalty: !cur.penalty,
      };
      return next;
    });
  }, []);

  const resetSession = useCallback(() => {
    const blank = Array.from({ length: bunkerProximityProtocolConfig.shotsPerStation }, () => ({
      distance: "",
      penalty: false,
    }));
    setValues({
      5: blank.map((x) => ({ ...x })),
      10: blank.map((x) => ({ ...x })),
      20: blank.map((x) => ({ ...x })),
    });
    setSaveError(null);
    setSaved(false);
    setPersisting(false);
    persistAttemptedRef.current = false;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!user?.id) {
      setSaveError("Sign in to save your session.");
      return;
    }
    if (!allFieldsValid) {
      setSaveError("Enter decimal metres for each shot or toggle Sand/Miss.");
      return;
    }
    if (saved || persisting) return;

    setSaveError(null);
    persistAttemptedRef.current = true;
    setPersisting(true);
    const err = await persistSession(user.id, shotLogs, totalScore);
    setPersisting(false);
    if (err) {
      setSaveError(err);
      persistAttemptedRef.current = false;
      return;
    }
    setSaved(true);
  }, [user?.id, allFieldsValid, saved, persisting, shotLogs, totalScore]);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Session score</p>
              <p className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0 font-bold tabular-nums leading-none text-gray-900">
                <span className="max-w-full truncate text-[clamp(1.5rem,5vw+0.75rem,2.25rem)]">
                  {totalScore.toFixed(1)}
                </span>
                <span className="shrink-0 font-semibold text-[clamp(0.875rem,2.8vw,1.125rem)] text-gray-500">
                  / {bunkerProximityProtocolConfig.maxScore}
                </span>
              </p>
            </div>
            <div className="min-w-0 sm:max-w-[18rem] sm:flex-1 sm:text-right text-[11px] leading-snug text-gray-600 sm:text-xs">
              <p className="font-medium text-gray-700">Scoring legend</p>
              <p>0m = 10 pts | 3m = 5.5 pts</p>
              <p>6m = 1.0 pt</p>
              <p className="text-red-600">Missed Green / Stayed in Sand = -10 pts</p>
              <p className="mt-1.5 text-[10px] text-gray-500 sm:text-[11px]">
                Shot, section, and session totals round to 0.1.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {bunkerProximityProtocolConfig.stationDistancesM.map((dist) => (
          <section
            key={dist}
            className="rounded-2xl border border-[#d6c5a3] bg-white p-4 shadow-sm sm:p-5"
            aria-labelledby={`bunker-prox-${dist}`}
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id={`bunker-prox-${dist}`}
                className="text-lg font-semibold text-slate-900"
              >
                {dist} Metres
              </h2>
              <p className="max-w-[min(100%,11rem)] text-right text-sm font-medium tabular-nums text-[#7a5a2f] sm:max-w-none sm:text-base">
                Section: {sectionTotals[dist].toFixed(1)} pts
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SHOT_LABELS.map((label, idx) => {
                const cell = values[dist][idx];
                const d = parseDistanceMetres(cell.distance);
                const pts = shotPoints(cell);
                return (
                  <div key={`${dist}-${idx}`} className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`bunker-prox-${dist}-${idx}`}
                      className="text-xs font-medium text-slate-800"
                    >
                      {label}{" "}
                      <span className="font-normal text-gray-500">(m)</span>
                    </label>
                    <input
                      id={`bunker-prox-${dist}-${idx}`}
                      type="text"
                      inputMode="decimal"
                      enterKeyHint="done"
                      placeholder="e.g. 2.4"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={cell.distance}
                      onChange={(e) => setCellDistance(dist, idx, e.target.value)}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => togglePenalty(dist, idx)}
                      className={`w-full rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                        cell.penalty
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-red-200 bg-red-50 text-red-700 hover:border-red-300"
                      }`}
                    >
                      Sand/Miss
                    </button>
                    <p className="min-h-[1.25rem] text-xs tabular-nums text-gray-500">
                      {pts !== null ? (
                        cell.penalty ? (
                          <span className="font-semibold text-red-600">-10.0 pts</span>
                        ) : (
                          <span className="font-medium text-[#014421]">
                            {d?.toFixed(1)}m = {roundOneDecimal(pts).toFixed(1)} pts
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!user?.id || !allFieldsValid || persisting}
          className="w-full rounded-xl bg-[#014421] py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {persisting ? "Saving..." : "Submit session"}
        </button>
        {!user?.id && (
          <p className="mt-2 text-center text-xs text-amber-700">
            Sign in to save results to the Academy leaderboard.
          </p>
        )}
        {saveError && (
          <p className="mt-2 text-center text-xs text-red-600">{saveError}</p>
        )}
        {saved && !saveError && (
          <p className="mt-2 text-center text-sm font-medium text-green-700">Saved to leaderboard.</p>
        )}
        <button
          type="button"
          onClick={resetSession}
          className="mt-3 w-full rounded-xl border-2 border-[#014421] bg-white py-3 text-base font-semibold text-[#014421] transition-colors hover:bg-[#014421]/5"
        >
          Reset inputs
        </button>
      </div>
    </div>
  );
}
