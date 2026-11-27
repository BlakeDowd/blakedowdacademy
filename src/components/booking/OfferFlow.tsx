"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookButton, BookShell, bookFieldClass } from "@/components/booking/BookShell";
import { loadSavedDetails, storeSavedDetails } from "@/lib/booking/savedDetails";
import { formatMoney } from "@/lib/booking/time";

type Offer = {
  slug: string;
  name: string;
  description: string;
  kind: string;
  credits: number;
  durationMinutes: number | null;
  priceCents: number;
  currency: string;
};

type Slot = { start: string; label: string; priceCents: number; listPriceCents: number };

type SlotDay = {
  date: string;
  label: string;
  closed: boolean;
  discounted: boolean;
  slots: Slot[];
};

export function OfferFlow({ slug }: { slug: string }) {
  const params = useSearchParams();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/bookings/offers")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "The lesson list didn't load.");
        return body.offers as Offer[];
      })
      .then((offers) => {
        if (cancel) return;
        const found = offers.find((item) => item.slug === slug) ?? null;
        setOffer(found);
        setMissing(!found);
      })
      .catch((err: Error) => {
        if (!cancel) setError(err.message);
      });
    return () => {
      cancel = true;
    };
  }, [slug]);

  if (error) {
    return (
      <BookShell title="Book a lesson" backHref="/book">
        <p className="rounded-2xl bg-white p-4 text-sm text-[#9a3412]">{error}</p>
      </BookShell>
    );
  }
  if (missing) {
    return (
      <BookShell title="That lesson is not listed" backHref="/book">
        <p className="text-[#5d6b64]">Go back and pick one from the list.</p>
      </BookShell>
    );
  }
  if (!offer) {
    return (
      <BookShell title="Book a lesson" backHref="/book">
        <p className="text-[#5d6b64]">Loading…</p>
      </BookShell>
    );
  }
  if (offer.kind === "appointment") {
    return <Scheduler offer={offer} initialCode={params.get("code") || ""} />;
  }
  return <PackForm offer={offer} />;
}

