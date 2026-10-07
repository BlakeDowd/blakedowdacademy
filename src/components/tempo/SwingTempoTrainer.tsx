"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, Music, Pause, Play, Volume2, type LucideIcon } from "lucide-react";
import { releaseAudio, unlockAudio } from "@/lib/unlockAudio";
import {
  COUNT_IN_BEATS,
  countInTimes,
  countLightAt,
  createLoudOutput,
  loadVoiceClips,
  playTone,
  playVoice,
  type CountedRep,
  type CountLight,
  type VoiceClips,
} from "@/lib/tempoSound";
import { CountInLights, CountInToggle } from "./CountInLights";

/** Frame counts at 30 FPS, e.g. 21/7 = 21 frames back, 7 frames down to impact. */
export type TempoPreset = { back: number; down: number; label?: string };
export type SoundMode = "tones" | "voice" | "click";

export type TempoTrainerConfig = {
  title: string;
  subtitle: string;
  /** Backswing time ÷ downswing time, e.g. 3 for 3:1. */
  ratio: number;
  presets: readonly TempoPreset[];
  defaultPresetIndex: number;
  /** Pause between reps so the player can address the ball. */
  resetSec: number;
  silhouette: ReactNode;
};

type Cue = "takeaway" | "apex" | "impact";
type Phase = "ready" | "back" | "down" | "hit" | "reset";
type Rep = CountedRep;

export const FRAME_MS = 1000 / 30;
export const BRAND_GREEN = "#014421";
const BRAND_ORANGE = "#FFA500";

const SCHEDULE_AHEAD_SEC = 0.15;
const HIT_FLASH_SEC = 0.35;
/** Quiet gap after the hit before the next count-in starts. */
const SETTLE_SEC = 0.3;
const START_DELAY_SEC = 0.5;
const SOUND_MODES: { id: SoundMode; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "tones", label: "Tones", hint: "Low, mid, high", icon: Music },
  { id: "voice", label: "Voice", hint: "One, Two, Hit!", icon: Mic },
  { id: "click", label: "Click", hint: "Short ticks", icon: Volume2 },
];
const PHASE_LABEL: Record<Phase, string> = {
  ready: "Ready",
  back: "Back",
  down: "Down",
  hit: "Hit!",
  reset: "Address",
};

const DIAL_SIZE = 260;
const DIAL_C = DIAL_SIZE / 2;
const DIAL_R = 112;
const TRACK_CIRC = 2 * Math.PI * DIAL_R;
const TICKS = 60;

export const presetSeconds = (p: TempoPreset) => ({ back: (p.back * FRAME_MS) / 1000, down: (p.down * FRAME_MS) / 1000 });
const ms = (sec: number) => Math.round(sec * 1000);

/** Rounded so server and browser render identical SVG attributes (avoids hydration mismatches). */
function dialPoint(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { x: round(DIAL_C + radius * Math.sin(a)), y: round(DIAL_C - radius * Math.cos(a)) };
}

