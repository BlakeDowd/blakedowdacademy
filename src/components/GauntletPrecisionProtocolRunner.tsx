"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  averageGauntletScore,
  perfectPuttCount,
  tripleFailureRatePercent,
} from "@/lib/gauntletPrecisionScoring";
import {
  gauntletPrecisionProtocolConfig,
  type GauntletGate,
  type GauntletStrike,
} from "@/lib/gauntletPrecisionProtocolConfig";
import { meanAbsDistanceCm } from "@/lib/strikeAndSpeedControlScoring";

type PuttRecord = {
  putt: number;
  targetFt: number;
  strike: GauntletStrike;
  gate: GauntletGate;
  distance_cm: number;
};

type CombineProfile = Record<string, unknown>;

async function persistSession(
  userId: string,
  putts: PuttRecord[],
  scoreAverage: number,
  perfectCount: number,
  tripleFailurePct: number,
) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const strike_payload = putts.map(({ putt, strike }) => ({ putt, strike }));
  const start_line_payload = putts.map(({ putt, gate }) => ({
    putt,
    start_line: gate,
  }));
  const distance_payload = putts.map(({ putt, targetFt, distance_cm }) => ({
    putt,
    target_ft: targetFt,
    distance_cm,
  }));

  const { error: logError } = await supabase.from("practice_logs").insert({
    user_id: userId,
    log_type: gauntletPrecisionProtocolConfig.practiceLogType,
    strike_data: strike_payload,
    start_line_data: start_line_payload,
    distance_data: distance_payload,
    matrix_score_average: scoreAverage,
    perfect_putt_count: perfectCount,
    triple_failure_rate: tripleFailurePct,
  });

  if (logError) {
    console.warn("[Gauntlet] practice_logs insert:", logError.message);
    return false;
  }

  const { data: profileRow, error: profileFetchError } = await supabase
    .from("profiles")
    .select("combine_profile")
    .eq("id", userId)
    .maybeSingle();

  if (profileFetchError) {
    console.warn("[Gauntlet] profiles fetch:", profileFetchError.message);
  } else {
    const prev = (profileRow?.combine_profile as CombineProfile | null) ?? {};
    const nextCombine: CombineProfile = {
      ...prev,
      gauntlet_precision_index: scoreAverage,
      gauntlet_last_perfect_putt_count: perfectCount,
      gauntlet_last_triple_failure_rate: tripleFailurePct,
    };
    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ combine_profile: nextCombine })
      .eq("id", userId);
    if (profileUpdateError) {
      console.warn("[Gauntlet] profiles update:", profileUpdateError.message);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("practiceSessionsUpdated"));
  }
  return true;
}

