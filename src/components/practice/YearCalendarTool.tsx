"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, MapPin, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  SERIES_META,
  availableYears,
  daysUntil,
  eventsForYear,
  formatEventDates,
  loadPlayingIds,
  monthKey,
  monthLabel,
  savePlayingIds,
  sydneyToday,
  type GolfCalendarEvent,
  type GolfEventSeries,
} from "@/lib/yearCalendar";

type Filter = "all" | "mine" | GolfEventSeries;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "My events" },
  { id: "jom", label: "JOM" },
  { id: "jnjg", label: "JNJG" },
  { id: "vardon", label: "Vardon" },
  { id: "national", label: "National" },
  { id: "club", label: "Club" },
];

function groupByMonth(events: GolfCalendarEvent[]): { month: string; events: GolfCalendarEvent[] }[] {
  const map = new Map<string, GolfCalendarEvent[]>();
  for (const e of events) {
    const key = monthKey(e.startsOn);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return [...map.entries()].map(([month, list]) => ({ month, events: list }));
}

export function YearCalendarTool({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const years = availableYears();
  const thisYear = Number(sydneyToday().slice(0, 4));
  const defaultYear = years.includes(thisYear) ? thisYear : years[0] ?? thisYear;

  const [year, setYear] = useState(defaultYear);
  const [filter, setFilter] = useState<Filter>("all");
  const [playing, setPlaying] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(() => {
    setPlaying(loadPlayingIds(user?.id));
    setHydrated(true);
  }, [user?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onUpdate = () => reload();
    window.addEventListener("yearCalendarUpdated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("yearCalendarUpdated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [reload]);

  const yearEvents = useMemo(() => eventsForYear(year), [year]);

  const visible = useMemo(() => {
    return yearEvents.filter((e) => {
      if (filter === "all") return true;
      if (filter === "mine") return playing.has(e.id);
      return e.series === filter;
    });
  }, [yearEvents, filter, playing]);

  const months = useMemo(() => groupByMonth(visible), [visible]);
  const playingCount = useMemo(
    () => yearEvents.filter((e) => playing.has(e.id)).length,
    [yearEvents, playing],
  );
  const today = sydneyToday();

  const toggle = (id: string) => {
    setPlaying((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      savePlayingIds(next, user?.id);
      return next;
    });
  };

  const yearIdx = years.indexOf(year);

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#014421]/10">
            <CalendarDays className="h-4 w-4 text-[#014421]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-900">Year calendar</h2>
            <p className="text-xs text-stone-500">
              Tap events you want to play. Practice phases come next.
            </p>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-white px-2 py-1.5">
        <button
          type="button"
          onClick={() => yearIdx > 0 && setYear(years[yearIdx - 1]!)}
          disabled={yearIdx <= 0}
          className="rounded-xl p-2 text-stone-500 disabled:opacity-30"
          aria-label="Previous year"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-lg font-bold tabular-nums text-stone-900">{year}</p>
          <p className="text-[11px] font-medium text-stone-500">
            {hydrated ? `${playingCount} selected` : "…"} · {yearEvents.length} on the calendar
          </p>
        </div>
        <button
          type="button"
          onClick={() => yearIdx >= 0 && yearIdx < years.length - 1 && setYear(years[yearIdx + 1]!)}
          disabled={yearIdx < 0 || yearIdx >= years.length - 1}
          className="rounded-xl p-2 text-stone-500 disabled:opacity-30"
          aria-label="Next year"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                active ? "bg-[#014421] text-white" : "border border-stone-200 bg-white text-stone-600"
              }`}
            >
              {f.label}
              {f.id === "mine" && playingCount > 0 ? ` (${playingCount})` : ""}
            </button>
          );
        })}
      </div>

      {months.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-10 text-center">
          <Star className="mx-auto h-7 w-7 text-stone-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-stone-700">
            {filter === "mine" ? "No events selected yet" : "No events in this filter"}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {filter === "mine"
              ? "Tap any event below All / JOM / JNJG / Vardons to mark you’re playing it."
              : "Try another series or year."}
          </p>
          {filter === "mine" && (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className="mt-3 text-xs font-bold text-[#014421] underline-offset-2 hover:underline"
            >
              Browse all events
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {months.map(({ month, events }) => (
            <section key={month}>
              <h3 className="mb-2 px-0.5 text-xs font-bold uppercase tracking-wide text-stone-400">
                {monthLabel(month)}
              </h3>
              <ul className="space-y-2">
                {events.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    selected={playing.has(e.id)}
                    today={today}
                    onToggle={() => toggle(e.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-stone-400">
        Vardon = NSW Vardon Trophy (elite amateur men, GA ≤4.4). JOM / JNJG = junior pathway. Club dates
        are placeholders — confirm with your club. Practice phases toward selected events come next.
      </p>
    </div>
  );
}

function EventRow({
  event,
  selected,
  today,
  onToggle,
}: {
  event: GolfCalendarEvent;
  selected: boolean;
  today: string;
  onToggle: () => void;
}) {
  const meta = SERIES_META[event.series];
  const until = daysUntil(event.startsOn, today);
  const past = event.endsOn < today;
  const live = event.startsOn <= today && event.endsOn >= today;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
          selected
            ? "border-[#014421] bg-[#014421]/[0.04] ring-1 ring-[#014421]"
            : "border-stone-200 bg-white hover:bg-stone-50"
        } ${past ? "opacity-70" : ""}`}
      >
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            selected ? "bg-[#014421] text-white" : "bg-stone-100 text-stone-400"
          }`}
          aria-hidden
        >
          {selected ? <Check className="h-4 w-4" /> : <Star className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.tint}`}>
              {meta.short}
            </span>
            {live && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                This week
              </span>
            )}
            {past && (
              <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-500">
                Done
              </span>
            )}
          </span>
          <span className="mt-1 block text-sm font-bold text-stone-900">{event.name}</span>
          <span className="mt-0.5 block text-xs text-stone-500">
            {formatEventDates(event)}
            {!past && until != null && until > 0 && (
              <span className="text-stone-400"> · {until} day{until === 1 ? "" : "s"} out</span>
            )}
          </span>
          {(event.venue || event.ages) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-400">
              {event.venue && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {event.venue}
                </span>
              )}
              {event.ages && <span>{event.ages}</span>}
            </span>
          )}
          {event.notes && <span className="mt-1 block text-[11px] text-stone-400">{event.notes}</span>}
        </span>
        <span className="shrink-0 pt-1 text-[11px] font-semibold text-[#014421]">
          {selected ? "Playing" : "Select"}
        </span>
      </button>
    </li>
  );
}
