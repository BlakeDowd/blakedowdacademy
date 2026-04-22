"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { flopShotCombineConfig } from "@/lib/flopShotCombineConfig";
import {
  FLOP_SHOT_MAX_TOTAL_POINTS,
  flopShotPointsFromCm,
  roundFlopPointsOneDecimal,
} from "@/lib/flopShotCombineScoring";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { performanceGradeFromOutOf150 } from "@/lib/combinePerformanceGrade";
import { CombinePerformanceGradeBadge } from "@/components/CombinePerformanceGradeBadge";

type DistM = (typeof flopShotCombineConfig.distancesMetres)[number];

const SHOT_LABELS = ["Shot 1", "Shot 2", "Shot 3", "Shot 4", "Shot 5"];

const inputCls =
  "w-full rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 outline-none transition-[border-color,box-shadow] focus:border-[#014421] focus:ring-2 focus:ring-[#014421]/30";

function parseCm(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type FlopShotCombineMetadata = {
  version: 2;
  scoring: "pro_linear";
  cm_5m: number[];
  cm_10m: number[];
  cm_20m: number[];
  /** Session total, rounded to one decimal (same as UI / persistence). */
  total_score: number;
  performance_grade: string;
};

async function persistFlopSession(
  userId: string,
  cm5: number[],
  cm10: number[],
  cm20: number[],
  totalScore: number,
): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const sessionScore: number =
      typeof totalScore === "number" && Number.isFinite(totalScore) ? totalScore : 0;
    const { label: performanceGrade } = performanceGradeFromOutOf150(sessionScore);

    const { error } = await supabase.from("practice_logs").insert({
      user_id: userId,
      log_type: flopShotCombineConfig.practiceLogType,
      score: sessionScore,
      total_points: sessionScore,
    });

    if (error) {
      const msg = formatSupabaseWriteError(error);
      console.warn("[FlopShotCombine] practice_logs insert:", msg);
      return msg;
    }

    await awardCombineCompletionXp(userId);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    const msg = formatSupabaseWriteError(e);
    console.warn("[FlopShotCombine] practice_logs insert failed", msg);
    return msg;
  }
}

