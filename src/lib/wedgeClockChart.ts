import {
  WEDGE_CLOCK_CLUB_OPTIONS,
  WEDGE_CLOCK_DEFAULT_CLUBS,
  WEDGE_CLOCK_TARGETS,
  type WedgeClockClub,
} from "@/lib/wedgeClock";
import { loadDistanceUnit, type DistanceUnit } from "@/lib/wedgeClockLog";

/** Per-club carry chart: club → clock label → distance. */
export type WedgeClockChart = Record<string, Partial<Record<string, number>>>;

const STORAGE_KEY = "wedge_clock_chart.v1";
const CLUBS_KEY = "wedge_clock_selected_clubs.v1";

const OPTION_SET = new Set<string>(WEDGE_CLOCK_CLUB_OPTIONS);

/** Older labels → current catalog names. */
const CLUB_ALIASES: Record<string, WedgeClockClub> = {
  "56° Wedge": "56°",
  "60° Wedge": "60°",
  "52° Wedge": "52°",
  "Pitching Wedge": "PW",
  "Gap Wedge": "GW",
  "Sand Wedge": "SW",
  "Lob Wedge": "LW",
};

export function normalizeWedgeClub(name: string): string {
  const t = name.trim();
  return CLUB_ALIASES[t] ?? t;
}

export function loadSelectedWedgeClubs(): WedgeClockClub[] {
  if (typeof window === "undefined") return [...WEDGE_CLOCK_DEFAULT_CLUBS];
  try {
    const raw = localStorage.getItem(CLUBS_KEY);
    if (!raw) return [...WEDGE_CLOCK_DEFAULT_CLUBS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...WEDGE_CLOCK_DEFAULT_CLUBS];
    const cleaned = parsed
      .map((c) => normalizeWedgeClub(String(c)))
      .filter((c): c is WedgeClockClub => OPTION_SET.has(c));
    // Keep catalog order
    const selected = new Set(cleaned);
    const ordered = WEDGE_CLOCK_CLUB_OPTIONS.filter((c) => selected.has(c));
    return ordered.length > 0 ? ordered : [...WEDGE_CLOCK_DEFAULT_CLUBS];
  } catch {
    return [...WEDGE_CLOCK_DEFAULT_CLUBS];
  }
}

export function saveSelectedWedgeClubs(clubs: WedgeClockClub[]): void {
  if (typeof window === "undefined") return;
  try {
    const selected = new Set(clubs.filter((c) => OPTION_SET.has(c)));
    const ordered = WEDGE_CLOCK_CLUB_OPTIONS.filter((c) => selected.has(c));
    localStorage.setItem(
      CLUBS_KEY,
      JSON.stringify(ordered.length > 0 ? ordered : WEDGE_CLOCK_DEFAULT_CLUBS),
    );
  } catch {
    /* ignore */
  }
}

export function loadWedgeClockChart(): WedgeClockChart {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WedgeClockChart;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveWedgeClockChart(chart: WedgeClockChart): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chart));
  } catch {
    /* ignore */
  }
}

export function chartDistance(
  chart: WedgeClockChart,
  club: string,
  clock: string,
): number | null {
  const n = chart[club]?.[clock];
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function setChartDistance(
  chart: WedgeClockChart,
  club: string,
  clock: string,
  distance: number | null,
): WedgeClockChart {
  const nextClub = { ...(chart[club] ?? {}) };
  if (distance == null || !Number.isFinite(distance)) delete nextClub[clock];
  else nextClub[clock] = Math.round(distance * 10) / 10;
  return { ...chart, [club]: nextClub };
}

/** Clock hours for dial drawing (6 = down … 12 = up). */
export function clockLabelToHours(label: string): number | null {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h === 12) h = 0;
  return h + min / 60;
}

/**
 * Angle for SVG: 6 o'clock = 90° in standard math (pointing down),
 * sweeping toward 9 (left for right-hander face-on… we draw side-on style:
 * 6 down, arm rises toward 9/12 on the RIGHT of the dial for a clear backswing).
 * Image-style: 0° at 12 o'clock, clockwise. So 6:00 = 180°, 9:00 = 270°, 12:00 = 0°.
 */
export function clockHoursToSvgDegrees(hours: number): number {
  // hours 6 → 12 maps to SVG 180 → 360/0
  const h = ((hours % 12) + 12) % 12;
  return h * 30; // 12→0°, 1→30°, … 6→180°, 9→270°
}

export const CHART_CLOCKS = WEDGE_CLOCK_TARGETS;

export function defaultUnit(): DistanceUnit {
  return loadDistanceUnit();
}
