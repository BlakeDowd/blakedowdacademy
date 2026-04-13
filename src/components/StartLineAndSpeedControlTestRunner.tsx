"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  averagePrecisionScore,
  gateSuccessRatePct,
  startLineVarianceMessage,
} from "@/lib/startLineSpeedControlScoring";
import {
  startLineAndSpeedControlTestConfig,
  type StartLineGate,
} from "@/lib/startLineAndSpeedControlTestConfig";
import { meanAbsDistanceCm } from "@/lib/strikeAndSpeedControlScoring";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";

type PuttRecord = {
  putt: number;
  targetFt: number;
  gate: StartLineGate;
  distance_cm: number;
};

type CombineProfile = Record<string, unknown>;

async function persistSession(
  userId: string,
  putts: PuttRecord[],
  scoreAverage: number,
  gateSuccessPct: number,
) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const start_line_payload = putts.map(({ putt, gate }) => ({ putt, start_line: gate }));
  const distance_payload = putts.map(({ putt, targetFt, distance_cm }) => ({
    putt,
    target_ft: targetFt,
    distance_cm,
  }));

  const { error: logError } = await supabase.from("practice_logs").insert({
    user_id: userId,
    log_type: startLineAndSpeedControlTestConfig.practiceLogType,
    strike_data: [],
    start_line_data: start_line_payload,
    distance_data: distance_payload,
    matrix_score_average: scoreAverage,
  });

  if (logError) {
    console.warn("[StartLineSpeedControl] practice_logs insert:", logError.message);
    return false;
  }

  const { data: profileRow, error: profileFetchError } = await supabase
    .from("profiles")
    .select("combine_profile")
    .eq("id", userId)
    .maybeSingle();

  if (profileFetchError) {
    console.warn("[StartLineSpeedControl] profiles fetch:", profileFetchError.message);
  } else {
    const prev = (profileRow?.combine_profile as CombineProfile | null) ?? {};
    const nextCombine: CombineProfile = {
      ...prev,
      start_line_speed_index: scoreAverage,
      start_line_gate_success_rate: gateSuccessPct,
    };
    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ combine_profile: nextCombine })
      .eq("id", userId);
    if (profileUpdateError) {
      console.warn("[StartLineSpeedControl] profiles update:", profileUpdateError.message);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("practiceSessionsUpdated"));
  }
  return true;
}

