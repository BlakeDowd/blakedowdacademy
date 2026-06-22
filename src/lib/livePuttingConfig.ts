/** Putting log fields for Live Entry. */

export type LivePuttMissLine = "high" | "low" | "good";
export type LivePuttMissLength = "long" | "short" | "good";
export type LivePuttBreak = "left_to_right" | "straight" | "right_to_left" | "double_breaker";

export const LIVE_PUTT_BREAK_OPTIONS: { id: LivePuttBreak; label: string }[] = [
  { id: "left_to_right", label: "L → R" },
  { id: "straight", label: "Straight" },
  { id: "right_to_left", label: "R → L" },
  { id: "double_breaker", label: "Double breaker" },
];

export function formatLivePuttBreak(breakType: LivePuttBreak | null | undefined): string {
  if (!breakType) return "";
  return LIVE_PUTT_BREAK_OPTIONS.find((o) => o.id === breakType)?.label ?? breakType;
}

export type LivePuttEntry = {
  puttNumber: number;
  made: boolean;
  /** Distance in feet — recorded per putt. */
  distanceFeet?: number | null;
  /** Green break read for this putt. */
  break?: LivePuttBreak | null;
  missLine?: LivePuttMissLine | null;
  missLength?: LivePuttMissLength | null;
};

export function formatLivePuttEntry(entry: LivePuttEntry): string {
  const parts = [`Putt ${entry.puttNumber}`];
  if (entry.distanceFeet != null) parts.push(`${entry.distanceFeet} ft`);
  if (entry.break) parts.push(formatLivePuttBreak(entry.break));
  if (entry.made) {
    parts.push("Make");
    return parts.join(" · ");
  }
  const missParts: string[] = ["Miss"];
  if (entry.missLine) missParts.push(entry.missLine);
  if (entry.missLength) missParts.push(entry.missLength);
  parts.push(missParts.join(" / "));
  return parts.join(" · ");
}

export function normalizePuttLogs(logs: LivePuttEntry[] | undefined): LivePuttEntry[] {
  if (!logs?.length) return [];
  return logs.map((p) => ({
    puttNumber: p.puttNumber,
    made: p.made,
    distanceFeet: p.distanceFeet ?? null,
    break: p.break ?? null,
    missLine: p.missLine ?? null,
    missLength: p.missLength ?? null,
  }));
}

export function puttingCompleteFromLogs(logs: LivePuttEntry[] | undefined): boolean {
  return (logs ?? []).some((p) => p.made);
}
