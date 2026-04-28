"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { threeStrikesWedgeConfig } from "@/lib/threeStrikesWedgeConfig";
import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";
import { awardCombineCompletionXp } from "@/lib/combineXp";
import { insertPracticeLogCompat } from "@/lib/practiceLogsCompat";

function randomTargetDistanceM(): number {
  const min = threeStrikesWedgeConfig.targetMinM;
  const max = threeStrikesWedgeConfig.targetMaxM;
  const span = max - min;
  const value = min + Math.random() * span;
  return Math.round(value * 10) / 10;
}

function normalizeMetresInput(raw: string): string {
  let cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot !== -1) {
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
  }
  return cleaned;
}

function parseMetres(raw: string): number | null {
  const s = raw.trim();
  if (s === "" || s === ".") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

async function persistThreeStrikesSession(userId: string, hits: number): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const payload = {
      version: 1,
      total_hits: hits,
      max_strikes: threeStrikesWedgeConfig.maxStrikes,
      hit_window_m: threeStrikesWedgeConfig.hitWindowM,
    };

    const insertRes = await insertPracticeLogCompat(supabase, {
      user_id: userId,
      log_type: threeStrikesWedgeConfig.practiceLogType,
      score: hits,
      total_points: hits,
      notes: JSON.stringify(payload),
    });
    if (!insertRes.ok) return insertRes.message;
    await awardCombineCompletionXp(userId);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("practiceSessionsUpdated"));
      window.dispatchEvent(new Event("academyLeaderboardRefresh"));
    }
    return null;
  } catch (e) {
    return formatSupabaseWriteError(e);
  }
}

export function ThreeStrikesWedgeRunner() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<"intro" | "playing" | "ended">("intro");
  const [targetM, setTargetM] = useState<number>(randomTargetDistanceM());
  const [actualInput, setActualInput] = useState("");
  const [hits, setHits] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [persisting, setPersisting] = useState(false);

  const canSubmitShot = phase === "playing" && parseMetres(actualInput) !== null;
  const strikeSlots = useMemo(
    () =>
      Array.from({ length: threeStrikesWedgeConfig.maxStrikes }, (_, i) => i < strikes),
    [strikes],
  );

  const startGame = useCallback(() => {
    setPhase("playing");
    setTargetM(randomTargetDistanceM());
    setActualInput("");
    setHits(0);
    setStrikes(0);
    setFeedback(null);
    setSaveError(null);
    setSaved(false);
    setPersisting(false);
  }, []);

  const submitShot = useCallback(() => {
    if (phase !== "playing") return;
    const actual = parseMetres(actualInput);
    if (actual === null) return;
    const diff = Math.abs(targetM - actual);
    const isHit = diff <= threeStrikesWedgeConfig.hitWindowM;

    if (isHit) {
      setHits((prev) => prev + 1);
      setFeedback(`Hit! Off by ${diff.toFixed(1)} m.`);
    } else {
      const nextStrikes = strikes + 1;
      setStrikes(nextStrikes);
      setFeedback(`Strike ${nextStrikes}: off by ${diff.toFixed(1)} m.`);
      if (nextStrikes >= threeStrikesWedgeConfig.maxStrikes) {
        setPhase("ended");
      }
    }

    setActualInput("");
    setTargetM(randomTargetDistanceM());
  }, [actualInput, phase, strikes, targetM]);

  const submitToLeaderboard = useCallback(async () => {
    if (!user?.id || persisting || saved) return;
    setPersisting(true);
    setSaveError(null);
    const err = await persistThreeStrikesSession(user.id, hits);
    setPersisting(false);
    if (err) {
      setSaveError(err);
      return;
    }
    setSaved(true);
  }, [hits, persisting, saved, user?.id]);

  const inputCls =
    "w-full rounded-lg border-2 border-gray-200 bg-surface px-3 py-3 text-lg text-gray-900 outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-primary/30";

  if (phase === "intro") {
    return (
      <div className="mt-6 space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
          <p>
            Each shot gives you a random wedge target from {threeStrikesWedgeConfig.targetMinM} m to{" "}
            {threeStrikesWedgeConfig.targetMaxM} m. Enter your actual carry distance.
          </p>
          <p className="mt-3">
            You score a hit when you are within{" "}
            <strong className="text-gray-900">±{threeStrikesWedgeConfig.hitWindowM.toFixed(1)} m</strong>.
            Miss outside that window and you take a strike. Three strikes ends the game.
          </p>
        </div>
        <button
          type="button"
          onClick={startGame}
          className="w-full rounded-xl bg-primary py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
        >
          Start challenge
        </button>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="mt-6 space-y-6">
        <div className="rounded-2xl border-2 border-danger/35 bg-surface p-6 shadow-sm">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-danger">Game Over</p>
          <p className="mt-3 text-center text-4xl font-bold tabular-nums text-gray-900">{hits}</p>
          <p className="mt-1 text-center text-sm text-gray-600">Total Hits</p>

          {!user?.id && (
            <p className="mt-4 text-center text-xs text-amber-700">
              Sign in to submit your score to the leaderboard.
            </p>
          )}
          {saveError && <p className="mt-4 text-center text-sm text-danger">{saveError}</p>}
          {saved && (
            <p className="mt-4 text-center text-sm font-medium text-primary">
              Submitted to leaderboard.
            </p>
          )}

          <button
            type="button"
            onClick={() => void submitToLeaderboard()}
            disabled={!user?.id || persisting || saved}
            className="mt-5 w-full rounded-xl bg-primary py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {persisting ? "Submitting..." : saved ? "Submitted" : "Submit to Leaderboard"}
          </button>

          <button
            type="button"
            onClick={startGame}
            className="mt-3 w-full rounded-xl border-2 border-primary bg-surface py-3 text-base font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            Play again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Current hits</p>
        <p className="mt-2 text-center text-5xl font-bold tabular-nums text-primary">{hits}</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Strikes</p>
        <div className="mt-3 flex items-center gap-3">
          {strikeSlots.map((filled, idx) => (
            <div
              key={`strike-${idx}`}
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-base font-bold ${
                filled
                  ? "border-danger bg-danger/10 text-danger"
                  : "border-gray-300 bg-surface text-gray-300"
              }`}
              aria-label={filled ? `Strike ${idx + 1}` : `Strike slot ${idx + 1}`}
            >
              {filled ? "✕" : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current target</p>
        <p className="mt-2 text-5xl font-bold tabular-nums text-primary">{targetM.toFixed(1)} m</p>

        <div className="mt-6 space-y-2">
          <label htmlFor="three-strikes-actual-m" className="text-sm font-medium text-gray-800">
            Actual distance (m)
          </label>
          <input
            id="three-strikes-actual-m"
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="e.g. 64.2"
            value={actualInput}
            onChange={(e) => setActualInput(normalizeMetresInput(e.target.value))}
            className={inputCls}
          />
        </div>

        <button
          type="button"
          onClick={submitShot}
          disabled={!canSubmitShot}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit shot
        </button>

        {feedback && <p className="mt-3 text-sm text-gray-700">{feedback}</p>}
      </div>
    </div>
  );
}
