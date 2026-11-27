import { createClient } from "@/lib/supabase/server";
import { isCoachEmail } from "@/lib/coachEmails";
import { BookingError, cleanBookingError } from "@/lib/booking/errors";
import { sendCancellationEmail, sendNoShowFeeEmail, type BookingMail } from "@/lib/booking/email";
import { bookingDb, paymentsReady, reconcileHolds } from "@/lib/booking/service";
import { createPaymentLink, squareConfigured } from "@/lib/booking/square";
import { parseYmd, zonedToUtc } from "@/lib/booking/time";

export async function requireCoach(request?: Request) {
  const supabase = await createClient();
  const header = request?.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const { data } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  if (!data.user || !isCoachEmail(data.user.email)) return null;
  return data.user;
}

export async function loadAgenda(origin: string) {
  const db = bookingDb();
  await reconcileHolds(origin);
  const now = new Date();
  const from = new Date(now.getTime() - 200 * 24 * 60 * 60_000).toISOString();
  const to = new Date(now.getTime() + 400 * 24 * 60 * 60_000).toISOString();

  const [settingsRes, hoursRes, blocksRes, bookingsRes, creditsRes] = await Promise.all([
    db.from("booking_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("booking_hours").select("weekday, start_minute, end_minute, active").order("weekday"),
    db.from("booking_blocks").select("id, starts_at, ends_at, reason").gte("ends_at", from).order("starts_at"),
    db
      .from("bookings")
      .select("id, starts_at, ends_at, status, note, offer_id, customer_id, fee_order_id")
      .in("status", ["confirmed", "held", "noshow"])
      .gte("starts_at", from)
      .lte("starts_at", to)
      .order("starts_at"),
    db
      .from("booking_credits")
      .select("id, code, remaining, recipient_name, recipient_email, offer_id, created_at")
      .gt("remaining", 0)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  for (const result of [settingsRes, hoursRes, blocksRes, bookingsRes, creditsRes]) {
    if (result.error) throw new BookingError(cleanBookingError(result.error.message), 503);
  }

  const offerIds = new Set<string>();
  for (const row of bookingsRes.data ?? []) offerIds.add(row.offer_id);
  for (const row of creditsRes.data ?? []) offerIds.add(row.offer_id);
  const customerIds = [...new Set((bookingsRes.data ?? []).map((row) => row.customer_id))];

  const [{ data: offers }, { data: customers }] = await Promise.all([
    offerIds.size
      ? db.from("booking_offers").select("id, name, slug").in("id", [...offerIds])
      : Promise.resolve({ data: [] as { id: string; name: string; slug: string }[] }),
    customerIds.length
      ? db.from("booking_customers").select("id, name, email, phone, newsletter_opt_in").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string; email: string; phone: string | null; newsletter_opt_in: boolean }[] }),
  ]);

  const feeIds = (bookingsRes.data ?? []).map((row) => row.fee_order_id).filter(Boolean) as string[];
  const { data: feeOrders } = feeIds.length
    ? await db.from("booking_orders").select("id, status").in("id", feeIds)
    : { data: [] as { id: string; status: string }[] };
  const feeStatus = new Map((feeOrders ?? []).map((order) => [order.id, order.status as string]));

  const offerById = new Map((offers ?? []).map((offer) => [offer.id, offer]));
  const customerById = new Map((customers ?? []).map((customer) => [customer.id, customer]));
  const settings = settingsRes.data;

  return {
    squareReady: paymentsReady(),
    settings: settings
      ? {
          timezone: settings.timezone as string,
          slotMinutes: settings.slot_minutes as number,
          bufferMinutes: settings.buffer_minutes as number,
          minNoticeMinutes: settings.min_notice_minutes as number,
          horizonDays: settings.horizon_days as number,
          discountWithinDays: settings.discount_within_days as number,
          discountPercent: settings.discount_percent as number,
          noshowFeeCents: settings.noshow_fee_cents as number,
          location: settings.location_label as string,
        }
      : null,
    hours: (hoursRes.data ?? []).map((row) => ({
      weekday: row.weekday as number,
      startMinute: row.start_minute as number,
      endMinute: row.end_minute as number,
      active: row.active as boolean,
    })),
    blocks: blocksRes.data ?? [],
    bookings: (bookingsRes.data ?? []).map((row) => {
      const customer = customerById.get(row.customer_id);
      const offer = offerById.get(row.offer_id);
      return {
        id: row.id as string,
        startsAt: row.starts_at as string,
        endsAt: row.ends_at as string,
        status: row.status as string,
        note: (row.note as string | null) ?? null,
        offerName: offer?.name ?? "Lesson",
        customerName: customer?.name ?? "",
        customerEmail: customer?.email ?? "",
        customerPhone: customer?.phone ?? "",
        newsletter: Boolean(customer?.newsletter_opt_in),
        feeStatus: row.fee_order_id ? feeStatus.get(row.fee_order_id) ?? null : null,
      };
    }),
    credits: (creditsRes.data ?? []).map((row) => ({
      id: row.id as string,
      code: row.code as string,
      remaining: row.remaining as number,
      recipientName: (row.recipient_name as string | null) ?? "",
      recipientEmail: (row.recipient_email as string | null) ?? "",
      offerName: offerById.get(row.offer_id)?.name ?? "Lesson",
    })),
  };
}

