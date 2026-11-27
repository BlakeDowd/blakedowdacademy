/** How many non-overlapping lessons fit in one window, with the gap after each lesson. */
export function spotsInWindow(startMinute: number, endMinute: number, duration: number, buffer: number) {
  const usable = endMinute - startMinute;
  if (duration <= 0 || usable < duration) return 0;
  const step = duration + Math.max(0, buffer);
  return Math.floor((usable - duration) / step) + 1;
}

/** The day still has room when fewer than half the spots are taken. */
export function dayIsUnfilled(booked: number, spots: number) {
  return spots > 0 && booked * 2 < spots;
}

/**
 * Sale price in cents, rounded to the nearest dollar.
 * Full price when the day is at least half full, or the lesson is further out than `withinDays`.
 */
export function closerRate(args: {
  listCents: number;
  startMs: number;
  nowMs: number;
  withinDays: number;
  percent: number;
  quiet: boolean;
}) {
  const { listCents, startMs, nowMs, withinDays, percent, quiet } = args;
  if (!quiet || withinDays <= 0 || percent <= 0) return listCents;
  const windowMs = withinDays * 24 * 60 * 60 * 1000;
  if (startMs <= nowMs || startMs - nowMs > windowMs) return listCents;
  const sale = Math.round((listCents * (100 - percent)) / 100 / 100) * 100;
  return Math.max(100, Math.min(listCents, sale));
}
