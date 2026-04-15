/** 3×3 matrix cells only (direction + GIR center). */
export type ApproachMatrixCellKey =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "gir"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/** Matrix cells plus “no realistic GIR” (tee/recovery or distance / lay-up). */
export type ApproachResultKey =
  | ApproachMatrixCellKey
  | "tee-no-gir"
  | "distance-no-gir";

const VALID_RESULTS = new Set<string>([
  "top-left",
  "top",
  "top-right",
  "left",
  "gir",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
  "tee-no-gir",
  "distance-no-gir",
]);

export type ParsedApproachShot = {
  hole?: number;
  club: string;
  result: ApproachResultKey;
};

export const APPROACH_MATRIX_ROWS: ApproachMatrixCellKey[][] = [
  ["top-left", "top", "top-right"],
  ["left", "gir", "right"],
  ["bottom-left", "bottom", "bottom-right"],
];

function isApproachResultKey(s: string): s is ApproachResultKey {
  return VALID_RESULTS.has(s);
}

/** Normalize one DB / JSON row (camelCase or legacy without hole). */
export function parseApproachShotRow(raw: unknown): ParsedApproachShot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const result = typeof o.result === "string" ? o.result : "";
  if (!isApproachResultKey(result)) return null;
  const club = typeof o.club === "string" && o.club.trim() ? o.club.trim() : "—";
  const hole = typeof o.hole === "number" && Number.isFinite(o.hole) ? Math.floor(o.hole) : undefined;
  return { result, club, hole };
}

export function parseApproachShotsFromJson(raw: unknown): ParsedApproachShot[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedApproachShot[] = [];
  for (const row of raw) {
    const p = parseApproachShotRow(row);
    if (p) out.push(p);
  }
  return out;
}

export function countByResult(shots: ParsedApproachShot[]): Record<ApproachResultKey, number> {
  const init = {} as Record<ApproachResultKey, number>;
  for (const k of VALID_RESULTS) {
    init[k as ApproachResultKey] = 0;
  }
  for (const s of shots) {
    init[s.result] += 1;
  }
  return init;
}

export function topClubs(shots: ParsedApproachShot[], limit = 6): { club: string; count: number }[] {
  const m = new Map<string, number>();
  for (const s of shots) {
    const c = s.club || "—";
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([club, count]) => ({ club, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type AdvancedApproachAggregate = {
  shots: ParsedApproachShot[];
  total: number;
  girCount: number;
  /** Matrix / GIR taps only (excludes tee-no-gir & distance-no-gir). */
  approachTrackedCount: number;
  /** GIR center taps ÷ approach-tracked taps (0 if none). */
  girRateAmongTrackedPct: number;
  noGirTeeCount: number;
  noGirDistanceCount: number;
  roundsWithData: number;
  byResult: Record<ApproachResultKey, number>;
  topClubs: { club: string; count: number }[];
  maxCellCount: number;
};

export function aggregateAdvancedApproach(
  rounds: ReadonlyArray<{ approachDirectionalShots?: unknown }>,
): AdvancedApproachAggregate {
  const shots: ParsedApproachShot[] = [];
  let roundsWithData = 0;
  for (const r of rounds) {
    const parsed = parseApproachShotsFromJson(r.approachDirectionalShots);
    if (parsed.length) roundsWithData += 1;
    shots.push(...parsed);
  }
  const byResult = countByResult(shots);
  const girCount = byResult.gir;
  const noGirTeeCount = byResult["tee-no-gir"];
  const noGirDistanceCount = byResult["distance-no-gir"];
  const approachTrackedCount = Math.max(
    0,
    shots.length - noGirTeeCount - noGirDistanceCount,
  );
  const girRateAmongTrackedPct =
    approachTrackedCount > 0
      ? Math.round((girCount / approachTrackedCount) * 1000) / 10
      : 0;
  let maxCellCount = 0;
  for (const row of APPROACH_MATRIX_ROWS) {
    for (const k of row) {
      maxCellCount = Math.max(maxCellCount, byResult[k]);
    }
  }
  return {
    shots,
    total: shots.length,
    girCount,
    approachTrackedCount,
    girRateAmongTrackedPct,
    noGirTeeCount,
    noGirDistanceCount,
    roundsWithData,
    byResult,
    topClubs: topClubs(shots, 8),
    maxCellCount: maxCellCount || 1,
  };
}