export function StartLineAndSpeedControlTestRunner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [currentPuttIndex, setCurrentPuttIndex] = useState(0);
  const [gate, setGate] = useState<StartLineGate>("through_gate");
  const [distanceInput, setDistanceInput] = useState("");
  const [completedPutts, setCompletedPutts] = useState<PuttRecord[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const sequence = startLineAndSpeedControlTestConfig.targetFeetSequence;
  const total = startLineAndSpeedControlTestConfig.puttCount;
  const currentTargetFt = sequence[currentPuttIndex];
  const puttNumber = currentPuttIndex + 1;

  const distanceCm = parseFloat(distanceInput);
  const distanceValid =
    distanceInput.trim() !== "" && !Number.isNaN(distanceCm) && Number.isFinite(distanceCm);

  const startTest = useCallback(() => {
    setStatus("active");
    setCurrentPuttIndex(0);
    setGate("through_gate");
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
      gate,
      distance_cm: distanceCm,
    };
    const nextLog = [...completedPutts, record];
    setGate("through_gate");
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
        const avg = averagePrecisionScore(
          nextLog.map((p) => ({
            targetFt: p.targetFt,
            cm: p.distance_cm,
            gate: p.gate,
          })),
        );
        const gatePct = gateSuccessRatePct(nextLog.map((p) => ({ gate: p.gate })));
        const ok = await persistSession(user.id, nextLog, avg, gatePct);
        setSaved(ok);
        if (!ok) {
          setSaveError(
            "Could not save session. Check your connection or apply the latest database migration.",
          );
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
    gate,
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
    setGate(last.gate);
    setDistanceInput(String(last.distance_cm));
  }, [status, completedPutts]);

  const retryPersist = useCallback(async () => {
    if (!user?.id || completedPutts.length < total) return;
    setSaveError(null);
    const avg = averagePrecisionScore(
      completedPutts.map((p) => ({
        targetFt: p.targetFt,
        cm: p.distance_cm,
        gate: p.gate,
      })),
    );
    const gatePct = gateSuccessRatePct(completedPutts.map((p) => ({ gate: p.gate })));
    persistAttemptedRef.current = true;
    const ok = await persistSession(user.id, completedPutts, avg, gatePct);
    setSaved(ok);
    if (!ok) {
      setSaveError(
        "Could not save session. Check your connection or apply the latest database migration.",
      );
      persistAttemptedRef.current = false;
    }
  }, [user?.id, completedPutts, total]);

  const summary = useMemo(() => {
    if (completedPutts.length < total) return null;
    const puttInputs = completedPutts.map((p) => ({
      targetFt: p.targetFt,
      cm: p.distance_cm,
      gate: p.gate,
    }));
    const avg = averagePrecisionScore(puttInputs);
    const gatePct = gateSuccessRatePct(completedPutts.map((p) => ({ gate: p.gate })));
    const varianceMsg = startLineVarianceMessage(completedPutts.map((p) => ({ gate: p.gate })));
    const meanCm = meanAbsDistanceCm(completedPutts.map((p) => ({ cm: p.distance_cm })));
    return {
      scoreAverage: avg,
      gateSuccessPct: gatePct,
      varianceMsg,
      meanCm,
    };
  }, [completedPutts, total]);

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold leading-snug text-gray-900">
          Start Line And Speed Control Test
        </h2>
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            Twelve putts from 5, 10, 20, and 30 feet (three at each distance). Use the gate setup
            below, then log start line and distance from the target (center of the ball to the hole
            or tee).
          </p>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
            <p className="font-semibold text-gray-900">The Gate</p>
            <p>
              Place two tees 50mm apart (barely wider than a ball) exactly 12 inches in front of the
              ball.
            </p>
            <p className="font-semibold text-gray-900 pt-1">The Goal</p>
            <p>Roll the ball through the gate and stop it at the target tee.</p>
          </div>
        </div>
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
          <p className="text-sm font-semibold text-gray-900">Start Line And Speed Control Test</p>
          <h2 className="text-base font-medium text-gray-600">Test complete</h2>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Precision Score Average
            </p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">
              {summary.scoreAverage.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Lower is better. Hit Gate putts score 100 each (precision premium).
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span>
              Gate Success Rate:{" "}
              <span className="font-semibold text-gray-900">
                {summary.gateSuccessPct.toFixed(0)}%
              </span>
            </span>
            <span>
              Avg |distance|:{" "}
              <span className="font-semibold text-gray-900">{summary.meanCm.toFixed(1)} cm</span>
            </span>
          </div>
          {summary.varianceMsg && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <p className="text-sm font-medium text-amber-950 leading-relaxed">{summary.varianceMsg}</p>
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
          Start Line And Speed Control Test
        </h2>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 space-y-2 text-sm text-gray-800">
        <p className="font-semibold text-gray-900">Setup</p>
        <p>
          <span className="font-medium text-gray-900">The Gate:</span> Two tees 50mm apart, 12 in
          front of the ball.
        </p>
        <p>
          <span className="font-medium text-gray-900">The Goal:</span> Through the gate, stop at the
          target tee.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
        <p className="text-sm font-medium text-gray-900">
          Putt {puttNumber} Of {total}
        </p>
        <p className="text-sm text-gray-700">Target: {currentTargetFt} Feet</p>
      </div>

      {completedPutts.length > 0 && (
        <CombineFlowBackControl onBack={undoLastPutt} label="Undo last putt" />
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">Start Line</p>
        <div className="grid grid-cols-2 rounded-xl border-2 border-gray-200 overflow-hidden p-0.5 bg-gray-100">
          <button
            type="button"
            onClick={() => setGate("through_gate")}
            className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
              gate === "through_gate"
                ? "bg-white text-[#014421] shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Through Gate
          </button>
          <button
            type="button"
            onClick={() => setGate("hit_gate")}
            className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
              gate === "hit_gate"
                ? "bg-white text-[#014421] shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Hit Gate
          </button>
        </div>
      </div>

      <div>
        <label
          htmlFor="start-line-speed-dist-cm"
          className="block text-sm font-medium text-gray-800 mb-1"
        >
          Distance From Target (cm)
        </label>
        <input
          id="start-line-speed-dist-cm"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 12"
          value={distanceInput}
          onChange={(e) => setDistanceInput(e.target.value)}
          className="w-full max-w-[160px] rounded-lg border-2 border-gray-200 px-3 py-2 text-sm focus:border-[#014421] focus:outline-none focus:ring-2 focus:ring-[#014421]/30"
        />
        <p className="text-xs text-gray-500 mt-1.5">Center of the ball to the target.</p>
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
