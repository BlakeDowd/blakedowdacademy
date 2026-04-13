/**
 * Dashboard Goal Accountability — aligned with Supabase `player_goals` and `practice_logs`.
 */

/**
 * Focus presets — aligned with weekly practice allocation / `DrillCard` `FacilityType`.
 * Stored in `player_goals.focus_area` and matched to `practice_logs.log_type` via
 * `logTypeToFocusArea` in `@/lib/goalAccountability`.
 */
export type GoalFocusArea =
  | "Driving"
  | "Irons"
  | "Wedges"
  | "Chipping"
  | "Bunkers"
  | "Putting"
  | "On-Course"
  | "Mental/Strategy";

/** Row shape for `public.player_goals` (PK user_id). */
export interface PlayerGoalRow {
  user_id: string;
  scoring_milestone: string;
  focus_area: string;
  weekly_hour_commitment: number;
  /** Per-focus weekly targets (hours); should sum to `weekly_hour_commitment`. */
  practice_allocation?: Record<string, number> | null;
  /** Best 18-hole score; optional. */
  lowest_score?: number | null;
  /** Handicap index; optional (negative = plus). */
  current_handicap?: number | null;
  updated_at?: string;
}

/** Subset of `practice_logs` used for weekly accountability rollup. */
export interface PracticeLogAccountabilityRow {
  id: string;
  user_id: string;
  log_type: string | null;
  created_at: string | null;
  duration_minutes: number | null;
}

export interface GoalAccountabilityMetrics {
  weekStartIso: string;
  weekEndIso: string;
  totalMinutesFromLogs: number;
  /** Minutes from `practice` for the same user/week when log durations are mostly unset. */
  supplementalPracticeMinutes: number;
  totalMinutes: number;
  topCategory: GoalFocusArea | null;
  logCountThisWeek: number;
}

export interface GoalAccountabilityState {
  goal: PlayerGoalRow | null;
  metrics: GoalAccountabilityMetrics | null;
  focusMismatch: boolean;
  commitmentHours: number;
  actualHours: number;
  hourProgressPct: number;
  hoursBelowThreshold: boolean;
}
