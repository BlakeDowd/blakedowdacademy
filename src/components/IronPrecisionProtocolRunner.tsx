"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  averagePointsPerShot,
  dominantDirectionalBiasWarning,
  horizontalStrikeSummaryLines,
  shotPoints,
  totalSessionPoints,
  wallPercentage,
  zeroPointRangePercentage,
  type IronFingerMiss,
} from "@/lib/ironPrecisionScoring";
import {
  ironPrecisionProtocolConfig,
  normalizeLegacyVerticalStrike,
  type IronContact,
  type IronMissDirection,
  type IronStrike,
} from "@/lib/ironPrecisionProtocolConfig";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";

const FINGER_OPTIONS: IronFingerMiss[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

type ShotPayload = {
  shot: number;
  club: string;
  direction: IronMissDirection;
  fingers: IronFingerMiss;
  strike: IronStrike;
  contact: IronContact;
  points: number;
};

type CombineProfile = Record<string, unknown>;

async function persistSession(
  userId: string,
  shots: ShotPayload[],
  totalPoints: number,
  avgPointsPerShot: number,
  wallPct: number,
  zeroPointPct: number,
) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const strike_payload = shots.map(({ shot, club, direction, fingers, strike, contact, points }) => ({
    shot,
    club,
    fingers,
    strike: normalizeLegacyVerticalStrike(strike),
    contact,
    points,
    metadata: { direction },
  }));

  const distance_payload = [{ wall_pct: wallPct, zero_point_pct: zeroPointPct }];

  const { error: logError } = await supabase.from("practice_logs").insert({
    user_id: userId,
    log_type: ironPrecisionProtocolConfig.practiceLogType,
    strike_data: strike_payload,
    start_line_data: [],
    distance_data: distance_payload,
    matrix_score_average: avgPointsPerShot,
    total_points: totalPoints,
  });

  if (logError) {
    console.warn("[IronPrecision] practice_logs insert:", logError.message);
    return false;
  }

  const { data: profileRow, error: profileFetchError } = await supabase
    .from("profiles")
    .select("combine_profile")
    .eq("id", userId)
    .maybeSingle();

  if (profileFetchError) {
    console.warn("[IronPrecision] profiles fetch:", profileFetchError.message);
  } else {
    const prev = (profileRow?.combine_profile as CombineProfile | null) ?? {};
    const nextCombine: CombineProfile = {
      ...prev,
      iron_precision_protocol_index: avgPointsPerShot,
      iron_precision_protocol_last_total_points: totalPoints,
      iron_precision_protocol_last_wall_pct: wallPct,
      iron_precision_protocol_last_zero_point_pct: zeroPointPct,
    };
    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ combine_profile: nextCombine })
      .eq("id", userId);
    if (profileUpdateError) {
      console.warn("[IronPrecision] profiles update:", profileUpdateError.message);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("practiceSessionsUpdated"));
  }
  return true;
}

