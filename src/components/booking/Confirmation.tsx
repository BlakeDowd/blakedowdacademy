"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookShell } from "@/components/booking/BookShell";
import { formatWhen } from "@/lib/booking/time";

type OrderView = {
  status: string;
  kind: string;
  purpose?: string;
  offerName: string | null;
  startsAt: string | null;
  creditCode: string | null;
  redeemSlug: string | null;
  credits: number | null;
  attention: boolean;
  checkoutUrl: string | null;
  location: string;
};

export function Confirmation() {
  const params = useSearchParams();
  const orderId = params.get("order") || "";
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancel = false;
    let timer = 0;
    let tries = 0;
    const load = async () => {
      try {
        const res = await fetch(`/api/bookings/orders/${orderId}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "That payment could not be found.");
        if (cancel) return;
        setOrder(body as OrderView);
        if (body.status === "pending" && tries < 15) {
          tries += 1;
          timer = window.setTimeout(load, 2000);
        } else if (body.status === "pending") {
          setGaveUp(true);
        }
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : "That payment could not be found.");
      }
    };
    void load();
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [orderId]);

  const when = order?.startsAt ? formatWhen(new Date(order.startsAt)) : null;
  const title =
    !order || order.status === "pending"
      ? "Confirming the payment"
      : order.attention
        ? "Payment received"
        : order.purpose === "noshow"
      ? "Fee paid"
      : order.creditCode
          ? "Paid"
          : "You're booked";

  return (
    <BookShell title={title} backHref="/book">
      {!orderId ? <p>This page needs a payment to look up.</p> : null}
      {error ? <p className="text-sm text-[#9a3412]">{error}</p> : null}
      {orderId && !order && !error ? <p className="text-[#5d6b64]">Checking with Square…</p> : null}
      {order?.status === "pending" ? (
        <div className="space-y-3">
          <p>
            {gaveUp
              ? "Square has not confirmed the payment on this page yet. If you paid, the email will still arrive and the lesson will show in the diary."
              : "Square has not confirmed the payment yet. This page checks again in a moment."}
          </p>
          {order.checkoutUrl ? (
            <a className="inline-flex font-semibold text-[#c45e16]" href={order.checkoutUrl}>
              Go back to the payment
            </a>
          ) : null}
        </div>
      ) : null}
      {order?.status === "paid" && order.attention ? (
        <p>The payment is in. The time was taken while it was finishing, so Blake will contact you to pick another.</p>
      ) : null}
      {order?.status === "paid" && order.purpose === "noshow" ? (
        <p>The no-show fee is paid.</p>
      ) : null}
      {order?.status === "paid" && order.purpose !== "noshow" && !order.attention && order.kind === "appointment" ? (
        <div className="space-y-2">
          <p className="text-lg font-semibold">{order.offerName}</p>
          {when ? <p>{when}</p> : null}
          <p className="text-[#5d6b64]">{order.location}</p>
          <p className="text-sm text-[#5d6b64]">A confirmation is on its way to your email.</p>
        </div>
      ) : null}
      {order?.status === "paid" && order.creditCode ? (
        <div className="space-y-3">
          <p>The code is</p>
          <p className="text-3xl font-semibold tracking-widest">{order.creditCode}</p>
          <p className="text-[#5d6b64]">
            It covers {order.credits} {(order.credits || 1) === 1 ? "lesson" : "lessons"}. We emailed it as well.
          </p>
          {order.redeemSlug ? (
            <Link
              href={`/book/${order.redeemSlug}?code=${encodeURIComponent(order.creditCode)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#e57025] px-5 text-sm font-semibold text-[#1a140f]"
            >
              Book a time
            </Link>
          ) : null}
        </div>
      ) : null}
      {order?.status === "failed" ? <p>That payment did not finish. Go back and pick the lesson again.</p> : null}
    </BookShell>
  );
}
