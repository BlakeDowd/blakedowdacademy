/**
 * CSV Drill Upload - ID-based upsert with duplicate prevention
 * CSV columns: Drill id, Drill Name, Category, Location, Focus, Duration (min), Description, PDF URL, YouTube Link, Goal/Reps, XP, Equipment
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
  title: string;
  category: string;
  focus: string | null;
  description: string | null;
  pdf_url: string | null;
  video_url: string | null;
  goal: string | null;
  estimated_minutes: number;
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
 * Parse CSV file content into drill rows.
 * Expected columns: Drill id, Drill Name, Category, Location, Focus, Duration (min), Description, PDF URL, YouTube Link, Goal/Reps, XP, Equipment
 */
export function parseDrillCSV(csvText: string): ParsedDrillRow[] {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  const drills: ParsedDrillRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const rawId = (row[0] || "").trim();
    const drillName = (row[1] || "").trim();
    if (!drillName) continue;

    const duration = parseInt((row[5] || "10").toString(), 10) || 10;
    const xp = parseInt((row[10] || "10").toString(), 10) || 10;

    drills.push({
      id: rawId || null,
      drillName,
      category: (row[2] || "").trim() || "Practice",
      location: (row[3] || "").trim(),
      focus: (row[4] || "").trim(),
      durationMinutes: Math.max(1, Math.min(480, duration)),
      description: (row[6] || "").trim(),
      pdfUrl: (row[7] || "").trim() || null,
      youtubeUrl: (row[8] || "").trim() || null,
      goal: (row[9] || "").trim(),
      xp,
      equipment: (row[11] || "").trim(),
    });
  }

  return drills;
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
    title: row.drillName,
    category: row.category,
    focus: row.focus || null,
    description: row.description || null,
    pdf_url: row.pdfUrl,
    video_url: row.youtubeUrl,
    goal: row.goal || null,
    estimated_minutes: row.durationMinutes,
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

  // Fetch existing drills: id and title for duplicate/lookup
  const { data: existingDrills, error: fetchError } = await supabase
    .from("drills")
    .select("id, title");

  if (fetchError) {
    throw new Error(`Failed to fetch existing drills: ${fetchError.message}`);
  }

  const existingById = new Map<string, { id: string; title: string }>();
  const existingByTitle = new Map<string, string>(); // title (lower) -> id

  (existingDrills || []).forEach((d: { id: string; title: string }) => {
    existingById.set(d.id, d);
    if (d.title) {
      existingByTitle.set(d.title.trim().toLowerCase(), d.id);
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
      const matchedId = existingByTitle.get(nameKey);
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
