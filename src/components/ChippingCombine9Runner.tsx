"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { chippingCombine9Config } from "@/lib/chippingCombine9Config";
import {
  type ChipResultLabel,
  type ChippingCombineHoleLog,
  type ExecutionErrorLabel,
  type ReadErrorLabel,
  MAX_CHIP_SESSION,
  MAX_SESSION_POINTS,
  averageProximityCm,
  buildAggregates,
  chipPointsFromProximityCm,
  chipResultLabelFromProximityCm,
  missDiagnosisText,
  proximityRating,
  scrambleRate,
  sessionTotalPoints,
  suggestedChipFromProximityCm,
  totalChipPoints,
} from "@/lib/chippingCombine9Analytics";

function parseProximityCm(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function randomDistancesM(count: number, min: number, max: number): number[] {
  const span = max - min + 1;
  return Array.from({ length: count }, () => min + Math.floor(Math.random() * span));
}

async function persistSession(
  userId: string,
  distancesM: number[],
  holes: ChippingCombineHoleLog[],
  aggregates: Record<string, unknown>,
) {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const proximityScores = holes.map((h) => ({
      hole: h.hole,
      chip_result: h.chip_result,
      chip_points: h.chip_points,
      proximity_cm: h.proximity_cm ?? null,
    }));
    const missCategories = holes
      .filter((h) => h.miss_category)
      .map((h) => ({
        hole: h.hole,
        category: h.miss_category,
        read_error: h.read_error,
        execution_error: h.execution_error,
      }));

    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: chippingCombine9Config.testType,
      test_type: chippingCombine9Config.testType,
      duration_minutes: 0,
      metadata: {
        version: 1,
        distances_m: distancesM,
        proximity_scores: proximityScores,
        miss_categories: missCategories,
        holes,
        aggregates,
      },
      notes: JSON.stringify({
        kind: chippingCombine9Config.noteKind,
        scramble_rate: aggregates.scramble_rate,
        proximity_rating: aggregates.proximity_rating,
        diagnosis: aggregates.diagnosis,
        total_points: aggregates.total_points,
      }),
    });
    if (error) {
      console.warn("[ChippingCombine9] practice insert:", error.message);
      return false;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return true;
  } catch (e) {
    console.warn("[ChippingCombine9] practice insert failed", e);
    return false;
  }
}

const CHIP_OPTIONS: { label: ChipResultLabel; hint: string }[] = [
  { label: "Holed", hint: "0 cm → 20 pts" },
  { label: "Inside Club Length", hint: "1–90 cm → 15–11 pts (linear)" },
  { label: "Inside 6ft", hint: "91–183 cm → 10–6 pts (linear)" },
  { label: "Safety Zone", hint: "184–300 cm → 5–1 pts (linear)" },
  { label: "Missed Zone", hint: ">300 cm → 0 pts" },
];

