/** Lightweight Web Audio arcade beeps. */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function beep(freq: number, dur: number, type: OscillatorType = "square", gain = 0.08) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function playSwing() {
  beep(180, 0.08, "sawtooth", 0.06);
  setTimeout(() => beep(90, 0.12, "triangle", 0.05), 40);
}

export function playBallHit() {
  beep(420, 0.05, "square", 0.07);
}

export function playRoll() {
  beep(140, 0.25, "triangle", 0.03);
}

export function playCup() {
  beep(660, 0.08, "square", 0.07);
  setTimeout(() => beep(880, 0.1, "square", 0.06), 70);
  setTimeout(() => beep(1100, 0.14, "square", 0.05), 140);
}

export function playSplash() {
  beep(200, 0.05, "sawtooth", 0.05);
  setTimeout(() => beep(120, 0.2, "triangle", 0.04), 30);
  setTimeout(() => beep(80, 0.25, "sine", 0.03), 80);
}

export function playSand() {
  beep(300, 0.04, "sawtooth", 0.04);
  setTimeout(() => beep(220, 0.08, "triangle", 0.03), 40);
}