export async function saveSchedule(input: {
  location: string;
  bufferMinutes: number;
  minNoticeMinutes: number;
  discountWithinDays: number;
  discountPercent: number;
  noshowFeeCents: number;
  hours: { weekday: number; startMinute: number; endMinute: number; active: boolean }[];
}) {
  const db = bookingDb();
  const { error } = await db.rpc("booking_set_schedule", {
    p_location: input.location,
    p_buffer: input.bufferMinutes,
    p_notice: input.minNoticeMinutes,
    p_discount_days: input.discountWithinDays,
    p_discount_percent: input.discountPercent,
    p_noshow_cents: input.noshowFeeCents,
    p_hours: input.hours,
  });
  if (error) throw new BookingError(cleanBookingError(error.message), 400);
}

export async function addBlock(input: { date: string; start: string; end: string; reason: string; timeZone: string }) {
  const day = parseYmd(input.date);
  const start = parseClock(input.start);
  const end = parseClock(input.end);
  if (!day || !start || !end) throw new BookingError("Add a date, a start, and a finish.");
  const startsAt = zonedToUtc(day.year, day.month, day.day, start.hour, start.minute, input.timeZone);
  const endsAt = zonedToUtc(day.year, day.month, day.day, end.hour, end.minute, input.timeZone);
  if (endsAt <= startsAt) throw new BookingError("The finish needs to be after the start.");
  const db = bookingDb();
  const { error } = await db.from("booking_blocks").insert({
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    reason: input.reason.trim().slice(0, 120) || null,
  });
  if (error) throw new BookingError(cleanBookingError(error.message), 400);
}

function parseClock(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export async function removeBlock(id: string) {
  const db = bookingDb();
  const { error } = await db.from("booking_blocks").delete().eq("id", id);
  if (error) throw new BookingError(cleanBookingError(error.message), 400);
}

export async function markNoShow(id: string, origin: string) {
  const db = bookingDb();
  const { data, error } = await db.rpc("booking_mark_noshow", { p_booking_id: id });
  if (error) throw new BookingError(cleanBookingError(error.message), 400);
  const payload = (data ?? {}) as BookingMail & { already?: boolean; order_id?: string; ok?: boolean };
  if (payload.already) return;
  const orderId = payload.order_id ? String(payload.order_id) : "";
  const amount = Number(payload.amount_cents || 0);
  let payUrl: string | null = null;
  if (orderId && amount > 0 && squareConfigured()) {
    const link = await createPaymentLink({
      idempotencyKey: orderId,
      name: "No-show fee",
      amountCents: amount,
      currency: String(payload.currency || "AUD"),
      redirectUrl: `${origin}/book/confirmed?order=${orderId}`,
      buyerEmail: String(payload.customer_email || ""),
      note: String(payload.summary || "No-show fee"),
    });
    await db
      .from("booking_orders")
      .update({
        square_payment_link_id: link.linkId,
        square_order_id: link.orderId,
        checkout_url: link.url,
      })
      .eq("id", orderId)
      .eq("status", "pending");
    payUrl = link.url;
  }
  try {
    await sendNoShowFeeEmail({ ...payload, payUrl });
  } catch (err) {
    console.error("No-show email failed", err);
  }
}

export async function coachCancel(id: string) {
  const db = bookingDb();
  const { data, error } = await db.rpc("booking_cancel_coach", { p_booking_id: id });
  if (error) throw new BookingError(cleanBookingError(error.message), 400);
  const mail = (data ?? {}) as BookingMail;
  try {
    await sendCancellationEmail(mail);
  } catch (err) {
    console.error("Cancel email failed", err);
  }
}
