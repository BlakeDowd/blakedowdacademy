/**
 * Web Audio on phones, iPhone especially, only starts inside a tap and is muted by the silent switch.
 * Call `unlockAudio` synchronously at the top of a tap handler (before any `await`).
 */

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

let silentLoop: HTMLAudioElement | null = null;

/** A short silent WAV, played on loop so iOS treats the page as media playback rather than a ringer sound. */
function silentWavUrl(): string {
  const sampleRate = 8000;
  const samples = sampleRate / 2;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(36, "data");
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function isIOS(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function startSilentLoop() {
  try {
    if (!silentLoop) {
      silentLoop = new Audio(silentWavUrl());
      silentLoop.loop = true;
      silentLoop.setAttribute("playsinline", "");
      silentLoop.setAttribute("x-webkit-airplay", "deny");
    }
    void silentLoop.play().catch(() => undefined);
  } catch {
    // Not critical: only needed to play through the silent switch on older iOS.
  }
}

/** Returns a running (or starting) AudioContext, reusing `existing` when it's still usable. */
export function unlockAudio(existing: AudioContext | null): AudioContext | null {
  const AudioCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;

  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session) {
    try {
      session.type = "playback";
    } catch {
      // ignore
    }
  } else if (isIOS()) {
    startSilentLoop();
  }

  // iOS can leave a context "interrupted" (e.g. after a call or another app's audio) and it never resumes.
  const state = existing?.state as string | undefined;
  let ctx = existing;
  if (!ctx || state === "closed" || state === "interrupted") {
    if (ctx && state !== "closed") void ctx.close().catch(() => undefined);
    ctx = new AudioCtor();
  }
  void ctx.resume().catch(() => undefined);

  // Playing a one-sample buffer inside the tap is what actually unlocks output on older iOS.
  const blip = ctx.createBufferSource();
  blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  blip.connect(ctx.destination);
  blip.start(0);

  return ctx;
}

/** Stops the silent keep-alive loop when nothing is playing. */
export function releaseAudio() {
  silentLoop?.pause();
}
