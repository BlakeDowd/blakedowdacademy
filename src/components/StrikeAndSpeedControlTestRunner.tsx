"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DoorOpen, Ruler, Target } from "lucide-react";
import { useCombineUser } from "@/hooks/useCombineUser";
import {
  averageMatrixScore,
  performanceDiagnosis,
  cleanStrikeRate,
  meanAbsDistanceCm,
  gateSideCounts,
  gateSideImprovementMessage,
  matrixScoreForPutt,
} from "@/lib/strikeAndSpeedControlScoring";
import {
  strikeAndSpeedControlTestConfig,
  type StrikeQuality,
} from "@/lib/strikeAndSpeedControlTestConfig";
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
  strike: StrikeQuality;
  distance_cm: number;
};

type CombineProfile = Record<string, unknown>;

const DISTANCE_CHIPS_CM = [0, 5, 10, 15, 20, 30, 45, 60, 90] as const;
const DISTANCES_FT = [5, 10, 20, 30] as const;

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

function scoreTone(score: number): string {
  if (score <= 10) return "bg-[#014421] text-white";
  if (score <= 25) return "bg-green-200 text-[#014421]";
  if (score <= 50) return "bg-amber-200 text-amber-900";
  return "bg-red-500 text-white";
}

const STRIKES: GateOption<StrikeQuality>[] = [
  { key: "hit_gate_left", title: "Hit left", hint: "Score x2", hit: "left" },
  { key: "clean", title: "Clean", hint: "Through the gate", hit: null },
  { key: "hit_gate_right", title: "Hit right", hint: "Score x2", hit: "right" },
];

