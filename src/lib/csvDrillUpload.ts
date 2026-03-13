/**
 * CSV Drill Upload - ID-based upsert with duplicate prevention
 * CSV columns: Drill id, Drill Name, Category, Location, Focus, Duration (min), Description, PDF URL, YouTube Link, Goal/Reps, XP, Equipment
 *
 * Unique key: Drill id (or Drill Name when id is missing).
 * - Upsert: If drill exists in DB, overwrite. If new, add.
 * - CSV deduplication: Exact duplicate rows (same unique key) are collapsed; only the last occurrence is imported.
 */

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
  drill_name: string;
  description: string;
  category: string;
  focus: string | null;
  pdf_url: string | null;
  video_url: string | null;
  goal: string | null;
  estimated_minutes: number;
  xp_value: number;
  drill_levels: string | null;
  created_at: string;
}

export interface UploadResult {
  updated: number;
  added: number;
  skipped: number;
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

  return {
    id: resolvedId,
    drill_name: row.drillName,
    description: (row.description && String(row.description).trim()) ? row.description.trim() : "",
    category: row.category,
    focus: row.focus || null,
    pdf_url: row.pdfUrl,
    video_url: row.youtubeUrl,
    goal: row.goal || null,
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

  // Fetch existing drills: id and drill_name for duplicate/lookup
  const { data: existingDrills, error: fetchError } = await supabase
    .from("drills")
    .select("id, drill_name");

  if (fetchError) {
    throw new Error(`Failed to fetch existing drills: ${fetchError.message}`);
  }

  const existingById = new Map<string, { id: string; drill_name: string }>();
  const existingByDrillName = new Map<string, string>(); // drill_name (lower) -> id

  (existingDrills || []).forEach((d: { id: string; drill_name?: string }) => {
    const name = d.drill_name ?? (d as any).title;
    existingById.set(d.id, { id: d.id, drill_name: name || "" });
    if (name && String(name).trim()) {
      existingByDrillName.set(String(name).trim().toLowerCase(), d.id);
    }
  });

  const toUpsert: DrillUpsertPayload[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    let resolvedId: string;

    if (row.id && row.id.trim()) {
      // ID provided: use it (upsert)
      resolvedId = row.id.trim();
    } else {
      // No ID: check for exact drill_name match
      const nameKey = row.drillName.trim().toLowerCase();
      const matchedId = existingByDrillName.get(nameKey);
      if (matchedId) {
        // Link to existing record - update instead of insert
        resolvedId = matchedId;
      } else {
        // New drill - generate ID
        resolvedId = generateSlugId(row.drillName, i);
      }
    }

    const payload = toSupabasePayload(row, resolvedId);
    toUpsert.push(payload);
  }

  // Batch upsert (Supabase upsert uses onConflict)
  const { data, error } = await supabase
    .from("drills")
    .upsert(toUpsert, {
      onConflict: "id",
      ignoreDuplicates: false,
    })
    .select("id");

  if (error) {
    throw new Error(`Failed to upsert drills: ${error.message}`);
  }

  // Ensure description is written: explicit update for drills with non-empty descriptions
  // (handles cases where batch upsert may not update all columns)
  const withDesc = toUpsert.filter((p) => p.description && p.description.trim());
  if (withDesc.length > 0) {
    for (const p of withDesc) {
      await supabase
        .from("drills")
        .update({ description: p.description })
        .eq("id", p.id);
    }
  }

  // Determine added vs updated
  const insertedIds = new Set((data || []).map((r: { id: string }) => r.id));
  for (const p of toUpsert) {
    if (existingById.has(p.id)) {
      result.updated++;
    } else {
      result.added++;
    }
  }

  return result;
}
