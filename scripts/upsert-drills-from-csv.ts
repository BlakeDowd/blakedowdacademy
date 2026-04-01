/**
 * Upsert drills from CSV into Supabase (same logic as Admin CSV upload).
 *
 * Usage:
 *   npm run drills:upsert
 *   npm run drills:upsert -- "C:\\path\\to\\file.csv"
 *
 * Easiest: log in as admin → /admin → choose CSV (uses the same import on the server).
 *
 * CLI needs .env.local: NEXT_PUBLIC_SUPABASE_URL and either
 * SUPABASE_SERVICE_ROLE_KEY (recommended) or NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *
 * CSV columns: Drill id, Drill Name, Category, Location, Focus, Duration (min),
 * Description, PDF URL, YouTube Link, Goal/Reps, XP, Equipment
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseDrillCSV, upsertDrillsFromCSV } from "../src/lib/csvDrillUpload";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const csvPath =
    process.argv[2] ??
    path.join(process.cwd(), "data", "drill-list-import.csv");

  if (!fs.existsSync(csvPath)) {
    console.error("CSV not found:", csvPath);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error(
      "Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)"
    );
    process.exit(1);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "\nNote: Using anon key — Supabase often blocks writes (RLS). Either:\n" +
        "  • Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Dashboard → Settings → API → service_role), then run again.\n" +
        "  • Or log into the app → Admin page → upload the same CSV (needs migration allow_authenticated_drills_upsert.sql if that fails).\n"
    );
  }

  const text = fs.readFileSync(csvPath, "utf8");
  const parsed = parseDrillCSV(text);

  if (parsed.length === 0) {
    console.error("No drills parsed from CSV.");
    process.exit(1);
  }

  console.log(
    `Parsed ${parsed.length} drills (duplicates in CSV collapsed by drill id / name).`
  );
  console.log("Using CSV:", csvPath);

  const supabase = createClient(url, key);
  const result = await upsertDrillsFromCSV({ supabase, parsed });

  const { count: tableCount, error: countErr } = await supabase
    .from("drills")
    .select("*", { count: "exact", head: true });

  console.log("Upsert complete:", {
    added: result.added,
    updated: result.updated,
    skipped: result.skipped,
    removedDuplicates: result.removed ?? 0,
  });
  console.log(
    countErr
      ? `(Could not read drills count: ${countErr.message})`
      : `Drills in database now (total rows): ${tableCount ?? "?"}`
  );
  console.log(
    "Note: “added” / “updated” compare to rows fetched before this run, not Supabase UI labels. A second identical import should show mostly “updated” if writes succeeded."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
