import { NextResponse } from "next/server";
import { coachCancel, requireCoach } from "@/lib/booking/admin";
import { bookingResponse } from "@/lib/booking/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireCoach(request);
  if (!user) return NextResponse.json({ error: "Sign in as the coach to change the diary." }, { status: 401 });
  try {
    const { id } = await context.params;
    await coachCancel(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return bookingResponse(error);
  }
}
