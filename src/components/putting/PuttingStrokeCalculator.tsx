"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Gauge, Pause, Play, Ruler, SlidersHorizontal, Timer, Volume2, VolumeX } from "lucide-react";

type DistanceUnit = "ft" | "m";
type LengthUnit = "cm" | "in";
type Ratio = "balanced" | "accelerating";
type RhythmId = "tour" | "pendulum" | "pop";
type Beat = "takeaway" | "apex" | "impact";

const FT_PER_M = 3.28084;
const CM_PER_IN = 2.54;
const STROKE_CONSTANT = 25.5;
const MAX_FT = 40;
const MAX_M = 12;
const FT_PRESETS = [5, 10, 15, 20, 30, 40];
const M_PRESETS = [1.5, 3, 4.5, 6, 9, 12];
const STIMP_SPEEDS = [8, 9, 10, 11, 12, 13];
const FOLLOW_THROUGH_RATIO: Record<Ratio, number> = { balanced: 1, accelerating: 1.15 };

/** Time in the backswing vs the downswing to impact. */
const RHYTHMS: { id: RhythmId; label: string; ratio: number; hint: string }[] = [
  { id: "tour", label: "Tour Standard", ratio: 2.0, hint: "Smooth, balanced tour baseline." },
  { id: "pendulum", label: "Deliberate / Pendulum", ratio: 2.1, hint: "Slower takeaway, ideal for slick greens (Crenshaw style)." },
  { id: "pop", label: "Brisk / Pop Stroke", ratio: 1.85, hint: "Crisp transition, firm wrist feel (Snedeker style)." },
];
const BPM_PRESETS = [
  { bpm: 70, label: "Smooth / Slow" },
  { bpm: 75, label: "Tour Baseline" },
  { bpm: 82, label: "Fast / Aggressive" },
];
const MIN_BPM = 66;
const MAX_BPM = 86;
const DEFAULT_BPM = 75;

const SCHEDULE_AHEAD_SEC = 0.12;
const BEAT_LIGHT_SEC = 0.15;
/** One rep lasts this many stroke cycles: the stroke, follow-through, a hold at the finish, then the reset to the ball. */
const REP_CYCLES = 3;
const BEEP_HZ: Record<Beat, number> = { takeaway: 440, apex: 587, impact: 880 };

type Rep = { start: number; back: number; down: number; cycle: number };

/** Total cycle = 60 / BPM, split by the backswing-to-downswing ratio. Times in seconds. */
export function tempoSplit(bpm: number, ratio: number) {
  const cycle = 60 / bpm;
  return { cycle, back: (cycle * ratio) / (ratio + 1), down: cycle / (ratio + 1) };
}

/**
 * Putter position (cm from the ball, negative = backswing) at `t` seconds into a rep.
 * Eases into the apex, accelerates down through impact, then decelerates into the follow-through
 * at the same speed it had at impact.
 */
function strokePositionCm(t: number, rep: Rep, backCm: number, throughCm: number): number {
  const { back, down, cycle } = rep;
  const impact = back + down;
  const followThrough = down * (throughCm / backCm);
  const holdEnd = 1.8 * cycle;
  const resetEnd = 2.6 * cycle;
  if (t <= 0) return 0;
  if (t < back) return (-backCm * (1 - Math.cos((Math.PI * t) / back))) / 2;
  if (t < impact) return -backCm * Math.cos((Math.PI / 2) * ((t - back) / down));
  if (t < impact + followThrough) return throughCm * Math.sin((Math.PI / 2) * ((t - impact) / followThrough));
  if (t < holdEnd) return throughCm;
  if (t < resetEnd) return (throughCm * (1 + Math.cos((Math.PI * (t - holdEnd)) / (resetEnd - holdEnd)))) / 2;
  return 0;
}

function beatAt(t: number, rep: Rep): Beat | null {
  if (t >= 0 && t < BEAT_LIGHT_SEC) return "takeaway";
  if (t >= rep.back && t < rep.back + BEAT_LIGHT_SEC) return "apex";
  const impact = rep.back + rep.down;
  if (t >= impact && t < impact + BEAT_LIGHT_SEC) return "impact";
  return null;
}