function Scheduler({ offer, initialCode }: { offer: Offer; initialCode: string }) {
  const router = useRouter();
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [location, setLocation] = useState("Stonecutters Ridge Golf Club");
  const [noshowFeeCents, setNoshowFeeCents] = useState(5000);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountWithinDays, setDiscountWithinDays] = useState(3);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState(initialCode);
  const [newsletter, setNewsletter] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    const saved = loadSavedDetails();
    if (!saved) return;
    setName(saved.name);
    setEmail(saved.email);
    setPhone(saved.phone);
    setRemember(true);
  }, []);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/bookings/slots?offer=${encodeURIComponent(offer.slug)}&days=21`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "The times didn't load.");
        return body as {
          days: SlotDay[];
          location?: string;
          noshowFeeCents?: number;
          discountPercent?: number;
          discountWithinDays?: number;
        };
      })
      .then((body) => {
        if (cancel) return;
        setDays(body.days);
        if (body.location) setLocation(body.location);
        if (typeof body.noshowFeeCents === "number") setNoshowFeeCents(body.noshowFeeCents);
        if (typeof body.discountPercent === "number") setDiscountPercent(body.discountPercent);
        if (typeof body.discountWithinDays === "number") setDiscountWithinDays(body.discountWithinDays);
        const first = body.days.find((day) => day.slots.length > 0);
        setDate(first?.date ?? body.days[0]?.date ?? null);
      })
      .catch((err: Error) => {
        if (!cancel) setLoadError(err.message);
      });
    return () => {
      cancel = true;
    };
  }, [offer.slug]);

  const selectedDay = useMemo(() => days?.find((day) => day.date === date) ?? null, [days, date]);
  const selectedSlot = selectedDay?.slots.find((slot) => slot.start === start) ?? null;
  const selectedLabel = selectedSlot?.label;
  const payCents = selectedSlot?.priceCents ?? offer.priceCents;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!start) {
      setFormError("Pick a time first.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/bookings/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerSlug: offer.slug,
          start,
          name,
          email,
          phone,
          note,
          creditCode: code,
          newsletter,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That time didn't save.");
      storeSavedDetails({ name, email, phone }, remember);
      if (body.mode === "pay" && body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }
      router.push(`/book/confirmed?order=${body.orderId}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "That time didn't save.");
      setBusy(false);
    }
  }

  return (
    <BookShell
      title={offer.name}
      lede={`${formatMoney(offer.priceCents, offer.currency)} · ${offer.durationMinutes} minutes · ${location}`}
      backHref="/book"
    >
      <p className="text-[#5d6b64]">{offer.description}</p>
      {loadError ? <p className="mt-4 rounded-2xl bg-white p-4 text-sm text-[#9a3412]">{loadError}</p> : null}
      {!days && !loadError ? <p className="mt-6 text-[#5d6b64]">Loading times…</p> : null}
      {days ? (
        <>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
            {days.map((day) => {
              const on = day.date === date;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => {
                    setDate(day.date);
                    setStart(null);
                  }}
                  className={`shrink-0 rounded-2xl px-3 py-2 text-left text-sm ${
                    on ? "bg-[#121816] text-white" : "border border-black/10 bg-white"
                  }`}
                >
                  <span className="block font-semibold">{day.label}</span>
                  <span className={`block text-xs ${on ? "text-white/70" : "text-[#5d6b64]"}`}>
                    {day.closed ? "Closed" : day.discounted ? `${discountPercent}% off` : day.slots.length ? `${day.slots.length} times` : "Full"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {selectedDay?.slots.map((slot) => {
              const on = slot.start === start;
              return (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => setStart(slot.start)}
                  className={`rounded-xl px-2 py-2.5 text-sm font-semibold ${
                    on ? "bg-[#e57025] text-[#1a140f]" : "border border-black/10 bg-white"
                  }`}
                >
                  <span className="block">{slot.label}</span>
                  {slot.priceCents < slot.listPriceCents ? (
                    <span className="block text-xs font-medium">
                      {formatMoney(slot.priceCents, offer.currency)}
                      <span className="ml-1 line-through opacity-70">{formatMoney(slot.listPriceCents, offer.currency)}</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {selectedDay && !selectedDay.slots.length ? (
            <p className="mt-4 text-sm text-[#5d6b64]">
              {selectedDay.closed ? "Closed this day." : "Nothing left this day. Try another."}
            </p>
          ) : null}
        </>
      ) : null}

      <form onSubmit={submit} className="mt-8 space-y-3 rounded-2xl border border-black/10 bg-white p-4">
        <h2 className="text-lg font-semibold">{selectedLabel ? `Your details · ${selectedLabel}` : "Your details"}</h2>
        <label className="block text-sm">
          Name
          <input className={bookFieldClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="block text-sm">
          Email
          <input className={bookFieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="block text-sm">
          Mobile
          <input className={bookFieldClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </label>
        <label className="block text-sm">
          What you want to work on
          <textarea className={bookFieldClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="block text-sm">
          Pack or voucher code
          <input className={bookFieldClass} value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" placeholder="Leave blank to pay by card" />
        </label>
        <DetailChoices
          newsletter={newsletter}
          remember={remember}
          onNewsletter={setNewsletter}
          onRemember={setRemember}
        />
        {formError ? <p className="text-sm text-[#9a3412]">{formError}</p> : null}
        <BookButton type="submit" disabled={busy || !start}>
          {busy ? "Saving…" : code.trim() ? "Book with code" : `Pay ${formatMoney(payCents, offer.currency)}`}
        </BookButton>
        <p className="text-xs text-[#5d6b64]">
          The time is held for 30 minutes while Square takes the payment. Cancel from the email until 24 hours before.
          {noshowFeeCents > 0 ? ` Missing the lesson is a ${formatMoney(noshowFeeCents, offer.currency)} fee.` : ""}
          {discountPercent > 0
            ? ` If a day is still under half full inside ${discountWithinDays} ${discountWithinDays === 1 ? "day" : "days"}, those open times are ${discountPercent}% off.`
            : ""}
        </p>
      </form>
    </BookShell>
  );
}

function PackForm({ offer }: { offer: Offer }) {
  const router = useRouter();
  const voucher = offer.kind === "voucher";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [newsletter, setNewsletter] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = loadSavedDetails();
    if (!saved) return;
    setName(saved.name);
    setEmail(saved.email);
    setPhone(saved.phone);
    setRemember(true);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerSlug: offer.slug,
          name,
          email,
          phone,
          recipientName,
          recipientEmail,
          newsletter,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The payment didn't start.");
      storeSavedDetails({ name, email, phone }, remember);
      if (body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }
      router.push(`/book/confirmed?order=${body.orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment didn't start.");
      setBusy(false);
    }
  }

  return (
    <BookShell
      title={offer.name}
      lede={`${formatMoney(offer.priceCents, offer.currency)} · ${offer.credits} ${offer.credits === 1 ? "lesson" : "lessons"}`}
      backHref="/book"
    >
      <p className="text-[#5d6b64]">{offer.description}</p>
      <form onSubmit={submit} className="mt-6 space-y-3 rounded-2xl border border-black/10 bg-white p-4">
        <h2 className="text-lg font-semibold">{voucher ? "Your details" : "Who the pack is for"}</h2>
        <label className="block text-sm">
          Name
          <input className={bookFieldClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="block text-sm">
          Email
          <input className={bookFieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="block text-sm">
          Mobile
          <input className={bookFieldClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </label>
        {voucher ? (
          <>
            <h2 className="pt-2 text-lg font-semibold">Who it is for</h2>
            <label className="block text-sm">
              Their name
              <input className={bookFieldClass} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required />
            </label>
            <label className="block text-sm">
              Their email
              <input className={bookFieldClass} type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} required />
            </label>
          </>
        ) : (
          <p className="text-sm text-[#5d6b64]">After payment you get a code. Use it each time you book one of the lessons.</p>
        )}
        <DetailChoices
          newsletter={newsletter}
          remember={remember}
          onNewsletter={setNewsletter}
          onRemember={setRemember}
        />
        {error ? <p className="text-sm text-[#9a3412]">{error}</p> : null}
        <BookButton type="submit" disabled={busy}>
          {busy ? "Opening Square…" : `Pay ${formatMoney(offer.priceCents, offer.currency)}`}
        </BookButton>
      </form>
    </BookShell>
  );
}

function DetailChoices({
  newsletter,
  remember,
  onNewsletter,
  onRemember,
}: {
  newsletter: boolean;
  remember: boolean;
  onNewsletter: (value: boolean) => void;
  onRemember: (value: boolean) => void;
}) {
  return (
    <div className="space-y-2 pt-1">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={newsletter} onChange={(event) => onNewsletter(event.target.checked)} />
        <span>Email me the newsletter. Lesson notes and the odd opening, not a weekly blast.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={remember} onChange={(event) => onRemember(event.target.checked)} />
        <span>Save my name, email and mobile on this device so the next booking is faster.</span>
      </label>
    </div>
  );
}
