import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/booking/errors";
import { markPaid } from "@/lib/booking/service";
import { squareSignatureValid } from "@/lib/booking/square";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentEvent = {
  type?: string;
  data?: { object?: { payment?: { id?: string; order_id?: string; status?: string; note?: string } } };
};

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-square-hmacsha256-signature");
  if (!squareSignatureValid(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: PaymentEvent;
  try {
    event = JSON.parse(raw) as PaymentEvent;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const payment = event.data?.object?.payment;
  if (!payment || payment.status !== "COMPLETED" || !payment.order_id) {
    return NextResponse.json({ ok: true });
  }

  try {
    const { createServiceRoleSupabase } = await import("@/lib/supabaseServiceRole");
    const db = createServiceRoleSupabase();
    const match = db
      ? await db
          .from("booking_orders")
          .select("id")
          .eq("square_order_id", payment.order_id)
          .maybeSingle()
      : { data: null };
    if (match.data?.id) {
      await markPaid(match.data.id, payment.id ?? null, payment.order_id, publicOrigin(request));
    }
  } catch (error) {
    console.error("Square webhook failed", error);
    return NextResponse.json({ error: "Could not record the payment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