export function FlopShotCombineRunner() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<DistM, string[]>>(() => {
    const blank = Array.from({ length: flopShotCombineConfig.shotsPerDistance }, () => "");
    return {
      5: [...blank],
      10: [...blank],
      20: [...blank],
    };
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const persistAttemptedRef = useRef(false);

  const totalsByDistance = useMemo(() => {
    const sumDist = (cells: string[]) =>
      cells.reduce((acc, raw) => {
        const cm = parseCm(raw);
        if (cm === null) return acc;
        return acc + flopShotPointsFromCm(cm);
      }, 0);
    return {
      5: sumDist(values[5]),
      10: sumDist(values[10]),
      20: sumDist(values[20]),
    };
  }, [values]);

  const cmArrays = useMemo(() => {
    const nums = (cells: string[]) =>
      cells.map((raw) => {
        const cm = parseCm(raw);
        return cm ?? 0;
      });
    return {
      cm5: nums(values[5]),
      cm10: nums(values[10]),
      cm20: nums(values[20]),
    };
  }, [values]);

  const totalScoreRaw =
    totalsByDistance[5] + totalsByDistance[10] + totalsByDistance[20];
  const totalScoreRounded = roundFlopPointsOneDecimal(totalScoreRaw);

  const sessionGrade = useMemo(
    () => performanceGradeFromOutOf150(totalScoreRounded),
    [totalScoreRounded],
  );

  const allFieldsValid = useMemo(() => {
    const ok = (cells: string[]) =>
      cells.every((raw) => parseCm(raw) !== null);
    return ok(values[5]) && ok(values[10]) && ok(values[20]);
  }, [values]);

  const setCell = useCallback((dist: DistM, idx: number, raw: string) => {
    setSaved(false);
    persistAttemptedRef.current = false;
    setSaveError(null);
    setValues((prev) => {
      const next = { ...prev, [dist]: [...prev[dist]] };
      next[dist][idx] = raw;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!user?.id) {
      setSaveError("Sign in to save your session.");
      return;
    }
    if (!allFieldsValid) {
      setSaveError("Enter a distance in cm for all 15 shots (use 0 for tap-in range).");
      return;
    }
    if (saved || isSaving) return;
    persistAttemptedRef.current = true;
    setSaveError(null);
    setIsSaving(true);

    const err = await persistFlopSession(
      user.id,
      cmArrays.cm5,
      cmArrays.cm10,
      cmArrays.cm20,
      totalScoreRounded,
    );
    setIsSaving(false);
    if (err) {
      setSaveError(err);
      persistAttemptedRef.current = false;
      return;
    }
    setSaved(true);
  }, [user?.id, allFieldsValid, cmArrays, totalScoreRounded, saved, isSaving]);

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Session score
              </p>
              <p className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0 font-bold tabular-nums leading-none text-gray-900">
                <span className="max-w-full truncate text-[clamp(1.5rem,5vw+0.75rem,2.25rem)]">
                  {totalScoreRounded.toFixed(1)}
                </span>
                <span className="shrink-0 font-semibold text-[clamp(0.875rem,2.8vw,1.125rem)] text-gray-500">
                  / {FLOP_SHOT_MAX_TOTAL_POINTS}
                </span>
              </p>
            </div>
            <div className="min-w-0 sm:max-w-[15rem] sm:flex-1 sm:text-right text-[11px] leading-snug text-gray-600 sm:text-xs">
              <p className="font-medium text-gray-700">Pro-scale (linear)</p>
              <p>0–90 cm: 10.0→7.0 pts</p>
              <p>91–180 cm: 6.9→4.0 pts</p>
              <p>181–300 cm: 3.9→1.0 pts</p>
              <p className="text-gray-500">&gt;300 cm: 0</p>
              <p className="mt-1.5 text-[10px] text-gray-500 sm:text-[11px]">
                Closer always scores higher. Totals rounded to 0.1.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {flopShotCombineConfig.distancesMetres.map((dist) => (
          <section
            key={dist}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
            aria-labelledby={`flop-dist-${dist}`}
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id={`flop-dist-${dist}`}
                className="text-lg font-semibold text-slate-900"
              >
                {dist} metres
              </h2>
              <p className="max-w-[min(100%,11rem)] text-right text-sm font-medium tabular-nums text-[#014421] sm:max-w-none sm:text-base">
                Section: {roundFlopPointsOneDecimal(totalsByDistance[dist]).toFixed(1)} pts
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {SHOT_LABELS.map((label, idx) => {
                const raw = values[dist][idx];
                const cm = parseCm(raw);
                const pts = cm === null ? null : flopShotPointsFromCm(cm);
                const ptsDisplay =
                  pts === null ? null : roundFlopPointsOneDecimal(pts);
                return (
                  <div key={`${dist}-${idx}`} className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`flop-${dist}-${idx}`}
                      className="text-xs font-medium text-slate-800"
                    >
                      {label}{" "}
                      <span className="font-normal text-gray-500">(cm)</span>
                    </label>
                    <input
                      id={`flop-${dist}-${idx}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      enterKeyHint="done"
                      placeholder="0"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={raw}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        setCell(dist, idx, v);
                      }}
                      className={inputCls}
                    />
                    <p className="min-h-[1.25rem] text-xs tabular-nums text-gray-500">
                      {ptsDisplay !== null ? (
                        <span className="font-medium text-[#014421]">
                          {ptsDisplay.toFixed(1)} pts
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!user?.id || !allFieldsValid || isSaving}
          className="w-full rounded-xl bg-[#014421] py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? "Saving…" : "Submit session"}
        </button>
        {!user?.id && (
          <p className="mt-2 text-center text-xs text-amber-700">
            Sign in to save results to your practice log.
          </p>
        )}
        {saveError && (
          <p className="mt-2 text-center text-xs text-red-600">{saveError}</p>
        )}
        {saved && !saveError && (
          <div className="mt-4 space-y-3">
            <p className="text-center text-sm font-medium text-green-700">
              Saved to your practice log.
            </p>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                Session result
              </p>
              <p className="mt-2 text-center text-lg font-semibold tabular-nums text-gray-900">
                {totalScoreRounded.toFixed(1)} / {FLOP_SHOT_MAX_TOTAL_POINTS} pts
              </p>
              <div className="mt-4 flex justify-center">
                <CombinePerformanceGradeBadge
                  gradeId={sessionGrade.id}
                  label={sessionGrade.label}
                  className="max-w-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
