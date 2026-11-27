import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleSupabase } from "@/lib/supabaseServiceRole";
import { BookingError, cleanBookingError } from "@/lib/booking/errors";
import { sendBookingEmails, sendCancellationEmail, type BookingMail } from "@/lib/booking/email";
import { createPaymentLink, fetchSquareOrder, squareConfigured } from "@/lib/booking/square";
import { buildSlots } from "@/lib/booking/slots";
import { parseYmd, todayInZone } from "@/lib/booking/time";

type Json = Record<string, unknown>;

export function bookingDb() {
  const db = createServiceRoleSupabase();
  if (!db) throw new BookingError("Booking storage is not connected.", 503);
  return db;
}

function asMail(value: Json | null): BookingMail {
  return (value ?? {}) as BookingMail;
}

async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new BookingError(cleanBookingError(error.message), /not turned on|schema cache/i.test(error.message) ? 503 : 400);
  return (data ?? {}) as Json;
}

export async function claimEmail(db: SupabaseClient, orderId: string) {
  const { data, error } = await db
    .from("booking_orders")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("emailed_at", null)
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function releaseEmail(db: SupabaseClient, orderId: string) {
  await db.from("booking_orders").update({ emailed_at: null }).eq("id", orderId);
}

export async function notifyPaid(db: SupabaseClient, payload: Json, origin: string) {
  if (payload.already === true) return;
  const orderId = String(payload.order_id || "");
  if (!orderId) return;
  const claimed = await claimEmail(db, orderId);
  if (!claimed) return;
  try {
    await sendBookingEmails(asMail(payload), origin);
  } catch (error) {
    console.error("Booking email failed", error);
    await releaseEmail(db, orderId);
  }
}

export async function markPaid(orderId: string, paymentId: string | null, squareOrderId: string | null, origin: string) {
  const db = bookingDb();
  const payload = await rpc(db, "booking_mark_paid", {
    p_order_id: orderId,
    p_square_payment_id: paymentId,
    p_square_order_id: squareOrderId,
  });
  await notifyPaid(db, payload, origin);
  return payload;
}

export async function reconcileHolds(origin: string) {
  const db = bookingDb();
  const { data: stale, error } = await db
    .from("bookings")
    .select("id, order_id")
    .eq("status", "held")
    .lt("hold_expires_at", new Date().toISOString());
  if (error || !stale?.length) return;

  for (const row of stale) {
    if (!row.order_id) {
      await db.from("bookings").update({ status: "expired" }).eq("id", row.id).eq("status", "held");
      continue;
    }
    const { data: order } = await db
      .from("booking_orders")
      .select("id, status, square_order_id, square_payment_id")
      .eq("id", row.order_id)
      .maybeSingle();
    if (!order) {
      await db.from("bookings").update({ status: "expired" }).eq("id", row.id).eq("status", "held");
      continue;
    }
    if (order.status === "paid") {
      await markPaid(order.id, order.square_payment_id, order.square_order_id, origin);
      continue;
    }
    if (order.square_order_id) {
      const square = await fetchSquareOrder(order.square_order_id);
      if (square?.state === "COMPLETED") {
        await markPaid(order.id, square.paymentId ?? order.square_payment_id, order.square_order_id, origin);
        continue;
      }
    }
    await db.from("bookings").update({ status: "expired" }).eq("id", row.id).eq("status", "held");
    if (order.status === "pending") {
      await db.from("booking_orders").update({ status: "failed" }).eq("id", order.id).eq("status", "pending");
    }
  }
}

export async function listOffers() {
  const db = bookingDb();
  const { data, error } = await db
    .from("booking_offers")
    .select("slug, name, description, kind, list_group, credits, duration_minutes, price_cents, currency, sort_order")
    .eq("active", true)
    .in("kind", ["appointment", "package", "voucher"])
    .order("sort_order", { ascending: true });
  if (error) throw new BookingError(cleanBookingError(error.message), 503);
  return (data ?? []).map((offer) => ({
    slug: offer.slug as string,
    name: offer.name as string,
    description: offer.description as string,
    kind: offer.kind as string,
    listGroup: offer.list_group as string,
    credits: offer.credits as number,
    durationMinutes: offer.duration_minutes as number | null,
    priceCents: offer.price_cents as number,
    currency: offer.currency as string,
  }));
}

export async function listSlots(slug: string, fromRaw: string | null, daysRaw: string | null, origin: string) {
  const db = bookingDb();
  await reconcileHolds(origin);

  const { data: offer, error: offerError } = await db
    .from("booking_offers")
    .select("id, duration_minutes, capacity, kind, active, price_cents")
    .eq("slug", slug)
    .maybeSingle();
  if (offerError) throw new BookingError(cleanBookingError(offerError.message), 503);
  if (!offer || !offer.active || offer.kind !== "appointment" || !offer.duration_minutes) {
    throw new BookingError("That lesson is not on the calendar.", 404);
  }

  const { data: settings, error: settingsError } = await db.from("booking_settings").select("*").eq("id", 1).maybeSingle();
  if (settingsError || !settings) throw new BookingError(cleanBookingError(settingsError?.message || "Booking is not set up yet."), 503);

  const { data: hours, error: hoursError } = await db
    .from("booking_hours")
    .select("weekday, start_minute, end_minute, active")
    .eq("active", true);
  if (hoursError) throw new BookingError(cleanBookingError(hoursError.message), 503);

  const timeZone = String(settings.timezone || "Australia/Sydney");
  const from = (fromRaw && parseYmd(fromRaw)) || todayInZone(new Date(), timeZone);
  const dayCount = Math.min(21, Math.max(1, Number(daysRaw) || 14));
  const rangeStart = new Date();
  const rangeEnd = new Date(rangeStart.getTime() + (Number(settings.horizon_days) + 2) * 24 * 60 * 60_000);

  const [{ data: bookings, error: bookingsError }, { data: blocks, error: blocksError }] = await Promise.all([
    db
      .from("bookings")
      .select("offer_id, starts_at, ends_at, status")
      .in("status", ["held", "confirmed"])
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString()),
    db
      .from("booking_blocks")
      .select("starts_at, ends_at")
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString()),
  ]);
  if (bookingsError) throw new BookingError(cleanBookingError(bookingsError.message), 503);
  if (blocksError) throw new BookingError(cleanBookingError(blocksError.message), 503);

  const days = buildSlots({
    timeZone,
    from,
    dayCount,
    durationMinutes: offer.duration_minutes,
    slotMinutes: settings.slot_minutes,
    bufferMinutes: settings.buffer_minutes,
    minNoticeMinutes: settings.min_notice_minutes,
    horizonDays: settings.horizon_days,
    capacity: offer.capacity,
    offerId: offer.id,
    listPriceCents: offer.price_cents,
    discountWithinDays: settings.discount_within_days,
    discountPercent: settings.discount_percent,
    hours: (hours ?? []).map((row) => ({
      weekday: row.weekday as number,
      startMinute: row.start_minute as number,
      endMinute: row.end_minute as number,
    })),
    busy: (bookings ?? []).map((row) => ({
      startMs: new Date(row.starts_at).getTime(),
      endMs: new Date(row.ends_at).getTime(),
      offerId: row.offer_id as string,
    })),
    blocks: (blocks ?? []).map((row) => ({
      startMs: new Date(row.starts_at).getTime(),
      endMs: new Date(row.ends_at).getTime(),
    })),
  });

  return {
    timezone: timeZone,
    location: settings.location_label as string,
    durationMinutes: offer.duration_minutes as number,
    listPriceCents: offer.price_cents as number,
    discountWithinDays: settings.discount_within_days as number,
    discountPercent: settings.discount_percent as number,
    noshowFeeCents: settings.noshow_fee_cents as number,
    days,
  };
}

