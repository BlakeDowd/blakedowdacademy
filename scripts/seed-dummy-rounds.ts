/**
 * Insert sample logged rounds for local stats / deep-dive development.
 *
 *   npm run rounds:seed -- your@email.com
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase → Settings → API → service_role).
 * Easier option: open /stats while logged in and click "Load sample rounds".
 */

import * as fs from "fs";
import * as path from "path";
import { buildDummyRoundsForUser } from "../src/lib/seedDummyRounds";
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

async function resolveUserIdByEmail(
  email: string,
): Promise<{ id: string; email: string } | null> {
  const supabase = createServiceRoleSupabase();
  if (!supabase) return null;

  const target = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match?.id) {
      return { id: match.id, email: match.email ?? email };
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const email = process.argv[2]?.trim();
  if (!email) {
    console.error("Pass your login email: npm run rounds:seed -- your@email.com");
    console.error("Or open /stats while logged in and click Load sample rounds.");
    process.exit(1);
  }

  const supabase = createServiceRoleSupabase();
  if (!supabase) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase → Settings → API → service_role).",
    );
    process.exit(1);
  }

  const user = await resolveUserIdByEmail(email);
  if (!user) {
    console.error(`No auth user found for email: ${email}`);
    process.exit(1);
  }

  const rows = buildDummyRoundsForUser(user.id);
  const { data, error } = await supabase
    .from("rounds")
    .insert(rows)
    .select("id, date, course_name, score, holes");

  if (error) {
    console.error("Insert failed:", error.message);
    if (error.code) console.error("Code:", error.code);
    if (error.details) console.error("Details:", error.details);
    process.exit(1);
  }

  console.log(`Seeded ${data?.length ?? 0} dummy round(s) for ${user.email} (${user.id}):`);
  for (const row of data ?? []) {
    console.log(`  • ${row.date} — ${row.course_name} — ${row.score} (${row.holes} holes) [${row.id}]`);
  }
  console.log("\nRefresh /stats and /scores in the app to see the data.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
