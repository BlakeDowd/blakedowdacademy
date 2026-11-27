"use client";

import { useMemo, useState } from "react";
import { addDays, formatTime, partsInZone, todayInZone, ymd, zonedToUtc, BOOKING_TZ } from "@/lib/booking/time";

type Booking = {
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
};

type Block = { id: string; starts_at: string; ends_at: string; reason: string | null };

type View = "day" | "week" | "month";

type DateParts = { year: number; month: number; day: number };

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CoachCalendar({
  bookings,
  blocks,
  timeZone = BOOKING_TZ,
  onCancel,
  onNoShow,
  onRemoveBlock,
}: {
  bookings: Booking[];
  blocks: Block[];
  timeZone?: string;
  onCancel: (id: string) => void;
  onNoShow: (id: string) => void;
  onRemoveBlock: (id: string) => void;
}) {
  const today = todayInZone(new Date(), timeZone);
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<DateParts>(today);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const key = ymd(cursor.year, cursor.month, cursor.day);
  const lessonsToday = useMemo(() => onDate(bookings, key, timeZone), [bookings, key, timeZone]);
  const blocksToday = useMemo(() => blocksOnDate(blocks, key, timeZone), [blocks, key, timeZone]);
  const selected = bookings.find((booking) => booking.id === selectedId) ?? null;

  function move(direction: number) {
    if (view === "month") setCursor((current) => addMonths(current, direction));
    else if (view === "week") setCursor((current) => addDays(current.year, current.month, current.day, direction * 7));
    else setCursor((current) => addDays(current.year, current.month, current.day, direction));
    setSelectedId(null);
  }

  function openDay(date: DateParts) {
    setCursor(date);
    setView("day");
    setSelectedId(null);
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white px-3 py-3">
      <div className="grid grid-cols-3 rounded-xl bg-stone-100 p-1 text-xs font-semibold">
        {(["day", "week", "month"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            className={`rounded-lg px-2 py-1.5 capitalize ${view === item ? "bg-white text-stone-900 shadow-sm" : "text-stone-500"}`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => move(-1)} className="rounded-lg px-2 py-1 text-sm font-semibold text-stone-600" aria-label="Previous">
          ‹
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-bold text-stone-900">{rangeLabel(view, cursor, timeZone)}</p>
          <button
            type="button"
            onClick={() => {
              setCursor(today);
              setSelectedId(null);
            }}
            className="text-xs font-semibold text-[#014421]"
          >
            Today
          </button>
        </div>
        <button type="button" onClick={() => move(1)} className="rounded-lg px-2 py-1 text-sm font-semibold text-stone-600" aria-label="Next">
          ›
        </button>
      </div>

      {view === "month" ? (
        <MonthGrid
          cursor={cursor}
          today={today}
          bookings={bookings}
          blocks={blocks}
          timeZone={timeZone}
          onOpenDay={openDay}
        />
      ) : null}
      {view === "week" ? (
        <WeekGrid
          cursor={cursor}
          today={today}
          bookings={bookings}
          blocks={blocks}
          timeZone={timeZone}
          onOpenDay={openDay}
          onSelect={setSelectedId}
          selectedId={selectedId}
        />
      ) : null}
      {view === "day" ? (
        <DayList
          lessons={lessonsToday}
          blocks={blocksToday}
          timeZone={timeZone}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      ) : null}

      {selected ? (
        <LessonDetail booking={selected} timeZone={timeZone} onCancel={onCancel} onNoShow={onNoShow} />
      ) : null}
      {view === "day" && blocksToday.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {blocksToday.map((block) => (
            <li key={block.id} className="flex items-start justify-between gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-600">
              <span>
                Blocked {formatTime(new Date(block.starts_at), timeZone)}–{formatTime(new Date(block.ends_at), timeZone)}
                {block.reason ? ` · ${block.reason}` : ""}
              </span>
              <button type="button" onClick={() => onRemoveBlock(block.id)} className="font-semibold text-stone-800">
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MonthGrid({
  cursor,
  today,
  bookings,
  blocks,
  timeZone,
  onOpenDay,
}: {
  cursor: DateParts;
  today: DateParts;
  bookings: Booking[];
  blocks: Block[];
  timeZone: string;
  onOpenDay: (date: DateParts) => void;
}) {
  const cells = monthCells(cursor);
  return (
    <div className="mt-3">
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wide text-stone-400">
        {WEEK_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const dateKey = ymd(cell.year, cell.month, cell.day);
          const count = onDate(bookings, dateKey, timeZone).length + blocksOnDate(blocks, dateKey, timeZone).length;
          const inMonth = cell.month === cursor.month;
          const isToday = sameDate(cell, today);
          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onOpenDay(cell)}
              className={`flex h-11 flex-col items-center justify-center rounded-lg text-xs ${
                isToday ? "bg-[#014421] text-white" : inMonth ? "text-stone-800" : "text-stone-300"
              }`}
            >
              <span className="font-semibold">{cell.day}</span>
              {count > 0 ? (
                <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${isToday ? "bg-white" : "bg-[#e57025]"}`} aria-label={`${count} bookings`} />
              ) : (
                <span className="mt-0.5 h-1.5 w-1.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  cursor,
  today,
  bookings,
  blocks,
  timeZone,
  onOpenDay,
  onSelect,
  selectedId,
}: {
  cursor: DateParts;
  today: DateParts;
  bookings: Booking[];
  blocks: Block[];
  timeZone: string;
  onOpenDay: (date: DateParts) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const days = weekDays(cursor);
  return (
    <div className="mt-3 grid grid-cols-7 gap-1">
      {days.map((day, index) => {
        const dateKey = ymd(day.year, day.month, day.day);
        const lessons = onDate(bookings, dateKey, timeZone);
        const dayBlocks = blocksOnDate(blocks, dateKey, timeZone);
        const isToday = sameDate(day, today);
        return (
          <div key={dateKey} className="min-w-0">
            <button type="button" onClick={() => onOpenDay(day)} className="w-full text-center">
              <span className="block text-[10px] font-semibold uppercase text-stone-400">{WEEK_LABELS[index]}</span>
              <span className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-[#014421] text-white" : "text-stone-800"}`}>
                {day.day}
              </span>
            </button>
            <div className="mt-1 space-y-1">
              {lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => onSelect(lesson.id)}
                  className={`block w-full truncate rounded px-0.5 py-0.5 text-left text-[10px] font-semibold leading-tight ${
                    lesson.id === selectedId ? "bg-[#014421] text-white" : statusClass(lesson.status)
                  }`}
                >
                  {formatTime(new Date(lesson.startsAt), timeZone).replace(":00", "").replace(" ", "")}
                </button>
              ))}
              {dayBlocks.map((block) => (
                <span key={block.id} className="block truncate rounded bg-stone-200 px-0.5 py-0.5 text-[10px] text-stone-600">
                  Off
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayList({
  lessons,
  blocks,
  timeZone,
  selectedId,
  onSelect,
}: {
  lessons: Booking[];
  blocks: Block[];
  timeZone: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (lessons.length === 0 && blocks.length === 0) {
    return <p className="mt-4 text-sm text-stone-500">Nothing booked this day.</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {lessons.map((lesson) => (
        <li key={lesson.id}>
          <button
            type="button"
            onClick={() => onSelect(lesson.id)}
            className={`w-full rounded-xl px-3 py-2 text-left ${lesson.id === selectedId ? "bg-[#014421] text-white" : statusClass(lesson.status)}`}
          >
            <span className="block text-sm font-semibold">
              {formatTime(new Date(lesson.startsAt), timeZone)} · {lesson.customerName || "Lesson"}
            </span>
            <span className={`block text-xs ${lesson.id === selectedId ? "text-white/80" : "text-stone-600"}`}>
              {lesson.offerName}
              {lesson.status === "held" ? " · waiting for payment" : ""}
              {lesson.status === "noshow" ? " · no-show" : ""}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LessonDetail({
  booking,
  timeZone,
  onCancel,
  onNoShow,
}: {
  booking: Booking;
  timeZone: string;
  onCancel: (id: string) => void;
  onNoShow: (id: string) => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-stone-200 px-3 py-3">
      <p className="text-sm font-semibold text-stone-900">
        {formatTime(new Date(booking.startsAt), timeZone)}–{formatTime(new Date(booking.endsAt), timeZone)} · {booking.customerName}
      </p>
      <p className="text-sm text-stone-700">{booking.offerName}</p>
      <p className="text-xs text-stone-500">
        {booking.customerEmail}
        {booking.customerPhone ? ` · ${booking.customerPhone}` : ""}
      </p>
      {booking.note ? <p className="mt-1 text-xs text-stone-600">{booking.note}</p> : null}
      {booking.newsletter ? <p className="mt-1 text-xs font-semibold text-[#014421]">Newsletter</p> : null}
      {booking.status === "noshow" ? (
        <p className="mt-1 text-xs font-semibold text-red-800">
          No-show{booking.feeStatus === "paid" ? " · fee paid" : booking.feeStatus === "pending" ? " · fee sent" : ""}
        </p>
      ) : null}
      <div className="mt-2 flex gap-3">
        {booking.status === "confirmed" && new Date(booking.startsAt).getTime() <= Date.now() ? (
          <button type="button" onClick={() => onNoShow(booking.id)} className="text-xs font-semibold text-red-700">
            No-show
          </button>
        ) : null}
        {booking.status !== "noshow" ? (
          <button type="button" onClick={() => onCancel(booking.id)} className="text-xs font-semibold text-red-700">
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function statusClass(status: string) {
  if (status === "held") return "bg-amber-100 text-amber-950";
  if (status === "noshow") return "bg-red-100 text-red-900";
  return "bg-[#014421]/10 text-[#014421]";
}

function onDate(bookings: Booking[], dateKey: string, timeZone: string) {
  return bookings
    .filter((booking) => localKey(booking.startsAt, timeZone) === dateKey)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function blocksOnDate(blocks: Block[], dateKey: string, timeZone: string) {
  return blocks.filter((block) => localKey(block.starts_at, timeZone) === dateKey);
}

function localKey(iso: string, timeZone: string) {
  const parts = partsInZone(new Date(iso), timeZone);
  return ymd(parts.year, parts.month, parts.day);
}

function sameDate(a: DateParts, b: DateParts) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function weekDays(cursor: DateParts) {
  const noon = zonedToUtc(cursor.year, cursor.month, cursor.day, 12, 0);
  const weekday = partsInZone(noon).weekday;
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = addDays(cursor.year, cursor.month, cursor.day, mondayOffset);
  return Array.from({ length: 7 }, (_, index) => addDays(monday.year, monday.month, monday.day, index));
}

function monthCells(cursor: DateParts) {
  const first = { year: cursor.year, month: cursor.month, day: 1 };
  const noon = zonedToUtc(first.year, first.month, first.day, 12, 0);
  const weekday = partsInZone(noon).weekday;
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(first.year, first.month, first.day, mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(start.year, start.month, start.day, index));
}

function addMonths(cursor: DateParts, delta: number): DateParts {
  const shifted = new Date(Date.UTC(cursor.year, cursor.month - 1 + delta, 1));
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Math.min(cursor.day, last) };
}

function rangeLabel(view: View, cursor: DateParts, timeZone: string) {
  const noon = zonedToUtc(cursor.year, cursor.month, cursor.day, 12, 0, timeZone);
  if (view === "day") {
    return new Intl.DateTimeFormat("en-AU", { timeZone, weekday: "long", day: "numeric", month: "short" }).format(noon);
  }
  if (view === "month") {
    return new Intl.DateTimeFormat("en-AU", { timeZone, month: "long", year: "numeric" }).format(noon);
  }
  const days = weekDays(cursor);
  const start = zonedToUtc(days[0].year, days[0].month, days[0].day, 12, 0, timeZone);
  const end = zonedToUtc(days[6].year, days[6].month, days[6].day, 12, 0, timeZone);
  const startLabel = new Intl.DateTimeFormat("en-AU", { timeZone, day: "numeric", month: "short" }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-AU", { timeZone, day: "numeric", month: "short" }).format(end);
  return `${startLabel} – ${endLabel}`;
}