export function StrikeAndSpeedControlTestRunner() {
  const user = useCombineUser();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [currentPuttIndex, setCurrentPuttIndex] = useState(0);
  const [strike, setStrike] = useState<StrikeQuality>("clean");
  const [distanceInput, setDistanceInput] = useState("");
  const [completedPutts, setCompletedPutts] = useState<PuttRecord[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const userId = user?.id;
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
    if (status !== "active" || !distanceValid || currentTargetFt == null) return;
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
      if (!userId) {
        setSaveError("Sign in to save this session to practice logs.");
        setSaved(false);
      } else if (!persistAttemptedRef.current) {
        persistAttemptedRef.current = true;
        setSaveError(null);
        const avg = averageMatrixScore(
          nextLog.map((p) => ({ targetFt: p.targetFt, cm: p.distance_cm, strike: p.strike })),
        );
        const saveErr = await persistSession(userId, nextLog, avg);
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
  }, [status, distanceValid, puttNumber, currentTargetFt, strike, distanceCm, completedPutts, total, userId]);

  const undoLastPutt = useCallback(() => {
    if (status !== "active" || completedPutts.length === 0) return;
    const last = completedPutts[completedPutts.length - 1]!;
    setCompletedPutts((s) => s.slice(0, -1));
    setCurrentPuttIndex((i) => Math.max(0, i - 1));
    setStrike(last.strike);
    setDistanceInput(String(last.distance_cm));
  }, [status, completedPutts]);

  const retryPersist = useCallback(async () => {
    if (!userId || completedPutts.length < total) return;
    setSaveError(null);
    const avg = averageMatrixScore(
      completedPutts.map((p) => ({ targetFt: p.targetFt, cm: p.distance_cm, strike: p.strike })),
    );
    persistAttemptedRef.current = true;
    const saveErr = await persistSession(userId, completedPutts, avg);
    setSaved(saveErr == null);
    if (saveErr) {
      setSaveError(saveErr);
      persistAttemptedRef.current = false;
    }
  }, [userId, completedPutts, total]);

  const summary = useMemo(() => {
    if (completedPutts.length < total) return null;
    const avg = averageMatrixScore(
      completedPutts.map((p) => ({ targetFt: p.targetFt, cm: p.distance_cm, strike: p.strike })),
    );
    return {
      matrixAverage: avg,
      diagnosis: performanceDiagnosis(completedPutts.map((p) => ({ strike: p.strike, cm: p.distance_cm }))),
      cleanPct: cleanStrikeRate(completedPutts.map((p) => ({ strike: p.strike }))) * 100,
      meanCm: meanAbsDistanceCm(completedPutts.map((p) => ({ cm: p.distance_cm }))),
      gateSides: gateSideCounts(completedPutts.map((p) => ({ strike: p.strike }))),
      gateSideMessage: gateSideImprovementMessage(completedPutts.map((p) => ({ strike: p.strike }))),
      byDistance: DISTANCES_FT.map((ft) => {
        const at = completedPutts.filter((p) => p.targetFt === ft);
        return { ft, meanCm: meanAbsDistanceCm(at.map((p) => ({ cm: p.distance_cm }))) };
      }),
    };
  }, [completedPutts, total]);

  if (status === "intro") {
    return (
      <div className="space-y-4">
        <CombineHero title="Strike & Speed Control" shape="Straight" chips={[`${total} putts`, "5 to 30 ft", "~15 min", "Lowest score wins"]} />
        <IntroSteps
          steps={[
            { icon: <DoorOpen className="h-5 w-5" aria-hidden />, title: "Set up a strike gate", hint: "Two tees just wider than your putter head" },
            { icon: <Target className="h-5 w-5" aria-hidden />, title: "3 putts from each distance", hint: "5, 10, 20, then 30 ft" },
            { icon: <Ruler className="h-5 w-5" aria-hidden />, title: "Log the strike and the finish", hint: "Measure in cm to the centre of the ball" },
          ]}
        />
        <ScoringGuide title="How scoring works">
          <ul className="space-y-1.5">
            <li>Each putt scores the cm it finished from the target.</li>
            <li>Short putts count more: 5 ft ×1.5, 10 ft ×1, 20 and 30 ft ×0.8.</li>
            <li>Touching the gate doubles that putt&apos;s score.</li>
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
          <p className="mt-3 text-6xl font-extrabold tabular-nums leading-none">{summary.matrixAverage.toFixed(1)}</p>
          <p className="mt-1 text-xs text-white/70">Strike & speed score · lower is better</p>
          <p className="mx-auto mt-3 max-w-xs rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold">{summary.diagnosis}</p>
        </ResultHero>

        <StatTiles
          stats={[
            { label: "Clean strikes", value: `${summary.cleanPct.toFixed(0)}%` },
            { label: "Avg miss", value: `${summary.meanCm.toFixed(0)} cm` },
            { label: "Gate hits", value: summary.gateSides.totalGateHits, sub: `L ${summary.gateSides.left} · R ${summary.gateSides.right}` },
          ]}
        />

        <div className="rounded-2xl border border-gray-100 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Average miss by distance</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {summary.byDistance.map((d) => (
              <div key={d.ft} className="rounded-xl bg-gray-50 py-2">
                <p className="text-[10px] font-semibold text-gray-400">{d.ft} ft</p>
                <p className="text-base font-extrabold tabular-nums text-gray-900">
                  {d.meanCm.toFixed(0)}
                  <span className="text-[10px] font-semibold text-gray-400"> cm</span>
                </p>
              </div>
            ))}
          </div>
        </div>

        {summary.gateSideMessage && (
          <p className="rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{summary.gateSideMessage}</p>
        )}

        <SaveStatus saved={saved} error={saveError} onRetry={userId ? () => void retryPersist() : undefined} />
        <PlayAgainButton onClick={startTest} />
      </div>
    );
  }

  const track: TrackItem[] = sequence.map((_, i) => {
    const p = completedPutts[i];
    if (!p) return null;
    const s = matrixScoreForPutt(p.distance_cm, p.targetFt, p.strike);
    return { label: String(Math.round(s)), tone: scoreTone(s), ariaLabel: `Putt ${i + 1}: score ${s.toFixed(1)}` };
  });
  const liveScore = distanceValid && currentTargetFt != null ? matrixScoreForPutt(distanceCm, currentTargetFt, strike) : null;
  const ofThisDistance = (currentPuttIndex % 3) + 1;
  const runningAvg =
    completedPutts.length > 0
      ? averageMatrixScore(completedPutts.map((p) => ({ targetFt: p.targetFt, cm: p.distance_cm, strike: p.strike })))
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#014421] px-3 py-1 text-xs font-bold tabular-nums text-white">
          {runningAvg == null ? "No score yet" : `Avg ${runningAvg.toFixed(1)}`}
        </span>
        <span className="text-xs font-semibold text-gray-500">Lower is better</span>
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
          <p className="mt-1.5 text-sm font-semibold text-[#014421]">Ball {ofThisDistance} of 3 from here</p>
        </div>
      </div>

      {completedPutts.length > 0 && <CombineFlowBackControl onBack={undoLastPutt} label="Undo last putt" />}

      <div className="space-y-2">
        <p className="text-base font-bold text-gray-900">How was the strike?</p>
        <GatePicker options={STRIKES} value={strike} onChange={setStrike} />
      </div>

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

      <PrimaryButton onClick={() => void recordPutt()} disabled={!distanceValid}>
        {puttNumber >= total ? "Finish the test" : "Next putt"}
        {liveScore != null && <span className="block text-xs font-semibold text-white/70">This putt scores {liveScore.toFixed(1)}</span>}
      </PrimaryButton>
    </div>
  );
}
