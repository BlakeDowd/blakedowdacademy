"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Pin, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import {
  fetchFeelLogs,
  formatFeelLogWhen,
  type FeelLogEntry,
} from "@/lib/feelLog";

/** Homepage feel diary — all recent cues; golden anchors featured as the main cards. */
export function HomeGoldenFeelsCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FeelLogEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setRows([]);
      setReady(true);
      return;
    }
    let cancelled = false;
    void fetchFeelLogs(createClient(), { userId: user.id }).then((res) => {
      if (cancelled) return;
      setRows(res.rows);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const { featured, recent } = useMemo(() => {
    const golden = rows.filter((r) => r.is_hitting_it_good);
    // Pinned goldens first, then newest golden.
    const featuredList = [...golden].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return b.logged_at.localeCompare(a.logged_at);
    });
    const featuredIds = new Set(featuredList.map((r) => r.id));
    const recentList = rows
      .filter((r) => !featuredIds.has(r.id))
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return b.logged_at.localeCompare(a.logged_at);
      })
      .slice(0, featuredList.length > 0 ? 3 : 5);
    return {
      featured: featuredList.slice(0, 3),
      recent: recentList,
    };
  }, [rows]);

  if (!user?.id || !ready) return null;

  const empty = featured.length === 0 && recent.length === 0;

  return (
    <div className="mb-6 w-full px-4">
      <section className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <Sparkles className="h-4 w-4 text-amber-600" aria-hidden />
            Feel log
          </h2>
          <Link
            href="/feel-log"
            className="flex items-center gap-1.5 text-sm font-semibold text-[#FFA500] hover:underline"
          >
            Open
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <p className="mt-1 text-[11px] text-stone-500">
          Your cues — golden anchors stay up top for confidence.
        </p>

        {empty ? (
          <Link
            href="/feel-log"
            className="mt-3 block rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-3 text-center"
          >
            <p className="text-sm font-semibold text-stone-800">No feels logged yet</p>
            <p className="mt-0.5 text-xs text-stone-500">
              Save a cue after practice. Mark it golden when it really clicks.
            </p>
          </Link>
        ) : (
          <div className="mt-3 space-y-3">
            {featured.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Golden anchors
                </p>
                <ul className="space-y-2">
                  {featured.map((entry) => (
                    <FeelHomeRow key={entry.id} entry={entry} featured />
                  ))}
                </ul>
              </div>
            ) : null}

            {recent.length > 0 ? (
              <div>
                {featured.length > 0 ? (
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-stone-400">
                    Recent feels
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {recent.map((entry) => (
                    <FeelHomeRow key={entry.id} entry={entry} featured={false} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function FeelHomeRow({ entry, featured }: { entry: FeelLogEntry; featured: boolean }) {
  return (
    <li>
      <Link
        href="/feel-log"
        className={`block rounded-xl px-3 py-2.5 transition ring-1 ${
          featured
            ? "bg-gradient-to-br from-amber-50 to-white ring-amber-200 hover:ring-amber-300"
            : "bg-stone-50/90 ring-stone-100 hover:ring-stone-200"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-stone-900">{entry.club}</span>
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${
              featured
                ? "bg-amber-50 text-amber-900 ring-amber-100"
                : "bg-white text-stone-500 ring-stone-200"
            }`}
          >
            {entry.focus_area}
          </span>
          {featured ? (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
              <Sparkles className="h-3 w-3" aria-hidden />
              Golden
            </span>
          ) : null}
          {entry.is_pinned ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#014421]">
              <Pin className="h-3 w-3" aria-hidden />
              Pinned
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-stone-800">
          {entry.target_feel}
        </p>
        <p className="mt-1 text-[10px] font-medium text-stone-400">
          {formatFeelLogWhen(entry.logged_at)}
          {entry.ball_flight_result ? ` · ${entry.ball_flight_result}` : ""}
        </p>
      </Link>
    </li>
  );
}
