"use client";

import { useEffect, useState } from "react";
import { BookButton, BookShell } from "@/components/booking/BookShell";
import { formatWhen } from "@/lib/booking/time";

type Preview = {
  ok?: boolean;
  message?: string;
  offer_name?: string;
  starts_at?: string;
  location?: string;
  applied?: boolean;
};

export function CancelBooking({ token }: { token: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/bookings/cancel?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "This link is not a booking.");
        return body as Preview;
      })
      .then((body) => {
        if (!cancel) setPreview(body);
      })
      .catch((err: Error) => {
        if (!cancel) setError(err.message);
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  async function cancelBooking() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That cancel didn't go through.");
      setPreview(body as Preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That cancel didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  const when = preview?.starts_at ? formatWhen(new Date(preview.starts_at)) : null;

  return (
    <BookShell title={preview?.applied ? "Cancelled" : "Cancel this lesson"} backHref="/book">
      {!preview && !error ? <p className="text-[#5d6b64]">Loading…</p> : null}
      {error ? <p className="text-sm text-[#9a3412]">{error}</p> : null}
      {preview ? (
        <div className="space-y-3">
          {preview.offer_name ? <p className="text-lg font-semibold">{preview.offer_name}</p> : null}
          {when ? <p>{when}</p> : null}
          {preview.location ? <p className="text-[#5d6b64]">{preview.location}</p> : null}
          <p>{preview.message}</p>
          {preview.ok && !preview.applied ? (
            <BookButton disabled={busy} onClick={() => void cancelBooking()}>
              {busy ? "Cancelling…" : "Cancel the lesson"}
            </BookButton>
          ) : null}
        </div>
      ) : null}
    </BookShell>
  );
}
