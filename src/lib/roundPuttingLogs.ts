import {
  formatLivePuttBreak,
  LIVE_PUTT_BREAK_OPTIONS,
  type LivePuttBreak,
  type LivePuttEntry,
  type LivePuttMissLength,
  type LivePuttMissLine,
} from "@/lib/livePuttingConfig";

export type RoundPuttingLogEntry = {
  hole: number;
  puttNumber: number;
  made: boolean;
  distanceFeet?: number | null;
  break?: LivePuttBreak | null;
  missLine?: LivePuttMissLine | null;
  missLength?: LivePuttMissLength | null;
};

export type PuttingDistanceBucket = "under6" | "ft6to12" | "ft12to20" | "ft20plus";

export const PUTTING_DISTANCE_BUCKETS: {
  id: PuttingDistanceBucket;
  label: string;
  shortLabel: string;
}[] = [
  { id: "under6", label: "Under 6 ft", shortLabel: "< 6 ft" },
  { id: "ft6to12", label: "6–12 ft", shortLabel: "6–12 ft" },
  { id: "ft12to20", label: "12–20 ft", shortLabel: "12–20 ft" },
  { id: "ft20plus", label: "20 ft+", shortLabel: "20+ ft" },
];

function distanceBucket(feet: number | null | undefined): PuttingDistanceBucket | null {
  if (feet == null || !Number.isFinite(feet) || feet < 0) return null;
  if (feet < 6) return "under6";
  if (feet < 12) return "ft6to12";
  if (feet < 20) return "ft12to20";
  return "ft20plus";
}

export function normalizeRoundPuttingLogs(raw: unknown): RoundPuttingLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: RoundPuttingLogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const hole = Number(row.hole);
    const puttNumber = Number(row.puttNumber);
    if (!Number.isFinite(hole) || !Number.isFinite(puttNumber)) continue;
    entries.push({
      hole,
      puttNumber,
      made: Boolean(row.made),
      distanceFeet:
        row.distanceFeet == null || row.distanceFeet === ""
          ? null
          : Number(row.distanceFeet),
      break: (row.break as LivePuttBreak | null) ?? null,
      missLine: (row.missLine as LivePuttMissLine | null) ?? null,
      missLength: (row.missLength as LivePuttMissLength | null) ?? null,
    });
  }
  return entries;
}

export function puttingMakeStatsFromLogs(logs: RoundPuttingLogEntry[]) {
  let madeUnder6 = 0;
  let attemptsUnder6 = 0;
  for (const putt of logs) {
    const bucket = distanceBucket(putt.distanceFeet);
    if (bucket === "under6") {
      attemptsUnder6 += 1;
      if (putt.made) madeUnder6 += 1;
    }
  }
  return { madeUnder6, attemptsUnder6 };
}

type RoundLike = {
  holes?: number;
  puttingLogs?: unknown;
  putting_logs?: unknown;
};

export type LivePuttingAggregate = {
  totalPutts: number;
  roundsWithData: number;
  distanceBuckets: Record<
    PuttingDistanceBucket,
    { attempts: number; makes: number; makePct: number }
  >;
  breakCounts: Record<LivePuttBreak, number>;
  breakTotal: number;
  missStartLine: { high: number; low: number; total: number };
  missSpeed: { long: number; short: number; total: number };
};

function emptyDistanceBuckets(): LivePuttingAggregate["distanceBuckets"] {
  return {
    under6: { attempts: 0, makes: 0, makePct: 0 },
    ft6to12: { attempts: 0, makes: 0, makePct: 0 },
    ft12to20: { attempts: 0, makes: 0, makePct: 0 },
    ft20plus: { attempts: 0, makes: 0, makePct: 0 },
  };
}

function emptyBreakCounts(): Record<LivePuttBreak, number> {
  return {
    left_to_right: 0,
    straight: 0,
    right_to_left: 0,
    double_breaker: 0,
  };
}

export function aggregateLivePuttingStats(rounds: RoundLike[]): LivePuttingAggregate {
  const distanceBuckets = emptyDistanceBuckets();
  const breakCounts = emptyBreakCounts();
  let totalPutts = 0;
  let roundsWithData = 0;
  let missStartLineHigh = 0;
  let missStartLineLow = 0;
  let missStartLineTotal = 0;
  let missSpeedLong = 0;
  let missSpeedShort = 0;
  let missSpeedTotal = 0;
  let breakTotal = 0;

  for (const round of rounds) {
    const logs = normalizeRoundPuttingLogs(round.puttingLogs ?? round.putting_logs);
    if (logs.length === 0) continue;
    roundsWithData += 1;
    totalPutts += logs.length;

    for (const putt of logs) {
      const bucket = distanceBucket(putt.distanceFeet);
      if (bucket) {
        distanceBuckets[bucket].attempts += 1;
        if (putt.made) distanceBuckets[bucket].makes += 1;
      }

      if (putt.break && putt.break in breakCounts) {
        breakCounts[putt.break as LivePuttBreak] += 1;
        breakTotal += 1;
      }

      if (!putt.made) {
        if (putt.missLine === "high" || putt.missLine === "low") {
          missStartLineTotal += 1;
          if (putt.missLine === "high") missStartLineHigh += 1;
          if (putt.missLine === "low") missStartLineLow += 1;
        }
        if (putt.missLength === "long" || putt.missLength === "short") {
          missSpeedTotal += 1;
          if (putt.missLength === "long") missSpeedLong += 1;
          if (putt.missLength === "short") missSpeedShort += 1;
        }
      }
    }
  }

  for (const bucket of PUTTING_DISTANCE_BUCKETS) {
    const row = distanceBuckets[bucket.id];
    row.makePct =
      row.attempts > 0 ? Math.round((row.makes / row.attempts) * 100) : 0;
  }

  return {
    totalPutts,
    roundsWithData,
    distanceBuckets,
    breakCounts,
    breakTotal,
    missStartLine: {
      high: missStartLineHigh,
      low: missStartLineLow,
      total: missStartLineTotal,
    },
    missSpeed: {
      long: missSpeedLong,
      short: missSpeedShort,
      total: missSpeedTotal,
    },
  };
}

export function formatPuttingLogEntry(entry: RoundPuttingLogEntry | LivePuttEntry): string {
  const parts: string[] = [];
  if (entry.distanceFeet != null) parts.push(`${entry.distanceFeet} ft`);
  if (entry.break) parts.push(formatLivePuttBreak(entry.break));
  if (entry.made) {
    parts.push("Make");
    return parts.join(" · ");
  }
  const miss: string[] = ["Miss"];
  if (entry.missLine && entry.missLine !== "good") miss.push(entry.missLine);
  if (entry.missLength && entry.missLength !== "good") miss.push(entry.missLength);
  parts.push(miss.join(" / "));
  return parts.join(" · ");
}

export { LIVE_PUTT_BREAK_OPTIONS };
