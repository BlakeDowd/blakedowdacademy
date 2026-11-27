import { formatMoney, formatWhen } from "@/lib/booking/time";

const COACH_EMAIL = "bdowd@pgamember.org.au";
const COACH_PHONE = "0421 409 662";

export type BookingMail = {
  kind?: string;
  summary?: string | null;
  offer_name?: string | null;
  starts_at?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  credit_code?: string | null;
  cancel_token?: string | null;
  location?: string | null;
  amount_cents?: number | null;
  list_price_cents?: number | null;
  currency?: string | null;
  purpose?: string | null;
  newsletter?: boolean;
  noshow_fee_cents?: number | null;
  needs_followup?: boolean;
  redeem_slug?: string | null;
  credits?: number | null;
  paid_by_card?: boolean;
};

function coachInbox() {
  return process.env.BOOKING_EMAIL_TO?.trim() || process.env.FEEDBACK_EMAIL_TO?.trim() || COACH_EMAIL;
}

function fromAddress() {
  return (
    process.env.BOOKING_EMAIL_FROM?.trim() ||
    process.env.FEEDBACK_EMAIL_FROM?.trim() ||
    "Blake Dowd Golf <onboarding@resend.dev>"
  );
}

function whenLabel(mail: BookingMail) {
  if (!mail.starts_at) return mail.summary || mail.offer_name || "Lesson";
  const date = new Date(mail.starts_at);
  if (Number.isNaN(date.getTime())) return mail.summary || "Lesson";
  return `${mail.offer_name || "Lesson"} · ${formatWhen(date)}`;
}

async function send(params: {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipients = params.to.map((item) => item.trim()).filter(Boolean);
  if (!apiKey || recipients.length === 0) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(),
      to: recipients,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      subject: params.subject,
      text: params.text,
    }),
  });
  return res.ok;
}