const formatRatio = (ratio: number) => `${Number.isInteger(ratio * 10) ? ratio.toFixed(1) : ratio.toFixed(2)}:1`;

const RANGE_CLASS =
  "h-2 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#FFA500] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white";
const rangeFill = (percent: number) =>
  `linear-gradient(to right, #014421 0%, #014421 ${percent}%, #e5e7eb ${percent}%, #e5e7eb 100%)`;

/** Half the track width, in cm. Longest possible stroke: 40 ft on stimp 8 with 1:1.15 ≈ 65.6 cm. */
const TRACK_HALF_CM = 70;

export function backswingCm(distanceFt: number, stimp: number): number {
  return STROKE_CONSTANT * Math.sqrt(distanceFt / stimp);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const trackPercent = (cm: number) => 50 + (cm / TRACK_HALF_CM) * 50;
const labelPercent = (cm: number) => Math.min(92, Math.max(8, trackPercent(cm)));

function playBeep(ctx: AudioContext, output: AudioNode, at: number, beat: Beat) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const crisp = beat === "impact";
  const length = crisp ? 0.045 : 0.09;
  osc.type = crisp ? "triangle" : "sine";
  osc.frequency.value = BEEP_HZ[beat];
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(crisp ? 0.7 : 0.45, at + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(output);
  osc.start(at);
  osc.stop(at + length + 0.01);
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex rounded-full bg-gray-100 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === o.id ? "bg-[#014421] text-white shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
        active ? "bg-[#014421] text-white shadow-sm" : "border border-gray-200 bg-white text-gray-700 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, unit, accent }: { label: string; value: number; unit: string; accent: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <span className={`block h-1 w-6 rounded-full ${accent}`} aria-hidden />
      <p className="mt-2 text-[11px] font-medium leading-tight text-gray-500">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold tabular-nums text-gray-900">
        {value.toFixed(1)}
        <span className="ml-0.5 text-xs font-semibold text-gray-500">{unit}</span>
      </p>
    </div>
  );
}

