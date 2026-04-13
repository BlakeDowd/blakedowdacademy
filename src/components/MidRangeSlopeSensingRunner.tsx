"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { midRangeSlopeSensingConfig } from "@/lib/midRangeSlopeSensingConfig";
import {
  lateBreakTransitionMessage,
  meanAbsError33,
  meanAbsError66,
  twentySlopeDataPoints,
  type MidRangeSlopePuttReadings,
} from "@/lib/midRangeSlopeSensingScoring";
import {
  totalPointsSession,
  calibrationScorePercent,
  averageBias,
  readerLabelFromBias,
} from "@/lib/aimpoint6ftCombineScoring";
import { parsePercentOneDecimal } from "@/lib/slopeReadingParse";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function persistSession(
  userId: string,
  putts: MidRangeSlopePuttReadings[],
  aggregates: Record<string, unknown>,
  dataPoints20: ReturnType<typeof twentySlopeDataPoints>,
) {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const totalPoints = totalPointsSession(putts);
    const calPct = calibrationScorePercent(totalPoints);

    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: midRangeSlopeSensingConfig.testType,
      test_type: midRangeSlopeSensingConfig.testType,
      duration_minutes: 0,
      metadata: {
        version: 1,
        band_ft: "8-20",
        putts,
        data_points_20: dataPoints20,
        aggregates,
      },
      notes: JSON.stringify({
        kind: midRangeSlopeSensingConfig.noteKind,
        total_points: totalPoints,
        calibration_accuracy_pct: calPct,
      }),
    });
    if (error) {
      console.warn("[MidRangeSlopeSensing] practice insert:", error.message);
      return false;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return true;
  } catch (e) {
    console.warn("[MidRangeSlopeSensing] practice insert failed", e);
    return false;
  }
}

