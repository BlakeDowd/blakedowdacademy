"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  averageMatrixScore,
  performanceDiagnosis,
  cleanStrikeRate,
  meanAbsDistanceCm,
  gateSideCounts,
  gateSideImprovementMessage,
} from "@/lib/strikeAndSpeedControlScoring";
import {
  strikeAndSpeedControlTestConfig,
  type StrikeQuality,
} from "@/lib/strikeAndSpeedControlTestConfig";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";

type PuttRecord = {
  putt: number;
  targetFt: number;
  strike: StrikeQuality;
  distance_cm: number;
};

type CombineProfile = Record<string, unknown>;

/** @returns null on success, or a user-visible error string */
async function persistSession(
  userId: string,
  putts: PuttRecord[],
  matrixAverage: number,
): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const strike_payload = putts.map(({ putt, strike }) => ({ putt, strike }));
  const distance_payload = putts.map(({ putt, targetFt, distance_cm }) => ({
    putt,
    target_ft: targetFt,
    distance_cm,
  }));

  const matrixAvg = Number.isFinite(matrixAverage) ? matrixAverage : 0;

  const { error: logError } = await supabase.from("practice_logs").insert({
    user_id: userId,
    log_type: strikeAndSpeedControlTestConfig.practiceLogType,
    strike_data: strike_payload,
    distance_data: distance_payload,
    matrix_score_average: matrixAvg,
  });

  if (logError) {
    const msg = formatSupabaseWriteError(logError);
    console.warn("[StrikeSpeedControl] practice_logs insert:", msg);
    return msg;
  }

  await awardCombineCompletionXp(userId);

  const { data: profileRow, error: profileFetchError } = await supabase
    .from("profiles")
    .select("combine_profile")
    .eq("id", userId)
    .maybeSingle();

  if (profileFetchError) {
    console.warn("[StrikeSpeedControl] profiles fetch:", profileFetchError.message);
  } else {
    const prev = (profileRow?.combine_profile as CombineProfile | null) ?? {};
    const nextCombine: CombineProfile = {
      ...prev,
      strike_speed_index: matrixAvg,
    };
    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ combine_profile: nextCombine })
      .eq("id", userId);
    if (profileUpdateError) {
      console.warn("[StrikeSpeedControl] profiles update:", profileUpdateError.message);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("practiceSessionsUpdated"));
  }
  return null;
}

