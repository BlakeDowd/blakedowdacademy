/** Lead-arm "clock" length for wedges — pure math, no video I/O. */

export type Point2 = { x: number; y: number };

/** MediaPipe Pose landmark indices */
export const POSE = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
} as const;

export type Handedness = "right" | "left";

export const WEDGE_CLOCK_CLUBS = [
  "PW",
  "GW",
  "56° Wedge",
  "60° Wedge",
  "9-Iron",
  "8-Iron",
] as const;

/** Common coaching targets (half-hour steps from short chip to full). */
export const WEDGE_CLOCK_TARGETS = [
  "7:00",
  "7:30",
  "8:00",
  "8:30",
  "9:00",
  "9:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
] as const;

export type WedgeClockLabel = (typeof WEDGE_CLOCK_TARGETS)[number] | string;

/**
 * Angle of shoulder→wrist from straight down (6 o'clock), in degrees 0–180.
 * Image coords: x right, y down. 0° = hanging (address), 90° = parallel (9 o'clock), 180° = vertical up (12).
 */
export function armDegreesFromDown(shoulder: Point2, wrist: Point2): number {
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return Math.min(180, Math.max(0, Math.abs(deg)));
}

/** Map 0–180° from down → clock hours past 6 (6:00 … 12:00). */
export function degreesToClockHours(degreesFromDown: number): number {
  const clamped = Math.min(180, Math.max(0, degreesFromDown));
  return 6 + clamped / 30;
}

export function formatClockLabel(clockHours: number): string {
  let h = ((clockHours % 12) + 12) % 12;
  // Prefer 12:00 over 0:00 for top of swing
  const hoursInt = Math.floor(h);
  let minutes = Math.round((h - hoursInt) * 60);
  let hours = hoursInt;
  if (minutes === 60) {
    minutes = 0;
    hours += 1;
  }
  if (hours === 0 && minutes === 0) return "12:00";
  if (hours === 0) hours = 12;
  if (hours === 12 && minutes > 0 && clockHours < 6) {
    // shouldn't happen in our 6–12 range
  }
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, "0")}`;
}

/** Snap to nearest half-hour for clean coaching feedback. */
export function snapClockLabel(degreesFromDown: number): string {
  const hours = degreesToClockHours(degreesFromDown);
  const snapped = Math.round(hours * 2) / 2;
  return formatClockLabel(snapped);
}

export function parseClockLabel(label: string): number | null {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min < 0 || min >= 60) return null;
  if (h === 12) h = 0;
  if (h < 0 || h > 12) return null;
  return h + min / 60;
}

/** Signed difference in clock-hours (measured − target). Positive = longer. */
export function clockHoursDelta(measuredLabel: string, targetLabel: string): number | null {
  const a = parseClockLabel(measuredLabel);
  const b = parseClockLabel(targetLabel);
  if (a == null || b == null) return null;
  return a - b;
}

export function describeDelta(measuredLabel: string, targetLabel: string | null | undefined): string | null {
  if (!targetLabel) return null;
  const d = clockHoursDelta(measuredLabel, targetLabel);
  if (d == null) return null;
  if (Math.abs(d) < 0.2) return "On target";
  const steps = Math.round(Math.abs(d) * 2) / 2;
  const pretty = steps === 0.5 ? "½ hour" : steps === 1 ? "1 hour" : `${steps} hours`;
  return d > 0 ? `${pretty} long` : `${pretty} short`;
}

export function leadArmPoints(
  landmarks: Array<{ x: number; y: number; visibility?: number }>,
  handedness: Handedness,
): { shoulder: Point2; elbow: Point2; wrist: Point2; ok: boolean } | null {
  if (!landmarks || landmarks.length < 17) return null;
  const si = handedness === "right" ? POSE.LEFT_SHOULDER : POSE.RIGHT_SHOULDER;
  const ei = handedness === "right" ? POSE.LEFT_ELBOW : POSE.RIGHT_ELBOW;
  const wi = handedness === "right" ? POSE.LEFT_WRIST : POSE.RIGHT_WRIST;
  const shoulder = landmarks[si];
  const elbow = landmarks[ei];
  const wrist = landmarks[wi];
  if (!shoulder || !elbow || !wrist) return null;
  const visOk = (p: { visibility?: number }) => p.visibility == null || p.visibility > 0.45;
  const ok = visOk(shoulder) && visOk(elbow) && visOk(wrist);
  return {
    shoulder: { x: shoulder.x, y: shoulder.y },
    elbow: { x: elbow.x, y: elbow.y },
    wrist: { x: wrist.x, y: wrist.y },
    ok,
  };
}

/**
 * Face-on clips make shoulder→wrist look “vertical” and falsely read as 12:00.
 * Side-on: shoulders nearly stacked in x; face-on: wide left–right separation.
 */
export function isLikelyFaceOn(
  landmarks: Array<{ x: number; y: number; visibility?: number }>,
): boolean {
  if (!landmarks || landmarks.length < 25) return false;
  const ls = landmarks[POSE.LEFT_SHOULDER];
  const rs = landmarks[POSE.RIGHT_SHOULDER];
  if (!ls || !rs) return false;
  const vis = (p: { visibility?: number }) => p.visibility == null || p.visibility > 0.4;
  if (!vis(ls) || !vis(rs)) return false;
  const shoulderWidth = Math.abs(ls.x - rs.x);
  const shoulderDepth = Math.abs(ls.y - rs.y) + 0.001;
  return shoulderWidth > 0.14 && shoulderWidth / shoulderDepth > 2.2;
}

/**
 * Lead-arm clock degrees. Uses wrist when the elbow lies roughly on the arm line;
 * otherwise falls back to shoulder→elbow (more stable mid-swing).
 */
export function measureLeadArmDegrees(
  landmarks: Array<{ x: number; y: number; visibility?: number }>,
  handedness: Handedness,
): number | null {
  const pts = leadArmPoints(landmarks, handedness);
  if (!pts || !pts.ok) return null;

  const toWrist = armDegreesFromDown(pts.shoulder, pts.wrist);
  const toElbow = armDegreesFromDown(pts.shoulder, pts.elbow);

  // If elbow and wrist disagree a lot, the wrist is often a bad 2D projection — prefer elbow.
  if (Math.abs(toWrist - toElbow) > 45) {
    return Math.min(toWrist, toElbow + 25);
  }
  // Blend slightly toward elbow so single-frame wrist spikes don't jump to 12:00.
  return toWrist * 0.75 + toElbow * 0.25;
}

/** Reject one-frame spikes: use the 3rd-highest sample (or max if few samples). */
export function robustPeakDegrees(samples: readonly number[]): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => b - a);
  if (sorted.length >= 5) return sorted[2]!;
  if (sorted.length >= 3) return sorted[1]!;
  return sorted[0]!;
}
