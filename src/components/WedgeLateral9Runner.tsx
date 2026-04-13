"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildWedgeLateral9Aggregates,
  wedgeLateral9ShotPoints,
  type WedgeLateral9ShotLog,
} from "@/lib/wedgeLateral9Analytics";
import { wedgeLateral9Config } from "@/lib/wedgeLateral9Config";
import { CombineFlowBackControl } from "@/components/CombineFlowBackControl";
import {
  normalizeLegacyVerticalStrike,
  type IronContact,
  type IronMissDirection,
  type IronStrike,
} from "@/lib/ironPrecisionProtocolConfig";

const DISPERSION_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const;

function randomTargetsM(count: number, min: number, max: number): number[] {
  const span = max - min + 1;
  return Array.from({ length: count }, () => min + Math.floor(Math.random() * span));
}

async function persistSession(userId: string, targetsM: number[], shots: WedgeLateral9ShotLog[]) {
  try {
    const shotsNormalized = shots.map((s) => {
      const strike = normalizeLegacyVerticalStrike(s.strike);
      return {
        ...s,
        strike,
        points: wedgeLateral9ShotPoints(s.dispersion, strike, s.contact),
      };
    });
    const aggregates = buildWedgeLateral9Aggregates(shotsNormalized);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.from("practice").insert({
      user_id: userId,
      type: wedgeLateral9Config.testType,
      test_type: wedgeLateral9Config.testType,
      duration_minutes: 0,
      metadata: {
        version: 1,
        targets_m: targetsM,
        shots: shotsNormalized,
        aggregates,
      },
      notes: JSON.stringify({
        kind: wedgeLateral9Config.noteKind,
        total_points: aggregates.total_points,
        solid_middle_bonus_pct: aggregates.solid_middle_bonus_pct,
        solid_middle_bonus_count: aggregates.solid_middle_bonus_count,
        wedge_bias_summary: aggregates.wedge_bias_summary,
      }),
    });
    if (error) {
      console.warn("[WedgeLateral9] practice insert:", error.message);
      return false;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return true;
  } catch (e) {
    console.warn("[WedgeLateral9] practice insert failed", e);
    return false;
  }
}

export function WedgeLateral9Runner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [targetsM, setTargetsM] = useState<number[]>([]);
  const [shotIndex, setShotIndex] = useState(0);
  const [direction, setDirection] = useState<IronMissDirection>("straight");
  const [dispersion, setDispersion] = useState<number | null>(0);
  const [strike, setStrike] = useState<IronStrike>("solid");
  const [contact, setContact] = useState<IronContact>("middle");
  const [completedShots, setCompletedShots] = useState<WedgeLateral9ShotLog[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const persistAttemptedRef = useRef(false);

  const total = wedgeLateral9Config.shotCount;
  const shotNumber = shotIndex + 1;
  const targetM = targetsM[shotIndex] ?? 0;

  const startTest = useCallback(() => {
    setTargetsM(
      randomTargetsM(
        wedgeLateral9Config.shotCount,
        wedgeLateral9Config.distanceMinM,
        wedgeLateral9Config.distanceMaxM,
      ),
    );
    setShotIndex(0);
    setDirection("straight");
    setDispersion(0);
    setStrike("solid");
    setContact("middle");
    setCompletedShots([]);
    setSaveError(null);
    setSaved(false);
    persistAttemptedRef.current = false;
    setStatus("active");
  }, []);

  const recordShot = useCallback(async () => {
    if (status !== "active") return;
    if (direction !== "straight" && dispersion === null) return;
    const effDispersion = direction === "straight" ? 0 : (dispersion as number);
    const points = wedgeLateral9ShotPoints(effDispersion, strike, contact);
    const record: WedgeLateral9ShotLog = {
      shot: shotNumber,
      target_m: targetM,
      direction,
      dispersion: effDispersion,
      strike,
      contact,
      points,
    };
    const nextLog = [...completedShots, record];
    setDirection("straight");
    setDispersion(0);
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
        const ok = await persistSession(uid, targetsM, nextLog);
        setSaved(ok);
        if (!ok) {
          setSaveError("Could not save session. Check your connection and try again.");
          persistAttemptedRef.current = false;
        }
      }
    } else {
      setCompletedShots(nextLog);
      setShotIndex((i) => i + 1);
    }
  }, [
    status,
    direction,
    dispersion,
    strike,
    contact,
    shotNumber,
    targetM,
    completedShots,
    total,
    targetsM,
    user,
  ]);

  const undoLastShot = useCallback(() => {
    if (status !== "active" || completedShots.length === 0) return;
    const last = completedShots[completedShots.length - 1];
    setCompletedShots((s) => s.slice(0, -1));
    setShotIndex((i) => Math.max(0, i - 1));
    setDirection(last.direction);
    setDispersion(last.direction === "straight" ? 0 : last.dispersion);
    setStrike(last.strike);
    setContact(last.contact);
  }, [status, completedShots]);

  const retryPersist = useCallback(async () => {
    if (!user?.id || completedShots.length < total) return;
    setSaveError(null);
    persistAttemptedRef.current = true;
    const ok = await persistSession(user.id, targetsM, completedShots);
    setSaved(ok);
    if (!ok) {
      setSaveError("Could not save session. Check your connection and try again.");
      persistAttemptedRef.current = false;
    }
  }, [user, completedShots, total, targetsM]);

  const summary = useMemo(() => {
    if (completedShots.length < total) return null;
    return buildWedgeLateral9Aggregates(completedShots);
  }, [completedShots, total]);

  if (status === "intro") {
    return (
      <div className="mt-6 space-y-4">
        <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
          <p>
            Nine shots at <span className="font-medium text-gray-800">random distances from 30 m to 100 m</span>.
            Each shot: log{" "}
            <span className="font-medium text-gray-800">direction</span> (left / straight / right),{" "}
            <span className="font-medium text-gray-800">dispersion</span> (fingers, 0–4 in half steps; straight
            locks 0), <span className="font-medium text-gray-800">vertical strike</span> (fat, thin, solid),
            and <span className="font-medium text-gray-800">horizontal contact</span> (toe, heel, middle).{" "}
            <span className="font-medium text-gray-800">+2 bonus</span> for solid with middle contact.
          </p>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700 space-y-1">
            <p className="font-semibold text-gray-900 text-sm">Dispersion Points</p>
            <p>0.0–0.5: 10 pts · 1.0–1.5: 7 · 2.0–2.5: 4 · 3.0–4.0: 1</p>
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
        <p className="text-sm font-semibold text-gray-900">{wedgeLateral9Config.testName}</p>
        <h2 className="text-base font-medium text-gray-600">Test Complete</h2>

        <div className="rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Points</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums">{summary.total_points}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 text-sm text-gray-600">
            <div className="rounded-lg border border-gray-100 bg-stone-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Shot Consistency</p>
              <p className="text-xl font-bold text-gray-900 tabular-nums">
                {summary.avg_points_per_shot.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Average Points Per Shot</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-stone-50/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Solid + Middle Rate
              </p>
              <p className="text-xl font-bold text-gray-900 tabular-nums">
                {summary.solid_middle_bonus_pct.toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {summary.solid_middle_bonus_count} of {total} earned the +2 bonus
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/90 mb-1">
              Wedge Bias
            </p>
            <p>{summary.wedge_bias_summary}</p>
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

  const canRecord = direction === "straight" || dispersion !== null;

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 space-y-2 text-sm text-gray-800">
        <p className="font-semibold text-gray-900">
          Shot {shotNumber} of {total}
        </p>
        <p className="text-base">
          Requested Distance:{" "}
          <span className="font-bold text-gray-900 tabular-nums">Hit to {targetM} m</span>
        </p>
      </div>

      {completedShots.length > 0 && (
        <CombineFlowBackControl onBack={undoLastShot} label="Undo last shot" />
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">Direction</p>
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
                if (value === "straight") setDispersion(0);
                else setDispersion(null);
              }}
              className={`py-3 text-sm font-semibold rounded-lg transition-colors ${
                direction === value ? "bg-white text-gray-900 shadow" : "text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800">Dispersion (Fingers)</p>
        {direction === "straight" ? (
          <p className="text-sm text-gray-600 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            Straight: dispersion locked at <span className="font-semibold text-gray-900">0</span>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {DISPERSION_STEPS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDispersion(d)}
                className={`min-w-[3rem] flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
                  dispersion === d
                    ? "border-[#014421] bg-[#014421] text-white"
                    : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
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
              ["toe", "Toe"],
              ["heel", "Heel"],
              ["middle", "Middle"],
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
