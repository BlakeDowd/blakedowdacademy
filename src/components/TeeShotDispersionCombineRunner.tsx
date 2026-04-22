"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { teeShotDispersionCombineConfig } from "@/lib/teeShotDispersionCombineConfig";
import {
  type FaceCol,
  type FaceRow,
  type TeeShotDirection,
  type TeeShotDispersionShotLog,
  type TeeShotFingerSelection,
  TEE_SHOT_FINGER_STEPS,
  buildAggregates,
  defaultTeeShotFingerSelection,
  lateralMissDisplayLine,
  lateralMissMeters,
  sessionTotalPoints,
  shotPointsForTeeDispersionShot,
  strikeClusterLine,
  strikeQuadrantLabel,
  selectionToLoggedFingers,
  MAX_SESSION_POINTS,
} from "@/lib/teeShotDispersionCombineAnalytics";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";

const FACE_ROWS: FaceRow[] = ["high", "middle", "low"];
const FACE_COLS: FaceCol[] = ["heel", "middle", "toe"];

function parseCarryMeters(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  const { minCarryDistanceM, maxCarryDistanceM } = teeShotDispersionCombineConfig;
  if (!Number.isFinite(n) || n < minCarryDistanceM || n > maxCarryDistanceM) return null;
  return n;
}

/** @returns null on success, or a user-visible error string */
async function persistSession(
  userId: string,
  shots: TeeShotDispersionShotLog[],
  aggregates: Record<string, unknown>,
): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const payload = {
      version: 3,
      total_score: aggregates.total_score,
      shots,
      aggregates,
    };
    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: teeShotDispersionCombineConfig.testType,
      test_type: teeShotDispersionCombineConfig.testType,
      duration_minutes: 0,
      notes: JSON.stringify({
        kind: teeShotDispersionCombineConfig.noteKind,
        total_points: aggregates.total_points,
        total_score: aggregates.total_score,
        strike_cluster: aggregates.strike_cluster,
        payload,
      }),
    });
    if (error) {
      const msg = formatSupabaseWriteError(error);
      console.warn("[TeeShotDispersionCombine] practice insert:", msg);
      return msg;
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    const msg = formatSupabaseWriteError(e);
    console.warn("[TeeShotDispersionCombine] practice insert failed", msg);
    return msg;
  }
}

