/**
 * CSV Drill Upload - ID-based upsert with duplicate prevention
 * CSV columns: Drill id, Drill Name, Category, Location, Focus, Duration (min), Description, PDF URL, YouTube Link, Goal/Reps, XP, Equipment
 *
 * Unique key: Drill id (or Drill Name when id is missing).
 * - Upsert: If drill exists in DB, overwrite. If new, add.
 * - CSV deduplication: Exact duplicate rows (same unique key) are collapsed; only the last occurrence is imported.
 *
 * Database `id` is UUID: CSV codes like PUTT-GATE-001 are converted with the same MD5→UUID mapping as import_drills.mjs.
 */

import md5 from "md5";

export interface ParsedDrillRow {
  id: string | null;
  drillName: string;
  category: string;
  location: string;
  focus: string;
  durationMinutes: number;
  description: string;
  pdfUrl: string | null;
  youtubeUrl: string | null;
  goal: string;
  xp: number;
  equipment: string;
}

export interface DrillUpsertPayload {
  id: string;
  /** Stable human drill code from CSV (e.g. PUTT-GATE-001), when table has drill_id column */
  drill_id?: string | null;
  drill_name: string;
  title: string; // Alias for drill_name (Supabase may use title)
  description: string;
  category: string;
  focus: string | null;
  pdf_url: string | null;
  video_url: string | null;
  goal: string | null;
  goal_reps: string | null;
  estimated_minutes: number;
  xp_value: number;
  drill_levels: string | null;
  created_at: string;
}

export interface UploadResult {
  updated: number;
  added: number;
  skipped: number;
  /** Rows removed to avoid duplicate drill_name with a different id (e.g. old UUID vs CSV code id) */
  removed?: number;
}

function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let currentLine: string[] = [];
  let currentString = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentString += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentString += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentLine.push(currentString);
        currentString = "";
      } else if (char === "\n") {
        currentLine.push(currentString);
        result.push(currentLine);
        currentLine = [];
        currentString = "";
      } else if (char !== "\r") {
        currentString += char;
      }
    }
  }

  if (currentString !== "" || currentLine.length > 0) {
    currentLine.push(currentString);
    result.push(currentLine);
  }

  return result;
}

/**
 * Get the unique key for a parsed row (Drill id if present, else Drill Name).
 */
function getUniqueKey(row: ParsedDrillRow): string {
  if (row.id && row.id.trim()) return row.id.trim();
  return row.drillName.trim().toLowerCase();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Same mapping as import_drills.mjs / legacy seed (deterministic per drill code). */
export function drillCsvCodeToUuid(code: string): string {
  const hash = md5(code.trim());
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    "4" + hash.substring(13, 16),
    "8" + hash.substring(17, 20),
    hash.substring(20, 32),
  ].join("-");
}

export function resolveDrillPrimaryKey(csvId: string | null): string {
  if (!csvId || !csvId.trim()) return "";
  const raw = csvId.trim();
  if (UUID_RE.test(raw)) return raw;
  return drillCsvCodeToUuid(raw);
}

/**
 * Deduplicate parsed rows by unique key. For duplicate keys, keep the last occurrence (last wins).
 */
