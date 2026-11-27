import { NextResponse } from "next/server";
import { addBlock, loadAgenda, markNoShow, removeBlock, requireCoach, saveSchedule } from "@/lib/booking/admin";
import { bookingResponse, publicOrigin } from "@/lib/booking/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function coachOr401(request: Request) {
  const user = await requireCoach(request);
  if (!user) return NextResponse.json({ error: "Sign in as the coach to see the diary." }, { status: 401 });
  return null;
}

export async function GET(request: Request) {
  const denied = await coachOr401(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await loadAgenda(publicOrigin(request)));
  } catch (error) {
    return bookingResponse(error);
  }
}

export async function PUT(request: Request) {
  const denied = await coachOr401(request);
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => null)) as {
      location?: unknown;
      bufferMinutes?: unknown;
      minNoticeMinutes?: unknown;
      discountWithinDays?: unknown;
      discountPercent?: unknown;
      noshowFeeCents?: unknown;
      hours?: { weekday: number; startMinute: number; endMinute: number; active: boolean }[];
    } | null;
    if (!body || !Array.isArray(body.hours)) {
      return NextResponse.json({ error: "Those hours are not valid." }, { status: 400 });
    }
    await saveSchedule({
      location: String(body.location ?? ""),
      bufferMinutes: Number(body.bufferMinutes),
      minNoticeMinutes: Number(body.minNoticeMinutes),
      discountWithinDays: Number(body.discountWithinDays),
      discountPercent: Number(body.discountPercent),
      noshowFeeCents: Number(body.noshowFeeCents),
      hours: body.hours,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return bookingResponse(error);
  }
}

export async function POST(request: Request) {
  const denied = await coachOr401(request);
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      date?: unknown;
      start?: unknown;
      end?: unknown;
      reason?: unknown;
      timeZone?: unknown;
      blockId?: unknown;
      bookingId?: unknown;
    } | null;
    if (body?.action === "noshow") {
      await markNoShow(String(body.bookingId ?? ""), publicOrigin(request));
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "remove-block") {
      await removeBlock(String(body.blockId ?? ""));
      return NextResponse.json({ ok: true });
    }
    await addBlock({
      date: String(body?.date ?? ""),
      start: String(body?.start ?? ""),
      end: String(body?.end ?? ""),
      reason: String(body?.reason ?? ""),
      timeZone: String(body?.timeZone ?? "Australia/Sydney"),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return bookingResponse(error);
  }
}
