/**
 * Re-upload drills from CSV to Supabase (ID-based upsert with descriptions)
 * Usage: node scripts/reupload_drills.mjs
 * CSV path: c:\Users\Owner\Downloads\Drill List App - Sheet1 (2).csv
 *
 * NOTE: This script uses the anon key and may fail with RLS. For best results,
 * use the Admin page in the app (while logged in): go to /admin, then
 * "Choose CSV File" under "Upsert Drill Library via CSV" and select the same file.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function generateUUID(str) {
  const hash = crypto.createHash("md5").update(str).digest("hex");
  return [hash.slice(0, 8), hash.slice(8, 12), "4" + hash.slice(13, 16), "8" + hash.slice(17, 20), hash.slice(20, 32)].join("-");
}

const CSV_PATH = "C:\\Users\\Owner\\Downloads\\Drill List App - Sheet1 (2).csv";

function parseCSV(text) {
  const result = [];
  let currentLine = [];
  let currentString = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentString += '"';
          i++;
        } else inQuotes = false;
      } else currentString += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ",") {
        currentLine.push(currentString);
        currentString = "";
      } else if (char === "\n") {
        currentLine.push(currentString);
        result.push(currentLine);
        currentLine = [];
        currentString = "";
      } else if (char !== "\r") currentString += char;
    }
  }
  if (currentString !== "" || currentLine.length > 0) {
    currentLine.push(currentString);
    result.push(currentLine);
  }
  return result;
}

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  const env = fs.readFileSync(envPath, "utf-8");
  const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
  return {
    url: urlMatch ? urlMatch[1].trim() : "",
    key: keyMatch ? keyMatch[1].trim() : "",
  };
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const { url, key } = loadEnv();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }

  const csvText = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(csvText);
  if (rows.length < 2) {
    console.error("CSV has no data rows");
    process.exit(1);
  }

  const drills = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const rawId = (row[0] || "").trim();
    const drillName = (row[1] || "").trim();
    if (!drillName) continue;
    const description = (row[6] || "").trim();
    const goal = (row[9] || "").trim();

    const id = rawId ? generateUUID(rawId) : crypto.randomUUID();
    drills.push({
      id,
      title: drillName,
      category: (row[2] || "").trim() || "Practice",
      description: description || null,
      pdf_url: (row[7] || "").trim() || null,
      video_url: (row[8] || "").trim() || null,
      created_at: new Date().toISOString(),
    });
  }

  console.log(`Parsed ${drills.length} drills from CSV. Upserting to Supabase...`);

  const supabase = createClient(url, key);

  supabase
    .from("drills")
    .upsert(drills, { onConflict: "id", ignoreDuplicates: false })
    .select("id")
    .then(({ data, error }) => {
      if (error) {
        console.error("Upload failed:", error.message);
        process.exit(1);
      }
      console.log(`Done. ${drills.length} drills upserted.`);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}

main();
