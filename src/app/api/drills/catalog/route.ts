import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Full drill catalog for the app UI. Uses service role so reads work even when
 * Supabase RLS blocks the anon key (imports still land in DB via admin API).
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    return NextResponse.json(
      { drills: null, drill: null, degraded: true },
      { status: 200 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const admin = createClient(url, serviceKey);

  if (id) {
    const { data, error } = await admin.from("drills").select("*").eq("id", id).maybeSingle();
    if (error) {
      return NextResponse.json({ drill: null, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ drill: data, drills: null });
  }

  const { data, error } = await admin.from("drills").select("*");
  if (error) {
    return NextResponse.json({ drills: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drills: data ?? [], drill: null });
}
