import { NextResponse } from "next/server";
import { bookingResponse, publicOrigin } from "@/lib/booking/errors";
import { syncOrder } from "@/lib/booking/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "That payment could not be found." }, { status: 404 });
    }
    const order = await syncOrder(id, publicOrigin(request));
    return NextResponse.json(order);
  } catch (error) {
    return bookingResponse(error);
  }
}