export function ChippingCombine9Runner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [distancesM, setDistancesM] = useState<number[]>([]);
  const [holeIndex, setHoleIndex] = useState(0);
  const [phase, setPhase] = useState<"chip" | "putt" | "audit">("chip");
  const [holes, setHoles] = useState<ChippingCombineHoleLog[]>([]);
  const [pendingChip, setPendingChip] = useState<ChipResultLabel | null>(null);
  const [proximityInput, setProximityInput] = useState("");
  const [chipError, setChipError] = useState<string | null>(null);
  const [readError, setReadError] = useState<ReadErrorLabel | null>(null);
  const [executionError, setExecutionError] = useState<ExecutionErrorLabel | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const total = chippingCombine9Config.holeCount;
  const displayHole = holeIndex + 1;
  const distanceThisHole = distancesM[holeIndex] ?? 0;

  const startTest = useCallback(() => {
    setDistancesM(
      randomDistancesM(
        chippingCombine9Config.holeCount,
        chippingCombine9Config.distanceMinM,
        chippingCombine9Config.distanceMaxM,
      ),
    );
    setHoleIndex(0);
    setPhase("chip");
    setHoles([]);
    setPendingChip(null);
    setProximityInput("");
    setChipError(null);
    setReadError(null);
    setExecutionError(null);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
    setStatus("active");
  }, []);

  const finishHole = useCallback(
    async (entry: ChippingCombineHoleLog) => {
      const next = [...holes, entry];
      setHoles(next);
      setPendingChip(null);
      setProximityInput("");
      setChipError(null);
      setReadError(null);
      setExecutionError(null);
      setPhase("chip");

      if (next.length >= total) {
        setStatus("complete");
        const aggregates = buildAggregates(next);
        if (!user?.id) {
          setSaveError("Sign in to save this session.");
          setSaved(false);
        } else if (!persistAttemptedRef.current) {
          persistAttemptedRef.current = true;
          setSaveError(null);
          const ok = await persistSession(user.id, distancesM, next, aggregates);
          setSaved(ok);
          if (!ok) {
            setSaveError(
              "Could not save. Apply the latest database migration or check your connection.",
            );
            persistAttemptedRef.current = false;
          }
        }
      } else {
        setHoleIndex((i) => i + 1);
      }
    },
    [holes, total, user?.id, distancesM],
  );

  const proximityCmParsed = useMemo(
    () => parseProximityCm(proximityInput),
    [proximityInput],
  );
  const suggestedChip = useMemo(
    () => suggestedChipFromProximityCm(proximityCmParsed),
    [proximityCmParsed],
  );
  const calculatedChipPts = useMemo(() => {
    if (proximityCmParsed === null) return null;
    return chipPointsFromProximityCm(proximityCmParsed);
  }, [proximityCmParsed]);

  const onSelectChip = useCallback(
    (_label: ChipResultLabel) => {
      const cm = parseProximityCm(proximityInput);
      if (cm === null) {
        setChipError("Enter distance from hole (cm) first.");
        return;
      }
      setChipError(null);
      const derived = chipResultLabelFromProximityCm(cm);
      setPendingChip(derived);
      setPhase("putt");
    },
    [proximityInput],
  );

  const onPuttMade = useCallback(() => {
    if (phase !== "putt" || !pendingChip) return;
    const cm = parseProximityCm(proximityInput);
    if (cm === null) return;
    const chipResult = chipResultLabelFromProximityCm(cm);
    const chipPts = chipPointsFromProximityCm(cm);
    void finishHole({
      hole: displayHole,
      distance_m: distanceThisHole,
      proximity_cm: cm,
      chip_result: chipResult,
      chip_points: chipPts,
      putt_made: true,
      putt_points: 10,
    });
  }, [phase, pendingChip, proximityInput, displayHole, distanceThisHole, finishHole]);

  const onPuttMissed = useCallback(() => {
    if (phase !== "putt") return;
    setPhase("audit");
    setReadError(null);
    setExecutionError(null);
  }, [phase]);

  const onSubmitAudit = useCallback(() => {
    if (phase !== "audit" || !pendingChip || readError === null || executionError === null) return;
    const cm = parseProximityCm(proximityInput);
    if (cm === null) return;
    const chipResult = chipResultLabelFromProximityCm(cm);
    const chipPts = chipPointsFromProximityCm(cm);
    const missCategory = `${readError}/${executionError}`;
    void finishHole({
      hole: displayHole,
      distance_m: distanceThisHole,
      proximity_cm: cm,
      chip_result: chipResult,
      chip_points: chipPts,
      putt_made: false,
      putt_points: 0,
      read_error: readError,
      execution_error: executionError,
      miss_category: missCategory,
    });
  }, [phase, pendingChip, proximityInput, readError, executionError, displayHole, distanceThisHole, finishHole]);

  const retryPersist = useCallback(async () => {
    if (!user?.id || holes.length < total) return;
    setSaveError(null);
    const aggregates = buildAggregates(holes);
    persistAttemptedRef.current = true;
    const ok = await persistSession(user.id, distancesM, holes, aggregates);
    setSaved(ok);
    if (!ok) {
      setSaveError(
        "Could not save. Apply the latest database migration or check your connection.",
      );
      persistAttemptedRef.current = false;
    }
  }, [user?.id, holes, total, distancesM]);

  const summary = useMemo(() => {
    if (holes.length < total) return null;
    return {
      scramblePct: scrambleRate(holes) * 100,
      proximityPct: proximityRating(holes) * 100,
      chipPts: totalChipPoints(holes),
      diagnosis: missDiagnosisText(holes),
      totalPts: sessionTotalPoints(holes),
      avgProximityCm: averageProximityCm(holes),
    };
  }, [holes, total]);

  const choiceBtn =
    "w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900 transition-colors hover:border-[#014421] hover:bg-[#014421]/5 text-left";
  const choiceBtnActive = "border-[#014421] bg-[#014421]/10 ring-2 ring-[#014421]/20";

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          Starting draws nine new distances in that same {chippingCombine9Config.distanceMinM}–
          {chippingCombine9Config.distanceMaxM} m window. Each hole: enter chip distance from the hole
          in centimeters (Online Academy linear proximity scale), confirm the matching zone, log make or
          miss on the putt, then optional read vs. execution tags on misses. Finish all nine to save this
          session to your practice history.
        </p>
        <button
          type="button"
          onClick={startTest}
          className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Start combine
        </button>
      </div>
    );
  }

  if (status === "complete" && summary) {
    return (
      <div className="mt-6 space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900">{chippingCombine9Config.testName}</p>
          <h2 className="text-base font-medium text-gray-600">Session complete</h2>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Scramble rate
              </p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {summary.scramblePct.toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">1-putts ÷ 9 (up and downs).</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Proximity rating
              </p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">
                {summary.proximityPct.toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Chip points {summary.chipPts.toFixed(1)} / {MAX_CHIP_SESSION} max.
              </p>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
              The diagnosis
            </p>
            <p className="text-sm font-medium text-gray-900">{summary.diagnosis}</p>
          </div>
          <div className="border-t border-gray-100 pt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs text-gray-500">Total points (chip + putts)</p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">
                {summary.totalPts.toFixed(1)} / {MAX_SESSION_POINTS}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Average proximity</p>
              <p className="text-lg font-semibold text-gray-900 tabular-nums">
                {summary.avgProximityCm !== null
                  ? `${summary.avgProximityCm.toFixed(1)} cm`
                  : "—"}
              </p>
            </div>
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
            Session saved.
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
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-900">
          Hole {displayHole} Of {total}
        </p>
        <p className="text-lg font-semibold text-[#014421] mt-1 tabular-nums">{distanceThisHole}m</p>
        <p className="text-xs text-gray-600 mt-1">Chip to the hole, then log your results.</p>
      </div>

      {phase === "chip" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="chipping-proximity-cm" className="text-sm font-medium text-gray-800">
              Distance From Hole (cm)
            </label>
            <input
              id="chipping-proximity-cm"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              autoComplete="off"
              enterKeyHint="done"
              value={proximityInput}
              onChange={(e) => {
                setProximityInput(e.target.value);
                if (chipError) setChipError(null);
              }}
              onFocus={(e) => {
                const el = e.currentTarget;
                if (el.value.length === 0) return;
                requestAnimationFrame(() => {
                  el.select();
                });
              }}
              placeholder="e.g. 120"
              className="w-full min-h-[48px] rounded-xl border-2 border-gray-200 bg-white px-4 py-3.5 text-[16px] leading-normal text-gray-900 tabular-nums focus:border-[#014421] focus:outline-none focus:ring-2 focus:ring-[#014421]/20 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {calculatedChipPts !== null && (
              <p className="text-sm text-gray-800 pt-1">
                Calculated chip points:{" "}
                <span className="font-semibold text-[#014421] tabular-nums">
                  {calculatedChipPts.toFixed(1)} pts
                </span>
              </p>
            )}
            <p className="text-xs text-gray-500 leading-relaxed">
              Use the iPhone Measure App for exact results.
            </p>
            {chipError && <p className="text-sm text-red-600">{chipError}</p>}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-800">Confirm your proximity zone</p>
            <div className="space-y-2">
              {CHIP_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => onSelectChip(o.label)}
                  className={`${choiceBtn} ${suggestedChip === o.label ? choiceBtnActive : ""}`}
                >
                  <span className="block">
                    {o.label === "Inside Club Length"
                      ? "Inside Club Length (<90 cm)"
                      : o.label === "Inside 6ft"
                        ? "Inside 6ft (<183 cm)"
                        : o.label}
                  </span>
                  <span className="text-xs font-normal text-gray-500">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === "putt" && pendingChip && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Chip: <span className="font-semibold text-gray-900">{pendingChip}</span> (
            {proximityCmParsed !== null
              ? chipPointsFromProximityCm(proximityCmParsed).toFixed(1)
              : "0.0"}{" "}
            pts)
          </p>
          <p className="text-sm font-medium text-gray-800">Putt outcome</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onPuttMade} className={`${choiceBtn} text-center`}>
              Made
              <span className="block text-xs font-normal text-gray-500">+10 pts</span>
            </button>
            <button type="button" onClick={onPuttMissed} className={`${choiceBtn} text-center`}>
              Missed
            </button>
          </div>
        </div>
      )}

      {phase === "audit" && pendingChip && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-amber-900">Process audit</p>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Read Error</p>
            <div className="grid grid-cols-2 gap-2">
              {(["High", "Low"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReadError(r)}
                  className={`${choiceBtn} text-center ${readError === r ? choiceBtnActive : ""}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Execution Error</p>
            <div className="grid grid-cols-2 gap-2">
              {(["Speed", "Start Line"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setExecutionError(e)}
                  className={`${choiceBtn} text-center ${executionError === e ? choiceBtnActive : ""}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={readError === null || executionError === null}
            onClick={onSubmitAudit}
            className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next hole
          </button>
        </div>
      )}
    </div>
  );
}
