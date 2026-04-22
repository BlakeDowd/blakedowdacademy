"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { survival20Config } from "@/lib/survival20Config";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";

function randomTargetDistanceM(): number {
  const { targetMinM, targetMaxM } = survival20Config;
  const span = targetMaxM - targetMinM;
  const t = targetMinM + Math.random() * span;
  return Math.round(t * 10) / 10;
}

function normalizeMetresInput(raw: string): string {
  let t = raw.replace(/[^0-9.]/g, "");
  const dot = t.indexOf(".");
  if (dot !== -1) {
    t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "");
  }
  return t;
}

function parseMetres(raw: string): number | null {
  const s = raw.trim();
  if (s === "" || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type Survival20Metadata = {
  version: 1;
  streak_shots: number;
};

function bufferBarTone(bufferM: number): "green" | "yellow" | "red" {
  if (bufferM > 10) return "green";
  if (bufferM > 2) return "yellow";
  return "red";
}

async function persistSurvivalSession(userId: string, streakShots: number): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const score = streakShots;
    const payload: Survival20Metadata = {
      version: 1,
      streak_shots: streakShots,
    };

    const { error } = await supabase.from("practice_logs").insert({
      user_id: userId,
      log_type: survival20Config.practiceLogType,
      score,
      total_points: score,
      notes: JSON.stringify(payload),
    });

    if (error) {
      console.warn("[Survival20] practice_logs insert:", formatSupabaseWriteError(error));
      return formatSupabaseWriteError(error);
    }
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
    }
    return null;
  } catch (e) {
    console.warn("[Survival20] practice_logs insert failed", formatSupabaseWriteError(e));
    return formatSupabaseWriteError(e);
  }
}

