import { listUserCombineCompletionEvents } from "@/lib/combineCompletionDetection";
import { COMBINE_TEST_CARDS, type CombineCategoryId } from "@/lib/combineTestsCatalog";
import type { LibraryCompletionRow } from "@/lib/libraryCompletions";
import { practiceSessionMinutesFromRow } from "@/lib/practiceSessionDuration";

export const PRACTICE_AREAS = [
  "Driving",
  "Irons",
  "Wedges",
  "Chipping",
  "Bunkers",
  "Putting",
  "On-Course",
  "Mental/Strategy",
] as const;

export type PracticeArea = (typeof PRACTICE_AREAS)[number];

export type PracticeActivityKind = "drill" | "video" | "practice" | "combine";

export type PracticeActivityItem = {
  id: string;
  kind: PracticeActivityKind;
  /** ISO timestamp. */
  at: string;
  title: string;
  area: PracticeArea | null;
  minutes: number;
  /** Catalog key for drills; library lesson id for videos. */
  refId?: string;
};

export type DrillCatalogEntry = { title: string; category: string };

const AREA_ALIASES: Record<string, PracticeArea> = {
  driving: "Driving",
  driver: "Driving",
  "tee shot": "Driving",
  "range-mat": "Driving",
  irons: "Irons",
  iron: "Irons",
  approach: "Irons",
  "range-grass": "Irons",
  "full swing": "Irons",
  wedges: "Wedges",
  wedge: "Wedges",
  "wedge play": "Wedges",
  chipping: "Chipping",
  "short game": "Chipping",
  "chipping-green": "Chipping",
  bunkers: "Bunkers",
  bunker: "Bunkers",
  "sand play": "Bunkers",
  putting: "Putting",
  "putting-green": "Putting",
  "on-course": "On-Course",
  "on course": "On-Course",
  "mental/strategy": "Mental/Strategy",
  mental: "Mental/Strategy",
  "mental game": "Mental/Strategy",
  strategy: "Mental/Strategy",
  home: "Mental/Strategy",
};

export function normalizePracticeArea(raw: string | null | undefined): PracticeArea | null {
  const key = String(raw ?? "").trim().toLowerCase();
  return key ? (AREA_ALIASES[key] ?? null) : null;
}

const COMBINE_CATEGORY_AREA: Record<CombineCategoryId, PracticeArea> = {
  Putting: "Putting",
  Chipping: "Chipping",
  Wedges: "Wedges",
  Irons: "Irons",
  "Tee Shot": "Driving",
  Bunkers: "Bunkers",
};

const COMBINE_AREA_BY_LABEL = new Map<string, PracticeArea>(
  COMBINE_TEST_CARDS.map((card) => [card.label, COMBINE_CATEGORY_AREA[card.category]]),
);

const DRILL_NOTE_PREFIX = "completed drill";

type PracticeRow = {
  id?: string | number;
  user_id?: string | null;
  type?: string | null;
  test_type?: string | null;
  notes?: unknown;
  duration_minutes?: unknown;
  completed_at?: string | null;
  created_at?: string | null;
};

/** "Driving Practice - 45 minutes" / "On-Course — 9 holes (60 minutes)" → "Driving Practice" / "On-Course — 9 holes". */
function sessionTitle(notes: string, area: PracticeArea | null): string {
  const cleaned = notes
    .replace(/\s*-\s*\d+\s*minutes?\s*$/i, "")
    .replace(/\s*\(\d+\s*minutes?\)\s*$/i, "")
    .trim();
  if (cleaned) return cleaned;
  return area ? `${area} practice` : "Practice session";
}

