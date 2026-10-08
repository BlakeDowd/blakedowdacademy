import { NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/coachingServer";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { isCoachEmail } from "@/lib/coachEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** First name plus last initial, so juniors aren't shown by full name on leaderboards. */
function juniorDisplayName(first: string, last: string): string {
  const initial = last.charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

/** Placeholder sign-in address: juniors don't need an email, they're picked on the family device. */
const juniorEmail = () => `junior-${crypto.randomUUID()}@family.invalid`;

/**
 * Coach adds a child to a family: creates their player account (no email or password of their own),
 * their profile, and a coaching space so they show on the coach's Spaces screen.
 */
export async function POST(request: Request) {
  const caller = await resolveRequestUser(request);
  if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "Adding children needs SUPABASE_SERVICE_ROLE_KEY on the server." },
      { status: 503 },
    );
  }

  const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", caller.id).maybeSingle();
  const isCoach = isCoachEmail(caller.email) || (callerProfile?.role ?? "").trim().toLowerCase() === "coach";
  if (!isCoach) return NextResponse.json({ error: "Only coaches can add children." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { familyId?: string; firstName?: string; lastName?: string };
  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  if (!body.familyId || !firstName || firstName.length > 40 || lastName.length > 40) {
    return NextResponse.json({ error: "Enter the child's first name." }, { status: 400 });
  }

  const { data: family } = await admin.from("families").select("id").eq("id", body.familyId).maybeSingle();
  if (!family) return NextResponse.json({ error: "That family doesn't exist." }, { status: 404 });

  const fullName = juniorDisplayName(firstName, lastName);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: juniorEmail(),
    email_confirm: true,
    user_metadata: { full_name: fullName, junior: true },
  });
  const userId = created?.user?.id;
  if (createError || !userId) {
    return NextResponse.json({ error: createError?.message || "Couldn't create the player." }, { status: 500 });
  }

  const fail = async (message: string) => {
    await admin.from("family_members").delete().eq("user_id", userId);
    await admin.from("coaching_spaces").delete().eq("student_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: message }, { status: 500 });
  };

  const { error: profileError } = await admin.from("profiles").upsert({ id: userId, full_name: fullName }, { onConflict: "id" });
  if (profileError) return fail(profileError.message);

  const { error: memberError } = await admin
    .from("family_members")
    .insert({ family_id: body.familyId, user_id: userId, role: "player", managed: true });
  if (memberError) return fail(memberError.message);

  const { error: spaceError } = await admin.from("coaching_spaces").insert({
    coach_id: caller.id,
    student_id: userId,
    display_name: fullName,
    joined_at: new Date().toISOString(),
  });
  if (spaceError) return fail(spaceError.message);

  return NextResponse.json({ id: userId, name: fullName });
}
