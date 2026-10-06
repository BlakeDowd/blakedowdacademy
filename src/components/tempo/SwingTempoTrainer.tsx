"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, Music, Pause, Play, Volume2, type LucideIcon } from "lucide-react";
import { releaseAudio, unlockAudio } from "@/lib/unlockAudio";

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
type Rep = { start: number; back: number; down: number };

export const FRAME_MS = 1000 / 30;
export const BRAND_GREEN = "#014421";
const BRAND_ORANGE = "#FFA500";

const SCHEDULE_AHEAD_SEC = 0.15;
const HIT_FLASH_SEC = 0.35;
/** Speech engines take a moment to start talking, so voice cues are fired slightly early. */
const VOICE_LEAD_MS = 70;
const TONE_HZ: Record<Cue, number> = { takeaway: 440, apex: 587, impact: 880 };
const CLICK_HZ: Record<Cue, number> = { takeaway: 1400, apex: 1400, impact: 2200 };
const VOICE_WORDS: Record<Cue, string> = { takeaway: "One", apex: "Two", impact: "Hit!" };
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

/** Short enveloped beep: linear attack and exponential release so it never clicks or clips. */
function playCue(ctx: AudioContext, out: AudioNode, at: number, cue: Cue, mode: "tones" | "click") {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const click = mode === "click";
  const length = click ? 0.03 : cue === "impact" ? 0.1 : 0.14;
  const peak = click ? 0.32 : 0.36;
  osc.type = click || cue !== "impact" ? "sine" : "triangle";
  osc.frequency.value = click ? CLICK_HZ[cue] : TONE_HZ[cue];
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(peak, at + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

function speak(word: string) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.rate = 1.5;
  u.volume = 1;
  synth.speak(u);
}

export function SwingTempoTrainer({ config, hideHeader = false }: { config: TempoTrainerConfig; hideHeader?: boolean }) {
  const { title, subtitle, ratio, presets, defaultPresetIndex, resetSec, silhouette } = config;
  const [presetIndex, setPresetIndex] = useState(defaultPresetIndex);
  const [mode, setMode] = useState<SoundMode>("tones");
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [reps, setReps] = useState(0);

  const preset = presets[presetIndex] ?? presets[0]!;
  const times = presetSeconds(preset);
  const apexAngle = (ratio / (ratio + 1)) * 360;
  const apexTick = { a: dialPoint(apexAngle, DIAL_R - 14), b: dialPoint(apexAngle, DIAL_R + 10) };

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const repsRef = useRef<Rep[]>([]);
  const nextStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const voiceTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const dotRef = useRef<SVGCircleElement | null>(null);
  const arcRef = useRef<SVGCircleElement | null>(null);
  const phaseRef = useRef<Phase>("ready");
  const presetRef = useRef(preset);
  const modeRef = useRef(mode);

  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

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
    voiceTimersRef.current.forEach(clearTimeout);
    voiceTimersRef.current.clear();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
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
    setPhase("ready");
    setPlaying(false);
  };

  const play = () => {
    const ctx = unlockAudio(ctxRef.current);
    if (!ctx) return;
    ctxRef.current = ctx;

    const canSpeak = "speechSynthesis" in window;
    if (canSpeak && modeRef.current === "voice") {
      // iOS only allows speech that starts from a tap, so prime it now.
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.ratio.value = 6;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(compressor).connect(ctx.destination);
    masterRef.current = master;
    repsRef.current = [];
    nextStartRef.current = ctx.currentTime + 0.6;
    setReps(0);

    // Preset and sound changes take effect from the next rep so a swing is never cut short.
    const schedule = () => {
      while (nextStartRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
        const { back, down } = presetSeconds(presetRef.current);
        const rep: Rep = { start: nextStartRef.current, back, down };
        const cues: [Cue, number][] = [
          ["takeaway", rep.start],
          ["apex", rep.start + back],
          ["impact", rep.start + back + down],
        ];
        const soundMode = modeRef.current === "voice" && !canSpeak ? "tones" : modeRef.current;
        for (const [cue, at] of cues) {
          if (soundMode === "voice") {
            const delay = Math.max(0, (at - ctx.currentTime) * 1000 - VOICE_LEAD_MS);
            const id = setTimeout(() => {
              voiceTimersRef.current.delete(id);
              speak(VOICE_WORDS[cue]);
            }, delay);
            voiceTimersRef.current.add(id);
          } else {
            playCue(ctx, master, at, cue, soundMode);
          }
        }
        repsRef.current = [...repsRef.current.slice(-1), rep];
        nextStartRef.current = rep.start + back + down + resetSec;
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
              {PHASE_LABEL[phase]}
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
          {resetSec}s pause between reps to address the ball. No sound? Turn your volume up, and on older iPhones switch off silent mode.
        </p>
      </section>
    </div>
  );
}

