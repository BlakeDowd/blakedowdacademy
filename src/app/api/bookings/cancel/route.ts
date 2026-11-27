import { NextResponse } from "next/server";
import { bookingResponse } from "@/lib/booking/errors";
import { previewOrCancel } from "@/lib/booking/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim() || "";
    if (token.length < 16) return NextResponse.json({ error: "This link is not a booking." }, { status: 400 });
    const result = await previewOrCancel(token, false);
    return NextResponse.json(result);
  } catch (error) {
    return bookingResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
    const token = String(body?.token ?? "").trim();
    if (token.length < 16) return NextResponse.json({ error: "This link is not a booking." }, { status: 400 });
    const result = await previewOrCancel(token, true);
    return NextResponse.json(result);
  } catch (error) {
    return bookingResponse(error);
  }
}
