"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Target, Trophy } from "lucide-react";
import {
  WEEKLY_GOAL_XP,
  fetchWeeklyGoalStatus,
  weeklyGoalItems,
  type WeeklyGoalItem,
  type WeeklyGoalStatus,
} from "@/lib/weeklyGoals";

const REFRESH_EVENTS = ["practiceSessionsUpdated", "roundsUpdated", "playerGoalsUpdated", "xpUpdated"];

function GoalRing({ item }: { item: WeeklyGoalItem }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const frac = item.target > 0 ? Math.min(1, item.done / item.target) : 0;
  return (
    <span className="relative flex h-10 w-10 items-center justify-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-stone-100" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className={`transition-[stroke-dashoffset] duration-700 ${item.met ? "stroke-[#FFA500]" : "stroke-[#014421]"}`}
        />
      </svg>
      {item.met ? (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFA500] text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        </span>
      ) : (
        <span className="text-[10px] font-bold tabular-nums text-stone-700">{Math.round(frac * 100)}%</span>
      )}
    </span>
  );
}

function daysLeftInWeek(): number {
  return 7 - ((new Date().getDay() + 6) % 7);
}

/** This week's goals with a tick for each one done. `href` makes the whole card a link. */
export function WeeklyGoalsBar({ href }: { href?: string }) {
  const [status, setStatus] = useState<WeeklyGoalStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [justEarned, setJustEarned] = useState(false);

  const refresh = useCallback(() => {
    void fetchWeeklyGoalStatus().then((next) => {
      setStatus(next);
      setLoaded(true);
      if (next?.awardedNow) setJustEarned(true);
    });
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    REFRESH_EVENTS.forEach((e) => window.addEventListener(e, onChange));
    return () => REFRESH_EVENTS.forEach((e) => window.removeEventListener(e, onChange));
  }, [refresh]);

  if (!loaded) {
    return <div className="h-[132px] animate-pulse rounded-2xl border border-stone-200 bg-white" aria-hidden />;
  }
  if (!status) return null;

  const wrap = (body: React.ReactNode, tone = "border-stone-200 bg-white") => {
    const className = `block rounded-2xl border p-4 shadow-sm transition-colors ${tone} ${href ? "hover:bg-stone-50" : ""}`;
    return href ? (
      <Link href={href} className={className}>
        {body}
      </Link>
    ) : (
      <div className={className}>{body}</div>
    );
  };

  const xpLabel = `${WEEKLY_GOAL_XP.toLocaleString()} XP`;

  if (!status.hasGoals) {
    return wrap(
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFA500]/15">
          <Target className="h-5 w-5 text-orange-600" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-stone-900">Set your weekly goals</span>
          <span className="block text-xs leading-snug text-stone-500">
            Practice, rounds, drills, combines and lessons. Finish them all to earn {xpLabel}.
          </span>
        </span>
        {href && <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" aria-hidden />}
      </div>,
    );
  }

  const items = weeklyGoalItems(status);
  const metCount = items.filter((i) => i.met).length;
  const pct = items.length > 0 ? Math.round((metCount / items.length) * 100) : 0;
  const daysLeft = daysLeftInWeek();
  const done = status.awarded || status.complete;

  return wrap(
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-stone-900">
          <Target className="h-4 w-4 text-[#014421]" aria-hidden />
          This week&apos;s goals
        </h2>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            done ? "bg-[#FFA500] text-white" : "bg-[#FFA500]/15 text-orange-700"
          }`}
        >
          {done ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : <Trophy className="h-3 w-3" aria-hidden />}
          {done ? `${xpLabel} earned` : `+${xpLabel}`}
        </span>
      </div>

      <ul
        className="mt-3 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <li key={item.key} className="flex flex-col items-center gap-1 text-center">
            <GoalRing item={item} />
            <span className="text-[11px] font-semibold leading-tight text-stone-800">{item.label}</span>
            <span className={`text-[10px] tabular-nums ${item.met ? "font-semibold text-orange-600" : "text-stone-400"}`}>
              {item.progress}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${done ? "bg-[#FFA500]" : "bg-[#014421]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-stone-500">
        {justEarned
          ? `Week complete! ${xpLabel} added to your total.`
          : done
            ? "Week complete. New goals start Monday."
            : `${metCount} of ${items.length} done · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left to earn ${xpLabel}`}
      </p>
    </>,
    done ? "border-[#FFA500]/40 bg-[#FFF8EC]" : undefined,
  );
}