export function Survival20Runner() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<"intro" | "playing" | "ended">("intro");
  const [bufferM, setBufferM] = useState<number>(survival20Config.initialBufferM);
  const [streak, setStreak] = useState(0);
  const [targetM, setTargetM] = useState<number | null>(null);
  const [actualInput, setActualInput] = useState("");
  const [lastDiff, setLastDiff] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const persistAttemptedRef = useRef(false);

  const pctFull = Math.max(
    0,
    Math.min(100, (bufferM / survival20Config.initialBufferM) * 100),
  );
  const tone = bufferBarTone(bufferM);

  const barColor =
    tone === "green"
      ? "bg-[#014421]"
      : tone === "yellow"
        ? "bg-amber-400"
        : "bg-red-600";

  const inputCls =
    "w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-3 text-lg text-gray-900 outline-none transition-[border-color,box-shadow] focus:border-[#014421] focus:ring-2 focus:ring-[#014421]/30";

  const startRound = useCallback(() => {
    persistAttemptedRef.current = false;
    setSaveError(null);
    setSaved(false);
    setBufferM(survival20Config.initialBufferM);
    setStreak(0);
    setLastDiff(null);
    setActualInput("");
    setTargetM(randomTargetDistanceM());
    setPhase("playing");
  }, []);

  const submitShot = useCallback(async () => {
    if (phase !== "playing" || targetM === null) return;
    const actual = parseMetres(actualInput);
    if (actual === null) return;

    const diff = Math.abs(targetM - actual);
    const nextBuf = Math.round((bufferM - diff) * 10) / 10;
    setLastDiff(diff);
    setActualInput("");

    if (nextBuf <= 0) {
      setBufferM(Math.max(0, nextBuf));
      setPhase("ended");
      if (!user?.id) {
        setSaveError(null);
        return;
      }
      const finalStreak = streak;
      if (!persistAttemptedRef.current && !persisting) {
        persistAttemptedRef.current = true;
        setPersisting(true);
        const err = await persistSurvivalSession(user.id, finalStreak);
        setPersisting(false);
        if (err) setSaveError(err);
        else setSaved(true);
        if (err) persistAttemptedRef.current = false;
      }
      return;
    }

    setBufferM(nextBuf);
    setStreak((s) => s + 1);
    setTargetM(randomTargetDistanceM());
  }, [
    phase,
    targetM,
    actualInput,
    bufferM,
    streak,
    user?.id,
    persisting,
  ]);

  const endedStreakDisplay = streak;

  const canSubmitPlaying =
    phase === "playing" &&
    targetM !== null &&
    parseMetres(actualInput) !== null &&
    !persisting;

  if (phase === "intro") {
    return (
      <div className="mt-6 space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
          <p>
            Start with a <strong className="text-gray-900">{survival20Config.initialBufferM} m</strong>{" "}
            buffer. Each shot gives a random target distance ({survival20Config.targetMinM}–
            {survival20Config.targetMaxM} m). Enter how far you actually flew the ball—the absolute
            miss vs target is deducted from your buffer.
          </p>
          <p className="mt-3">
            Survive as many shots as you can. When the buffer hits zero, your{" "}
            <strong className="text-gray-900">streak</strong> (successful shots before you ran out) is
            saved as your score.
          </p>
        </div>
        <button
          type="button"
          onClick={startRound}
          className="w-full rounded-xl bg-[#014421] py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
        >
          Start round
        </button>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="mt-6 space-y-6">
        <div className="rounded-2xl border-2 border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
            Round over
          </p>
          <p className="mt-2 text-center text-3xl font-bold tabular-nums text-gray-900">
            {endedStreakDisplay}{" "}
            <span className="text-lg font-semibold text-gray-600">
              shot{endedStreakDisplay === 1 ? "" : "s"} survived
            </span>
          </p>
          {lastDiff !== null && (
            <p className="mt-2 text-center text-sm text-gray-600">
              Last miss: <span className="font-semibold tabular-nums">{lastDiff.toFixed(1)} m</span>
            </p>
          )}
          {!user?.id && (
            <p className="mt-4 text-center text-xs text-amber-700">
              Sign in to save your streak to the Academy leaderboard.
            </p>
          )}
          {saveError && (
            <p className="mt-3 text-center text-sm text-red-600">{saveError}</p>
          )}
          {saved && user?.id && (
            <p className="mt-3 text-center text-sm font-medium text-green-700">
              Saved to practice log as Survival 20.
            </p>
          )}
          {persisting && (
            <p className="mt-2 text-center text-sm text-gray-500">Saving…</p>
          )}
          <button
            type="button"
            onClick={startRound}
            className="mt-6 w-full rounded-xl border-2 border-[#014421] bg-white py-3 text-base font-semibold text-[#014421] transition-colors hover:bg-[#014421]/5"
          >
            Play again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Buffer</p>
          <p className="text-xs text-gray-500">
            Green &gt;10 m · Yellow ≤10 m (&gt;2 m) · Red ≤2 m
          </p>
        </div>
        <p className="mt-2 text-center text-3xl font-bold tabular-nums text-gray-900">
          {bufferM.toFixed(1)}{" "}
          <span className="text-base font-semibold text-gray-500">/ {survival20Config.initialBufferM} m</span>
        </p>
        <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out ${barColor}`}
            style={{ width: `${pctFull}%` }}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Target distance
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums text-[#014421]">
              {targetM !== null ? `${targetM.toFixed(1)} m` : "—"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Streak</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{streak}</p>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <label htmlFor="survival-actual-m" className="text-sm font-medium text-gray-800">
            Actual distance (m)
          </label>
          <input
            id="survival-actual-m"
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="e.g. 72.5"
            value={actualInput}
            onChange={(e) => setActualInput(normalizeMetresInput(e.target.value))}
            className={inputCls}
          />
        </div>

        <button
          type="button"
          disabled={!canSubmitPlaying}
          onClick={() => void submitShot()}
          className="mt-5 w-full rounded-xl bg-[#014421] py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit shot
        </button>
      </div>
    </div>
  );
}
