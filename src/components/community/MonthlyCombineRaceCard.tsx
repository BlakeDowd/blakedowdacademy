"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchMonthlyCombineRace,
  type MonthlyCombineRaceBoard,
} from "@/lib/monthlyCombineRace";

function DaysLeftBadge({ days }: { days: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
      <Clock className="h-3 w-3" aria-hidden />
      {days <= 0 ? "Last day" : `${days}d left`}
    </span>
  );
}

/** Compact Home → Community slot. */
export function MonthlyCombineRaceCompact() {
  const { user } = useAuth();
  const [board, setBoard] = useState<MonthlyCombineRaceBoard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchMonthlyCombineRace(user?.id).then((b) => {
      if (!cancelled) {
        setBoard(b);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) {
    return <div className="h-[88px] animate-pulse rounded-xl bg-[#014421]/[0.06]" aria-hidden />;
  }
  if (!board) return null;

  const { feature, rows, myRank, gap } = board;
  const top = rows.slice(0, 3);

  return (
    <div className="overflow-hidden rounded-xl bg-[#014421] text-white">
      <Link href="/community?tab=challenges" className="block p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#FFC966]">
              Combine of the month · {feature.monthLabel}
            </p>
            <p className="mt-0.5 truncate text-[15px] font-bold">{feature.label}</p>
          </div>
          <DaysLeftBadge days={feature.daysLeftInMonth} />
        </div>
        {top.length > 0 ? (
          <ol className="mt-2.5 space-y-1">
            {top.map((r, i) => (
              <li key={r.userId} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-center">{["🥇", "🥈", "🥉"][i]}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {r.isCurrentUser ? "You" : r.name.split(" ")[0] || r.name}
                </span>
                <span className="font-bold tabular-nums text-[#FFC966]">{r.scoreDisplay}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-white/75">No scores this month yet. Be first on the board.</p>
        )}
        {myRank != null && myRank > 3 && (
          <p className="mt-1.5 text-xs font-semibold text-[#FFC966]">You&apos;re #{myRank}</p>
        )}
        {gap && <p className="mt-1 text-[11px] text-white/75">{gap.label}</p>}
      </Link>
      <Link
        href={feature.href}
        className="flex items-center justify-center border-t border-white/15 bg-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/15"
      >
        Play {feature.label}
      </Link>
    </div>
  );
}

/** Full card for Community → Challenges. */
export function MonthlyCombineRaceCard() {
  const { user } = useAuth();
  const [board, setBoard] = useState<MonthlyCombineRaceBoard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchMonthlyCombineRace(user?.id).then((b) => {
      if (!cancelled) {
        setBoard(b);
        setLoading(false);
      }
    });
    const onUpdate = () => {
      void fetchMonthlyCombineRace(user?.id).then((b) => {
        if (!cancelled) setBoard(b);
      });
    };
    window.addEventListener("practiceSessionsUpdated", onUpdate);
    window.addEventListener("practiceDrawUpdated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("practiceSessionsUpdated", onUpdate);
      window.removeEventListener("practiceDrawUpdated", onUpdate);
    };
  }, [user?.id]);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-stone-200 bg-white" aria-hidden />;
  }
  if (!board) return null;

  const { feature, rows, myRank, myRow, gap, totalPlayers } = board;
  const shown = rows.slice(0, 10);
  const meOffBoard = myRank != null && myRank > 10 && myRow;

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-[#014421] to-[#0b6b3a] px-4 py-3.5 text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#FFC966]">
              <Trophy className="h-3.5 w-3.5" aria-hidden />
              Combine of the month
            </p>
            <h3 className="mt-0.5 text-lg font-bold leading-tight">{feature.label}</h3>
            <p className="mt-0.5 text-xs text-white/70">
              {feature.monthLabel} · best score wins · {feature.scoreHeader}
            </p>
          </div>
          <DaysLeftBadge days={feature.daysLeftInMonth} />
        </div>
        {gap && (
          <p className="mt-2.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-[#FFC966]">
            {gap.label}
          </p>
        )}
        {myRank == null && (
          <p className="mt-2.5 text-xs text-white/75">
            Log this combine once this month to join the race.
          </p>
        )}
      </div>

      <div className="px-4 py-3">
        {shown.length === 0 ? (
          <p className="py-2 text-center text-sm text-stone-500">No scores yet this month.</p>
        ) : (
          <ol className="space-y-1.5">
            {shown.map((r, i) => (
              <li
                key={r.userId}
                className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm ${
                  r.isCurrentUser ? "bg-[#014421]/[0.08] ring-1 ring-[#014421]/20" : "bg-stone-50"
                }`}
              >
                <span className="w-6 text-center text-xs font-bold text-stone-400">#{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-stone-900">
                  {r.isCurrentUser ? "You" : r.name}
                </span>
                <span className="font-bold tabular-nums text-[#014421]">{r.scoreDisplay}</span>
              </li>
            ))}
            {meOffBoard && myRow && (
              <li className="flex items-center gap-2 rounded-xl bg-[#014421]/[0.08] px-2.5 py-2 text-sm ring-1 ring-[#014421]/20">
                <span className="w-6 text-center text-xs font-bold text-stone-400">#{myRank}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-stone-900">You</span>
                <span className="font-bold tabular-nums text-[#014421]">{myRow.scoreDisplay}</span>
              </li>
            )}
          </ol>
        )}
        {totalPlayers > 0 && (
          <p className="mt-2 text-center text-[11px] text-stone-400">
            {totalPlayers} player{totalPlayers === 1 ? "" : "s"} this month
          </p>
        )}
      </div>

      <div className="border-t border-stone-100 p-3">
        <Link
          href={feature.href}
          className="flex w-full items-center justify-center rounded-xl bg-[#014421] py-2.5 text-sm font-bold text-white"
        >
          Play now
        </Link>
      </div>
    </article>
  );
}
