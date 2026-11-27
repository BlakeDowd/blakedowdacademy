import { NextResponse } from "next/server";
import { bookingResponse } from "@/lib/booking/errors";
import { listOffers } from "@/lib/booking/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const offers = await listOffers();
    return NextResponse.json({ offers });
  } catch (error) {
    return bookingResponse(error);
  }
}
