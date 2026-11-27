import { NextResponse } from "next/server";
import { bookingResponse, publicOrigin } from "@/lib/booking/errors";
import { listSlots } from "@/lib/booking/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("offer")?.trim() || "";
    if (!slug) return NextResponse.json({ error: "Choose a lesson." }, { status: 400 });
    const days = await listSlots(slug, url.searchParams.get("from"), url.searchParams.get("days"), publicOrigin(request));
    return NextResponse.json(days);
  } catch (error) {
    return bookingResponse(error);
  }
}
