import type { SupabaseClient } from "@supabase/supabase-js";

export type DistanceUnit = "metres" | "yards";

export const METRES_PER_YARD = 0.9144;

export type PlaysLikeClubTemplate = {
  /** Stable key for deduping in the add-club picker (not the DB row id). */
  templateKey: string;
  label: string;
  shortLabel: string;
};

/** Pre-filled when a user has no saved bag yet — saves typing club names. */
export const PLAYS_LIKE_DEFAULT_CLUB_TEMPLATES: PlaysLikeClubTemplate[] = [
  { templateKey: "driver", label: "Driver", shortLabel: "Drv" },
  { templateKey: "3wood", label: "3-Wood", shortLabel: "3W" },
  { templateKey: "4iron", label: "4-Iron", shortLabel: "4i" },
  { templateKey: "5iron", label: "5-Iron", shortLabel: "5i" },
  { templateKey: "6iron", label: "6-Iron", shortLabel: "6i" },
  { templateKey: "7iron", label: "7-Iron", shortLabel: "7i" },
  { templateKey: "8iron", label: "8-Iron", shortLabel: "8i" },
  { templateKey: "9iron", label: "9-Iron", shortLabel: "9i" },
  { templateKey: "pw", label: "Pitching Wedge", shortLabel: "PW" },
  { templateKey: "w52", label: "52° Wedge", shortLabel: "52°" },
  { templateKey: "w56", label: "56° Wedge", shortLabel: "56°" },
  { templateKey: "w60", label: "60° Wedge", shortLabel: "60°" },
];

/** Optional extras in the “Add common club” picker. */
export const PLAYS_LIKE_EXTRA_CLUB_TEMPLATES: PlaysLikeClubTemplate[] = [
  { templateKey: "5wood", label: "5-Wood", shortLabel: "5W" },
  { templateKey: "7wood", label: "7-Wood", shortLabel: "7W" },
  { templateKey: "hybrid", label: "Hybrid", shortLabel: "Hyb" },
  { templateKey: "3iron", label: "3-Iron", shortLabel: "3i" },
  { templateKey: "4hybrid", label: "4-Hybrid", shortLabel: "4H" },
  { templateKey: "5hybrid", label: "5-Hybrid", shortLabel: "5H" },
  { templateKey: "gw", label: "Gap Wedge", shortLabel: "GW" },
  { templateKey: "sw", label: "Sand Wedge", shortLabel: "SW" },
  { templateKey: "lw", label: "Lob Wedge", shortLabel: "LW" },
];

const ALL_CLUB_TEMPLATES = [
  ...PLAYS_LIKE_DEFAULT_CLUB_TEMPLATES,
  ...PLAYS_LIKE_EXTRA_CLUB_TEMPLATES,
];

export type UserClubRow = {
  id: string;
  user_id: string;
  club_name: string;
  short_label: string | null;
  sort_order: number;
  base_carry_metres: number | null;
  peak_height_metres: number | null;
  launch_angle_deg: number | null;
  spin_rate_rpm: number | null;
  /** Legacy columns on older `user_clubs` installs — read/write until migration repair runs. */
  base_carry?: number | null;
  peak_height?: number | null;
  launch_angle?: number | null;
  spin_rate?: number | null;
  created_at?: string;
  updated_at?: string;
};

/** UI state while editing. */
export type PlaysLikeClubFormState = {
  id: string;
  label: string;
  shortLabel: string;
  /** Canonical storage — always metres internally. */
  baseCarryMetres: number | null;
  peakHeightMetres: number | null;
  launchAngleDeg: number | null;
  spinRateRpm: number | null;
  advancedExpanded: boolean;
  /** False until row exists in `user_clubs` (skip delete API for unsaved rows). */
  isPersisted: boolean;
};

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function deriveShortLabel(label: string): string {
  const t = label.trim();
  if (!t) return "—";
  const wedge = t.match(/(\d{2})\s*°/);
  if (wedge) return `${wedge[1]}°`;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 1) return t.slice(0, 4);
  return words
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 4);
}

export function newClubId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0")}`;
}