export function MidRangeSlopeSensingRunner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [distances, setDistances] = useState<number[]>([]);
  const [puttIndex, setPuttIndex] = useState(0);
  const [g33, setG33] = useState("");
  const [a33, setA33] = useState("");
  const [g66, setG66] = useState("");
  const [a66, setA66] = useState("");
  const [log, setLog] = useState<MidRangeSlopePuttReadings[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const total = midRangeSlopeSensingConfig.puttCount;
  const puttDisplay = puttIndex + 1;
  const targetFt = distances[puttIndex] ?? 0;

  const n33g = parsePercentOneDecimal(g33);
  const n33a = parsePercentOneDecimal(a33);
  const n66g = parsePercentOneDecimal(g66);
  const n66a = parsePercentOneDecimal(a66);
  const stepValid =
    n33g !== null && n33a !== null && n66g !== null && n66a !== null && targetFt > 0;

  const startTest = useCallback(() => {
    setDistances(shuffle([...midRangeSlopeSensingConfig.distances]));
    setStatus("active");
    setPuttIndex(0);
    setG33("");
    setA33("");
    setG66("");
    setA66("");
    setLog([]);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const recordPutt = useCallback(async () => {
    if (status !== "active" || !stepValid) return;
    const row: MidRangeSlopePuttReadings = {
      putt: puttDisplay,
      target_ft: targetFt,
      pct_33_guess: n33g,
      pct_33_actual: n33a,
      pct_66_guess: n66g,
      pct_66_actual: n66a,
    };
    const nextLog = [...log, row];
    setG33("");
    setA33("");
    setG66("");
    setA66("");

    if (puttDisplay >= total) {
      setLog(nextLog);
      setStatus("complete");
      const pts = totalPointsSession(nextLog);
      const calPct = calibrationScorePercent(pts);
      const bias = averageBias(nextLog);
      const reader = readerLabelFromBias(bias);
      const late = lateBreakTransitionMessage(nextLog);
      const data20 = twentySlopeDataPoints(nextLog);
      const aggregates: Record<string, unknown> = {
        total_points: pts,
        calibration_accuracy_pct: calPct,
        avg_bias: bias,
        reader_label: reader,
        mean_abs_error_33: meanAbsError33(nextLog),
        mean_abs_error_66: meanAbsError66(nextLog),
        late_break_flag: late != null,
        late_break_message: late,
      };
      if (!user?.id) {
        setSaveError("Sign in to save this session to practice.");
        setSaved(false);
      } else if (!persistAttemptedRef.current) {
        persistAttemptedRef.current = true;
        setSaveError(null);
        const ok = await persistSession(user.id, nextLog, aggregates, data20);
        setSaved(ok);
        if (!ok) {
          setSaveError(
            "Could not save. Apply the latest database migration or check your connection.",
          );
          persistAttemptedRef.current = false;
        }
      }
    } else {
      setLog(nextLog);
      setPuttIndex((i) => i + 1);
    }
  }, [status, stepValid, puttDisplay, targetFt, n33g, n33a, n66g, n66a, log, total, user?.id]);

  const undoLastPutt = useCallback(() => {
    if (status !== "active" || log.length === 0) return;
    const last = log[log.length - 1];
    setLog((s) => s.slice(0, -1));
    setPuttIndex((i) => Math.max(0, i - 1));
    setG33(String(last.pct_33_guess));
    setA33(String(last.pct_33_actual));
    setG66(String(last.pct_66_guess));
    setA66(String(last.pct_66_actual));
  }, [status, log]);

  const retryPersist = useCallback(async () => {
    if (!user?.id || log.length < total) return;
    setSaveError(null);
    const pts = totalPointsSession(log);
    const calPct = calibrationScorePercent(pts);
    const bias = averageBias(log);
    const reader = readerLabelFromBias(bias);
    const late = lateBreakTransitionMessage(log);
    const data20 = twentySlopeDataPoints(log);
    const aggregates: Record<string, unknown> = {
      total_points: pts,
      calibration_accuracy_pct: calPct,
      avg_bias: bias,
      reader_label: reader,
      mean_abs_error_33: meanAbsError33(log),
      mean_abs_error_66: meanAbsError66(log),
      late_break_flag: late != null,
      late_break_message: late,
    };
    persistAttemptedRef.current = true;
    const ok = await persistSession(user.id, log, aggregates, data20);
    setSaved(ok);
    if (!ok) {
      setSaveError(
        "Could not save. Apply the latest database migration or check your connection.",
      );
      persistAttemptedRef.current = false;
    }
  }, [user?.id, log, total]);

  const summary = useMemo(() => {
    if (log.length < total) return null;
    const pts = totalPointsSession(log);
    const bias = averageBias(log);
    return {
      totalPoints: pts,
      calibrationPct: calibrationScorePercent(pts),
      bias,
      reader: readerLabelFromBias(bias),
      lateMsg: lateBreakTransitionMessage(log),
      m33: meanAbsError33(log),
      m66: meanAbsError66(log),
    };
  }, [log, total]);

  const inputCls =
    "w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-sm focus:border-[#014421] focus:outline-none focus:ring-2 focus:ring-[#014421]/30";

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold leading-snug text-gray-900">
          {midRangeSlopeSensingConfig.testName}
        </h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          Ten putts from eight to twenty feet (distance order shuffled each run). Each putt, log
          your read at the <span className="font-medium text-gray-800">33%</span> and{" "}
          <span className="font-medium text-gray-800">66%</span> marks, then actuals after the
          ball is struck. Percentages with at most one decimal (e.g. 2.1%).
        </p>
        <button
          type="button"
          onClick={startTest}
          className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Start protocol
        </button>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="mt-6 space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900">{midRangeSlopeSensingConfig.testName}</p>
          <h2 className="text-base font-medium text-gray-600">Session complete</h2>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Calibration Accuracy
            </p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">
              {summary.calibrationPct.toFixed(1)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {summary.totalPoints} / 200 points from 20 absolute-error scores.
            </p>
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-medium text-gray-900">Bias tracking (avg guess − actual):</span>{" "}
              {summary.bias >= 0 ? "+" : ""}
              {summary.bias.toFixed(2)}% →{" "}
              <span className="font-semibold text-gray-900">
                {summary.reader === "Neutral"
                  ? "No strong bias (near neutral)"
                  : summary.reader}
              </span>
            </p>
            <p className="text-xs text-gray-500">
              Over-Reader: guesses higher than actual; Under-Reader: lower.
            </p>
            <p>
              <span className="font-medium text-gray-900">33% vs 66% (avg |error|):</span>{" "}
              33% (start) {summary.m33.toFixed(3)} vs 66% (end) {summary.m66.toFixed(3)}
            </p>
            {summary.lateMsg && (
              <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 font-medium text-amber-950">
                {summary.lateMsg}
              </p>
            )}
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
          <p className="text-sm text-green-700 font-medium">
            Saved to practice (test_type + metadata with 20 data points).
          </p>
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
          {midRangeSlopeSensingConfig.testName}
        </h2>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-1">
        <p className="text-sm font-medium text-gray-900">
          Putt {puttDisplay} Of {total}
        </p>
        <p className="text-sm text-gray-800">
          Target: {targetFt} Feet
        </p>
        <p className="text-xs text-gray-600">Enter percentages with at most one decimal.</p>
      </div>

      {log.length > 0 && <CombineFlowBackControl onBack={undoLastPutt} label="Undo last putt" />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="mr-33g" className="block text-sm font-medium text-gray-800 mb-1">
            33% Guess
          </label>
          <input
            id="mr-33g"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 2.1"
            value={g33}
            onChange={(e) => setG33(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="mr-33a" className="block text-sm font-medium text-gray-800 mb-1">
            33% Actual
          </label>
          <input
            id="mr-33a"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 1.9"
            value={a33}
            onChange={(e) => setA33(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="mr-66g" className="block text-sm font-medium text-gray-800 mb-1">
            66% Guess
          </label>
          <input
            id="mr-66g"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 2.4"
            value={g66}
            onChange={(e) => setG66(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="mr-66a" className="block text-sm font-medium text-gray-800 mb-1">
            66% Actual
          </label>
          <input
            id="mr-66a"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 2.0"
            value={a66}
            onChange={(e) => setA66(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={!stepValid}
        onClick={() => void recordPutt()}
        className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {puttDisplay >= total ? "Finish session" : "Next putt"}
      </button>
    </div>
  );
}
