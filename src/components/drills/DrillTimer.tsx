"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Pause, Play, Plus, RotateCcw, Timer } from "lucide-react";

export type DrillTimerMode = "countdown" | "stopwatch";

const TICK_MS = 250;
const MAX_COUNTDOWN_MIN = 120;

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Short beep plus a buzz on phones, so players notice the end of a countdown away from the screen. */
function playDoneAlert(ctx: AudioContext | null) {
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* vibration not supported */
  }
  if (!ctx) return;
  [0, 0.35, 0.7].forEach((offset) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + offset);
    osc.stop(ctx.currentTime + offset + 0.3);
  });
}

export function useDrillTimer(defaultMinutes: number, defaultMode: DrillTimerMode = "countdown") {
  const [mode, setModeState] = useState<DrillTimerMode>(defaultMode);
  const [durationSec, setDurationSec] = useState(() => Math.max(1, Math.round(defaultMinutes || 10)) * 60);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [bankedMs, setBankedMs] = useState(0);
  const [now, setNow] = useState(0);
  const [finished, setFinished] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const running = startedAt != null;
  const elapsedMs = running ? bankedMs + Math.max(0, now - startedAt) : bankedMs;

  useEffect(() => {
    if (startedAt == null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (mode === "countdown" && bankedMs + (t - startedAt) >= durationSec * 1000) {
        setBankedMs(durationSec * 1000);
        setStartedAt(null);
        setFinished(true);
        playDoneAlert(audioRef.current);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [startedAt, mode, bankedMs, durationSec]);

  const start = useCallback(() => {
    if (!audioRef.current && typeof window !== "undefined") {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      audioRef.current = Ctx ? new Ctx() : null;
    }
    void audioRef.current?.resume();
    const t = Date.now();
    if (finished) {
      setBankedMs(0);
      setFinished(false);
    }
    setNow(t);
    setStartedAt(t);
  }, [finished]);

  const pause = useCallback(() => {
    if (startedAt == null) return;
    const t = Date.now();
    setBankedMs((b) => b + (t - startedAt));
    setNow(t);
    setStartedAt(null);
  }, [startedAt]);

  const reset = useCallback(() => {
    setStartedAt(null);
    setBankedMs(0);
    setFinished(false);
  }, []);

  const setMode = useCallback((m: DrillTimerMode) => {
    setModeState(m);
    setStartedAt(null);
    setBankedMs(0);
    setFinished(false);
  }, []);

  const adjustMinutes = useCallback((delta: number) => {
    setDurationSec((d) => Math.min(MAX_COUNTDOWN_MIN * 60, Math.max(60, d + delta * 60)));
    setFinished(false);
  }, []);

  const elapsedSec = elapsedMs / 1000;
  const remainingSec = Math.max(0, durationSec - elapsedSec);
  const displaySec = mode === "countdown" ? Math.ceil(remainingSec) : elapsedSec;

  return {
    mode,
    setMode,
    running,
    finished,
    durationSec,
    elapsedSec,
    remainingSec,
    displaySec,
    started: running || bankedMs > 0,
    start,
    pause,
    reset,
    adjustMinutes,
  };
}

export type DrillTimerState = ReturnType<typeof useDrillTimer>;

const ICON_BTN =
  "flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition-colors hover:border-[#014421]/40 disabled:opacity-40";

/** Countdown for the drill's minutes, or a stopwatch. `onUseTime` turns the stopwatch reading into the score. */
export function DrillTimerCard({
  timer,
  onUseTime,
  useTimeLabel,
}: {
  timer: DrillTimerState;
  onUseTime?: (seconds: number) => void;
  useTimeLabel?: string;
}) {
  const { mode, running, finished, durationSec, remainingSec, displaySec, started } = timer;
  const pct = mode === "countdown" ? 1 - remainingSec / durationSec : 0;
  const canUseTime = mode === "stopwatch" && !running && timer.elapsedSec > 0 && onUseTime;

  return (
    <div className="rounded-2xl border border-gray-100 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Timer className="h-3.5 w-3.5" aria-hidden />
          Timer
        </span>
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-[11px] font-semibold" role="group" aria-label="Timer mode">
          {(["countdown", "stopwatch"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => timer.setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                mode === m ? "bg-white text-[#014421] shadow-sm" : "text-gray-500"
              }`}
            >
              {m === "countdown" ? "Countdown" : "Stopwatch"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {mode === "countdown" && (
          <button
            type="button"
            onClick={() => timer.adjustMinutes(-1)}
            disabled={running || durationSec <= 60}
            className={ICON_BTN}
            aria-label="One minute less"
          >
            <Minus className="h-4 w-4" />
          </button>
        )}
        <p
          className={`flex-1 text-center text-4xl font-extrabold tabular-nums ${
            finished ? "text-[#FFA500]" : running ? "text-[#014421]" : "text-gray-900"
          }`}
          aria-live="polite"
        >
          {finished ? "Time!" : formatClock(displaySec)}
        </p>
        {mode === "countdown" && (
          <button
            type="button"
            onClick={() => timer.adjustMinutes(1)}
            disabled={running}
            className={ICON_BTN}
            aria-label="One minute more"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {mode === "countdown" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-[#FFA500] transition-[width] duration-200" style={{ width: `${pct * 100}%` }} />
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={running ? timer.pause : timer.start}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-colors ${
            running ? "bg-[#FFA500] hover:bg-[#e69500]" : "bg-[#014421] hover:bg-[#013320]"
          }`}
        >
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? "Pause" : finished ? "Go again" : started ? "Resume" : "Start"}
        </button>
        <button
          type="button"
          onClick={timer.reset}
          disabled={!started && !finished}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>

      {canUseTime && (
        <button
          type="button"
          onClick={() => onUseTime!(timer.elapsedSec)}
          className="mt-2 w-full rounded-xl bg-orange-50 py-2 text-sm font-semibold text-orange-900 hover:bg-orange-100"
        >
          {useTimeLabel ?? "Use this time as my score"}
        </button>
      )}
    </div>
  );
}