export function GauntletPrecisionProtocolRunner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [currentPuttIndex, setCurrentPuttIndex] = useState(0);
  const [strike, setStrike] = useState<GauntletStrike>("clean");
  const [gate, setGate] = useState<GauntletGate>("through_gate");
  const [distanceInput, setDistanceInput] = useState("");
  const [completedPutts, setCompletedPutts] = useState<PuttRecord[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const sequence = gauntletPrecisionProtocolConfig.targetFeetSequence;
  const total = gauntletPrecisionProtocolConfig.puttCount;
  const currentTargetFt = sequence[currentPuttIndex];
  const puttNumber = currentPuttIndex + 1;

  const distanceCm = parseFloat(distanceInput);
  const distanceValid =
    distanceInput.trim() !== "" && !Number.isNaN(distanceCm) && Number.isFinite(distanceCm);

  const startTest = useCallback(() => {
    setStatus("active");
    setCurrentPuttIndex(0);
    setStrike("clean");
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
      strike,
      gate,
      distance_cm: distanceCm,
    };
    const nextLog = [...completedPutts, record];
    setStrike("clean");
    setGate("through_gate");
    setDistanceInput("");

    if (puttNumber >= total) {
      setCompletedPutts(nextLog);
      setStatus("complete");
      if (!user?.id) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
      } else if (!persistAttemptedRef.current) {
        persistAttemptedRef.current = true;
        setSaveError(null);
        const puttScores = nextLog.map((p) => ({
          targetFt: p.targetFt,
          cm: p.distance_cm,
          strike: p.strike,
          gate: p.gate,
        }));
        const avg = averageGauntletScore(puttScores);
        const perfect = perfectPuttCount(
          nextLog.map((p) => ({ strike: p.strike, gate: p.gate, cm: p.distance_cm })),
        );
        const triplePct = tripleFailureRatePercent(
          nextLog.map((p) => ({ strike: p.strike, gate: p.gate })),
        );
        const ok = await persistSession(user.id, nextLog, avg, perfect, triplePct);
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
    strike,
    gate,
    distanceCm,
    completedPutts,
    total,
    user?.id,
  ]);

  const retryPersist = useCallback(async () => {
    if (!user?.id || completedPutts.length < total) return;
    setSaveError(null);
    const puttScores = completedPutts.map((p) => ({
      targetFt: p.targetFt,
      cm: p.distance_cm,
      strike: p.strike,
      gate: p.gate,
    }));
    const avg = averageGauntletScore(puttScores);
    const perfect = perfectPuttCount(
      completedPutts.map((p) => ({ strike: p.strike, gate: p.gate, cm: p.distance_cm })),
    );
    const triplePct = tripleFailureRatePercent(
      completedPutts.map((p) => ({ strike: p.strike, gate: p.gate })),
    );
    persistAttemptedRef.current = true;
    const ok = await persistSession(user.id, completedPutts, avg, perfect, triplePct);
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
    const puttScores = completedPutts.map((p) => ({
      targetFt: p.targetFt,
      cm: p.distance_cm,
      strike: p.strike,
      gate: p.gate,
    }));
    return {
      scoreAverage: averageGauntletScore(puttScores),
      perfect: perfectPuttCount(
        completedPutts.map((p) => ({ strike: p.strike, gate: p.gate, cm: p.distance_cm })),
      ),
      triplePct: tripleFailureRatePercent(
        completedPutts.map((p) => ({ strike: p.strike, gate: p.gate })),
      ),
      meanCm: meanAbsDistanceCm(completedPutts.map((p) => ({ cm: p.distance_cm }))),
    };
  }, [completedPutts, total]);

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            Twelve putts from 5, 10, 20, and 30 feet. Each putt must pass{" "}
            <span className="font-medium text-gray-800">The Strike</span>,{" "}
            <span className="font-medium text-gray-800">The Gate</span>, then{" "}
            <span className="font-medium text-gray-800">The Distance</span> is scored with stacking
            penalties: Clip ×1.5, Hit Gate ×3 (both ×4.5). Lower average score is better.
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
          Start Combine
        </button>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="mt-6 space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900">The Gauntlet Precision Protocol</p>
          <h2 className="text-base font-medium text-gray-600">Test complete</h2>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Session Average Score
            </p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">
              {summary.scoreAverage.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Lower is better (stacking penalties apply).</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span>
              Perfect Putts:{" "}
              <span className="font-semibold text-gray-900">{summary.perfect}</span>
              <span className="text-gray-500"> / {total}</span>
            </span>
            <span>
              Triple Failure Rate:{" "}
              <span className="font-semibold text-gray-900">{summary.triplePct.toFixed(0)}%</span>
            </span>
            <span>
              Avg |distance|:{" "}
              <span className="font-semibold text-gray-900">{summary.meanCm.toFixed(1)} cm</span>
            </span>
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
          <p className="text-sm text-green-700 font-medium">Session saved.</p>
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

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">The Strike</p>
        <div className="grid grid-cols-2 rounded-xl border-2 border-gray-200 overflow-hidden p-0.5 bg-gray-100">
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
            onClick={() => setStrike("clip")}
            className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
              strike === "clip"
                ? "bg-white text-[#014421] shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Clip
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">The Gate</p>
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
          htmlFor="gauntlet-dist-cm"
          className="block text-sm font-medium text-gray-800 mb-1"
        >
          Distance From Target (cm)
        </label>
        <input
          id="gauntlet-dist-cm"
          type="text"
          inputMode="decimal"
          placeholder="e.g. 8"
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
