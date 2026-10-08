"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DoorOpen, Ruler, Target } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import {
  averagePrecisionScore,
  gateSuccessRatePct,
  HIT_GATE_PRECISION_SCORE,
  precisionScoreForPutt,
  startLineVarianceMessage,
} from "@/lib/startLineSpeedControlScoring";
import {
  startLineAndSpeedControlTestConfig,
  type StartLineGate,
} from "@/lib/startLineAndSpeedControlTestConfig";
import { meanAbsDistanceCm } from "@/lib/strikeAndSpeedControlScoring";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import {
  CombineHero,
  GatePicker,
  IntroSteps,
  NumberChips,
  PlayAgainButton,
  PrimaryButton,
  ProgressTrack,
  PuttLineDiagram,
  ResultHero,
  SaveStatus,
  ScoringGuide,
  StatTiles,
  type GateOption,
  type TrackItem,
} from "@/components/combine/PuttingCombineUi";

type PuttRecord = {
  putt: number;
  targetFt: number;
  gate: StartLineGate;
  distance_cm: number;
};

type CombineProfile = Record<string, unknown>;

const DISTANCE_CHIPS_CM = [0, 5, 10, 15, 20, 30, 45, 60, 90] as const;

const GATES: GateOption<StartLineGate>[] = [
  { key: "hit_gate_left", title: "Hit left", hint: "Pulled it", hit: "left" },
  { key: "through_gate", title: "Through", hint: "Clean start", hit: null },
  { key: "hit_gate_right", title: "Hit right", hint: "Pushed it", hit: "right" },
];

/** @returns null on success, or a user-visible error string */
async function persistSession(
  userId: string,
  putts: PuttRecord[],
  scoreAverage: number,
  gateSuccessPct: number,
): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();

  const start_line_payload = putts.map(({ putt, gate }) => ({ putt, start_line: gate }));
  const distance_payload = putts.map(({ putt, targetFt, distance_cm }) => ({
    putt,
    target_ft: targetFt,
    distance_cm,
  }));

  const matrixAvg = Number.isFinite(scoreAverage) ? scoreAverage : 0;

  const { error: logError } = await supabase.from("practice_logs").insert({
    user_id: userId,
    log_type: startLineAndSpeedControlTestConfig.practiceLogType,
    strike_data: [],
    start_line_data: start_line_payload,
    distance_data: distance_payload,
    matrix_score_average: matrixAvg,
  });

  if (logError) {
    const msg = formatSupabaseWriteError(logError);
    console.warn("[StartLineSpeedControl] practice_logs insert:", msg);
    return msg;
  }

  await awardCombineCompletionXp(userId);

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
      start_line_speed_index: matrixAvg,
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
  return null;
}

function isGateHit(gate: StartLineGate): boolean {
  return gate !== "through_gate";
}

