"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPracticeDrawStatus,
  type PracticeDrawStatus,
} from "@/lib/practiceDrawTickets";

function waysToEarn(status: PracticeDrawStatus): { label: string; live: boolean }[] {
  const r = status.earnRules;
  return [
    {
      label: `Log ${r.practiceMinutesPerTicket} min practice = 1 ticket`,
      live: r.practiceMinutesPerTicket > 0,
    },
    {
      label:
        r.combineTickets > 0
          ? `Complete a combine = ${r.combineTickets} ticket${r.combineTickets === 1 ? "" : "s"}`
          : "Complete a combine (coming soon)",
      live: r.combineTickets > 0,
    },
    {
      label:
        r.drillTickets > 0
          ? `Finish drills = ${r.drillTickets} ticket${r.drillTickets === 1 ? "" : "s"}`
          : "Drills (coming soon)",
      live: r.drillTickets > 0,
    },
    {
      label:
        r.toolTickets > 0
          ? `Use training tools = ${r.toolTickets} ticket${r.toolTickets === 1 ? "" : "s"}`
          : "Training tools (coming soon)",
      live: r.toolTickets > 0,
    },
  ];
}

function useLessonDrawStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PracticeDrawStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setStatus(null);
      setLoading(false);
      return;
    }
    const next = await fetchPracticeDrawStatus(user.id);
    setStatus(next);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUpdate = () => {
      void load();
    };
    window.addEventListener("practiceDrawUpdated", onUpdate);
    window.addEventListener("practiceSessionsUpdated", onUpdate);
    return () => {
      window.removeEventListener("practiceDrawUpdated", onUpdate);
      window.removeEventListener("practiceSessionsUpdated", onUpdate);
    };
  }, [load]);

  return { status, loading, userId: user?.id ?? "" };
}

/** Compact block for Home → Community “Challenge of the week” slot. */
export function CommunityLessonDrawCompact() {
  const { status, loading, userId } = useLessonDrawStatus();
  if (!userId) return null;
  if (loading) {
    return <div className="h-[72px] animate-pulse rounded-xl bg-[#014421]/[0.06]" aria-hidden />;
  }
  if (!status) return null;

  const ticketLabel = status.tickets === 1 ? "ticket" : "tickets";
  const progressPct = Math.min(
    100,
    Math.round(
      ((status.minutesPerTicket - status.minutesToNext) / Math.max(1, status.minutesPerTicket)) * 100,
    ),
  );

  return (
    <Link href="/community?tab=challenges" className="block rounded-xl bg-[#014421] p-3 text-white">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{status.prize} draw</p>
          <p className="mt-0.5 text-xs text-white/75">
            Log 1 hour of practice = 1 ticket. Combines, drills &amp; tools coming soon.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
          <Ticket className="h-3 w-3" aria-hidden />
          {status.tickets}
        </span>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div>
          <p className="text-lg font-bold tabular-nums">
            {status.tickets}{" "}
            <span className="text-sm font-semibold text-white/70">{ticketLabel}</span>
          </p>
          <p className="text-[11px] text-white/70">
            {status.minutesToNext > 0
              ? `${status.minutesToNext} min to your next ticket`
              : "Ready for your next hour"}
          </p>
        </div>
        {status.totalTicketsInDraw > 0 && (
          <p className="shrink-0 text-right text-[11px] text-white/55">
            {status.totalTicketsInDraw} in the draw
          </p>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-[#FFC966] transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </Link>
  );
}

/** Full card for Community → Challenges tab. */
export function CommunityLessonDrawCard() {
  const { status, loading, userId } = useLessonDrawStatus();
  if (!userId) return null;
  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-stone-200 bg-white" aria-hidden />;
  }
  if (!status) return null;

  const ticketLabel = status.tickets === 1 ? "ticket" : "tickets";
  const progressPct = Math.min(
    100,
    Math.round(
      ((status.minutesPerTicket - status.minutesToNext) / Math.max(1, status.minutesPerTicket)) * 100,
    ),
  );
  const ways = waysToEarn(status);

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFA500]/15">
          <Ticket className="h-5 w-5 text-[#FFA500]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#FFA500]">Community draw</p>
          <h3 className="text-base font-bold text-stone-900">{status.prize}</h3>
          <p className="mt-0.5 text-xs text-stone-500">
            Tickets go into a random draw. More tickets = better odds.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold tabular-nums text-stone-900">
            {status.tickets}
            <span className="ml-1.5 text-sm font-semibold text-stone-500">{ticketLabel}</span>
          </p>
          <p className="text-xs text-stone-500">
            {status.minutesToNext > 0
              ? `${status.minutesToNext} min practice to your next ticket`
              : "Log another hour for another ticket"}
          </p>
        </div>
        {status.totalTicketsInDraw > 0 && (
          <p className="shrink-0 text-right text-xs text-stone-400">
            {status.totalTicketsInDraw} tickets in the draw
          </p>
        )}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-[#FFA500] transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ul className="mt-3 space-y-1.5">
        {ways.map((w) => (
          <li
            key={w.label}
            className={`flex items-center gap-2 text-xs ${
              w.live ? "font-semibold text-stone-800" : "text-stone-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                w.live ? "bg-[#014421]" : "bg-stone-300"
              }`}
              aria-hidden
            />
            {w.label}
          </li>
        ))}
      </ul>

      <Link
        href="/practice"
        className="mt-3 flex w-full items-center justify-center rounded-xl bg-[#014421] py-2.5 text-sm font-bold text-white"
      >
        Log practice
      </Link>
    </article>
  );
}