export function SwingTempoTrainer({ config, hideHeader = false }: { config: TempoTrainerConfig; hideHeader?: boolean }) {
  const { title, subtitle, ratio, presets, defaultPresetIndex, resetSec, silhouette } = config;
  const [presetIndex, setPresetIndex] = useState(defaultPresetIndex);
  const [mode, setMode] = useState<SoundMode>("tones");
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [reps, setReps] = useState(0);
  const [countIn, setCountIn] = useState(true);
  const [light, setLight] = useState<CountLight | null>(null);

  const preset = presets[presetIndex] ?? presets[0]!;
  const times = presetSeconds(preset);
  const apexAngle = (ratio / (ratio + 1)) * 360;
  const apexTick = { a: dialPoint(apexAngle, DIAL_R - 14), b: dialPoint(apexAngle, DIAL_R + 10) };

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const repsRef = useRef<Rep[]>([]);
  const nextRef = useRef({ start: 0, lead: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const voiceRef = useRef<VoiceClips | null | undefined>(undefined);
  const dotRef = useRef<SVGCircleElement | null>(null);
  const arcRef = useRef<SVGCircleElement | null>(null);
  const phaseRef = useRef<Phase>("ready");
  const lightRef = useRef<CountLight | null>(null);
  const presetRef = useRef(preset);
  const modeRef = useRef(mode);
  const countInRef = useRef(countIn);

  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    countInRef.current = countIn;
  }, [countIn]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const drawTracker = (fraction: number) => {
    const p = dialPoint(fraction * 360, DIAL_R);
    dotRef.current?.setAttribute("cx", String(p.x));
    dotRef.current?.setAttribute("cy", String(p.y));
    arcRef.current?.setAttribute("stroke-dashoffset", String(TRACK_CIRC * (1 - fraction)));
  };

  const halt = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
    releaseAudio();
    const ctx = ctxRef.current;
    const master = masterRef.current;
    masterRef.current = null;
    if (ctx && master) {
      // Fade out rather than cutting off mid-tone, then drop anything still scheduled.
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
      setTimeout(() => master.disconnect(), 120);
    }
    repsRef.current = [];
  }, []);

  const pause = () => {
    halt();
    const p0 = dialPoint(0, DIAL_R);
    dotRef.current?.setAttribute("cx", String(p0.x));
    dotRef.current?.setAttribute("cy", String(p0.y));
    arcRef.current?.setAttribute("stroke-dashoffset", String(TRACK_CIRC));
    phaseRef.current = "ready";
    lightRef.current = null;
    setPhase("ready");
    setLight(null);
    setPlaying(false);
  };

  const play = () => {
    const ctx = unlockAudio(ctxRef.current);
    if (!ctx) return;
    ctxRef.current = ctx;
    voiceRef.current = undefined;
    void loadVoiceClips(ctx).then((clips) => {
      voiceRef.current = clips;
    });

    const master = createLoudOutput(ctx);
    masterRef.current = master;
    repsRef.current = [];
    const leadFor = () => (countInRef.current ? presetSeconds(presetRef.current).back : 0);
    let primed = false;
    let clockSeen = -1;
    setReps(0);

    // Preset and sound changes take effect from the next rep so a swing is never cut short.
    const schedule = () => {
      if (!primed) {
        // The audio clock can stall while the output starts up, which would bunch up the first count-in.
        const ticking = ctx.state === "running" && clockSeen >= 0 && ctx.currentTime > clockSeen;
        clockSeen = ctx.currentTime;
        if (!ticking) return;
        if (modeRef.current === "voice" && voiceRef.current === undefined) return;
        primed = true;
        const firstLead = leadFor();
        nextRef.current = { start: ctx.currentTime + START_DELAY_SEC + firstLead * COUNT_IN_BEATS, lead: firstLead };
      }
      while (nextRef.current.start - nextRef.current.lead * COUNT_IN_BEATS < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
        const { back, down } = presetSeconds(presetRef.current);
        const rep: Rep = { ...nextRef.current, back, down };
        const voice = modeRef.current === "voice" ? voiceRef.current : null;
        const soundMode = modeRef.current === "voice" && !voice ? "tones" : modeRef.current;
        for (const at of countInTimes(rep)) {
          if (at >= ctx.currentTime) playTone(ctx, master, at, "count", soundMode === "click" ? "click" : "tones");
        }
        const cues: [Cue, number][] = [
          ["takeaway", rep.start],
          ["apex", rep.start + back],
          ["impact", rep.start + back + down],
        ];
        cues.forEach(([cue, at], i) => {
          if (voice) playVoice(ctx, master, at, voice[cue], cues[i + 1]?.[1]);
          else if (soundMode !== "voice") playTone(ctx, master, at, cue, soundMode);
        });
        repsRef.current = [...repsRef.current.slice(-1), rep];
        const lead = leadFor();
        const gap = Math.max(resetSec, HIT_FLASH_SEC + SETTLE_SEC + lead * COUNT_IN_BEATS);
        nextRef.current = { start: rep.start + back + down + gap, lead };
      }
    };
    schedule();
    timerRef.current = setInterval(schedule, 25);

    const frame = () => {
      const now = ctx.currentTime;
      const list = repsRef.current;
      const rep = list[1] && list[1].start <= now ? list[1] : list[0] && list[0].start <= now ? list[0] : null;
      let next: Phase = "ready";
      if (rep) {
        const t = now - rep.start;
        const total = rep.back + rep.down;
        if (t < total) {
          drawTracker(t / total);
          next = t < rep.back ? "back" : "down";
        } else {
          drawTracker(0);
          next = t < total + HIT_FLASH_SEC ? "hit" : "reset";
        }
      }
      if (next !== phaseRef.current) {
        if (next === "hit") setReps((r) => r + 1);
        phaseRef.current = next;
        setPhase(next);
      }
      const lit = countLightAt(now, list);
      if (lit !== lightRef.current) {
        lightRef.current = lit;
        setLight(lit);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    setPlaying(true);
  };

  useEffect(
    () => () => {
      halt();
      const ctx = ctxRef.current;
      ctxRef.current = null;
      void ctx?.close().catch(() => undefined);
    },
    [halt],
  );

  const start = dialPoint(0, DIAL_R);
  const hit = phase === "hit";
  const centreLabel = light === "red" ? "Ready" : light === "amber" ? "Set" : PHASE_LABEL[phase];

  return (
    <div className="w-full space-y-4">
      {!hideHeader && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900">Tempo dial</h3>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-700">
            {ratio}:1 ratio
          </span>
        </div>

        {countIn && (
          <div className="mt-3 flex justify-center">
            <CountInLights light={light} />
          </div>
        )}

        <div className="relative mx-auto mt-2 aspect-square w-full max-w-[280px]">
          <svg viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`} className="absolute inset-0 h-full w-full" aria-hidden>
            {Array.from({ length: TICKS }, (_, i) => {
              const angle = (i / TICKS) * 360;
              const major = i % 5 === 0;
              const a = dialPoint(angle, DIAL_R + 6);
              const b = dialPoint(angle, DIAL_R + (major ? 14 : 10));
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={major ? "#9ca3af" : "#d1d5db"}
                  strokeWidth={major ? 2 : 1}
                  strokeLinecap="round"
                />
              );
            })}
            <circle cx={DIAL_C} cy={DIAL_C} r={DIAL_R} fill="none" stroke="#f3f4f6" strokeWidth={6} />
            <circle
              ref={arcRef}
              cx={DIAL_C}
              cy={DIAL_C}
              r={DIAL_R}
              fill="none"
              stroke={BRAND_GREEN}
              strokeOpacity={0.3}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={TRACK_CIRC}
              strokeDashoffset={TRACK_CIRC}
              transform={`rotate(-90 ${DIAL_C} ${DIAL_C})`}
            />
            <line
              x1={apexTick.a.x}
              y1={apexTick.a.y}
              x2={apexTick.b.x}
              y2={apexTick.b.y}
              stroke={BRAND_ORANGE}
              strokeWidth={5}
              strokeLinecap="round"
            />
            <line
              x1={DIAL_C}
              y1={DIAL_C - DIAL_R - 14}
              x2={DIAL_C}
              y2={DIAL_C - DIAL_R + 6}
              stroke="#374151"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <circle ref={dotRef} cx={start.x} cy={start.y} r={9} fill={BRAND_GREEN} stroke="white" strokeWidth={3} />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`h-[44%] transition-transform duration-150 ${hit ? "scale-105" : ""}`}>{silhouette}</div>
            <p
              className={`mt-1 text-sm font-extrabold uppercase tracking-wider ${hit ? "text-[#FFA500]" : "text-gray-700"}`}
              aria-live="polite"
            >
              {centreLabel}
            </p>
            {playing && <p className="text-[10px] font-semibold tabular-nums text-gray-400">Reps {reps}</p>}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Backswing", value: ms(times.back), tone: "bg-orange-50 text-[#c77c00]" },
            { label: "Downswing", value: ms(times.down), tone: "bg-green-50 text-[#014421]" },
            { label: "Total", value: ms(times.back + times.down), tone: "bg-gray-50 text-gray-500" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl px-2 py-2 ${s.tone}`}>
              <p className="text-[10px] font-semibold">{s.label}</p>
              <p className="text-base font-extrabold tabular-nums text-gray-900">
                {s.value}
                <span className="text-[10px] font-semibold text-gray-500">ms</span>
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => (playing ? pause() : play())}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white shadow-sm transition-colors ${
            playing ? "bg-gray-800 hover:bg-gray-700" : "bg-[#014421] hover:bg-[#013320]"
          }`}
        >
          {playing ? <Pause className="h-4 w-4 fill-current" aria-hidden /> : <Play className="h-4 w-4 fill-current" aria-hidden />}
          {playing ? "Pause" : "Play"}
        </button>
        <CountInToggle on={countIn} onChange={setCountIn} />
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">Tempo</h3>
        <p className="text-xs text-gray-500">Frames at 30 FPS (backswing / downswing)</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {presets.map((p, i) => {
            const active = i === presetIndex;
            const s = presetSeconds(p);
            return (
              <button
                key={`${p.back}/${p.down}`}
                type="button"
                onClick={() => setPresetIndex(i)}
                aria-pressed={active}
                className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                  active ? "border-[#014421] bg-[#014421] text-white" : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                }`}
              >
                <span className="block text-sm font-extrabold tabular-nums">
                  {p.back}/{p.down}
                </span>
                <span className={`block text-[10px] tabular-nums ${active ? "text-white/80" : "text-gray-500"}`}>
                  {ms(s.back + s.down)}ms
                </span>
                {p.label && (
                  <span className={`mt-0.5 block text-[10px] font-semibold leading-tight ${active ? "text-white" : "text-gray-600"}`}>
                    {p.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900">Sound</h3>
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Sound mode">
          {SOUND_MODES.map((m) => {
            const active = mode === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors ${
                  active ? "border-[#014421] bg-[#014421] text-white" : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "text-white" : "text-[#014421]"}`} aria-hidden />
                <span className="text-sm font-bold">{m.label}</span>
                <span className={`text-[10px] leading-tight ${active ? "text-white/80" : "text-gray-500"}`}>{m.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
          {mode === "voice"
            ? "“One” starts the takeaway, “Two” is the top, “Hit!” is impact."
            : "Low tone starts the takeaway, middle tone is the top (orange mark), high tone is impact."}{" "}
          {countIn
            ? "With the count-in, red and amber tick one backswing apart: start the takeaway on green."
            : `${resetSec}s pause between reps to address the ball.`}{" "}
          No sound? Turn your volume up, and on older iPhones switch off silent mode.
        </p>
      </section>
    </div>
  );
}