export function IronPrecisionProtocolRunner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [shotIndex, setShotIndex] = useState(0);
  const [direction, setDirection] = useState<IronMissDirection>("straight");
  const [fingers, setFingers] = useState<IronFingerMiss | null>(0);
  const [strike, setStrike] = useState<IronStrike>("solid");
  const [contact, setContact] = useState<IronContact>("middle");
  const [completedShots, setCompletedShots] = useState<ShotPayload[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const clubs = ironPrecisionProtocolConfig.clubSequence;
  const total = clubs.length;
  const currentClub = clubs[shotIndex];
  const shotNumber = shotIndex + 1;

  const startTest = useCallback(() => {
    setStatus("active");
    setShotIndex(0);
    setDirection("straight");
    setFingers(0);
    setStrike("solid");
    setContact("middle");
    setCompletedShots([]);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const recordShot = useCallback(async () => {
    if (status !== "active") return;
    if (direction !== "straight" && fingers === null) return;
    const effFingers: IronFingerMiss =
      direction === "straight" ? 0 : (fingers as IronFingerMiss);

    const points = shotPoints(effFingers, strike, contact);
    const record: ShotPayload = {
      shot: shotNumber,
      club: currentClub,
      direction,
      fingers: effFingers,
      strike,
      contact,
      points,
    };
    const nextLog = [...completedShots, record];
    setDirection("straight");
    setFingers(0);
    setStrike("solid");
    setContact("middle");

    if (shotNumber >= total) {
      setCompletedShots(nextLog);
      setStatus("complete");
      if (!user?.id) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
      } else if (!persistAttemptedRef.current) {
        persistAttemptedRef.current = true;
        setSaveError(null);
        const uid = user.id;
        const inputs = nextLog.map((s) => ({
          fingers: s.fingers,
          strike: s.strike,
          contact: s.contact,
        }));
        const totalPoints = totalSessionPoints(inputs);
        const avg = averagePointsPerShot(inputs);
        const wallPct = wallPercentage(inputs);
        const zpPct = zeroPointRangePercentage(inputs);
        const ok = await persistSession(uid, nextLog, totalPoints, avg, wallPct, zpPct);
        setSaved(ok);
        if (!ok) {
          setSaveError(
            "Could not save session. Check your connection or apply the latest database migration.",
          );
          persistAttemptedRef.current = false;
        }
      }
    } else {
      setCompletedShots(nextLog);
      setShotIndex((i) => i + 1);
    }
  }, [
    status,
    fingers,
    strike,
    contact,
    direction,
    shotNumber,
    currentClub,
    completedShots,
    total,
    user,
  ]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || completedShots.length === 0) return;
    const last = completedShots[completedShots.length - 1];
    setCompletedShots((s) => s.slice(0, -1));
    setShotIndex((i) => Math.max(0, i - 1));
    setDirection(last.direction);
    setFingers(last.direction === "straight" ? 0 : last.fingers);
    setStrike(last.strike);
    setContact(last.contact);
  }, [status, completedShots]);

  const retryPersist = useCallback(async () => {
    if (!user?.id || completedShots.length < total) return;
    setSaveError(null);
    const uid = user.id;
    const inputs = completedShots.map((s) => ({
      fingers: s.fingers,
      strike: s.strike,
      contact: s.contact,
    }));
    const totalPoints = totalSessionPoints(inputs);
    const avg = averagePointsPerShot(inputs);
    const wallPct = wallPercentage(inputs);
    const zpPct = zeroPointRangePercentage(inputs);
    persistAttemptedRef.current = true;
    const ok = await persistSession(uid, completedShots, totalPoints, avg, wallPct, zpPct);
    setSaved(ok);
    if (!ok) {
      setSaveError(
        "Could not save session. Check your connection or apply the latest database migration.",
      );
      persistAttemptedRef.current = false;
    }
  }, [user, completedShots, total]);

  const summary = useMemo(() => {
    if (completedShots.length < total) return null;
    const inputs = completedShots.map((s) => ({
      fingers: s.fingers,
      strike: s.strike,
      contact: s.contact,
    }));
    const totalPoints = totalSessionPoints(inputs);
    const biasWarning = dominantDirectionalBiasWarning(completedShots);
    const strikeByDirLines = horizontalStrikeSummaryLines(completedShots);
    return {
      totalPoints,
      avgPoints: averagePointsPerShot(inputs),
      wallPct: wallPercentage(inputs),
      zeroPointPct: zeroPointRangePercentage(inputs),
      biasWarning,
      strikeByDirLines,
    };
  }, [completedShots, total]);

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            Nine shots, one per club ({clubs.join(", ")}). Choose{" "}
            <span className="font-medium text-gray-800">directional bias</span> (left, straight, or
            right). Straight locks dispersion at 0 fingers. For left or right, log{" "}
            <span className="font-medium text-gray-800">finger dispersion</span> (0–4 in half-finger
            steps) or <span className="font-medium text-gray-800">Outside 4 Fingers</span> (0 pts, same
            as wider than 4). Record <span className="font-medium text-gray-800">vertical strike</span>{" "}
            (fat, thin, solid) and{" "}
            <span className="font-medium text-gray-800">horizontal contact</span> (heel / middle / toe).
            Solid with middle contact adds +2 bonus on top of dispersion points.
          </p>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2 text-xs text-gray-700">
            <p className="font-semibold text-gray-900 text-sm">Dispersion Scoring (Fingers)</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>0.0–0.5: 10 pts</li>
              <li>1.0–1.5: 7 pts</li>
              <li>2.0–2.5: 4 pts</li>
              <li>3.0–4.0: 1 pt</li>
              <li>Greater than 4.0 / outside: 0 pts</li>
            </ul>
            <p className="pt-1">
              Dispersion-only maximum: 9 × 10 = 90 pts (plus up to +2 per shot for solid with middle).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={startTest}
          className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Start Combine
        </button>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="mt-6 space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900">{ironPrecisionProtocolConfig.testName}</p>
          <h2 className="text-base font-medium text-gray-600">Test Complete</h2>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Points</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">{summary.totalPoints}</p>
            <p className="text-xs text-gray-500 mt-1">
              Session total (dispersion bands + solid with middle bonuses). Dispersion-only maximum is
              90 for nine 10-point shots.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 text-sm text-gray-600">
            <div className="rounded-lg border border-gray-100 bg-stone-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Shot Consistency
              </p>
              <p className="text-xl font-bold text-gray-900 tabular-nums">
                {summary.avgPoints.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Average Points Per Shot</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-stone-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">The Wall</p>
              <p className="text-sm text-gray-800 mt-1">
                <span className="font-semibold text-gray-900">{summary.wallPct.toFixed(0)}%</span>{" "}
                in 0–1 finger range
              </p>
              <p className="text-sm text-gray-800">
                <span className="font-semibold text-gray-900">
                  {summary.zeroPointPct.toFixed(0)}%
                </span>{" "}
                in 0-point finger band (outside 4+)
              </p>
            </div>
          </div>

          {(summary.biasWarning != null || summary.strikeByDirLines.length > 0) && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 space-y-3 text-sm text-gray-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/90">
                Miss Bias & Face Map
              </p>
              {summary.biasWarning && (
                <p className="font-semibold text-amber-950">{summary.biasWarning}</p>
              )}
              {summary.strikeByDirLines.length > 0 && (
                <ul className="list-disc pl-4 space-y-1.5 text-gray-700">
                  {summary.strikeByDirLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {saveError && (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{saveError}</p>
            {user?.id && (
              <button
                type="button"
                onClick={() => void retryPersist()}
                className="w-full py-3 rounded-xl border-2 border-[#014421] text-[#014421] font-semibold hover:bg-[#014421]/5 transition-colors"
              >
                Retry Save
              </button>
            )}
          </div>
        )}
        {saved && !saveError && (
          <p className="text-sm text-green-700 font-medium">Session saved.</p>
        )}

        <button
          type="button"
          onClick={startTest}
          className="w-full py-3 rounded-xl border-2 border-[#014421] text-[#014421] font-semibold hover:bg-[#014421]/5 transition-colors"
        >
          Run Again
        </button>
      </div>
    );
  }

  const canRecord = direction === "straight" || fingers !== null;

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 space-y-2 text-sm text-gray-800">
        <p className="font-semibold text-gray-900">
          Shot {shotNumber} of {total}
        </p>
        <p>
          Club: <span className="font-semibold text-gray-900">{currentClub}</span>
        </p>
      </div>

      {completedShots.length > 0 && (
        <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">Directional Bias</p>
        <div className="grid grid-cols-3 rounded-xl border-2 border-gray-200 overflow-hidden p-0.5 bg-gray-100 gap-0.5">
          {(
            [
              ["left", "Left"],
              ["straight", "Straight"],
              ["right", "Right"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setDirection(value);
                if (value === "straight") setFingers(0);
                else setFingers(null);
              }}
              className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
                direction === value ? "bg-white text-gray-900 shadow" : "text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Straight sets dispersion to 0 fingers. Left or right: choose finger dispersion (including 0).
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">Dispersion (Fingers)</p>
        {direction === "straight" ? (
          <p className="text-sm text-gray-600 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            Straight: dispersion locked at <span className="font-semibold text-gray-900">0</span> fingers.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {FINGER_OPTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFingers(f)}
                  className={`min-w-[3rem] flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                    fingers === f
                      ? "border-[#014421] bg-[#014421] text-white"
                      : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFingers("outside")}
              className={`w-full py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                fingers === "outside"
                  ? "border-amber-700 bg-amber-700 text-white"
                  : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
              }`}
            >
              Outside 4 Fingers
            </button>
          </>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">Vertical Strike</p>
        <div className="grid grid-cols-3 rounded-xl border-2 border-gray-200 overflow-hidden p-0.5 bg-gray-100 gap-0.5">
          {(
            [
              ["fat", "Fat"],
              ["thin", "Thin"],
              ["solid", "Solid"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStrike(value)}
              className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
                strike === value ? "bg-white text-gray-900 shadow" : "text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">Horizontal Contact</p>
        <div className="grid grid-cols-3 rounded-xl border-2 border-gray-200 overflow-hidden p-0.5 bg-gray-100 gap-0.5">
          {(
            [
              ["heel", "Heel"],
              ["middle", "Middle"],
              ["toe", "Toe"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setContact(value)}
              className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
                contact === value ? "bg-white text-gray-900 shadow" : "text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!canRecord}
        onClick={() => void recordShot()}
        className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Record Shot {shotNumber}
      </button>
    </div>
  );
}
