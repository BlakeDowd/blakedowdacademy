/**
 * Upsert drills from CSV (same as Admin → CSV on the web).
 *
 *   npm run drills:upsert
 *   npm run drills:upsert -- "C:\\path\\to\\file.csv"
 *
 * Writes need SUPABASE_SERVICE_ROLE_KEY in .env.local (or use /admin upload on Vercel with that key set).
 * Showing drills on phones/production: run supabase/migrations/20260401120000_drills_public_select.sql once
 * in the Supabase SQL editor, then only NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel.
 *
 * CSV: Drill id, Drill Name, Category, Location, Focus, Duration (min), Description, PDF URL,
 * YouTube Link, Goal/Reps, XP, Equipment
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseDrillCSV, upsertDrillsFromCSV } from "../src/lib/csvDrillUpload";
import { createServiceRoleSupabase } from "../src/lib/supabaseServiceRole";

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
  if (!url) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
    process.exit(1);
  }

  let supabase = createServiceRoleSupabase();
  if (!supabase) {
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anon) {
      console.error(
        "Add SUPABASE_SERVICE_ROLE_KEY to .env.local for upserts (Supabase → Settings → API → service_role)."
      );
      process.exit(1);
    }
    console.warn("Using anon key — writes often fail on RLS. Prefer SUPABASE_SERVICE_ROLE_KEY.");
    supabase = createClient(url, anon);
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