function scoreTone(score: number): string {
  if (score <= 10) return "bg-[#014421] text-white";
  if (score <= 25) return "bg-green-200 text-[#014421]";
  if (score <= 50) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

export function StartLineAndSpeedControlTestRunner() {
  const user = useCombineUser();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [currentPuttIndex, setCurrentPuttIndex] = useState(0);
  const [gate, setGate] = useState<StartLineGate>("through_gate");
  const [distanceInput, setDistanceInput] = useState("");
  const [completedPutts, setCompletedPutts] = useState<PuttRecord[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const userId = user?.id;
  const sequence = startLineAndSpeedControlTestConfig.targetFeetSequence;
  const total = startLineAndSpeedControlTestConfig.puttCount;
  const currentTargetFt = sequence[currentPuttIndex];
  const puttNumber = currentPuttIndex + 1;

  const distanceCm = parseFloat(distanceInput);
  const gateHitSelected = isGateHit(gate);
  const distanceValid =
    distanceInput.trim() !== "" && !Number.isNaN(distanceCm) && Number.isFinite(distanceCm);
  const canRecord = gateHitSelected || distanceValid;

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
    if (status !== "active" || !canRecord || currentTargetFt == null) return;
    const record: PuttRecord = {
      putt: puttNumber,
      targetFt: currentTargetFt,
      gate,
      // Gate contact is treated as a no-distance score (0) and advances immediately.
      distance_cm: gateHitSelected ? 0 : distanceCm,
    };
    const nextLog = [...completedPutts, record];
    setGate("through_gate");
    setDistanceInput("");

    if (puttNumber >= total) {
      setCompletedPutts(nextLog);
      setStatus("complete");
      if (!userId) {
        setSaveError("Sign in to save this session to practice logs.");
        setSaved(false);
      } else if (!persistAttemptedRef.current) {
        persistAttemptedRef.current = true;
        setSaveError(null);
        const avg = averagePrecisionScore(nextLog.map((p) => ({ targetFt: p.targetFt, cm: p.distance_cm, gate: p.gate })));
        const gatePct = gateSuccessRatePct(nextLog.map((p) => ({ gate: p.gate })));
        const saveErr = await persistSession(userId, nextLog, avg, gatePct);
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
  }, [status, canRecord, puttNumber, currentTargetFt, gate, gateHitSelected, distanceCm, completedPutts, total, userId]);

  const undoLastPutt = useCallback(() => {
    if (status !== "active" || completedPutts.length === 0) return;
    const last = completedPutts[completedPutts.length - 1]!;
    setCompletedPutts((s) => s.slice(0, -1));
    setCurrentPuttIndex((i) => Math.max(0, i - 1));
    setGate(last.gate);
    setDistanceInput(isGateHit(last.gate) ? "" : String(last.distance_cm));
  }, [status, completedPutts]);

  const retryPersist = useCallback(async () => {
    if (!userId || completedPutts.length < total) return;
    setSaveError(null);
    const avg = averagePrecisionScore(completedPutts.map((p) => ({ targetFt: p.targetFt, cm: p.distance_cm, gate: p.gate })));
    const gatePct = gateSuccessRatePct(completedPutts.map((p) => ({ gate: p.gate })));
    persistAttemptedRef.current = true;
    const saveErr = await persistSession(userId, completedPutts, avg, gatePct);
    setSaved(saveErr == null);
    if (saveErr) {
      setSaveError(saveErr);
      persistAttemptedRef.current = false;
    }
  }, [userId, completedPutts, total]);

  const summary = useMemo(() => {
    if (completedPutts.length < total) return null;
    const avg = averagePrecisionScore(completedPutts.map((p) => ({ targetFt: p.targetFt, cm: p.distance_cm, gate: p.gate })));
    const through = completedPutts.filter((p) => !isGateHit(p.gate));
    return {
      scoreAverage: avg,
      gateSuccessPct: gateSuccessRatePct(completedPutts.map((p) => ({ gate: p.gate }))),
      varianceMsg: startLineVarianceMessage(completedPutts.map((p) => ({ gate: p.gate }))),
      meanCm: meanAbsDistanceCm(through.map((p) => ({ cm: p.distance_cm }))),
      left: completedPutts.filter((p) => p.gate === "hit_gate_left").length,
      right: completedPutts.filter((p) => p.gate === "hit_gate_right").length,
    };
  }, [completedPutts, total]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero title="Start Line & Speed Control" shape="Straight" chips={[`${total} putts`, "5 to 30 ft", "~15 min", "Lowest score wins"]} />
        <IntroSteps
          steps={[
            { icon: <DoorOpen className="h-5 w-5" aria-hidden />, title: "Set up a start-line gate", hint: "Two tees 50 mm apart, 12 in in front of the ball" },
            { icon: <Target className="h-5 w-5" aria-hidden />, title: "3 putts from each distance", hint: "Through the gate, stop it at the target tee" },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Log the gate and the finish", hint: "Hit the gate? One tap and move on" },
          ]}
        />
        <ScoringGuide title="How scoring works">
          <ul className="space-y-1.5">
            <li>Each putt through the gate scores the cm it finished from the target.</li>
            <li>Short putts count more: 5 ft ×1.5, 10 ft ×1, 20 and 30 ft ×0.8.</li>
            <li>Hitting the gate scores {HIT_GATE_PRECISION_SCORE}.</li>
            <li className="font-semibold text-gray-900">Your score is the average. Lower is better.</li>
          </ul>
        </ScoringGuide>
        <PrimaryButton onClick={startTest}>Start the test</PrimaryButton>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="space-y-4">
        <ResultHero>
          <p className="mt-3 text-6xl font-extrabold tabular-nums leading-none">{summary.scoreAverage.toFixed(1)}</p>
          <p className="mt-1 text-xs text-white/70">Start line & speed score · lower is better</p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Through gate", value: `${summary.gateSuccessPct.toFixed(0)}%` },
            { label: "Avg miss", value: `${summary.meanCm.toFixed(0)} cm`, sub: "Gate putts only" },
            { label: "Gate hits", value: summary.left + summary.right, sub: `L ${summary.left} · R ${summary.right}` },
          ]}
        />

        {summary.varianceMsg && (
          <p className="rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{summary.varianceMsg}</p>
        )}

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void retryPersist() : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const track: TrackItem[] = sequence.map((_, i) => {
    const p = completedPutts[i];
    if (!p) return null;
    if (isGateHit(p.gate)) return { label: "Gate", tone: "bg-red-500 text-white", ariaLabel: `Putt ${i + 1}: hit the gate` };
    const s = precisionScoreForPutt(p.distance_cm, p.targetFt, p.gate);
    return { label: String(Math.round(s)), tone: scoreTone(s), ariaLabel: `Putt ${i + 1}: score ${s.toFixed(1)}` };
  });
  const liveScore =
    !gateHitSelected && distanceValid && currentTargetFt != null ? precisionScoreForPutt(distanceCm, currentTargetFt, gate) : null;
  const throughSoFar = completedPutts.filter((p) => !isGateHit(p.gate)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">
          {throughSoFar}/{completedPutts.length} through the gate
        </span>
        <span className="text-xs font-semibold text-gray-500">Lower score wins</span>
      </div>

      <ProgressTrack items={track} current={currentPuttIndex} />

      <div className="flex items-stretch gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <PuttLineDiagram shape="Straight" className="h-28 w-[5.5rem] shrink-0" />
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Putt {puttNumber} of {total}
          </p>
          <p className="text-5xl font-extrabold tabular-nums leading-none text-gray-900">
            {currentTargetFt}
            <span className="ml-1 text-xl font-bold text-gray-400">ft</span>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">Ball {(currentPuttIndex % 3) + 1} of 3 from here</p>
        </div>
      </div>

      {completedPutts.length > 0 && <CombineFlowBackControl onBack={undoLastPutt} label="Undo last putt" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">Did it start through the gate?</p>
        <GatePicker options={GATES} value={gate} onChange={setGate} />
      </div>

      {!gateHitSelected && (
        <div className="space-y-2">
          <p className="text-base font-bold text-gray-900">How far from the target?</p>
          <NumberChips
            values={DISTANCE_CHIPS_CM}
            value={distanceInput}
            onChange={setDistanceInput}
            unit="cm"
            formatChip={(v) => (v === 0 ? "Holed" : null)}
            ariaLabel="Distance from target in cm"
          />
        </div>
      )}

      <PrimaryButton onClick={() => void recordPutt()} disabled={!canRecord}>
        {puttNumber >= total ? "Finish the test" : "Next putt"}
        {liveScore != null && <span className="block text-xs font-semibold text-white/70">This putt scores {liveScore.toFixed(1)}</span>}
        {gateHitSelected && <span className="block text-xs font-semibold text-white/70">This putt scores {HIT_GATE_PRECISION_SCORE}</span>}
      </PrimaryButton>
    </div>
  );
}
