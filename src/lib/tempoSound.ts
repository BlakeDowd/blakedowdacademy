/**
 * Shared sound and count-in timing for the tempo trainers (putting, short game, long game).
 *
 * Phone speakers barely reproduce anything below ~700 Hz, so tones sit in the 0.8–2 kHz range, carry
 * harmonics (square + sine) and are driven into a limiter: as loud as the device allows without crackling.
 */

export type ToneCue = "count" | "takeaway" | "apex" | "impact";
export type ToneStyle = "tones" | "click";

const TONE_HZ: Record<ToneCue, number> = { count: 1319, takeaway: 784, apex: 1047, impact: 1568 };
const CLICK_HZ: Record<ToneCue, number> = { count: 1760, takeaway: 2093, apex: 2093, impact: 2794 };
const TONE_SEC: Record<ToneCue, number> = { count: 0.07, takeaway: 0.16, apex: 0.16, impact: 0.11 };
const CLICK_SEC = 0.045;

/** Master volume node feeding a limiter. Set `.gain.value` to 0 to mute. */
export function createLoudOutput(ctx: AudioContext): GainNode {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(limiter).connect(ctx.destination);
  return master;
}

/** One cue at `at` (AudioContext time). */
export function playTone(ctx: AudioContext, out: AudioNode, at: number, cue: ToneCue, style: ToneStyle = "tones") {
  const click = style === "click";
  const hz = click ? CLICK_HZ[cue] : TONE_HZ[cue];
  const length = click ? CLICK_SEC : TONE_SEC[cue];
  const peak = cue === "count" ? 0.8 : 1;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(peak, at + 0.004);
  env.gain.setValueAtTime(peak, at + length * 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);

  // Softens the square wave's harshest overtones while keeping it loud.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 6000;
  tone.connect(env).connect(out);

  const voices: [OscillatorType, number, number][] = [
    ["square", hz, 0.55],
    ["sine", hz, 0.9],
    ["sine", hz * 2, 0.35],
  ];
  for (const [type, freq, level] of voices) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = level;
    osc.connect(gain).connect(tone);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }
}

export type VoiceCue = "takeaway" | "apex" | "impact";
export type VoiceClips = Record<VoiceCue, AudioBuffer>;

/** Placeholder Windows desktop voice (unclear licence for a paid app): replace with own recordings before charging. */
const VOICE_FILES: Record<VoiceCue, string> = {
  takeaway: "/sounds/tempo/one.wav",
  apex: "/sounds/tempo/two.wav",
  impact: "/sounds/tempo/hit.wav",
};
/** A word's beat lands just after its first sound, so clips start this much early. */
const VOICE_BEAT_SEC = 0.03;
const voiceCache = new WeakMap<BaseAudioContext, Promise<VoiceClips | null>>();

/** Cuts the silence around a word (so it can be placed on the beat) and brings it up to full volume. */
function trimClip(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  const data = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  if (peak === 0) return buf;
  const threshold = peak * 0.05;
  let first = 0;
  while (first < data.length && Math.abs(data[first]!) < threshold) first++;
  let last = data.length - 1;
  while (last > first && Math.abs(data[last]!) < threshold) last--;
  const start = Math.max(0, first - Math.round(buf.sampleRate * 0.004));
  const end = Math.min(data.length, last + Math.round(buf.sampleRate * 0.03));
  const out = ctx.createBuffer(1, end - start, buf.sampleRate);
  const o = out.getChannelData(0);
  const gain = 0.98 / peak;
  for (let i = 0; i < o.length; i++) o[i] = data[start + i]! * gain;
  return out;
}

/** Loads "One", "Two", "Hit!" once per audio context. Resolves null if they can't be loaded. */
export function loadVoiceClips(ctx: BaseAudioContext): Promise<VoiceClips | null> {
  let pending = voiceCache.get(ctx);
  if (!pending) {
    pending = Promise.all(
      (Object.keys(VOICE_FILES) as VoiceCue[]).map(async (cue) => {
        const res = await fetch(VOICE_FILES[cue]);
        if (!res.ok) throw new Error(`voice clip ${res.status}`);
        return [cue, trimClip(ctx, await ctx.decodeAudioData(await res.arrayBuffer()))] as const;
      }),
    )
      .then((pairs) => Object.fromEntries(pairs) as VoiceClips)
      .catch(() => null);
    voiceCache.set(ctx, pending);
  }
  return pending;
}

/** Plays a word on the beat at `at`; `cutAt` fades it out so it never talks over the next word. */
export function playVoice(ctx: AudioContext, out: AudioNode, at: number, clip: AudioBuffer, cutAt?: number) {
  const begin = Math.max(ctx.currentTime, at - VOICE_BEAT_SEC);
  const src = ctx.createBufferSource();
  src.buffer = clip;
  const gain = ctx.createGain();
  src.connect(gain).connect(out);
  src.start(begin);
  if (cutAt !== undefined && cutAt - VOICE_BEAT_SEC < begin + clip.duration) {
    const end = cutAt - VOICE_BEAT_SEC;
    gain.gain.setValueAtTime(1, Math.max(begin, end - 0.02));
    gain.gain.linearRampToValueAtTime(0, end);
    src.stop(end + 0.01);
  }
}

export type CountLight = "red" | "amber" | "green";

/** A rep as the lights see it: takeaway at `start`, count-in beats every `lead` seconds before it (0 = no count-in). */
export type CountedRep = { start: number; lead: number; back: number; down: number };

/** Count-in beats come one backswing apart, so the pulse carries straight on into the top of the swing. */
export const COUNT_IN_BEATS = 2;

export function countInTimes(rep: Pick<CountedRep, "start" | "lead">): number[] {
  if (rep.lead <= 0) return [];
  return Array.from({ length: COUNT_IN_BEATS }, (_, i) => rep.start - rep.lead * (COUNT_IN_BEATS - i));
}

/** Red, then amber on the count-in beats; green from the takeaway until impact. */
export function countLightAt(now: number, reps: readonly CountedRep[]): CountLight | null {
  for (const rep of reps) {
    const impact = rep.start + rep.back + rep.down;
    if (now >= rep.start && now < impact) return "green";
    if (rep.lead > 0 && now < rep.start && now >= rep.start - rep.lead * COUNT_IN_BEATS) {
      return now < rep.start - rep.lead ? "red" : "amber";
    }
  }
  return null;
}