async function failOrder(orderId: string) {
  const db = bookingDb();
  await db.from("bookings").update({ status: "expired" }).eq("order_id", orderId).eq("status", "held");
  await db.from("booking_orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
}

export async function checkout(input: {
  offerSlug: string;
  start: string | null;
  name: string;
  email: string;
  phone: string;
  note: string;
  creditCode: string;
  recipientName: string;
  recipientEmail: string;
  newsletter: boolean;
  origin: string;
}) {
  const db = bookingDb();
  await reconcileHolds(input.origin);
  const payload = await rpc(db, "booking_checkout", {
    p_offer_slug: input.offerSlug,
    p_start: input.start,
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone,
    p_note: input.note,
    p_credit_code: input.creditCode,
    p_recipient_name: input.recipientName,
    p_recipient_email: input.recipientEmail,
    p_newsletter: input.newsletter,
  });

  if (payload.mode === "confirmed") {
    await notifyPaid(db, payload, input.origin);
    return { mode: "confirmed" as const, orderId: String(payload.order_id) };
  }

  const orderId = String(payload.order_id);
  const amount = Number(payload.amount_cents || 0);
  if (!squareConfigured()) {
    if (process.env.BOOKING_ALLOW_UNPAID === "1") {
      await markPaid(orderId, null, null, input.origin);
      return { mode: "confirmed" as const, orderId };
    }
    await failOrder(orderId);
    throw new BookingError("Card payments are not connected yet. Add the Square keys, then try again.", 503);
  }

  try {
    const link = await createPaymentLink({
      idempotencyKey: orderId,
      name: String(payload.item_name || "Lesson"),
      amountCents: amount,
      currency: String(payload.currency || "AUD"),
      redirectUrl: `${input.origin}/book/confirmed?order=${orderId}`,
      buyerEmail: String(payload.customer_email || input.email),
      note: String(payload.summary || payload.item_name || "Lesson"),
    });
    const { error } = await db
      .from("booking_orders")
      .update({
        square_payment_link_id: link.linkId,
        square_order_id: link.orderId,
        checkout_url: link.url,
      })
      .eq("id", orderId)
      .eq("status", "pending");
    if (error) throw new BookingError(cleanBookingError(error.message), 500);
    return { mode: "pay" as const, orderId, checkoutUrl: link.url };
  } catch (error) {
    await failOrder(orderId);
    throw error;
  }
}

export async function syncOrder(orderId: string, origin: string) {
  const db = bookingDb();
  const { data: order, error } = await db
    .from("booking_orders")
    .select("id, status, kind, purpose, summary, amount_cents, currency, checkout_url, credit_code, attention, square_order_id, square_payment_id, offer_id, booking_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new BookingError(cleanBookingError(error.message), 503);
  if (!order) throw new BookingError("That payment could not be found.", 404);

  if (order.status === "pending" && order.square_order_id) {
    const square = await fetchSquareOrder(order.square_order_id);
    if (square?.state === "COMPLETED") {
      await markPaid(order.id, square.paymentId ?? null, order.square_order_id, origin);
    }
  }

  const { data: fresh } = await db
    .from("booking_orders")
    .select("id, status, kind, purpose, summary, checkout_url, credit_code, attention, offer_id, booking_id")
    .eq("id", orderId)
    .maybeSingle();
  const current = fresh ?? order;

  let startsAt: string | null = null;
  let offerName: string | null = null;
  let redeemSlug: string | null = null;
  let credits: number | null = null;
  const { data: offer } = await db
    .from("booking_offers")
    .select("name, slug, credits, redeems_offer_id, kind")
    .eq("id", current.offer_id)
    .maybeSingle();
  offerName = offer?.name ?? null;
  credits = offer?.credits ?? null;
  if (offer?.kind === "appointment") redeemSlug = offer.slug;
  else if (offer?.redeems_offer_id) {
    const { data: redeem } = await db.from("booking_offers").select("slug").eq("id", offer.redeems_offer_id).maybeSingle();
    redeemSlug = redeem?.slug ?? null;
  }
  if (current.booking_id) {
    const { data: booking } = await db.from("bookings").select("starts_at, status").eq("id", current.booking_id).maybeSingle();
    if (booking?.status === "confirmed" || booking?.status === "held") startsAt = booking.starts_at;
  }

  const { data: settings } = await db.from("booking_settings").select("location_label, timezone").eq("id", 1).maybeSingle();

  return {
    status: current.status as string,
    kind: current.kind as string,
    purpose: (current.purpose as string) || "booking",
    summary: current.summary as string | null,
    offerName,
    startsAt,
    creditCode:
      current.status === "paid" && current.kind !== "appointment" ? (current.credit_code as string | null) : null,
    redeemSlug,
    credits,
    attention: Boolean(current.attention),
    checkoutUrl: current.status === "pending" ? (current.checkout_url as string | null) : null,
    location: (settings?.location_label as string) || "Stonecutters Ridge Golf Club",
    timezone: (settings?.timezone as string) || "Australia/Sydney",
  };
}

export function paymentsReady() {
  return squareConfigured();
}

export async function previewOrCancel(token: string, apply: boolean) {
  const db = bookingDb();
  const payload = await rpc(db, "booking_cancel_token", { p_token: token, p_apply: apply });
  if (apply && payload.ok === true) {
    try {
      await sendCancellationEmail(asMail(payload));
    } catch (error) {
      console.error("Cancel email failed", error);
    }
  }
  return payload;
}
