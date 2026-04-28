import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const dynamic = "force-dynamic";

/**
 * Fallback catalog when the browser cannot read `drills` (RLS). Optional on Vercel if you run
 * supabase/migrations/20260401120000_drills_public_select.sql once.
 */
export async function GET(request: Request) {
  const admin = createServiceRoleSupabase();

  if (!admin) {
    console.warn(
      "[drills/catalog] No SUPABASE_SERVICE_ROLE_KEY — this route is optional if public SELECT on drills is enabled (see supabase/migrations/20260401120000_drills_public_select.sql)."
    );
    return NextResponse.json(
      { drills: null, drill: null, degraded: true },
      { status: 200 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const byPk = await admin.from("drills").select("*").eq("id", id).maybeSingle();
    if (byPk.error) {
      return NextResponse.json({ drill: null, error: byPk.error.message }, { status: 500 });
    }
    let data = byPk.data;
    if (!data) {
      const byCode = await admin.from("drills").select("*").eq("drill_id", id).maybeSingle();
      if (byCode.error) {
        return NextResponse.json({ drill: null, error: byCode.error.message }, { status: 500 });
      }
      data = byCode.data;
    }
    return NextResponse.json({ drill: data, drills: null });
  }

  const { data, error } = await admin.from("drills").select("*");
  if (error) {
    return NextResponse.json({ drills: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drills: data ?? [], drill: null });
}
