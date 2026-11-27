"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookShell } from "@/components/booking/BookShell";
import { formatMoney } from "@/lib/booking/time";

type Offer = {
  slug: string;
  name: string;
  description: string;
  kind: string;
  listGroup: string;
  credits: number;
  durationMinutes: number | null;
  priceCents: number;
  currency: string;
};

export function BookHome() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch("/api/bookings/offers")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "The lesson list didn't load.");
        return body.offers as Offer[];
      })
      .then((rows) => {
        if (!cancel) setOffers(rows);
      })
      .catch((err: Error) => {
        if (!cancel) setError(err.message);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const lessons = (offers ?? []).filter((offer) => offer.listGroup === "lesson");
  const vouchers = (offers ?? []).filter((offer) => offer.listGroup === "voucher");

  return (
    <BookShell title="Book a lesson" lede="Pick a lesson at Stonecutters Ridge Golf Club. You pay on Square, then the time is yours.">
      {error ? <p className="rounded-2xl bg-white p-4 text-sm text-[#9a3412]">{error}</p> : null}
      {!offers && !error ? <p className="text-[#5d6b64]">Loading lessons…</p> : null}
      {offers ? (
        <div className="space-y-10">
          <OfferGrid title="Lessons" offers={lessons} action={(offer) => (offer.kind === "appointment" ? "Book" : "Buy the pack")} />
          <OfferGrid title="Gift a lesson" offers={vouchers} action={() => "Buy voucher"} />
        </div>
      ) : null}
    </BookShell>
  );
}

function OfferGrid({
  title,
  offers,
  action,
}: {
  title: string;
  offers: Offer[];
  action: (offer: Offer) => string;
}) {
  if (!offers.length) return null;
  return (
    <section>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {offers.map((offer) => (
          <article key={offer.slug} className="flex flex-col rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold">{offer.name}</h3>
              <span className="shrink-0 font-semibold">{formatMoney(offer.priceCents, offer.currency)}</span>
            </div>
            <p className="mt-2 flex-1 text-sm text-[#5d6b64]">{offer.description}</p>
            <Link
              href={`/book/${offer.slug}`}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#e57025] px-4 text-sm font-semibold text-[#1a140f]"
            >
              {action(offer)}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