export function StrikeAndSpeedControlTestRunner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [currentPuttIndex, setCurrentPuttIndex] = useState(0);
  const [strike, setStrike] = useState<StrikeQuality>("clean");
  const [distanceInput, setDistanceInput] = useState("");
  const [completedPutts, setCompletedPutts] = useState<PuttRecord[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const sequence = strikeAndSpeedControlTestConfig.targetFeetSequence;
  const total = strikeAndSpeedControlTestConfig.puttCount;
  const currentTargetFt = sequence[currentPuttIndex];
  const puttNumber = currentPuttIndex + 1;

  const distanceCm = parseFloat(distanceInput);
  const distanceValid =
    distanceInput.trim() !== "" && !Number.isNaN(distanceCm) && Number.isFinite(distanceCm);

  const startTest = useCallback(() => {
    setStatus("active");
    setCurrentPuttIndex(0);
    setStrike("clean");
    setDistanceInput("");
    setCompletedPutts([]);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const recordPutt = useCallback(async () => {
    if (status !== "active" || !distanceValid) return;
    const record: PuttRecord = {
      putt: puttNumber,
      targetFt: currentTargetFt,
      strike,
      distance_cm: distanceCm,
    };
    const nextLog = [...completedPutts, record];
    setStrike("clean");
    setDistanceInput("");

    if (puttNumber >= total) {
      setCompletedPutts(nextLog);
      setStatus("complete");
      if (!user?.id) {
        setSaveError("Sign in to save this session to practice logs.");
        setSaved(false);
      } else if (!persistAttemptedRef.current) {
        persistAttemptedRef.current = true;
        setSaveError(null);
        const avg = averageMatrixScore(
          nextLog.map((p) => ({
            targetFt: p.targetFt,
            cm: p.distance_cm,
            strike: p.strike,
          })),
        );
        const saveErr = await persistSession(user.id, nextLog, avg);
        setSaved(saveErr == null);
        if (saveErr) {
          setSaveError(saveErr);
          persistAttemptedRef.current = false;
        }
      }
    } else {
      setCompletedPutts(nextLog);
      setCurrentPuttIndex((i) => i + 1);
    }
  }, [
    status,
    distanceValid,
    puttNumber,
    currentTargetFt,
    strike,
    distanceCm,
    completedPutts,
    total,
    user?.id,
  ]);

  const undoLastPutt = useCallback(() => {
    if (status !== "active" || completedPutts.length === 0) return;
    const last = completedPutts[completedPutts.length - 1];
    setCompletedPutts((s) => s.slice(0, -1));
    setCurrentPuttIndex((i) => Math.max(0, i - 1));
    setStrike(last.strike);
    setDistanceInput(String(last.distance_cm));
  }, [status, completedPutts]);

  const retryPersist = useCallback(async () => {
    if (!user?.id || completedPutts.length < total) return;
    setSaveError(null);
    const avg = averageMatrixScore(
      completedPutts.map((p) => ({
        targetFt: p.targetFt,
        cm: p.distance_cm,
        strike: p.strike,
      })),
    );
    persistAttemptedRef.current = true;
    const saveErr = await persistSession(user.id, completedPutts, avg);
    setSaved(saveErr == null);
    if (saveErr) {
      setSaveError(saveErr);
      persistAttemptedRef.current = false;
    }
  }, [user?.id, completedPutts, total]);

  const summary = useMemo(() => {
    if (completedPutts.length < total) return null;
    const avg = averageMatrixScore(
      completedPutts.map((p) => ({
        targetFt: p.targetFt,
        cm: p.distance_cm,
        strike: p.strike,
      })),
    );
    return {
      matrixAverage: avg,
      diagnosis: performanceDiagnosis(
        completedPutts.map((p) => ({ strike: p.strike, cm: p.distance_cm })),
      ),
      cleanPct: cleanStrikeRate(completedPutts.map((p) => ({ strike: p.strike }))) * 100,
      meanCm: meanAbsDistanceCm(completedPutts.map((p) => ({ cm: p.distance_cm }))),
      gateSides: gateSideCounts(completedPutts.map((p) => ({ strike: p.strike }))),
      gateSideMessage: gateSideImprovementMessage(completedPutts.map((p) => ({ strike: p.strike }))),
    };
  }, [completedPutts, total]);

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold leading-snug text-gray-900">
          Strike And Speed Control Test
        </h2>
        <p className="text-sm text-gray-600">
          Twelve putts from 5, 10, 20, and 30 feet (three at each distance). Log strike quality and
          distance from the hole using the center of the ball. Your matrix score averages weighted
          distance error; lower is better.
        </p>
        <button
          type="button"
          onClick={startTest}
          className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Start test
        </button>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="mt-6 space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900">Strike And Speed Control Test</p>
          <h2 className="text-base font-medium text-gray-600">Test complete</h2>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Strike Speed Index
            </p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">
              {summary.matrixAverage.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Lower is better (matrix score average).</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span>
              Clean strikes:{" "}
              <span className="font-semibold text-gray-900">{summary.cleanPct.toFixed(0)}%</span>
            </span>
            <span>
              Avg |distance|:{" "}
              <span className="font-semibold text-gray-900">{summary.meanCm.toFixed(1)} cm</span>
            </span>
            <span>
              Gate L/R:{" "}
              <span className="font-semibold text-gray-900">
                {summary.gateSides.left}/{summary.gateSides.right}
              </span>
            </span>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
              Performance Diagnosis
            </p>
            <p className="text-sm font-medium text-gray-800 leading-relaxed">{summary.diagnosis}</p>
            <p className="mt-2 text-sm text-gray-700 leading-relaxed">{summary.gateSideMessage}</p>
          </div>
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
                Retry save
              </button>
            )}
          </div>
        )}
        {saved && !saveError && (
          <p className="text-sm text-green-700 font-medium">Session saved to practice logs.</p>
        )}

        <button
          type="button"
          onClick={startTest}
          className="w-full py-3 rounded-xl border-2 border-[#014421] text-[#014421] font-semibold hover:bg-[#014421]/5 transition-colors"
        >
          Run again
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 sm:px-4">
        <h2 className="text-center text-base font-semibold text-gray-900 sm:text-left">
          Strike And Speed Control Test
        </h2>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
        <p className="text-sm font-medium text-gray-900">
          Putt {puttNumber} Of {total}
        </p>
        <p className="text-sm text-gray-700">
          Target: {currentTargetFt} Feet
        </p>
      </div>

      {completedPutts.length > 0 && (
        <CombineFlowBackControl onBack={undoLastPutt} label="Undo last putt" />
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">Strike</p>
        <div className="grid grid-cols-3 rounded-xl border-2 border-gray-200 overflow-hidden p-0.5 bg-gray-100">
          <button
            type="button"
            onClick={() => setStrike("clean")}
            className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
              strike === "clean"
                ? "bg-white text-[#014421] shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Clean Strike
          </button>
          <button
            type="button"
            onClick={() => setStrike("hit_gate_left")}
            className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
              strike === "hit_gate_left"
                ? "bg-white text-[#014421] shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Hit Gate (Left)
          </button>
          <button
            type="button"
            onClick={() => setStrike("hit_gate_right")}
            className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
              strike === "hit_gate_right"
                ? "bg-white text-[#014421] shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Hit Gate (Right)
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="strike-speed-dist-cm" className="block text-sm font-medium text-gray-800 mb-1">
          Distance From Target (cm)
        </label>
        <input
          id="strike-speed-dist-cm"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 12"
          value={distanceInput}
          onChange={(e) => setDistanceInput(e.target.value)}
          className="w-full max-w-[160px] rounded-lg border-2 border-gray-200 px-3 py-2 text-sm focus:border-[#014421] focus:outline-none focus:ring-2 focus:ring-[#014421]/30"
        />
        <p className="text-xs text-gray-500 mt-1.5">Measure from the center of the ball to the target.</p>
      </div>

      <button
        type="button"
        disabled={!distanceValid}
        onClick={() => void recordPutt()}
        className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {puttNumber >= total ? "Finish last putt" : "Next putt"}
      </button>
    </div>
  );
}
