import { createHmac, timingSafeEqual } from "crypto";
import { BookingError } from "@/lib/booking/errors";

const SQUARE_VERSION = "2025-10-16";

export function squareConfigured() {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN?.trim() && process.env.SQUARE_LOCATION_ID?.trim());
}

function squareBase() {
  return process.env.SQUARE_ENV?.trim().toLowerCase() === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function squareHeaders() {
  return {
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN?.trim()}`,
    "Square-Version": SQUARE_VERSION,
    "Content-Type": "application/json",
  };
}

export async function createPaymentLink(input: {
  idempotencyKey: string;
  name: string;
  amountCents: number;
  currency: string;
  redirectUrl: string;
  buyerEmail: string;
  note: string;
}): Promise<{ url: string; linkId: string; orderId: string }> {
  if (!squareConfigured()) {
    throw new BookingError("Card payments are not connected yet.", 503);
  }
  const res = await fetch(`${squareBase()}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: squareHeaders(),
    body: JSON.stringify({
      idempotency_key: input.idempotencyKey,
      description: input.note.slice(0, 255),
      quick_pay: {
        name: input.name.slice(0, 255),
        price_money: { amount: input.amountCents, currency: input.currency },
        location_id: process.env.SQUARE_LOCATION_ID?.trim(),
      },
      checkout_options: {
        allow_tipping: false,
        redirect_url: input.redirectUrl,
        ask_for_shipping_address: false,
        merchant_support_email: process.env.BOOKING_EMAIL_TO?.trim() || "bdowd@pgamember.org.au",
      },
      pre_populated_data: { buyer_email: input.buyerEmail },
      payment_note: input.note.slice(0, 500),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    payment_link?: { id?: string; url?: string; order_id?: string };
    errors?: { detail?: string; code?: string }[];
  };
  if (!res.ok) {
    const detail = json.errors?.[0]?.detail || json.errors?.[0]?.code || `Square returned ${res.status}`;
    throw new BookingError(`Square couldn't start the payment. ${detail}`, 502);
  }
  const link = json.payment_link;
  if (!link?.url || !link.order_id || !link.id) {
    throw new BookingError("Square didn't return a checkout link.", 502);
  }
  return { url: link.url, linkId: link.id, orderId: link.order_id };
}

export async function fetchSquareOrder(orderId: string): Promise<{ state?: string; paymentId?: string } | null> {
  if (!process.env.SQUARE_ACCESS_TOKEN?.trim()) return null;
  const res = await fetch(`${squareBase()}/v2/orders/${orderId}`, { headers: squareHeaders() });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as {
    order?: { state?: string; tenders?: { payment_id?: string }[] };
  };
  const paymentId = json.order?.tenders?.find((tender) => tender.payment_id)?.payment_id;
  return { state: json.order?.state, paymentId };
}

export function squareSignatureValid(rawBody: string, signature: string | null) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();
  const url = process.env.SQUARE_WEBHOOK_URL?.trim();
  if (!key || !url || !signature) return false;
  const hmac = createHmac("sha256", key).update(url + rawBody).digest("base64");
  const left = Buffer.from(hmac);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