export default function PuttingStrokeCalculator({ hideHeader = false }: { hideHeader?: boolean }) {
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("ft");
  const [distanceFt, setDistanceFt] = useState(10);
  const [stimp, setStimp] = useState(10);
  const [ratio, setRatio] = useState<Ratio>("balanced");
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>("cm");
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(true);
  const [beat, setBeat] = useState<Beat | null>(null);
  const [rhythmId, setRhythmId] = useState<RhythmId>("tour");
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const rhythm = RHYTHMS.find((r) => r.id === rhythmId) ?? RHYTHMS[0]!;
  const tempo = tempoSplit(bpm, rhythm.ratio);
  const ms = (sec: number) => Math.round(sec * 1000);

  const back = backswingCm(distanceFt, stimp);
  const through = back * FOLLOW_THROUGH_RATIO[ratio];
  const toDisplay = (cm: number) => (lengthUnit === "cm" ? cm : cm / CM_PER_IN);

  const distanceValue = distanceUnit === "ft" ? round1(distanceFt) : round1(distanceFt / FT_PER_M);
  const presets = distanceUnit === "ft" ? FT_PRESETS : M_PRESETS;
  const sliderMin = distanceUnit === "ft" ? 1 : 0.3;
  const sliderMax = distanceUnit === "ft" ? MAX_FT : MAX_M;
  const sliderFill = ((distanceValue - sliderMin) / (sliderMax - sliderMin)) * 100;
  const setDistanceInUnit = (v: number) => setDistanceFt(distanceUnit === "ft" ? v : v * FT_PER_M);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const repsRef = useRef<Rep[]>([]);
  const nextRepStartRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const markerRef = useRef<HTMLDivElement | null>(null);
  const soundRef = useRef(sound);
  const extentsRef = useRef({ back, through });
  const tempoRef = useRef({ bpm, ratio: rhythm.ratio });
  const beatRef = useRef<Beat | null>(null);

  useEffect(() => {
    soundRef.current = sound;
    if (masterGainRef.current) masterGainRef.current.gain.value = sound ? 1 : 0;
  }, [sound]);

  useEffect(() => {
    extentsRef.current = { back, through };
  }, [back, through]);

  useEffect(() => {
    tempoRef.current = { bpm, ratio: rhythm.ratio };
  }, [bpm, rhythm.ratio]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    rafRef.current = null;
    beatRef.current = null;
    masterGainRef.current?.disconnect();
    masterGainRef.current = null;
    repsRef.current = [];
    if (markerRef.current) markerRef.current.style.left = "50%";
    setBeat(null);
    setPlaying(false);
  }, []);

  const start = async () => {
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = ctxRef.current ?? new AudioCtor();
    ctxRef.current = ctx;
    await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = soundRef.current ? 1 : 0;
    master.connect(ctx.destination);
    masterGainRef.current = master;
    repsRef.current = [];
    nextRepStartRef.current = ctx.currentTime + 0.4;

    // Tempo changes take effect from the next rep, so a stroke is never cut short mid-swing.
    const schedule = () => {
      while (nextRepStartRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
        const { bpm: repBpm, ratio: repRatio } = tempoRef.current;
        const split = tempoSplit(repBpm, repRatio);
        const rep: Rep = { start: nextRepStartRef.current, ...split };
        playBeep(ctx, master, rep.start, "takeaway");
        playBeep(ctx, master, rep.start + rep.back, "apex");
        playBeep(ctx, master, rep.start + rep.back + rep.down, "impact");
        repsRef.current = [...repsRef.current.slice(-1), rep];
        nextRepStartRef.current += rep.cycle * REP_CYCLES;
      }
    };
    schedule();
    timerRef.current = setInterval(schedule, 25);

    const frame = () => {
      const now = ctx.currentTime;
      const reps = repsRef.current;
      const rep = reps[1] && reps[1].start <= now ? reps[1] : reps[0] && reps[0].start <= now ? reps[0] : null;
      const t = rep ? now - rep.start : 0;
      const { back: b, through: th } = extentsRef.current;
      const cm = rep ? strokePositionCm(t, rep, b, th) : 0;
      if (markerRef.current) markerRef.current.style.left = `${trackPercent(cm)}%`;

      const lit = rep ? beatAt(t, rep) : null;
      if (lit !== beatRef.current) {
        beatRef.current = lit;
        setBeat(lit);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    setPlaying(true);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const ctx = ctxRef.current;
      ctxRef.current = null;
      void ctx?.close().catch(() => undefined);
    },
    [],
  );

  const tickStepCm = lengthUnit === "cm" ? 10 : 5 * CM_PER_IN;
  const tickCount = Math.floor(TRACK_HALF_CM / tickStepCm);
  const ticks = Array.from({ length: tickCount * 2 + 1 }, (_, i) => (i - tickCount) * tickStepCm);

  return (
    <div className="w-full space-y-4">
      {!hideHeader && (
        <div className="flex items-center gap-2">
          <Ruler className="h-5 w-5 shrink-0 text-[#014421]" aria-hidden />
          <div>
            <h2 className="text-base font-bold text-gray-900">Putting Stroke Length Calculator</h2>
            <p className="text-xs text-gray-500">Find the stroke length for any distance and green speed.</p>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900">Distance</h3>
          <Segmented
            label="Distance unit"
            value={distanceUnit}
            onChange={setDistanceUnit}
            options={[
              { id: "ft", label: "Feet" },
              { id: "m", label: "Metres" },
            ]}
          />
        </div>
        <p className="mt-3 text-3xl font-extrabold tabular-nums text-[#014421]">
          {distanceUnit === "ft" ? distanceValue : distanceValue.toFixed(1)}
          <span className="ml-1 text-base font-semibold text-gray-500">{distanceUnit}</span>
        </p>
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={distanceUnit === "ft" ? 0.5 : 0.1}
          value={distanceValue}
          onChange={(e) => setDistanceInUnit(Number(e.target.value))}
          className={`mt-3 ${RANGE_CLASS}`}
          style={{ background: rangeFill(sliderFill) }}
          aria-label={`Distance in ${distanceUnit === "ft" ? "feet" : "metres"}`}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <Chip key={p} active={distanceValue === p} onClick={() => setDistanceInUnit(p)}>
              {p}
              {distanceUnit}
            </Chip>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-[#014421]" aria-hidden />
          <h3 className="text-sm font-bold text-gray-900">Green speed (Stimpmeter)</h3>
        </div>
        <div className="mt-3 grid grid-cols-6 gap-1.5">
          {STIMP_SPEEDS.map((s) => (
            <Chip key={s} active={stimp === s} onClick={() => setStimp(s)}>
              {s}
            </Chip>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] font-medium text-gray-400">
          <span>Slower</span>
          <span>Faster</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-700">Follow-through</p>
            <Segmented
              label="Follow-through ratio"
              value={ratio}
              onChange={setRatio}
              options={[
                { id: "balanced", label: "1:1 Balanced" },
                { id: "accelerating", label: "1:1.15 Accelerating" },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-700">Show lengths in</p>
            <Segmented
              label="Length unit"
              value={lengthUnit}
              onChange={setLengthUnit}
              options={[
                { id: "cm", label: "Centimetres" },
                { id: "in", label: "Inches" },
              ]}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Backswing" value={toDisplay(back)} unit={lengthUnit} accent="bg-[#FFA500]" />
        <StatCard label="Follow-through" value={toDisplay(through)} unit={lengthUnit} accent="bg-[#014421]" />
        <StatCard label="Total arc" value={toDisplay(back + through)} unit={lengthUnit} accent="bg-gray-400" />
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900">Stroke track</h3>
          <span className="text-[11px] font-semibold text-gray-400">Target →</span>
        </div>

        <div className="relative mt-8 h-20">
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gray-100" aria-hidden />
          <div
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-l-full bg-[#FFA500]"
            style={{ left: `${trackPercent(-back)}%`, right: "50%" }}
            aria-hidden
          />
          <div
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-r-full bg-[#014421]"
            style={{ left: "50%", right: `${100 - trackPercent(through)}%` }}
            aria-hidden
          />

          <span
            className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-[#FFA500]"
            style={{ left: `${labelPercent(-back)}%` }}
          >
            {toDisplay(back).toFixed(1)}
            {lengthUnit}
          </span>
          <span
            className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-[#014421]"
            style={{ left: `${labelPercent(through)}%` }}
          >
            {toDisplay(through).toFixed(1)}
            {lengthUnit}
          </span>
          <span
            className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-[#FFA500]"
            style={{ left: `${trackPercent(-back)}%` }}
            aria-hidden
          />
          <span
            className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-[#014421]"
            style={{ left: `${trackPercent(through)}%` }}
            aria-hidden
          />

          <div
            ref={markerRef}
            className="absolute top-1/2 z-10 h-12 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-gray-800 shadow"
            style={{ left: "50%" }}
            aria-hidden
          />
          <span
            className="absolute left-1/2 top-1/2 z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gray-300 bg-white shadow"
            aria-label="Ball"
          />

          <div className="absolute inset-x-0 bottom-0 h-4" aria-hidden>
            {ticks.map((cm) => (
              <span
                key={cm}
                className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${trackPercent(cm)}%` }}
              >
                <span className={`w-px bg-gray-300 ${cm === 0 ? "h-2" : "h-1.5"}`} />
                <span className="text-[8px] tabular-nums text-gray-400">{Math.round(Math.abs(toDisplay(cm)))}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-semibold">
          <span className="text-[#FFA500]">Backswing</span>
          <span className="text-gray-400">Ball</span>
          <span className="text-[#014421]">Follow-through</span>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Timer className="mt-0.5 h-4 w-4 shrink-0 text-[#014421]" aria-hidden />
            <div>
              <h3 className="text-sm font-bold text-gray-900">Putting tempo trainer</h3>
              <p className="text-xs text-gray-500">
                {rhythm.label} {formatRatio(rhythm.ratio)} · {bpm} BPM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSound((s) => !s)}
            aria-pressed={sound}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              sound ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-gray-800 text-white"
            }`}
          >
            {sound ? <Volume2 className="h-3.5 w-3.5" aria-hidden /> : <VolumeX className="h-3.5 w-3.5" aria-hidden />}
            {sound ? "Audio click" : "Muted"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-orange-50 px-2 py-2">
            <p className="text-[10px] font-semibold text-[#c77c00]">Backswing</p>
            <p className="text-base font-extrabold tabular-nums text-gray-900">
              {ms(tempo.back)}
              <span className="text-[10px] font-semibold text-gray-500">ms</span>
            </p>
          </div>
          <div className="rounded-xl bg-green-50 px-2 py-2">
            <p className="text-[10px] font-semibold text-[#014421]">Downswing</p>
            <p className="text-base font-extrabold tabular-nums text-gray-900">
              {ms(tempo.down)}
              <span className="text-[10px] font-semibold text-gray-500">ms</span>
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 px-2 py-2">
            <p className="text-[10px] font-semibold text-gray-500">Total stroke</p>
            <p className="text-base font-extrabold tabular-nums text-gray-900">
              {ms(tempo.cycle)}
              <span className="text-[10px] font-semibold text-gray-500">ms</span>
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => (playing ? stop() : void start())}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${
              playing ? "bg-gray-800 hover:bg-gray-700" : "bg-[#014421] hover:bg-[#013320]"
            }`}
          >
            {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4 fill-current" aria-hidden />}
            {playing ? "Stop" : "Start tempo"}
          </button>
          <div className="flex gap-1.5" aria-hidden>
            {(
              [
                { id: "takeaway", label: "Takeaway", on: "bg-gray-800 text-white" },
                { id: "apex", label: "Top", on: "bg-[#FFA500] text-white" },
                { id: "impact", label: "Impact", on: "bg-[#014421] text-white" },
              ] as const
            ).map((b) => (
              <span
                key={b.id}
                className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                  beat === b.id ? b.on : "bg-gray-100 text-gray-400"
                }`}
              >
                {b.label}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-gray-400">
          Low beep: start the takeaway. Middle beep: top of the backswing. High click: strike the ball. The putter on the stroke
          track moves at your exact timings. On iPhone, turn off silent mode to hear the beeps.
        </p>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          aria-expanded={settingsOpen}
          className="flex w-full items-center justify-between gap-2 p-4 text-left"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#014421]" aria-hidden />
            <span>
              <span className="block text-sm font-bold text-gray-900">Tempo &amp; Rhythm Settings</span>
              <span className="block text-xs text-gray-500">Change the stroke rhythm and cadence</span>
            </span>
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        {settingsOpen && (
          <div className="space-y-5 border-t border-gray-100 p-4">
            <div>
              <p className="text-xs font-semibold text-gray-700">Stroke rhythm (backswing : downswing)</p>
              <div className="mt-2 space-y-2" role="radiogroup" aria-label="Stroke rhythm">
                {RHYTHMS.map((r) => {
                  const active = r.id === rhythmId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setRhythmId(r.id)}
                      className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        active ? "border-[#014421] bg-green-50/60" : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">{r.label}</span>
                        <span className="block text-[11px] text-gray-500">{r.hint}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                          active ? "bg-[#014421] text-white" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {formatRatio(r.ratio)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-semibold text-gray-700">Cadence speed</p>
                <p className="text-sm font-extrabold tabular-nums text-[#014421]">
                  {bpm} <span className="text-[11px] font-semibold text-gray-500">BPM</span>
                </p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {BPM_PRESETS.map((p) => {
                  const active = p.bpm === bpm;
                  return (
                    <button
                      key={p.bpm}
                      type="button"
                      onClick={() => setBpm(p.bpm)}
                      aria-pressed={active}
                      className={`rounded-xl border px-2 py-2 text-center transition-colors ${
                        active ? "border-[#014421] bg-[#014421] text-white" : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                      }`}
                    >
                      <span className="block text-[11px] font-semibold leading-tight">{p.label}</span>
                      <span className="block text-sm font-extrabold tabular-nums">{p.bpm} BPM</span>
                      <span className={`block text-[10px] ${active ? "text-white/80" : "text-gray-500"}`}>
                        ~{(60 / p.bpm).toFixed(2)}s stroke
                      </span>
                    </button>
                  );
                })}
              </div>
              <input
                type="range"
                min={MIN_BPM}
                max={MAX_BPM}
                step={1}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                aria-label="Cadence in beats per minute"
                className={`mt-4 ${RANGE_CLASS}`}
                style={{ background: rangeFill(((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100) }}
              />
              <div className="mt-1 flex justify-between text-[10px] font-medium text-gray-400">
                <span>{MIN_BPM} BPM</span>
                <span>{MAX_BPM} BPM</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