function deduplicateByUniqueKey(drills: ParsedDrillRow[]): ParsedDrillRow[] {
  const byKey = new Map<string, ParsedDrillRow>();
  for (const row of drills) {
    const key = getUniqueKey(row);
    byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

/** Column indices for CSV (0-based). Description is column 6. */
const CSV_COLS = {
  DRILL_ID: 0,
  DRILL_NAME: 1,
  CATEGORY: 2,
  LOCATION: 3,
  FOCUS: 4,
  DURATION: 5,
  DESCRIPTION: 6,
  PDF_URL: 7,
  YOUTUBE_LINK: 8,
  GOAL_REPS: 9,
  XP: 10,
  EQUIPMENT: 11,
} as const;

/**
 * Parse CSV file content into drill rows.
 * Expected columns: Drill id, Drill Name, Category, Location, Focus, Duration (min), Description, PDF URL, YouTube Link, Goal/Reps, XP, Equipment
 * Duplicate rows (same Drill id or Drill Name) are collapsed; only the last occurrence is kept.
 */
export function parseDrillCSV(csvText: string): ParsedDrillRow[] {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  const drills: ParsedDrillRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const rawId = (row[CSV_COLS.DRILL_ID] || "").trim();
    const drillName = (row[CSV_COLS.DRILL_NAME] || "").trim();
    if (!drillName) continue;

    const duration = parseInt((row[CSV_COLS.DURATION] || "10").toString(), 10) || 10;
    const xp = parseInt((row[CSV_COLS.XP] || "10").toString(), 10) || 10;
    const description = (row[CSV_COLS.DESCRIPTION] ?? "").trim();

    drills.push({
      id: rawId || null,
      drillName,
      category: (row[CSV_COLS.CATEGORY] || "").trim() || "Practice",
      location: (row[CSV_COLS.LOCATION] || "").trim(),
      focus: (row[CSV_COLS.FOCUS] || "").trim(),
      durationMinutes: Math.max(1, Math.min(480, duration)),
      description,
      pdfUrl: (row[CSV_COLS.PDF_URL] || "").trim() || null,
      youtubeUrl: (row[CSV_COLS.YOUTUBE_LINK] || "").trim() || null,
      goal: (row[CSV_COLS.GOAL_REPS] || "").trim(),
      xp,
      equipment: (row[CSV_COLS.EQUIPMENT] || "").trim(),
    });
  }

  return deduplicateByUniqueKey(drills);
}

/**
 * Convert parsed row to Supabase payload.
 */
function toSupabasePayload(
  row: ParsedDrillRow,
  resolvedId: string
): DrillUpsertPayload {
  const drillLevels = row.goal
    ? JSON.stringify([{ id: "goal-1", name: `Goal: ${row.goal}`, completed: false }])
    : null;

  const csvCode = row.id?.trim() || null;
  const humanDrillId =
    csvCode && !UUID_RE.test(csvCode) ? csvCode : null;

  return {
    id: resolvedId,
    drill_id: humanDrillId,
    drill_name: row.drillName,
    title: row.drillName,
    description: (row.description && String(row.description).trim()) ? row.description.trim() : "",
    category: row.category,
    focus: row.focus || null,
    pdf_url: row.pdfUrl,
    video_url: row.youtubeUrl,
    goal: row.goal || null,
    goal_reps: row.goal?.trim() ? row.goal.trim() : null,
    estimated_minutes: row.durationMinutes,
    xp_value: row.xp,
    drill_levels: drillLevels,
    created_at: new Date().toISOString(),
  };
}

/**
 * Generate a slug-style ID for new drills (when CSV has no ID).
 */
function generateSlugId(drillName: string, index: number): string {
  const slug = drillName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `NEW-${slug}-${index}`.slice(0, 40);
}

export interface UpsertDrillsOptions {
  supabase: any;
  parsed: ParsedDrillRow[];
}

/** Columns used when the drills table is empty (no sample row to inspect). Omit drill_name for legacy schemas. */
const DRILL_COLUMNS_WHEN_EMPTY = new Set([
  "id",
  "title",
  "drill_id",
  "description",
  "category",
  "focus",
  "pdf_url",
  "video_url",
  "goal",
  "goal_reps",
  "estimated_minutes",
  "estimatedMinutes",
  "xp_value",
  "xpValue",
  "drill_levels",
  "created_at",
]);

function getDisplayNameFromRow(d: Record<string, unknown>): string {
  const dn = d.drill_name ?? d.title;
  return dn != null ? String(dn).trim() : "";
}

/**
 * Build upsert object from full payload, only including columns that exist in the table.
 */
function filterDrillPayloadForSchema(
  p: DrillUpsertPayload,
  colSet: Set<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (colSet.has("id")) out.id = p.id;
  if (colSet.has("drill_id") && p.drill_id != null) {
    out.drill_id = p.drill_id;
  }
  if (colSet.has("drill_name")) out.drill_name = p.drill_name;
  if (colSet.has("title")) out.title = p.title;
  if (colSet.has("description")) out.description = p.description;
  if (colSet.has("category")) out.category = p.category;
  if (colSet.has("focus")) out.focus = p.focus;
  if (colSet.has("pdf_url")) out.pdf_url = p.pdf_url;
  if (colSet.has("video_url")) out.video_url = p.video_url;
  if (colSet.has("goal")) out.goal = p.goal;
  if (colSet.has("goal_reps")) out.goal_reps = p.goal_reps;
  if (colSet.has("estimated_minutes")) {
    out.estimated_minutes = p.estimated_minutes;
  } else if (colSet.has("estimatedMinutes")) {
    out.estimatedMinutes = p.estimated_minutes;
  }
  if (colSet.has("xp_value")) {
    out.xp_value = p.xp_value;
  } else if (colSet.has("xpValue")) {
    out.xpValue = p.xp_value;
  }
  if (colSet.has("drill_levels")) out.drill_levels = p.drill_levels;
  if (colSet.has("created_at")) out.created_at = p.created_at;
  return out;
}

/**
 * Upsert drills to Supabase by ID (unique key):
 * - If the CSV row has an ID: Update the record in Supabase (fixes spelling/typos without deleting).
 * - If the ID is missing: Insert a new record (or link to existing by drill_name to avoid duplicates).
 */
export async function upsertDrillsFromCSV({
  supabase,
  parsed,
}: UpsertDrillsOptions): Promise<UploadResult> {
  const result: UploadResult = { updated: 0, added: 0, skipped: 0 };

  if (parsed.length === 0) return result;

  const { data: sampleRows, error: sampleError } = await supabase
    .from("drills")
    .select("*")
    .limit(1);

  if (sampleError) {
    throw new Error(`Failed to read drills schema: ${sampleError.message}`);
  }

  // Union with known columns: if the table was created before `goal` / `drill_levels` existed, the
  // sample row may omit them and we would otherwise strip those fields from every upsert (silent data loss).
  const colSet: Set<string> =
    sampleRows && sampleRows.length > 0
      ? new Set([...Object.keys(sampleRows[0] as object), ...Array.from(DRILL_COLUMNS_WHEN_EMPTY)])
      : DRILL_COLUMNS_WHEN_EMPTY;

  const nameSelectFields = ["drill_name", "title"].filter((f) => colSet.has(f));
  const selectExisting =
    nameSelectFields.length > 0
      ? `id,${nameSelectFields.join(",")}`
      : "id";

  const { data: existingDrills, error: fetchError } = await supabase
    .from("drills")
    .select(selectExisting);

  if (fetchError) {
    throw new Error(`Failed to fetch existing drills: ${fetchError.message}`);
  }

  const existingById = new Map<string, { id: string; drill_name: string }>();
  const existingByDrillName = new Map<string, string>(); // drill_name (lower) -> id (one representative)
  const idsByDrillName = new Map<string, string[]>(); // all ids sharing the same display name

  (existingDrills || []).forEach((d: Record<string, unknown>) => {
    const id = String(d.id ?? "");
    const name = getDisplayNameFromRow(d);
    existingById.set(id, { id, drill_name: name });
    if (name) {
      const key = name.toLowerCase();
      existingByDrillName.set(key, id);
      const list = idsByDrillName.get(key) ?? [];
      list.push(id);
      idsByDrillName.set(key, list);
    }
  });

  const toUpsert: DrillUpsertPayload[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    let resolvedId: string;

    if (row.id && row.id.trim()) {
      resolvedId = resolveDrillPrimaryKey(row.id);
    } else {
      // No ID: check for exact drill_name match
      const nameKey = row.drillName.trim().toLowerCase();
      const matchedId = existingByDrillName.get(nameKey);
      if (matchedId) {
        // Link to existing record - update instead of insert
        resolvedId = matchedId;
      } else {
        // New drill - generate ID
        resolvedId = resolveDrillPrimaryKey(generateSlugId(row.drillName, i));
      }
    }

    const payload = toSupabasePayload(row, resolvedId);
    toUpsert.push(payload);
  }

  // One payload per id (last wins if CSV somehow repeated the same id)
  const uniqueById = new Map<string, DrillUpsertPayload>();
  for (const p of toUpsert) {
    uniqueById.set(p.id, p);
  }
  const uniqueUpsertsById = Array.from(uniqueById.values());

  // DB enforces unique title (e.g. unique_drill_title_v2). Different CSV ids can share the same
  // drill name — keep one row per title (last occurrence in batch wins) so the batch upsert succeeds.
  const byTitle = new Map<string, DrillUpsertPayload>();
  const noTitlePayloads: DrillUpsertPayload[] = [];
  for (const p of uniqueUpsertsById) {
    const tk = String(p.drill_name || p.title || "").trim().toLowerCase();
    if (!tk) {
      noTitlePayloads.push(p);
      continue;
    }
    byTitle.set(tk, p);
  }
  const finalUpserts = [...noTitlePayloads, ...byTitle.values()];

  const filteredUpserts = finalUpserts.map((p) =>
    filterDrillPayloadForSchema(p, colSet)
  );

  // Remove stale rows: same drill_name as an incoming row but different id (prevents UUID + code-id duplicates)
  const idsToDelete = new Set<string>();
  const finalIds = new Set(finalUpserts.map((p) => p.id));
  for (const p of uniqueUpsertsById) {
    if (!finalIds.has(p.id)) idsToDelete.add(p.id);
  }
  for (const p of finalUpserts) {
    const nameKey = String(p.drill_name || p.title || "").trim().toLowerCase();
    if (!nameKey) continue;
    for (const existingId of idsByDrillName.get(nameKey) ?? []) {
      if (existingId !== p.id) {
        idsToDelete.add(existingId);
      }
    }
  }

  if (idsToDelete.size > 0) {
    const { error: delError } = await supabase
      .from("drills")
      .delete()
      .in("id", [...idsToDelete]);
    if (delError) {
      throw new Error(`Failed to remove duplicate-name drills: ${delError.message}`);
    }
    result.removed = idsToDelete.size;
  }

  // Single upsert: id is unique key (drill_id from CSV). Updates existing, inserts new. Zero duplicates.
  const { data, error } = await supabase
    .from("drills")
    .upsert(filteredUpserts, {
      onConflict: "id",
      ignoreDuplicates: false,
    })
    .select("id");

  if (error) {
    throw new Error(`Failed to upsert drills: ${error.message}`);
  }

  // Determine added vs updated
  for (const p of finalUpserts) {
    if (existingById.has(p.id)) {
      result.updated++;
    } else {
      result.added++;
    }
  }

  return result;
}
