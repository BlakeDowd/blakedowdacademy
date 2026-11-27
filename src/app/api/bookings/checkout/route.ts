import { NextResponse } from "next/server";
import { bookingResponse, publicOrigin } from "@/lib/booking/errors";
import { checkout } from "@/lib/booking/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  offerSlug?: unknown;
  start?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  note?: unknown;
  creditCode?: unknown;
  recipientName?: unknown;
  recipientEmail?: unknown;
  newsletter?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Body | null;
    const offerSlug = String(body?.offerSlug ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim();
    if (!offerSlug) return NextResponse.json({ error: "Choose a lesson." }, { status: 400 });
    if (name.length < 2 || !email.includes("@")) {
      return NextResponse.json({ error: "Add your name and email." }, { status: 400 });
    }
    const start = body?.start == null || body.start === "" ? null : String(body.start);
    const result = await checkout({
      offerSlug,
      start,
      name,
      email,
      phone: String(body?.phone ?? ""),
      note: String(body?.note ?? ""),
      creditCode: String(body?.creditCode ?? ""),
      recipientName: String(body?.recipientName ?? ""),
      recipientEmail: String(body?.recipientEmail ?? ""),
      newsletter: body?.newsletter === true,
      origin: publicOrigin(request),
    });
    return NextResponse.json(result);
  } catch (error) {
    return bookingResponse(error);
  }
}