export function TeeShotDispersionCombineRunner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [shotIndex, setShotIndex] = useState(0);
  const [carryInput, setCarryInput] = useState("");
  const [direction, setDirection] = useState<TeeShotDirection>("straight");
  const [fingerSelection, setFingerSelection] = useState<TeeShotFingerSelection>(() =>
    defaultTeeShotFingerSelection(),
  );
  const [row, setRow] = useState<FaceRow>("middle");
  const [col, setCol] = useState<FaceCol>("middle");
  const [shots, setShots] = useState<TeeShotDispersionShotLog[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const total = teeShotDispersionCombineConfig.shotCount;
  const displayShot = shotIndex + 1;

  const carryM = useMemo(() => parseCarryMeters(carryInput), [carryInput]);
  const carryValid = carryM !== null;

  const lateralReadout = useMemo(() => {
    if (!carryValid || carryM === null) {
      return "Enter carry distance to see lateral miss.";
    }
    return lateralMissDisplayLine(direction, carryM, fingerSelection);
  }, [carryValid, carryM, direction, fingerSelection]);

  const quadrantLabel = useMemo(() => strikeQuadrantLabel(row, col), [row, col]);
  const previewPoints = useMemo(
    () => shotPointsForTeeDispersionShot(direction, fingerSelection, row, col),
    [direction, fingerSelection, row, col],
  );

  const setDirectionAndSync = useCallback((d: TeeShotDirection) => {
    setDirection(d);
    if (d === "straight") {
      setFingerSelection({ mode: "numeric", value: 0 });
    }
  }, []);

  const selectNumericFinger = useCallback(
    (value: number) => {
      if (direction === "straight" && value !== 0) return;
      setFingerSelection({ mode: "numeric", value });
    },
    [direction],
  );

  const selectOutside = useCallback(() => {
    if (direction === "straight") return;
    setFingerSelection({ mode: "outside" });
  }, [direction]);

  const startTest = useCallback(() => {
    setStatus("active");
    setShotIndex(0);
    setCarryInput("");
    setDirection("straight");
    setFingerSelection(defaultTeeShotFingerSelection());
    setRow("middle");
    setCol("middle");
    setShots([]);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
  }, []);

  const finishSession = useCallback(
    async (finalShots: TeeShotDispersionShotLog[]) => {
      setShots(finalShots);
      setStatus("complete");
      const aggregates = buildAggregates(finalShots);
      if (!user?.id) {
        setSaveError("Sign in to save this session.");
        setSaved(false);
      } else if (!persistAttemptedRef.current) {
        persistAttemptedRef.current = true;
        setSaveError(null);
        const saveErr = await persistSession(user.id, finalShots, aggregates);
        setSaved(saveErr == null);
        if (saveErr) {
          setSaveError(saveErr);
          persistAttemptedRef.current = false;
        }
      }
    },
    [user?.id],
  );

  const onLogShot = useCallback(() => {
    if (status !== "active") return;
    const carry = parseCarryMeters(carryInput);
    if (carry === null) return;

    const loggedFingers = selectionToLoggedFingers(direction, fingerSelection);
    const lateralM =
      fingerSelection.mode === "outside"
        ? null
        : lateralMissMeters(
            carry,
            direction === "straight" ? 0 : fingerSelection.value,
          );
    const pts = shotPointsForTeeDispersionShot(direction, fingerSelection, row, col);
    const entry: TeeShotDispersionShotLog = {
      shot: displayShot,
      carry_distance_m: carry,
      direction,
      finger_dispersion: loggedFingers,
      lateral_meters: lateralM,
      strike_vertical: row,
      strike_horizontal: col,
      strike_quadrant: strikeQuadrantLabel(row, col),
      points: pts,
    };
    const next = [...shots, entry];
    setCarryInput(String(carry));
    setDirection("straight");
    setFingerSelection(defaultTeeShotFingerSelection());
    setRow("middle");
    setCol("middle");
    if (displayShot >= total) {
      void finishSession(next);
    } else {
      setShots(next);
      setShotIndex((i) => i + 1);
    }
  }, [
    status,
    carryInput,
    direction,
    fingerSelection,
    row,
    col,
    displayShot,
    total,
    shots,
    finishSession,
  ]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || shots.length === 0) return;
    const last = shots[shots.length - 1];
    setShots((s) => s.slice(0, -1));
    setShotIndex((i) => Math.max(0, i - 1));
    setCarryInput(String(last.carry_distance_m));
    setDirection(last.direction);
    if (last.finger_dispersion === "outside") {
      setFingerSelection({ mode: "outside" });
    } else {
      setFingerSelection({
        mode: "numeric",
        value: last.direction === "straight" ? 0 : (last.finger_dispersion as number),
      });
    }
    setRow(last.strike_vertical);
    setCol(last.strike_horizontal);
  }, [status, shots]);

  const retryPersist = useCallback(async () => {
    if (!user?.id || shots.length < total) return;
    setSaveError(null);
    const aggregates = buildAggregates(shots);
    persistAttemptedRef.current = true;
    const saveErr = await persistSession(user.id, shots, aggregates);
    setSaved(saveErr == null);
    if (saveErr) {
      setSaveError(saveErr);
      persistAttemptedRef.current = false;
    }
  }, [user?.id, shots, total]);

  const summary = useMemo(() => {
    if (shots.length < total) return null;
    return {
      totalPts: sessionTotalPoints(shots),
      strikeCluster: strikeClusterLine(shots),
    };
  }, [shots, total]);

  const cellClass = (r: FaceRow, c: FaceCol, selected: boolean) =>
    [
      "relative h-full min-h-[3rem] min-w-0 w-full rounded-xl border-2 text-sm font-semibold transition-all",
      "flex items-center justify-center text-center leading-tight px-0.5",
      selected
        ? "border-[#014421] bg-[#014421]/15 text-[#014421] ring-2 ring-[#014421]/30 shadow-sm"
        : "border-stone-400/80 bg-white/95 text-stone-700 hover:border-[#014421]/60 hover:bg-[#014421]/5",
    ].join(" ");

  const numericSelected =
    fingerSelection.mode === "numeric" ? fingerSelection.value : null;
  const outsideSelected = fingerSelection.mode === "outside";

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          Fourteen tee shots. Enter carry distance (meters) for each shot, then set start direction (left
          / straight / right), finger dispersion on the button grid (0–4 in half-finger steps; straight
          locks to 0), or tap <span className="font-medium">Outside 4</span> for a fail shot (0 points, no
          lateral number). Then log strike on the 9-point driver face. Finger bands match the iron/wedge
          combine (up to 10 pts) plus +{teeShotDispersionCombineConfig.middleMiddleBonus} for Middle/Middle
          when not Outside 4. Finish all {total} to save and see your strike cluster.
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
          <p className="text-sm font-semibold text-gray-900">{teeShotDispersionCombineConfig.testName}</p>
          <h2 className="text-base font-medium text-gray-600">Session complete</h2>
        </div>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
              Session score
            </p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {summary.totalPts.toFixed(0)} / {MAX_SESSION_POINTS}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Sum of all 14 shots: finger bands (0–10 each) +{" "}
              {teeShotDispersionCombineConfig.middleMiddleBonus} on Middle/Middle; Outside 4 shots score 0.
            </p>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
              Strike cluster
            </p>
            <p className="text-sm font-medium text-gray-900 leading-relaxed">{summary.strikeCluster}</p>
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

  const { minCarryDistanceM, maxCarryDistanceM } = teeShotDispersionCombineConfig;
  const logDisabled = !carryValid;

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-900">
          Shot {displayShot} of {total}
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Strike: <span className="font-semibold text-gray-800">{quadrantLabel}</span>
          <span className="text-gray-500"> · </span>
          <span className="tabular-nums">{previewPoints} pts this shot</span>
        </p>
      </div>

      {shots.length > 0 && (
        <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />
      )}

      {/* 1. Carry — 2. Direction — 3. Dispersion — 4. Strike */}
      <div className="space-y-4">
        <div>
          <label htmlFor="tee-carry-m" className="text-sm font-medium text-gray-800 block mb-2">
            Carry distance (m)
          </label>
          <input
            id="tee-carry-m"
            name="carryDistanceM"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            placeholder={`${minCarryDistanceM}–${maxCarryDistanceM}`}
            value={carryInput}
            onChange={(e) => setCarryInput(e.target.value)}
            className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-lg font-semibold tabular-nums text-gray-900 outline-none focus:border-[#014421] focus:ring-2 focus:ring-[#014421]/20"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Required before logging. Whole or decimal meters ({minCarryDistanceM}–{maxCarryDistanceM}).
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-800 mb-2">Direction</p>
          <div className="grid grid-cols-3 gap-2">
            {(["left", "straight", "right"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirectionAndSync(d)}
                className={`rounded-xl border-2 px-2 py-2.5 text-sm font-semibold transition-colors ${
                  direction === d
                    ? "border-[#014421] bg-[#014421]/10 text-[#014421] ring-2 ring-[#014421]/20"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                }`}
              >
                {d === "left" ? "Left" : d === "straight" ? "Straight" : "Right"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-medium text-gray-800">Finger dispersion</p>
            <span className="text-sm font-semibold tabular-nums text-[#014421]">
              {outsideSelected
                ? "Outside 4"
                : direction === "straight"
                  ? "0"
                  : `${numericSelected?.toFixed(1) ?? "0"} fingers`}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TEE_SHOT_FINGER_STEPS.map((step) => {
              const disabled = direction === "straight" && step !== 0;
              const selected = fingerSelection.mode === "numeric" && fingerSelection.value === step;
              return (
                <button
                  key={step}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectNumericFinger(step)}
                  className={`rounded-xl border-2 py-2.5 text-sm font-semibold tabular-nums transition-colors ${
                    selected
                      ? "border-[#014421] bg-[#014421]/10 text-[#014421] ring-2 ring-[#014421]/20"
                      : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                  } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {step === 0 ? "0" : step.toFixed(1)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={direction === "straight"}
            onClick={selectOutside}
            className={`mt-2 w-full rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
              outsideSelected
                ? "border-red-500 bg-red-100 text-red-900 ring-2 ring-red-300/60"
                : "border-red-300 bg-red-50/90 text-red-800 hover:bg-red-100 hover:border-red-400"
            } ${direction === "straight" ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            Outside 4
          </button>
          <p className="text-xs text-gray-600 mt-2">
            <span className="font-medium text-gray-900">{lateralReadout}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">Strike location (9-point grid)</p>
        <p className="text-xs text-gray-500">
          Tap the cell that matches your ball mark. Default is Middle / Middle (sweet spot).
        </p>

        <div className="mx-auto flex max-w-sm aspect-[3/4.2] min-h-0 flex-col rounded-[2rem] border-[5px] border-stone-700 bg-gradient-to-b from-stone-100 via-stone-200 to-stone-300 p-3 shadow-[inset_0_2px_8px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.15)] sm:p-4">
          {/*
            Full-width grid: narrow label column + three equal columns; header row auto-height,
            three strike rows share remaining height so cells fill the gray driver face.
          */}
          <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(2.5rem,auto)_repeat(3,minmax(0,1fr))] grid-rows-[minmax(1.75rem,auto)_repeat(3,minmax(0,1fr))] gap-x-2 gap-y-2">
            <div className="min-w-0" aria-hidden />
            {FACE_COLS.map((c) => (
              <div
                key={c}
                className="flex min-w-0 items-end justify-center pb-1 text-center text-[11px] font-bold uppercase tracking-wide text-stone-600"
              >
                {c === "heel" ? "Heel" : c === "middle" ? "Middle" : "Toe"}
              </div>
            ))}
            {FACE_ROWS.map((r) => (
              <Fragment key={r}>
                <div className="flex min-w-0 items-center justify-end pr-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-stone-600">
                  {r === "high" ? "High" : r === "middle" ? "Middle" : "Low"}
                </div>
                {FACE_COLS.map((c) => (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    onClick={() => {
                      setRow(r);
                      setCol(c);
                    }}
                    className={cellClass(r, c, row === r && col === c)}
                  >
                    <span className="sr-only">{strikeQuadrantLabel(r, c)}</span>
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={logDisabled}
        onClick={onLogShot}
        title={logDisabled ? `Enter carry (${minCarryDistanceM}–${maxCarryDistanceM} m) to log` : undefined}
        className="w-full py-3 rounded-xl bg-[#014421] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Log shot {displayShot}
      </button>
      {logDisabled && (
        <p className="text-center text-xs text-amber-800 -mt-4">
          Enter a valid carry distance to enable logging.
        </p>
      )}
    </div>
  );
}
