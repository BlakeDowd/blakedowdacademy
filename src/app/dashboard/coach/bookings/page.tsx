"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isCoachEmail } from "@/lib/coachEmails";
import { createClient } from "@/lib/supabase/client";
import { CoachCalendar } from "@/components/booking/CoachCalendar";
import { formatWhen, minutesLabel, weekdayName } from "@/lib/booking/time";

type Agenda = {
  squareReady: boolean;
  settings: {
    timezone: string;
    slotMinutes: number;
    bufferMinutes: number;
    minNoticeMinutes: number;
    discountWithinDays: number;
    discountPercent: number;
    noshowFeeCents: number;
    location: string;
  } | null;
  hours: { weekday: number; startMinute: number; endMinute: number; active: boolean }[];
  blocks: { id: string; starts_at: string; ends_at: string; reason: string | null }[];
  bookings: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    note: string | null;
    offerName: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    newsletter: boolean;
    feeStatus: string | null;
  }[];
  credits: { id: string; code: string; remaining: number; recipientName: string; recipientEmail: string; offerName: string }[];
};

type HourRow = { weekday: number; startMinute: number; endMinute: number; active: boolean };

async function coachHeaders(json = false) {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function CoachBookingsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notLive, setNotLive] = useState(false);
  const [hours, setHours] = useState<HourRow[]>([]);
  const [location, setLocation] = useState("Stonecutters Ridge Golf Club");
  const [buffer, setBuffer] = useState(15);
  const [notice, setNotice] = useState(120);
  const [discountDays, setDiscountDays] = useState(3);
  const [discountPercent, setDiscountPercent] = useState(20);
  const [noshowDollars, setNoshowDollars] = useState(50);
  const [saving, setSaving] = useState(false);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [blockDate, setBlockDate] = useState("");
  const [blockStart, setBlockStart] = useState("08:00");
  const [blockEnd, setBlockEnd] = useState("17:00");
  const [blockReason, setBlockReason] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/bookings/admin", { headers: await coachHeaders() });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "The diary didn't load.");
    const next = body as Agenda;
    setAgenda(next);
    const byDay = new Map(next.hours.map((row) => [row.weekday, row]));
    setHours(
      [0, 1, 2, 3, 4, 5, 6].map(
        (weekday) => byDay.get(weekday) ?? { weekday, startMinute: 8 * 60, endMinute: 17 * 60, active: false },
      ),
    );
    if (next.settings) {
      setLocation(next.settings.location);
      setBuffer(next.settings.bufferMinutes);
      setNotice(next.settings.minNoticeMinutes);
      setDiscountDays(next.settings.discountWithinDays);
      setDiscountPercent(next.settings.discountPercent);
      setNoshowDollars(Math.round(next.settings.noshowFeeCents / 100));
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user || !isCoachEmail(user.email)) {
      router.push("/login");
      return;
    }
    load().catch((err: Error) => {
      if (/not turned on|not connected|not set up/i.test(err.message)) setNotLive(true);
      else setError(err.message);
    });
  }, [user, loading, router, load]);

  async function saveHours() {
    setSaving(true);
    setNoticeText(null);
    try {
      const res = await fetch("/api/bookings/admin", {
        method: "PUT",
        headers: await coachHeaders(true),
        body: JSON.stringify({
          location,
          bufferMinutes: buffer,
          minNoticeMinutes: notice,
          discountWithinDays: discountDays,
          discountPercent,
          noshowFeeCents: Math.round(noshowDollars * 100),
          hours,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Those hours didn't save.");
      setNoticeText("Hours saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those hours didn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function addBlock(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await fetch("/api/bookings/admin", {
      method: "POST",
      headers: await coachHeaders(true),
      body: JSON.stringify({
        date: blockDate,
        start: blockStart,
        end: blockEnd,
        reason: blockReason,
        timeZone: agenda?.settings?.timezone || "Australia/Sydney",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "That block didn't save.");
      return;
    }
    setBlockReason("");
    await load();
  }

  async function removeBlock(id: string) {
    await fetch("/api/bookings/admin", {
      method: "POST",
      headers: await coachHeaders(true),
      body: JSON.stringify({ action: "remove-block", blockId: id }),
    });
    await load();
  }

  async function markNoShow(id: string) {
    const fee = noshowDollars > 0 ? ` and email them the $${noshowDollars} fee` : "";
    if (!window.confirm(`Mark this as a no-show${fee}?`)) return;
    const res = await fetch("/api/bookings/admin", {
      method: "POST",
      headers: await coachHeaders(true),
      body: JSON.stringify({ action: "noshow", bookingId: id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "That no-show didn't save.");
      return;
    }
    await load();
  }

  async function cancelBooking(id: string) {
    if (!window.confirm("Cancel this lesson? A card payment is refunded by you in Square.")) return;
    const res = await fetch(`/api/bookings/admin/bookings/${id}/cancel`, {
      method: "POST",
      headers: await coachHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "That cancel didn't go through.");
      return;
    }
    await load();
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-md flex-col bg-stone-50">
      <header className="px-4 pt-4">
        <Link href="/dashboard/coach" className="inline-flex items-center gap-1.5 py-1.5 text-sm font-semibold text-stone-600">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Player reports
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">Diary</h1>
        <p className="mt-0.5 text-sm text-stone-500">Your calendar. Students cannot book until you turn this on.</p>
      </header>

      <div className="space-y-4 px-4 pb-32 pt-4">
        {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
        {!agenda && !error && !notLive ? (
          <p className="flex items-center gap-2 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the diary…
          </p>
        ) : null}

        {notLive ? (
          <section className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
            Not live yet. The day, week, and month views are here. Lessons show up after the booking database is turned on.
          </section>
        ) : null}

        {agenda && !agenda.squareReady ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Square is not connected yet</p>
            <p className="mt-1">
              Add <code>SQUARE_ACCESS_TOKEN</code>, <code>SQUARE_LOCATION_ID</code>, and <code>SQUARE_ENV</code> on the server.
              For the payment to confirm if someone closes the tab, also add <code>SQUARE_WEBHOOK_SIGNATURE_KEY</code> and{" "}
              <code>SQUARE_WEBHOOK_URL</code> for <code>/api/bookings/square/webhook</code>. Set <code>NEXT_PUBLIC_SITE_URL</code> to this app&apos;s address so Square sends people back to the right page.
            </p>
          </section>
        ) : null}

        {agenda ? (
          <a href="/book" className="block rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-[#014421]">
            Open the public booking page
          </a>
        ) : null}

        <CoachCalendar
          bookings={agenda?.bookings ?? []}
          blocks={agenda?.blocks ?? []}
          timeZone={agenda?.settings?.timezone}
          onCancel={(id) => void cancelBooking(id)}
          onNoShow={(id) => void markNoShow(id)}
          onRemoveBlock={(id) => void removeBlock(id)}
        />

        <section className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <h2 className="text-sm font-bold text-stone-900">Block a stretch</h2>
          <form onSubmit={addBlock} className="mt-3 space-y-2">
            <input type="date" required value={blockDate} onChange={(e) => setBlockDate(e.target.value)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" step={1800} value={blockStart} onChange={(e) => setBlockStart(e.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm" />
              <input type="time" step={1800} value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} className="rounded-xl border border-stone-200 px-3 py-2 text-sm" />
            </div>
            <input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Reason, optional" className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-xl bg-[#014421] px-3 py-2 text-xs font-semibold text-white">
              Block it
            </button>
          </form>
          <ul className="mt-3 space-y-2">
            {(agenda?.blocks ?? []).map((block) => (
              <li key={block.id} className="flex items-start justify-between gap-2 text-xs text-stone-600">
                <span>
                  {formatWhen(new Date(block.starts_at))} – {formatWhen(new Date(block.ends_at))}
                  {block.reason ? ` · ${block.reason}` : ""}
                </span>
                <button type="button" onClick={() => void removeBlock(block.id)} className="font-semibold text-stone-800">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <h2 className="text-sm font-bold text-stone-900">Hours</h2>
          <p className="mt-1 text-xs text-stone-500">
            Sydney time. A lesson has to finish inside these hours. Sunday starts closed. Inside the closer-in window, a day that is still under half full has its open times discounted.
          </p>
          <label className="mt-3 block text-xs font-semibold text-stone-600">
            Where the lesson is
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-normal text-stone-900" />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-stone-600">
              Gap after a lesson
              <select value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-normal">
                {[0, 15, 30, 45, 60].map((value) => (
                  <option key={value} value={value}>
                    {value} min
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-stone-600">
              Closer-in window
              <select value={discountDays} onChange={(e) => setDiscountDays(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-normal">
                {[0, 1, 2, 3, 5, 7].map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? "Off" : `${value} days`}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-stone-600">
              Closer-in discount
              <select value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-normal">
                {[0, 10, 15, 20, 25, 30].map((value) => (
                  <option key={value} value={value}>
                    {value === 0 ? "None" : `${value}% off`}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-stone-600">
              No-show fee
              <input
                type="number"
                min={0}
                max={500}
                value={noshowDollars}
                onChange={(e) => setNoshowDollars(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-stone-600">
              Soonest booking
              <select value={notice} onChange={(e) => setNotice(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-normal">
                <option value={0}>No notice</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={240}>4 hours</option>
                <option value={1440}>1 day</option>
              </select>
            </label>
          </div>
          <div className="mt-3 space-y-2">
            {hours.map((row) => (
              <div key={row.weekday} className="grid grid-cols-[1.1fr_auto_1fr_1fr] items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 font-semibold text-stone-700">
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(e) =>
                      setHours((current) => current.map((item) => (item.weekday === row.weekday ? { ...item, active: e.target.checked } : item)))
                    }
                  />
                  {weekdayName(row.weekday).slice(0, 3)}
                </label>
                <span />
                <input
                  type="time"
                  step={1800}
                  disabled={!row.active}
                  value={minutesLabel(row.startMinute)}
                  onChange={(e) =>
                    setHours((current) =>
                      current.map((item) => (item.weekday === row.weekday ? { ...item, startMinute: clockToMinutes(e.target.value) } : item)),
                    )
                  }
                  className="rounded-lg border border-stone-200 px-1 py-1 disabled:opacity-40"
                />
                <input
                  type="time"
                  step={1800}
                  disabled={!row.active}
                  value={minutesLabel(row.endMinute)}
                  onChange={(e) =>
                    setHours((current) =>
                      current.map((item) => (item.weekday === row.weekday ? { ...item, endMinute: clockToMinutes(e.target.value) } : item)),
                    )
                  }
                  className="rounded-lg border border-stone-200 px-1 py-1 disabled:opacity-40"
                />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => void saveHours()} disabled={saving} className="mt-3 rounded-xl bg-[#014421] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
            {saving ? "Saving…" : "Save hours"}
          </button>
          {noticeText ? <p className="mt-2 text-xs text-[#014421]">{noticeText}</p> : null}
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
          <h2 className="text-sm font-bold text-stone-900">Unused lesson credits</h2>
          <ul className="mt-3 space-y-2">
            {(agenda?.credits ?? []).length === 0 ? <li className="text-sm text-stone-500">None waiting to be booked.</li> : null}
            {(agenda?.credits ?? []).map((credit) => (
              <li key={credit.id} className="text-sm text-stone-700">
                <span className="font-semibold tracking-wide">{credit.code}</span> · {credit.remaining} left · {credit.offerName}
                {credit.recipientName ? <span className="block text-xs text-stone-500">{credit.recipientName} · {credit.recipientEmail}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function clockToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}
