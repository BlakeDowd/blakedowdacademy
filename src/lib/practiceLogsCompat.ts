import { formatSupabaseWriteError } from "@/lib/formatSupabaseWriteError";

type PracticeLogInsertRow = Record<string, unknown>;

function omitKeys(row: PracticeLogInsertRow, keys: string[]): PracticeLogInsertRow {
  const out: PracticeLogInsertRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (!keys.includes(k)) out[k] = v;
  }
  return out;
}

/**
 * Insert into `practice_logs` with progressive fallbacks for older schemas.
 * This prevents new combines from breaking when optional columns (e.g. metadata, strike_data, notes, score)
 * are missing in a deployment that has not applied all migrations yet.
 */
export async function insertPracticeLogCompat(
  supabase: any,
  row: PracticeLogInsertRow,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const variants: PracticeLogInsertRow[] = [
    row,
    omitKeys(row, ["metadata"]),
    omitKeys(row, ["metadata", "strike_data", "distance_data", "start_line_data", "sub_type", "notes"]),
    omitKeys(row, ["metadata", "strike_data", "distance_data", "start_line_data", "sub_type", "notes", "score"]),
    omitKeys(
      row,
      ["metadata", "strike_data", "distance_data", "start_line_data", "sub_type", "notes", "score", "total_points"],
    ),
  ];

  let lastMsg = "Unknown practice_logs insert failure.";
  for (const v of variants) {
    const { error } = await supabase.from("practice_logs").insert(v);
    if (!error) return { ok: true };
    lastMsg = formatSupabaseWriteError(error);
  }
  return { ok: false, message: lastMsg };
}