export function createEmptyClub(overrides?: Partial<PlaysLikeClubFormState>): PlaysLikeClubFormState {
  const label = overrides?.label ?? "";
  return {
    id: overrides?.id ?? newClubId(),
    label,
    shortLabel: overrides?.shortLabel ?? deriveShortLabel(label || "Club"),
    baseCarryMetres: overrides?.baseCarryMetres ?? null,
    peakHeightMetres: overrides?.peakHeightMetres ?? null,
    launchAngleDeg: overrides?.launchAngleDeg ?? null,
    spinRateRpm: overrides?.spinRateRpm ?? null,
    advancedExpanded: overrides?.advancedExpanded ?? false,
    isPersisted: overrides?.isPersisted ?? false,
  };
}

export function clubFromTemplate(
  template: PlaysLikeClubTemplate,
  options?: { expandAdvanced?: boolean },
): PlaysLikeClubFormState {
  return createEmptyClub({
    label: template.label,
    shortLabel: template.shortLabel,
    advancedExpanded: options?.expandAdvanced ?? false,
  });
}

/** Standard 12-club bag for first-time setup (not persisted until Save). */
export function createPresetBagFormState(options?: {
  expandAdvanced?: boolean;
}): PlaysLikeClubFormState[] {
  return PLAYS_LIKE_DEFAULT_CLUB_TEMPLATES.map((template) =>
    clubFromTemplate(template, options),
  );
}

/** Templates not already present in the bag (matched by club name). */
export function addableClubTemplatesForBag(
  clubs: PlaysLikeClubFormState[],
): PlaysLikeClubTemplate[] {
  const usedLabels = new Set(clubs.map((c) => c.label.trim().toLowerCase()));
  return ALL_CLUB_TEMPLATES.filter((t) => !usedLabels.has(t.label.toLowerCase()));
}

export function rowToFormState(
  row: UserClubRow,
  options?: { expandAdvanced?: boolean },
): PlaysLikeClubFormState {
  const hasAdvanced =
    row.peak_height_metres != null ||
    row.launch_angle_deg != null ||
    row.spin_rate_rpm != null;
  const label = row.club_name?.trim() || "Club";
  return {
    id: row.id,
    label,
    shortLabel: row.short_label?.trim() || deriveShortLabel(label),
    baseCarryMetres:
      parseOptionalNumber(row.base_carry_metres) ?? parseOptionalNumber(row.base_carry),
    peakHeightMetres:
      parseOptionalNumber(row.peak_height_metres) ?? parseOptionalNumber(row.peak_height),
    launchAngleDeg:
      parseOptionalNumber(row.launch_angle_deg) ?? parseOptionalNumber(row.launch_angle),
    spinRateRpm:
      parseOptionalNumber(row.spin_rate_rpm) ?? parseOptionalNumber(row.spin_rate),
    advancedExpanded: options?.expandAdvanced === true || hasAdvanced,
    isPersisted: true,
  };
}

export function formStateToUpsertRow(
  club: PlaysLikeClubFormState,
  userId: string,
  sortOrder: number,
): Omit<UserClubRow, "created_at" | "updated_at"> {
  return {
    id: club.id,
    user_id: userId,
    club_name: club.label.trim() || "Club",
    short_label: (club.shortLabel || deriveShortLabel(club.label)).slice(0, 6),
    sort_order: sortOrder,
    base_carry_metres: club.baseCarryMetres,
    peak_height_metres: club.peakHeightMetres,
    launch_angle_deg: club.launchAngleDeg,
    spin_rate_rpm: club.spinRateRpm != null ? Math.round(club.spinRateRpm) : null,
  };
}

export function metresToDisplay(
  metres: number | null,
  unit: DistanceUnit,
): number | null {
  if (metres == null) return null;
  if (unit === "metres") return metres;
  return Math.round((metres / METRES_PER_YARD) * 10) / 10;
}

export function displayToMetres(
  display: number | null,
  unit: DistanceUnit,
): number | null {
  if (display == null) return null;
  if (unit === "metres") return display;
  return Math.round(display * METRES_PER_YARD * 10) / 10;
}

export function carryUnitLabel(unit: DistanceUnit): string {
  return unit === "metres" ? "m" : "yd";
}

export function validateBagForSave(clubs: PlaysLikeClubFormState[]): string | null {
  if (clubs.length === 0) {
    return "Add at least one club to your bag before saving.";
  }
  const withCarry = clubs.filter((c) => c.baseCarryMetres != null && c.baseCarryMetres > 0);
  if (withCarry.length === 0) {
    return "Enter at least one base carry distance before saving.";
  }
  for (const club of clubs) {
    if (!club.label.trim()) {
      return "Every club needs a name.";
    }
    if (club.baseCarryMetres != null && club.baseCarryMetres <= 0) {
      return `${club.label}: carry must be greater than zero.`;
    }
  }
  return null;
}

function isMissingUserClubsTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (error.message?.includes("Could not find the table") === true &&
      error.message?.includes("user_clubs") === true)
  );
}

/** Maps form state to DB row for upsert. */
function formStateToUpsertPayload(
  club: PlaysLikeClubFormState,
  userId: string,
  sortOrder: number,
): Omit<UserClubRow, "created_at"> {
  return {
    ...formStateToUpsertRow(club, userId, sortOrder),
    updated_at: new Date().toISOString(),
  };
}

/** One-time import from legacy `profiles.plays_like_bag` jsonb. */
async function importLegacyPlaysLikeBag(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlaysLikeClubFormState[] | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("plays_like_bag")
    .eq("id", userId)
    .maybeSingle();

  if (error || !Array.isArray(data?.plays_like_bag) || data.plays_like_bag.length === 0) {
    return null;
  }

  const imported: PlaysLikeClubFormState[] = [];
  for (let i = 0; i < data.plays_like_bag.length; i++) {
    const raw = data.plays_like_bag[i] as Record<string, unknown>;
    const label =
      typeof raw.label === "string" && raw.label.trim()
        ? raw.label.trim()
        : "Club";
    const metres =
      parseOptionalNumber(raw.baseCarryMetres) ??
      (parseOptionalNumber(raw.baseCarryYards) != null
        ? Math.round(parseOptionalNumber(raw.baseCarryYards)! * METRES_PER_YARD * 10) / 10
        : null);
    imported.push(
      createEmptyClub({
        id: newClubId(),
        label,
        shortLabel:
          typeof raw.shortLabel === "string" ? raw.shortLabel : deriveShortLabel(label),
        baseCarryMetres: metres,
        peakHeightMetres:
          parseOptionalNumber(raw.peakHeightMetres) ??
          (parseOptionalNumber(raw.peakHeightFt) != null
            ? Math.round(parseOptionalNumber(raw.peakHeightFt)! * 0.3048 * 10) / 10
            : null),
        launchAngleDeg: parseOptionalNumber(raw.launchAngleDeg),
        spinRateRpm: parseOptionalNumber(raw.spinRateRpm),
        isPersisted: false,
      }),
    );
  }
  return imported.length > 0 ? imported : null;
}

export async function fetchUserClubs(
  supabase: SupabaseClient,
  userId: string,
  options?: { expandAdvanced?: boolean },
): Promise<PlaysLikeClubFormState[]> {
  const { data, error } = await supabase
    .from("user_clubs")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingUserClubsTable(error)) {
      const legacy = await importLegacyPlaysLikeBag(supabase, userId);
      return legacy ?? createPresetBagFormState(options);
    }
    throw error;
  }

  if (!data?.length) {
    const legacy = await importLegacyPlaysLikeBag(supabase, userId);
    if (legacy?.length) return legacy;
    return createPresetBagFormState(options);
  }

  return (data as UserClubRow[]).map((row) => rowToFormState(row, options));
}

export async function deleteUserClub(
  supabase: SupabaseClient,
  clubId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("user_clubs").delete().eq("id", clubId);
  if (error) {
    if (isMissingUserClubsTable(error)) {
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function upsertUserClubs(
  supabase: SupabaseClient,
  userId: string,
  clubs: PlaysLikeClubFormState[],
): Promise<
  | { ok: true; clubs: PlaysLikeClubFormState[] }
  | { ok: false; error: string }
> {
  const rows = clubs.map((club, index) => formStateToUpsertPayload(club, userId, index));

  const { data, error } = await supabase
    .from("user_clubs")
    .upsert(rows, { onConflict: "id" })
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingUserClubsTable(error)) {
      return {
        ok: false,
        error: "Run supabase/migrations/20260530120000_user_clubs.sql in Supabase to enable bag sync.",
      };
    }
    return { ok: false, error: error.message };
  }

  const saved = (data as UserClubRow[]).map((row) => rowToFormState(row));
  return { ok: true, clubs: saved };
}

export const DISTANCE_UNIT_STORAGE_KEY = "playsLikeDistanceUnit";

export function loadDistanceUnitPreference(): DistanceUnit {
  if (typeof window === "undefined") return "metres";
  const stored = localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY);
  return stored === "yards" ? "yards" : "metres";
}

export function saveDistanceUnitPreference(unit: DistanceUnit) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, unit);
}
