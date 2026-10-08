import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/coachingServer";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lets a family share one device: returns a one-time sign-in token for another member of a family
 * the caller belongs to. The browser exchanges it for that player's session.
 */
export async function POST(request: Request) {
  try {
    const caller = await resolveRequestUser(request);
    if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

    const admin = createServiceRoleSupabase();
    if (!admin) {
      return NextResponse.json(
        { error: "Family switching needs SUPABASE_SERVICE_ROLE_KEY on the server." },
        { status: 503 },
      );
    }

    const { playerId } = (await request.json().catch(() => ({}))) as { playerId?: string };
    if (!playerId || !/^[0-9a-f-]{36}$/i.test(playerId) || playerId === caller.id) {
      return NextResponse.json({ error: "Pick someone else in your family." }, { status: 400 });
    }

    const { data: mine, error: mineError } = await admin
      .from("family_members")
      .select("family_id")
      .eq("user_id", caller.id);
    if (mineError) return NextResponse.json({ error: mineError.message }, { status: 500 });
    const familyIds = (mine ?? []).map((r) => r.family_id as string);
    if (!familyIds.length) {
      return NextResponse.json({ error: "You're not in a family." }, { status: 403 });
    }

    const { data: shared, error: sharedError } = await admin
      .from("family_members")
      .select("family_id")
      .eq("user_id", playerId)
      .in("family_id", familyIds)
      .limit(1);
    if (sharedError) return NextResponse.json({ error: sharedError.message }, { status: 500 });
    if (!shared?.length) {
      return NextResponse.json({ error: "That player isn't in your family." }, { status: 403 });
    }

    const { data: target, error: targetError } = await admin.auth.admin.getUserById(playerId);
    const email = target?.user?.email;
    if (targetError || !email) {
      return NextResponse.json({ error: "That player's account couldn't be found." }, { status: 404 });
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      return NextResponse.json({ error: linkError?.message || "Couldn't switch player." }, { status: 500 });
    }

    return NextResponse.json({ tokenHash });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't switch player." }, { status: 500 });
  }
}
