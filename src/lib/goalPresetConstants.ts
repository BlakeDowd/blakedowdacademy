/** Goal Setting presets — UI labels match `player_goals` text fields. */

import type { GoalFocusArea } from "@/types/playerGoals";

export const SCORING_MILESTONE_PRESETS = ["Break 100", "Break 90", "Break 80", "Scratch", "Plus", "Pro"] as const;
export type ScoringMilestonePreset = (typeof SCORING_MILESTONE_PRESETS)[number];

/** Display-only labels (stored milestone text uses preset keys, e.g. `Plus`, `Pro`). */
export const SCORING_MILESTONE_LABELS: Record<ScoringMilestonePreset, string> = {
  "Break 100": "Break 100",
  "Break 90": "Break 90",
  "Break 80": "Break 80",
  Scratch: "Scratch",
  Plus: "Plus Handicap",
  Pro: "Pro (+5)",
};

/** Same order as practice allocation / facility picker on the Practice page. */
export const FOCUS_AREA_PRESETS = [
  "Driving",
  "Irons",
  "Wedges",
  "Chipping",
  "Bunkers",
  "Putting",
  "On-Course",
  "Mental/Strategy",
] as const satisfies readonly GoalFocusArea[];

/** Stored in `player_goals.weekly_hour_commitment` for the elite "15h+" tier (distinct from plain `15`). */
export const HIGH_VOLUME_WEEKLY_HOURS_STORED = 18;

export const WEEKLY_HOURS_PRESETS = [2, 5, 10, 15, "15+"] as const;
export type WeeklyHoursPreset = (typeof WEEKLY_HOURS_PRESETS)[number];

export const DEFAULT_SCORING_PRESET: ScoringMilestonePreset = "Break 90";
export const DEFAULT_WEEKLY_HOURS: WeeklyHoursPreset = 5;

export function weeklyHoursPresetToStoredHours(p: WeeklyHoursPreset): number {
  if (p === "15+") return HIGH_VOLUME_WEEKLY_HOURS_STORED;
  return p;
}

export function formatWeeklyHoursLabel(p: WeeklyHoursPreset): string {
  if (p === "15+") return "15h+";
  return `${p}h`;
}

/** Snap stored hour target to the nearest preset (for loads from DB). */
export function weeklyHoursToPreset(n: number): WeeklyHoursPreset {
  const x = Number.isFinite(n) ? n : 5;
  if (Math.abs(x - HIGH_VOLUME_WEEKLY_HOURS_STORED) < 0.01) return "15+";
  const numericPresets = [2, 5, 10, 15] as const;
  if (numericPresets.includes(x as (typeof numericPresets)[number])) return x as 2 | 5 | 10 | 15;
  return numericPresets.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
}

/** Map arbitrary saved milestone text to the nearest preset for the button grid. */
export function milestoneToPreset(raw: string | null | undefined): ScoringMilestonePreset {
  const r = (raw || "").trim();
  if (SCORING_MILESTONE_PRESETS.includes(r as ScoringMilestonePreset)) return r as ScoringMilestonePreset;
  const lower = r.toLowerCase();
  // +5 / Pro before generic "plus" / "+" so "+5" does not become Plus.
  if (
    lower === "pro" ||
    lower.includes("+5") ||
    lower.includes("plus 5") ||
    lower.includes("plus5") ||
    lower.includes("plus five")
  ) {
    return "Pro";
  }
  if (lower.includes("plus") || lower.includes("+")) return "Plus";
  if (lower.includes("scratch")) return "Scratch";
  if (lower.includes("80")) return "Break 80";
  if (lower.includes("100")) return "Break 100";
  if (lower.includes("90")) return "Break 90";
  return DEFAULT_SCORING_PRESET;
}
