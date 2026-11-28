/**
 * Player year calendar — golf events for the season.
 * V1: seeded NSW calendars (JOM / JNJG juniors + NSW Vardon elite amateur) + local selections.
 * Later: coach-editable events + practice phases into selected targets.
 */

export type GolfEventSeries =
  | "jom"
  | "jnjg"
  | "vardon"
  | "national"
  | "club"
  | "other";

export type GolfCalendarEvent = {
  id: string;
  name: string;
  series: GolfEventSeries;
  /** Inclusive YYYY-MM-DD (Sydney). */
  startsOn: string;
  /** Inclusive YYYY-MM-DD (Sydney). */
  endsOn: string;
  venue?: string;
  ages?: string;
  notes?: string;
};

export const SERIES_META: Record<
  GolfEventSeries,
  { label: string; short: string; color: string; tint: string }
> = {
  jom: {
    label: "Juniors on the Move",
    short: "JOM",
    color: "#0d9488",
    tint: "bg-teal-50 text-teal-800 border-teal-200",
  },
  jnjg: {
    label: "JNJG Masters / Tour",
    short: "JNJG",
    color: "#014421",
    tint: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  vardon: {
    label: "NSW Vardon Trophy",
    short: "Vardon",
    color: "#b45309",
    tint: "bg-amber-50 text-amber-900 border-amber-200",
  },
  national: {
    label: "National",
    short: "National",
    color: "#1d4ed8",
    tint: "bg-blue-50 text-blue-900 border-blue-200",
  },
  club: {
    label: "Club",
    short: "Club",
    color: "#57534e",
    tint: "bg-stone-100 text-stone-700 border-stone-200",
  },
  other: {
    label: "Other",
    short: "Other",
    color: "#6b7280",
    tint: "bg-gray-50 text-gray-700 border-gray-200",
  },
};

/** Seeded 2026 calendar. Dates follow published Golf NSW / JNJG calendars and may shift. */
export const YEAR_CALENDAR_EVENTS: GolfCalendarEvent[] = [
  // —— NSW Vardon Trophy (elite amateur men, GA ≤ 4.4) ——
  {
    id: "2026-vardon-great-lakes",
    name: "Forster Tuncurry Great Lakes Open",
    series: "vardon",
    startsOn: "2026-01-04",
    endsOn: "2026-01-04",
    venue: "Forster-Tuncurry GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-north-ryde",
    name: "North Ryde Amateur Cup",
    series: "vardon",
    startsOn: "2026-01-10",
    endsOn: "2026-01-10",
    venue: "North Ryde GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-lake-macquarie",
    name: "Belmont Lake Macquarie Cup",
    series: "vardon",
    startsOn: "2026-01-11",
    endsOn: "2026-01-11",
    venue: "Belmont GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-pymble",
    name: "Pymble Cup",
    series: "vardon",
    startsOn: "2026-01-18",
    endsOn: "2026-01-18",
    venue: "Pymble GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-gold-creek",
    name: "Gold Creek ACT Classic",
    series: "vardon",
    startsOn: "2026-01-24",
    endsOn: "2026-01-25",
    venue: "Gold Creek CC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-south-creek",
    name: "Dunheved South Creek Cup",
    series: "vardon",
    startsOn: "2026-01-24",
    endsOn: "2026-01-24",
    venue: "Dunheved GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-queanbeyan",
    name: "Queanbeyan Open",
    series: "vardon",
    startsOn: "2026-01-31",
    endsOn: "2026-01-31",
    venue: "Queanbeyan GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-stonecutters",
    name: "Stonecutters Ridge Cup",
    series: "vardon",
    startsOn: "2026-02-07",
    endsOn: "2026-02-07",
    venue: "Stonecutters Ridge GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-lakeside",
    name: "Lakeside Cup",
    series: "vardon",
    startsOn: "2026-02-21",
    endsOn: "2026-02-21",
    venue: "Lakeside GC, Camden",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-carnarvon",
    name: "Carnarvon Cup",
    series: "vardon",
    startsOn: "2026-02-28",
    endsOn: "2026-02-28",
    venue: "Carnarvon GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-charlestown",
    name: "Charlestown Cup",
    series: "vardon",
    startsOn: "2026-03-07",
    endsOn: "2026-03-07",
    venue: "Charlestown GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-fox-hills",
    name: "Fox Hills Cup",
    series: "vardon",
    startsOn: "2026-03-07",
    endsOn: "2026-03-07",
    venue: "Fox Hills GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-northbridge",
    name: "Northbridge Cup",
    series: "vardon",
    startsOn: "2026-03-14",
    endsOn: "2026-03-14",
    venue: "Northbridge GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-asquith",
    name: "Asquith Cup",
    series: "vardon",
    startsOn: "2026-03-21",
    endsOn: "2026-03-21",
    venue: "Asquith GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-lakes-medal",
    name: "The Lakes Medal",
    series: "vardon",
    startsOn: "2026-03-22",
    endsOn: "2026-03-22",
    venue: "The Lakes GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-dubbo",
    name: "Dubbo Macquarie Cup",
    series: "vardon",
    startsOn: "2026-04-04",
    endsOn: "2026-04-05",
    venue: "Dubbo GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-tamworth",
    name: "Tamworth Easter Cup",
    series: "vardon",
    startsOn: "2026-04-04",
    endsOn: "2026-04-05",
    venue: "Tamworth GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-cabramatta",
    name: "Cabramatta Cup",
    series: "vardon",
    startsOn: "2026-04-11",
    endsOn: "2026-04-11",
    venue: "Cabramatta GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-richmond",
    name: "Richmond Cup",
    series: "vardon",
    startsOn: "2026-04-18",
    endsOn: "2026-04-18",
    venue: "Richmond GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-magenta",
    name: "Magenta Shores Open Amateur",
    series: "vardon",
    startsOn: "2026-04-19",
    endsOn: "2026-04-19",
    venue: "Magenta Shores GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-strathfield",
    name: "Strathfield Bowl",
    series: "vardon",
    startsOn: "2026-04-19",
    endsOn: "2026-04-19",
    venue: "Strathfield GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-bonnie-doon",
    name: "Bonnie Doon Open Amateur",
    series: "vardon",
    startsOn: "2026-05-02",
    endsOn: "2026-05-02",
    venue: "Bonnie Doon GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-bankstown",
    name: "Bankstown Cup",
    series: "vardon",
    startsOn: "2026-05-09",
    endsOn: "2026-05-09",
    venue: "Bankstown GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-woolooware",
    name: "Woolooware Cup",
    series: "vardon",
    startsOn: "2026-05-09",
    endsOn: "2026-05-09",
    venue: "Woolooware GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-camden",
    name: "Camden Cup",
    series: "vardon",
    startsOn: "2026-05-23",
    endsOn: "2026-05-23",
    venue: "Camden GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-cromer",
    name: "Cromer Bowl",
    series: "vardon",
    startsOn: "2026-06-06",
    endsOn: "2026-06-06",
    venue: "Cromer GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-monash",
    name: "Monash Masters",
    series: "vardon",
    startsOn: "2026-06-07",
    endsOn: "2026-06-07",
    venue: "Monash CC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-massey-park",
    name: "Massey Park Cup",
    series: "vardon",
    startsOn: "2026-06-13",
    endsOn: "2026-06-13",
    venue: "Massey Park GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-muirfield",
    name: "Muirfield Open Amateur",
    series: "vardon",
    startsOn: "2026-06-28",
    endsOn: "2026-06-28",
    venue: "Muirfield GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-wollongong",
    name: "Wollongong Open",
    series: "vardon",
    startsOn: "2026-07-05",
    endsOn: "2026-07-05",
    venue: "Wollongong GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-shell-cove",
    name: "The Links Shell Cove Open",
    series: "vardon",
    startsOn: "2026-07-12",
    endsOn: "2026-07-12",
    venue: "The Links Shell Cove",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-kooindah",
    name: "Kooindah Waters Cup",
    series: "vardon",
    startsOn: "2026-08-02",
    endsOn: "2026-08-02",
    venue: "Kooindah Waters GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-randwick",
    name: "Randwick Cup",
    series: "vardon",
    startsOn: "2026-08-22",
    endsOn: "2026-08-22",
    venue: "Randwick GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-castle-hill",
    name: "Castle Hill Spring Cup",
    series: "vardon",
    startsOn: "2026-10-10",
    endsOn: "2026-10-10",
    venue: "Castle Hill CC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-mittagong",
    name: "Mittagong Cup",
    series: "vardon",
    startsOn: "2026-11-28",
    endsOn: "2026-11-28",
    venue: "Highlands GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },
  {
    id: "2026-vardon-lake-illawarra",
    name: "Lake Illawarra Cup",
    series: "vardon",
    startsOn: "2026-12-06",
    endsOn: "2026-12-06",
    venue: "Port Kembla GC",
    notes: "NSW Vardon Trophy counting event · elite amateur men",
  },

  // —— Juniors on the Move ——
  {
    id: "2026-country-jom",
    name: "Country JOM Championships",
    series: "jom",
    startsOn: "2026-01-24",
    endsOn: "2026-01-25",
    venue: "Thurgoona",
    ages: "6–14",
  },
  {
    id: "2026-jom-wyong",
    name: "Juniors on the Move — Wyong",
    series: "jom",
    startsOn: "2026-03-01",
    endsOn: "2026-03-01",
    venue: "Wyong GC",
    ages: "6–14",
  },
  {
    id: "2026-nsw-jom-champs",
    name: "NSW JOM Championships",
    series: "jom",
    startsOn: "2026-06-07",
    endsOn: "2026-06-08",
    venue: "Camden GC / Campbelltown GC",
    ages: "6–14",
  },
  {
    id: "2026-jom-mini-golf",
    name: "JOM Mini Golf Championships",
    series: "jom",
    startsOn: "2026-07-07",
    endsOn: "2026-07-09",
    venue: "Lynwood CC",
    ages: "6–14",
  },

  // —— JNJG junior tour / masters ——
  {
    id: "2026-act-week-of-golf",
    name: "Harvey Norman ACT Week of Golf",
    series: "jnjg",
    startsOn: "2026-01-05",
    endsOn: "2026-01-08",
    venue: "Murrumbidgee CC",
    ages: "12–17",
    notes: "JNJG national ranking event",
  },
  {
    id: "2026-u12-sydney-week",
    name: "Under 12 Tour — Sydney Week of Golf",
    series: "jnjg",
    startsOn: "2026-01-06",
    endsOn: "2026-01-08",
    venue: "Sydney",
  },
  {
    id: "2026-sydney-week-of-golf",
    name: "Harvey Norman Sydney Week of Golf",
    series: "jnjg",
    startsOn: "2026-01-12",
    endsOn: "2026-01-16",
    venue: "Sydney",
    ages: "12–17",
    notes: "JNJG national ranking event",
  },
  {
    id: "2026-murray-river-masters",
    name: "Murray River Junior Masters",
    series: "jnjg",
    startsOn: "2026-01-24",
    endsOn: "2026-01-25",
    venue: "Albury GC",
  },
  {
    id: "2026-wagga-masters",
    name: "Wagga Wagga Junior Masters",
    series: "jnjg",
    startsOn: "2026-02-21",
    endsOn: "2026-02-22",
    venue: "Wagga Wagga CC",
  },
  {
    id: "2026-blue-mountains-masters",
    name: "Blue Mountains Junior Masters",
    series: "jnjg",
    startsOn: "2026-03-14",
    endsOn: "2026-03-15",
    venue: "Blackheath GC",
  },
  {
    id: "2026-omalley-masters",
    name: "Peter O'Malley Junior Masters",
    series: "jnjg",
    startsOn: "2026-03-28",
    endsOn: "2026-03-29",
    venue: "Bathurst GC",
  },
  {
    id: "2026-illawarra-masters",
    name: "Illawarra Junior Masters",
    series: "jnjg",
    startsOn: "2026-04-07",
    endsOn: "2026-04-08",
    venue: "Links Shell Cove",
  },
  {
    id: "2026-northern-rivers-masters",
    name: "Northern Rivers Junior Masters",
    series: "jnjg",
    startsOn: "2026-04-12",
    endsOn: "2026-04-13",
    venue: "Ocean Shores CC",
  },
  {
    id: "2026-north-coast-masters",
    name: "North Coast Junior Masters",
    series: "jnjg",
    startsOn: "2026-05-16",
    endsOn: "2026-05-17",
    venue: "Forster-Tuncurry GC",
  },
  {
    id: "2026-macarthur-masters",
    name: "Macarthur Junior Masters",
    series: "jnjg",
    startsOn: "2026-06-07",
    endsOn: "2026-06-08",
    venue: "Campbelltown GC / Camden GC",
  },
  {
    id: "2026-nsw-junior-championship",
    name: "NSW Junior Championship (inc. State Age)",
    series: "jnjg",
    startsOn: "2026-07-14",
    endsOn: "2026-07-17",
    venue: "Club Catalina GC & Moruya GC",
    ages: "12–17",
    notes: "JNJG national ranking event",
  },
  {
    id: "2026-nsw-state-age-u12",
    name: "NSW State Age Under 12 Championships",
    series: "jnjg",
    startsOn: "2026-07-21",
    endsOn: "2026-07-23",
    venue: "NSW",
  },
  {
    id: "2026-chalmers-masters",
    name: "Greg Chalmers Junior Masters",
    series: "jnjg",
    startsOn: "2026-08-01",
    endsOn: "2026-08-02",
    venue: "Shelly Beach GC",
  },
  {
    id: "2026-south-coast-masters",
    name: "South Coast Junior Masters",
    series: "jnjg",
    startsOn: "2026-08-29",
    endsOn: "2026-08-30",
    venue: "Catalina CC",
  },
  {
    id: "2026-international-junior-classic",
    name: "JNJG International Junior Classic",
    series: "jnjg",
    startsOn: "2026-09-29",
    endsOn: "2026-10-02",
    venue: "Cypress Lakes Resort",
    ages: "15–17",
    notes: "JNJG national ranking event",
  },

  // —— National junior ——
  {
    id: "2026-aus-junior-amateur",
    name: "Australian Junior Amateur",
    series: "national",
    startsOn: "2026-04-07",
    endsOn: "2026-04-10",
    venue: "Ballarat, VIC",
    notes: "Golf Australia national championship",
  },
  {
    id: "2026-interstate-teams",
    name: "Australian Junior Interstate Teams Matches",
    series: "national",
    startsOn: "2026-04-13",
    endsOn: "2026-04-16",
    venue: "Moonah Links, VIC",
  },

  // —— Club (non-Vardon) ——
  {
    id: "2026-stonecutters-club-champs",
    name: "Stonecutters Ridge Club Championship",
    series: "club",
    startsOn: "2026-10-17",
    endsOn: "2026-10-18",
    venue: "Stonecutters Ridge GC",
    notes: "Placeholder club window — confirm dates with the club",
  },
  {
    id: "2026-stonecutters-junior-champs",
    name: "Stonecutters Junior Championship",
    series: "club",
    startsOn: "2026-11-14",
    endsOn: "2026-11-15",
    venue: "Stonecutters Ridge GC",
    notes: "Placeholder club window — confirm dates with the club",
  },
];

const STORAGE_KEY = "yearCalendarPlayingIds";

export function sydneyToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

export function eventsForYear(year: number, catalog = YEAR_CALENDAR_EVENTS): GolfCalendarEvent[] {
  const prefix = `${year}-`;
  return catalog
    .filter((e) => e.startsOn.startsWith(prefix) || e.endsOn.startsWith(prefix))
    .slice()
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.name.localeCompare(b.name));
}

export function availableYears(catalog = YEAR_CALENDAR_EVENTS): number[] {
  const years = new Set<number>();
  for (const e of catalog) {
    years.add(Number(e.startsOn.slice(0, 4)));
    years.add(Number(e.endsOn.slice(0, 4)));
  }
  const list = [...years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  return list.length > 0 ? list : [new Date().getFullYear()];
}

export function formatEventDates(e: GolfCalendarEvent): string {
  const start = new Date(`${e.startsOn}T12:00:00`);
  const end = new Date(`${e.endsOn}T12:00:00`);
  const sameDay = e.startsOn === e.endsOn;
  // Fixed locale so SSR and the browser always match (avoids hydration mismatch).
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const fmt = (d: Date) => d.toLocaleDateString("en-AU", opts);
  if (sameDay) return fmt(start);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${fmt(end)}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

export function monthKey(day: string): string {
  return day.slice(0, 7); // YYYY-MM
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

export function loadPlayingIds(userId?: string | null): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export function savePlayingIds(ids: Set<string>, userId?: string | null): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(userId), JSON.stringify([...ids]));
  window.dispatchEvent(new CustomEvent("yearCalendarUpdated"));
}

function storageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

export function daysUntil(startsOn: string, today = sydneyToday()): number | null {
  const a = Date.parse(`${today}T12:00:00`);
  const b = Date.parse(`${startsOn}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