export function buildPracticeActivity({
  userId,
  practiceSessions,
  practiceLogs,
  libraryCompletions,
  drillCatalog,
}: {
  userId: string;
  practiceSessions: readonly unknown[] | null | undefined;
  practiceLogs: readonly unknown[] | null | undefined;
  libraryCompletions: readonly LibraryCompletionRow[];
  drillCatalog: ReadonlyMap<string, DrillCatalogEntry>;
}): PracticeActivityItem[] {
  const items: PracticeActivityItem[] = [];

  (practiceSessions || []).forEach((raw, idx) => {
    const row = raw as PracticeRow;
    if (!row || row.user_id !== userId || row.test_type) return;
    const notes = typeof row.notes === "string" ? row.notes.trim() : "";
    if (notes.startsWith("{") || notes.startsWith("[")) return;
    const at = String(row.completed_at || row.created_at || "");
    if (!at) return;
    const minutes = practiceSessionMinutesFromRow(row);
    const id = `practice-${row.id ?? idx}`;

    if (notes.toLowerCase().startsWith(DRILL_NOTE_PREFIX)) {
      const key = String(row.type ?? "").trim();
      const catalog = drillCatalog.get(key);
      const noteCategory = notes.split(":").slice(1).join(":").trim();
      // Older completions stored the drill title in `type`; newer ones store a catalog id (no spaces).
      items.push({
        id,
        kind: "drill",
        at,
        title: catalog?.title || (/\s/.test(key) ? key.replace(/\s+/g, " ") : "Drill"),
        area: normalizePracticeArea(catalog?.category) ?? normalizePracticeArea(noteCategory),
        minutes,
        refId: key,
      });
      return;
    }

    if (minutes <= 0) return;
    const area = normalizePracticeArea(row.type);
    items.push({ id, kind: "practice", at, title: sessionTitle(notes, area), area, minutes });
  });

  listUserCombineCompletionEvents({ userId, practiceSessions: [...(practiceSessions || [])], practiceLogs: [...(practiceLogs || [])] }).forEach(
    (event, idx) => {
      if (!event.at) return;
      items.push({
        id: `combine-${idx}-${event.at}`,
        kind: "combine",
        at: event.at,
        title: event.label,
        area: COMBINE_AREA_BY_LABEL.get(event.label) ?? null,
        minutes: 0,
      });
    },
  );

  for (const row of libraryCompletions) {
    if (row.user_id !== userId || !row.completed_at) continue;
    items.push({
      id: `video-${row.lesson_id}`,
      kind: "video",
      at: row.completed_at,
      title: row.lesson_title?.trim() || "Library lesson",
      area: null,
      minutes: 0,
      refId: row.lesson_id,
    });
  }

  return items
    .filter((i) => Number.isFinite(new Date(i.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export type PracticeRange = "week" | "month" | "all";

const DAY_MS = 86_400_000;

export function rangeStartMs(range: PracticeRange, now = new Date()): number {
  if (range === "all") return 0;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return startOfToday - (range === "week" ? 6 : 29) * DAY_MS;
}

export function itemsInRange(items: readonly PracticeActivityItem[], range: PracticeRange): PracticeActivityItem[] {
  const start = rangeStartMs(range);
  return items.filter((i) => new Date(i.at).getTime() >= start);
}

export type PracticeSummary = {
  minutes: number;
  drills: number;
  videos: number;
  combines: number;
  sessions: number;
  activeDays: number;
};

export function localDayKey(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function summarizePractice(items: readonly PracticeActivityItem[]): PracticeSummary {
  const days = new Set<string>();
  const summary: PracticeSummary = { minutes: 0, drills: 0, videos: 0, combines: 0, sessions: 0, activeDays: 0 };
  for (const i of items) {
    summary.minutes += i.minutes;
    if (i.kind === "drill") summary.drills += 1;
    else if (i.kind === "video") summary.videos += 1;
    else if (i.kind === "combine") summary.combines += 1;
    else summary.sessions += 1;
    days.add(localDayKey(i.at));
  }
  summary.activeDays = days.size;
  return summary;
}

export function minutesByArea(items: readonly PracticeActivityItem[]): Record<PracticeArea, number> {
  const out = Object.fromEntries(PRACTICE_AREAS.map((a) => [a, 0])) as Record<PracticeArea, number>;
  for (const i of items) {
    if (i.area && i.minutes > 0) out[i.area] += i.minutes;
  }
  return out;
}

/** Consecutive days with any activity, counting back from today (or yesterday if today is still empty). */
export function practiceStreakDays(items: readonly PracticeActivityItem[], now = new Date()): number {
  const days = new Set(items.map((i) => localDayKey(i.at)));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