export async function sendBookingEmails(mail: BookingMail, origin: string) {
  const when = whenLabel(mail);
  const location = mail.location || "Stonecutters Ridge Golf Club";
  const tasks: Promise<boolean>[] = [];

  if (mail.needs_followup) {
    tasks.push(
      send({
        to: [mail.customer_email || ""],
        replyTo: coachInbox(),
        subject: `Payment received · ${mail.offer_name || "lesson"}`,
        text: [
          `Hi ${mail.customer_name || ""},`,
          "",
          "Square has the payment. The time you picked was taken while the payment was finishing, so Blake will contact you to lock another one in.",
          "",
          `${mail.offer_name || "Lesson"}`,
          location,
          "",
          `Blake · ${COACH_PHONE}`,
        ].join("\n"),
      }),
    );
    tasks.push(
      send({
        to: [coachInbox()],
        replyTo: mail.customer_email || undefined,
        subject: `Paid, time needs a new slot · ${mail.customer_name || "student"}`,
        text: [
          `${mail.customer_name} paid for ${mail.offer_name}, but the held time was no longer free.`,
          mail.customer_email || "",
          mail.customer_phone || "",
          "Pick another time with them and keep the payment in Square.",
        ].join("\n"),
      }),
    );
  } else if (mail.purpose === "noshow") {
    tasks.push(
      send({
        to: [mail.customer_email || ""],
        replyTo: coachInbox(),
        subject: `No-show fee paid · ${mail.offer_name || "lesson"}`,
        text: [`Hi ${mail.customer_name || ""},`, "", "The no-show fee is paid.", "", `Blake · ${COACH_PHONE}`].join("\n"),
      }),
    );
  } else if (mail.kind === "appointment") {
    const cancel = mail.cancel_token ? `${origin}/book/cancel/${mail.cancel_token}` : "";
    tasks.push(
      send({
        to: [mail.customer_email || ""],
        replyTo: coachInbox(),
        subject: `Booked · ${when}`,
        text: [
          `Hi ${mail.customer_name || ""},`,
          "",
          "You're booked.",
          when,
          location,
          mail.list_price_cents && mail.amount_cents != null && mail.amount_cents < mail.list_price_cents
            ? `This time is the closer-in rate, ${formatMoney(mail.amount_cents, mail.currency || "AUD")}.`
            : "",
          "",
          cancel ? `Change of plan: cancel from this link until 24 hours before.\n${cancel}` : "",
          mail.noshow_fee_cents
            ? `Missing the lesson without cancelling is a ${formatMoney(mail.noshow_fee_cents, mail.currency || "AUD")} fee.`
            : "",
          cancel && mail.paid_by_card !== false && (mail.amount_cents ?? 0) > 0
            ? "Cancelling frees the time. Blake refunds the card from Square."
            : "",
          "",
          `Blake · ${COACH_PHONE}`,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    );
    tasks.push(
      send({
        to: [coachInbox()],
        replyTo: mail.customer_email || undefined,
        subject: `New booking · ${mail.customer_name || "student"} · ${when}`,
        text: [
          when,
          location,
          mail.customer_name || "",
          mail.customer_email || "",
          mail.customer_phone || "",
          mail.newsletter ? "Asked to join the newsletter." : "",
          mail.list_price_cents && mail.amount_cents != null && mail.amount_cents < mail.list_price_cents
            ? `Closer-in rate ${formatMoney(mail.amount_cents, mail.currency || "AUD")}.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    );
  } else if (mail.credit_code) {
    const book = `${origin}/book/${mail.redeem_slug || "hour"}?code=${encodeURIComponent(mail.credit_code)}`;
    const count = mail.credits || 1;
    const lessonWord = count === 1 ? "lesson" : "lessons";
    const buyer = mail.customer_email || "";
    const recipient = mail.recipient_email || buyer;
    tasks.push(
      send({
        to: [buyer],
        replyTo: coachInbox(),
        subject: `Paid · ${mail.offer_name || "lesson"}`,
        text: [
          `Hi ${mail.customer_name || ""},`,
          "",
          `The code is ${mail.credit_code}.`,
          `It covers ${count} ${lessonWord}.`,
          `Book a time here: ${book}`,
          "",
          `Blake · ${COACH_PHONE}`,
        ].join("\n"),
      }),
    );
    if (recipient && recipient !== buyer) {
      tasks.push(
        send({
          to: [recipient],
          replyTo: buyer,
          subject: `${mail.customer_name || "Someone"} sent you a golf lesson`,
          text: [
            `Hi ${mail.recipient_name || ""},`,
            "",
            `${mail.customer_name || "Someone"} bought you ${mail.offer_name || "a lesson"} at ${location}.`,
            `The code is ${mail.credit_code}.`,
            `Pick a time here: ${book}`,
            "",
            `Blake · ${COACH_PHONE}`,
          ].join("\n"),
        }),
      );
    }
    tasks.push(
      send({
        to: [coachInbox()],
        replyTo: buyer || undefined,
        subject: `New ${mail.kind === "voucher" ? "voucher" : "pack"} · ${mail.customer_name || "buyer"}`,
        text: [
          mail.offer_name || "",
          `Code ${mail.credit_code}`,
          mail.customer_name || "",
          buyer,
          recipient !== buyer ? `For ${mail.recipient_name || ""} <${recipient}>` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    );
  }

  await Promise.all(tasks);
}

export async function sendCancellationEmail(mail: BookingMail) {
  const when = whenLabel(mail);
  await send({
    to: [mail.customer_email || ""],
    replyTo: coachInbox(),
    subject: `Cancelled · ${when}`,
    text: [
      `Hi ${mail.customer_name || ""},`,
      "",
      `${when} is cancelled. The time is free again.`,
      mail.paid_by_card ? "Blake will refund the card from Square." : "",
      "",
      `Blake · ${COACH_PHONE}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  await send({
    to: [coachInbox()],
    replyTo: mail.customer_email || undefined,
    subject: `Cancelled · ${mail.customer_name || "student"} · ${when}`,
    text: [when, mail.customer_name || "", mail.customer_email || "", mail.paid_by_card ? "Refund the card in Square." : ""]
      .filter(Boolean)
      .join("\n"),
  });
}

export async function sendNoShowFeeEmail(mail: BookingMail & { payUrl?: string | null }) {
  const when = whenLabel(mail);
  const fee = formatMoney(mail.amount_cents || 0, mail.currency || "AUD");
  await send({
    to: [mail.customer_email || ""],
    replyTo: coachInbox(),
    subject: `Missed lesson · ${fee} fee`,
    text: [
      `Hi ${mail.customer_name || ""},`,
      "",
      `${when} was missed.`,
      `The no-show fee is ${fee}.`,
      mail.payUrl ? `Pay it here: ${mail.payUrl}` : "Blake will send a way to pay.",
      "",
      `Blake · ${COACH_PHONE}`,
    ].join("\n"),
  });
  await send({
    to: [coachInbox()],
    replyTo: mail.customer_email || undefined,
    subject: `No-show · ${mail.customer_name || "student"} · ${when}`,
    text: [when, mail.customer_name || "", mail.customer_email || "", `${fee} fee`, mail.payUrl || "Square is not connected, so no payment link was sent."]
      .filter(Boolean)
      .join("\n"),
  });
}
