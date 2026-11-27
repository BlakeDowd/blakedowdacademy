import { closerRate, dayIsUnfilled, spotsInWindow } from "@/lib/booking/price";
import { addDays, formatDay, formatTime, partsInZone, ymd, zonedToUtc } from "@/lib/booking/time";

export type HoursWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type Interval = {
  startMs: number;
  endMs: number;
  offerId?: string;
};

export type SlotDay = {
  date: string;
  label: string;
  closed: boolean;
  discounted: boolean;
  slots: { start: string; label: string; priceCents: number; listPriceCents: number }[];
};

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function buildSlots(args: {
  timeZone: string;
  from: { year: number; month: number; day: number };
  dayCount: number;
  durationMinutes: number;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  horizonDays: number;
  capacity: number;
  offerId: string;
  listPriceCents: number;
  discountWithinDays: number;
  discountPercent: number;
  hours: HoursWindow[];
  busy: Interval[];
  blocks: Interval[];
  now?: Date;
}): SlotDay[] {
  const now = args.now ?? new Date();
  const earliest = now.getTime() + args.minNoticeMinutes * 60_000;
  const latest = now.getTime() + args.horizonDays * 24 * 60 * 60_000;
  const bufferMs = args.bufferMinutes * 60_000;
  const durationMs = args.durationMinutes * 60_000;
  const days: SlotDay[] = [];

  for (let offset = 0; offset < args.dayCount; offset++) {
    const date = addDays(args.from.year, args.from.month, args.from.day, offset);
    const noon = zonedToUtc(date.year, date.month, date.day, 12, 0, args.timeZone);
    const label = formatDay(noon, args.timeZone);
    const weekday = partsInZone(noon, args.timeZone).weekday;
    const windows = args.hours.filter((h) => h.weekday === weekday && h.endMinute > h.startMinute);
    if (windows.length === 0) {
      days.push({ date: ymd(date.year, date.month, date.day), label, closed: true, discounted: false, slots: [] });
      continue;
    }

    const booked = args.busy.filter((item) => {
      const parts = partsInZone(new Date(item.startMs), args.timeZone);
      return parts.year === date.year && parts.month === date.month && parts.day === date.day;
    }).length;
    const spots = windows.reduce(
      (sum, window) => sum + spotsInWindow(window.startMinute, window.endMinute, args.durationMinutes, args.bufferMinutes),
      0,
    );
    const quiet = dayIsUnfilled(booked, spots);
    const slots: SlotDay["slots"] = [];
    for (const window of windows) {
      for (let minute = window.startMinute; minute + args.durationMinutes <= window.endMinute; minute += args.slotMinutes) {
        const start = zonedToUtc(
          date.year,
          date.month,
          date.day,
          Math.floor(minute / 60),
          minute % 60,
          args.timeZone,
        );
        const startMs = start.getTime();
        const endMs = startMs + durationMs;
        if (startMs < earliest || startMs > latest) continue;
        const occupiedUntil = endMs + bufferMs;
        if (args.blocks.some((block) => rangesOverlap(startMs, endMs, block.startMs, block.endMs))) continue;

        let same = 0;
        let other = 0;
        for (const busy of args.busy) {
          const busyEnd = busy.endMs + bufferMs;
          if (!rangesOverlap(startMs, occupiedUntil, busy.startMs, busyEnd)) continue;
          if (busy.offerId && busy.offerId === args.offerId) same += 1;
          else other += 1;
        }
        if (other > 0 || same >= args.capacity) continue;
        const listPriceCents = args.listPriceCents;
        const priceCents = closerRate({
          listCents: listPriceCents,
          startMs,
          nowMs: now.getTime(),
          withinDays: args.discountWithinDays,
          percent: args.discountPercent,
          quiet,
        });
        slots.push({ start: start.toISOString(), label: formatTime(start, args.timeZone), priceCents, listPriceCents });
      }
    }

    days.push({
      date: ymd(date.year, date.month, date.day),
      label,
      closed: false,
      discounted: slots.some((slot) => slot.priceCents < slot.listPriceCents),
      slots,
    });
  }

  return days;
}
