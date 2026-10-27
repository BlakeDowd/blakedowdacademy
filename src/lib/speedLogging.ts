/**
 * Club speed → estimated max carry (perfect strike, calm / sea-level conditions).
 * Driver only for now; add more clubs here later without changing the UI much.
 */

export type SpeedClubId = "driver";

/** On-course = typical playing swing; Max = absolute best speed that day. */
export type SpeedKind = "on_course" | "max";

export const SPEED_KINDS: readonly { id: SpeedKind; label: string; hint: string }[] = [
  { id: "on_course", label: "On-course speed", hint: "What you swing to in a round" },
  { id: "max", label: "Max speed", hint: "Absolute top speed that day" },
] as const;

export type CarryUnit = "m" | "yd";

export type SpeedClubConfig = {
  id: SpeedClubId;
  label: string;
  /** Optimal smash factor (ball speed ÷ club speed) for a centred strike. */
  smash: number;
  /**
   * Carry yards per mph of club speed when launch/spin are optimised.
   * Tuned to TrackMan-style “efficient” driver (≈ club × 2.4 → e.g. 100 mph ≈ 240 yd).
   */
  yardsPerMph: number;
};

export const SPEED_CLUBS: readonly SpeedClubConfig[] = [
  { id: "driver", label: "Driver", smash: 1.48, yardsPerMph: 2.4 },
] as const;

export function speedClubById(id: SpeedClubId): SpeedClubConfig {
  return SPEED_CLUBS.find((c) => c.id === id) ?? SPEED_CLUBS[0]!;
}

export type SpeedEstimate = {
  clubSpeedMph: number;
  ballSpeedMph: number;
  carryYards: number;
  carryMetres: number;
};

/** Max carry if struck perfectly in normal conditions (no wind, ~sea level). */
export function estimateMaxCarry(clubSpeedMph: number, clubId: SpeedClubId = "driver"): SpeedEstimate | null {
  const mph = Number(clubSpeedMph);
  if (!Number.isFinite(mph) || mph <= 0 || mph > 160) return null;
  const club = speedClubById(clubId);
  const ballSpeedMph = Math.round(mph * club.smash * 10) / 10;
  const carryYards = Math.round(mph * club.yardsPerMph);
  const carryMetres = Math.round(carryYards * 0.9144);
  return { clubSpeedMph: Math.round(mph * 10) / 10, ballSpeedMph, carryYards, carryMetres };
}

export type SpeedLogEntry = {
  id: string;
  clubId: SpeedClubId;
  kind: SpeedKind;
  clubSpeedMph: number;
  ballSpeedMph: number;
  carryYards: number;
  carryMetres: number;
  at: string;
  /** Player the coach logged for; omitted / null = self on this device. */
  playerId?: string | null;
  playerName?: string | null;
  note?: string;
};

const STORAGE_PREFIX = "driver_speed_log_v2:";
const UNIT_KEY = "driver_speed_carry_unit";
const MAX_ENTRIES = 60;

function storageKey(playerId: string | null | undefined): string {
  return `${STORAGE_PREFIX}${playerId?.trim() || "self"}`;
}

export function loadCarryUnit(): CarryUnit {
  if (typeof window === "undefined") return "m";
  try {
    const v = localStorage.getItem(UNIT_KEY);
    return v === "yd" ? "yd" : "m";
  } catch {
    return "m";
  }
}

export function saveCarryUnit(unit: CarryUnit): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UNIT_KEY, unit);
  } catch {
    /* storage full */
  }
}

export function loadSpeedLog(playerId?: string | null): SpeedLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(playerId)) || "[]") as SpeedLogEntry[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e.clubSpeedMph === "number")
      .map(
        (e): SpeedLogEntry => ({
          ...e,
          kind: e.kind === "max" ? ("max" as const) : ("on_course" as const),
        }),
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveSpeedLog(entries: SpeedLogEntry[], playerId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(playerId), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* storage full */
  }
}

export function addSpeedLogEntry(
  estimate: SpeedEstimate,
  opts: {
    clubId?: SpeedClubId;
    kind: SpeedKind;
    playerId?: string | null;
    playerName?: string | null;
    note?: string;
  },
): SpeedLogEntry[] {
  const playerId = opts.playerId ?? null;
  const entry: SpeedLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    clubId: opts.clubId ?? "driver",
    kind: opts.kind,
    clubSpeedMph: estimate.clubSpeedMph,
    ballSpeedMph: estimate.ballSpeedMph,
    carryYards: estimate.carryYards,
    carryMetres: estimate.carryMetres,
    at: new Date().toISOString(),
    playerId,
    playerName: opts.playerName ?? null,
    ...(opts.note?.trim() ? { note: opts.note.trim() } : {}),
  };
  const next = [entry, ...loadSpeedLog(playerId)].slice(0, MAX_ENTRIES);
  saveSpeedLog(next, playerId);
  return next;
}

export function removeSpeedLogEntry(id: string, playerId?: string | null): SpeedLogEntry[] {
  const next = loadSpeedLog(playerId).filter((e) => e.id !== id);
  saveSpeedLog(next, playerId);
  return next;
}

export function kindLabel(kind: SpeedKind): string {
  return SPEED_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

/**
 * Profile chart: merge "self" phone logs with entries keyed by the user's id
 * (coach logging for that player on this device).
 */
export function loadSpeedLogForProfile(userId?: string | null): SpeedLogEntry[] {
  const byId = new Map<string, SpeedLogEntry>();
  for (const e of loadSpeedLog(null)) byId.set(e.id, e);
  if (userId?.trim()) {
    for (const e of loadSpeedLog(userId)) byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export type SpeedTrendPoint = {
  at: Date;
  clubSpeedMph: number;
  carryYards: number;
  carryMetres: number;
  kind: SpeedKind;
};

/** Chronological points for one swing type (oldest → newest). */
export function speedTrendPoints(
  entries: readonly SpeedLogEntry[],
  kind: SpeedKind,
  clubId: SpeedClubId = "driver",
): SpeedTrendPoint[] {
  return entries
    .filter((e) => e.clubId === clubId && e.kind === kind)
    .map((e) => {
      const at = new Date(e.at);
      if (!Number.isFinite(at.getTime())) return null;
      return {
        at,
        clubSpeedMph: e.clubSpeedMph,
        carryYards: e.carryYards,
        carryMetres: e.carryMetres,
        kind: e.kind,
      };
    })
    .filter((p): p is SpeedTrendPoint => p != null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
