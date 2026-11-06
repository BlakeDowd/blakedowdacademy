import type { SupabaseClient } from "@supabase/supabase-js";

export type DistanceUnit = "m" | "yd";

export type WedgeClockLogEntry = {
  id: string;
  user_id: string;
  logged_at: string;
  club: string;
  target_clock: string | null;
  measured_clock: string | null;
  measured_degrees: number | null;
  goal_distance: number | null;
  carry_distance: number | null;
  distance_unit: DistanceUnit | null;
  note: string | null;
  handedness: string;
  created_at: string;
};

export const WEDGE_CLOCK_MIGRATION_HINT =
  "Run supabase/migrations/20261106120000_player_wedge_clock_logs.sql and 20261106130000_wedge_clock_radar_fields.sql in Supabase first.";

const UNIT_KEY = "wedge_clock_distance_unit";

export function loadDistanceUnit(): DistanceUnit {
  if (typeof window === "undefined") return "m";
  try {
    const v = localStorage.getItem(UNIT_KEY);
    return v === "yd" ? "yd" : "m";
  } catch {
    return "m";
  }
}

export function saveDistanceUnit(unit: DistanceUnit): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UNIT_KEY, unit);
  } catch {
    /* ignore */
  }
}

function isMissingRelation(message: string): boolean {
  return /player_wedge_clock_logs|schema cache|does not exist/i.test(message);
}

function asUnit(v: unknown): DistanceUnit | null {
  return v === "m" || v === "yd" ? v : null;
}

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row: Record<string, unknown>): WedgeClockLogEntry {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    logged_at: String(row.logged_at || row.created_at || ""),
    club: String(row.club || ""),
    target_clock: typeof row.target_clock === "string" ? row.target_clock : null,
    measured_clock: typeof row.measured_clock === "string" ? row.measured_clock : null,
    measured_degrees: asNum(row.measured_degrees),
    goal_distance: asNum(row.goal_distance),
    carry_distance: asNum(row.carry_distance),
    distance_unit: asUnit(row.distance_unit),
    note: typeof row.note === "string" ? row.note : null,
    handedness: String(row.handedness || "right"),
    created_at: String(row.created_at || ""),
  };
}

const SELECT =
  "id, user_id, logged_at, club, target_clock, measured_clock, measured_degrees, goal_distance, carry_distance, distance_unit, note, handedness, created_at";

export function formatDistanceDelta(
  goal: number | null | undefined,
  carry: number | null | undefined,
  unit: DistanceUnit | null | undefined,
): string | null {
  if (goal == null || carry == null || !Number.isFinite(goal) || !Number.isFinite(carry)) return null;
  const d = Math.round((carry - goal) * 10) / 10;
  if (Math.abs(d) < 0.05) return "on goal";
  const label = unit === "yd" ? "yd" : "m";
  return d > 0 ? `+${d} ${label}` : `${d} ${label}`;
}

export async function fetchWedgeClockLogs(
  client: SupabaseClient,
  opts: { userId: string; limit?: number },
): Promise<{ rows: WedgeClockLogEntry[]; error: string | null; available: boolean }> {
  const { data, error } = await client
    .from("player_wedge_clock_logs")
    .select(SELECT)
    .eq("user_id", opts.userId)
    .order("logged_at", { ascending: false })
    .limit(opts.limit ?? 40);

  if (error) {
    const msg = error.message || "Couldn't load wedge clock log.";
    if (isMissingRelation(msg) || /goal_distance|carry_distance|distance_unit/i.test(msg)) {
      return { rows: [], error: WEDGE_CLOCK_MIGRATION_HINT, available: false };
    }
    return { rows: [], error: msg, available: true };
  }
  return {
    rows: ((data as Record<string, unknown>[]) || []).map(mapRow),
    error: null,
    available: true,
  };
}

export type WedgeClockInsertInput = {
  userId: string;
  club: string;
  measuredClock?: string | null;
  targetClock?: string | null;
  measuredDegrees?: number | null;
  goalDistance?: number | null;
  carryDistance?: number | null;
  distanceUnit?: DistanceUnit | null;
  note?: string | null;
  handedness?: "right" | "left";
  loggedAt?: string | null;
};

function parseDistance(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value < 0 || value > 400) return null;
  return Math.round(value * 10) / 10;
}

export async function insertWedgeClockLog(
  client: SupabaseClient,
  input: WedgeClockInsertInput,
): Promise<{ row: WedgeClockLogEntry | null; error: string | null }> {
  const club = input.club.trim();
  const measuredClock = input.measuredClock?.trim() || null;
  const goalDistance = parseDistance(input.goalDistance ?? null);
  const carryDistance = parseDistance(input.carryDistance ?? null);
  const hasDistance = goalDistance != null || carryDistance != null;
  const distanceUnit = hasDistance ? (input.distanceUnit === "yd" ? "yd" : "m") : null;

  if (!club) return { row: null, error: "Pick a club." };
  if (!measuredClock && carryDistance == null) {
    return { row: null, error: "Enter carry from the radar, or lock a clock reading." };
  }
  if (input.goalDistance != null && goalDistance == null) {
    return { row: null, error: "Goal distance looks invalid (0–400)." };
  }
  if (input.carryDistance != null && carryDistance == null) {
    return { row: null, error: "Carry distance looks invalid (0–400)." };
  }

  const payload: Record<string, unknown> = {
    user_id: input.userId,
    club,
    measured_clock: measuredClock,
    target_clock: measuredClock ? input.targetClock?.trim() || null : null,
    measured_degrees:
      measuredClock && input.measuredDegrees != null && Number.isFinite(input.measuredDegrees)
        ? Math.round(input.measuredDegrees * 10) / 10
        : null,
    goal_distance: goalDistance,
    carry_distance: carryDistance,
    distance_unit: distanceUnit,
    note: input.note?.trim() || null,
    handedness: input.handedness === "left" ? "left" : "right",
    logged_at: input.loggedAt?.trim() || new Date().toISOString(),
  };

  const { data, error } = await client
    .from("player_wedge_clock_logs")
    .insert(payload)
    .select(SELECT)
    .maybeSingle();

  if (error) {
    const msg = error.message || "Couldn't save shot.";
    if (/permission|rls|policy/i.test(msg)) {
      const retry = await client.from("player_wedge_clock_logs").insert(payload);
      if (!retry.error) return { row: null, error: null };
    }
    if (isMissingRelation(msg) || /goal_distance|carry_distance|distance_unit|has_reading/i.test(msg)) {
      return { row: null, error: WEDGE_CLOCK_MIGRATION_HINT };
    }
    return { row: null, error: msg };
  }
  return {
    row: data ? mapRow(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function deleteWedgeClockLog(
  client: SupabaseClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await client.from("player_wedge_clock_logs").delete().eq("id", id);
  if (error) {
    const msg = error.message || "Couldn't delete.";
    return { error: isMissingRelation(msg) ? WEDGE_CLOCK_MIGRATION_HINT : msg };
  }
  return { error: null };
}
