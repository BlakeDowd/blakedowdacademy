import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseDrillCSV, upsertDrillsFromCSV } from "@/lib/csvDrillUpload";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const dynamic = "force-dynamic";

/** Must match `ADMIN_EMAIL` on the admin page. */
function expectedAdminEmail(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAIL || "your-email@example.com")
    .trim()
    .toLowerCase();
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { error: "Server missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY." },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* ignore */
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  const expected = expectedAdminEmail();
  if (!user?.email || user.email.trim().toLowerCase() !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  const adminClient = createServiceRoleSupabase();
  if (!adminClient) {
    return NextResponse.json(
      {
        error:
          "Set SUPABASE_SERVICE_ROLE_KEY in Vercel (or .env.local), redeploy, then upload again.",
      },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing CSV file (field name: file)." }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseDrillCSV(text);
  if (parsed.length === 0) {
    return NextResponse.json(
      { error: "No drills parsed. Check column headers match the template." },
      { status: 400 }
    );
  }

  try {
    const result = await upsertDrillsFromCSV({ supabase: adminClient, parsed });
    const { count: tableCount, error: countErr } = await adminClient
      .from("drills")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({
      ok: true,
      added: result.added,
      updated: result.updated,
      skipped: result.skipped,
      removed: result.removed ?? 0,
      parsed: parsed.length,
      totalRowsInTable: countErr ? null : tableCount,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
