import { OFFICIAL_DRILLS, type DrillRecord } from "@/data/official_drills";
import { RECOMMENDED_DRILLS_STORAGE_KEY } from "@/lib/academyTrophies";

/** Stable focus themes produced by combine result breakdowns. */
export type CombineFocusTheme =
  | "perfect"
  | "putting_short"
  | "putting_speed"
  | "putting_break"
  | "putting_three_putt"
  | "putting_start_line"
  | "putting_holing"
  | "chipping_closer"
  | "chipping_holing_out"
  | "chipping_short_putts"
  | "flop_proximity"
  | "bunker_green"
  | "bunker_strike"
  | "bunker_putt"
  | "wedge_dispersion"
  | "iron_dispersion"
  | "driver_dispersion"
  | "generic_improve";

export type SuggestedDrill = {
  id: string;
  drillId: string;
  title: string;
  category: string;
  minutes: number;
  href: string;
  why: string;
};

const byCode = new Map(OFFICIAL_DRILLS.map((d) => [d.drill_id, d]));

function drill(code: string, why: string): SuggestedDrill | null {
  const d = byCode.get(code);
  if (!d) return null;
  return {
    id: d.id,
    drillId: d.drill_id,
    title: d.drill_name ?? d.title ?? d.drill_id,
    category: d.category,
    minutes: d.estimatedMinutes,
    href: `/practice?plan=library&drill=${encodeURIComponent(d.drill_id)}`,
    why,
  };
}

/** Ordered drill codes + short “why this” copy per focus theme. */
const THEME_DRILLS: Record<CombineFocusTheme, { code: string; why: string }[]> = {
  perfect: [
    { code: "CHIP-UPDE-022", why: "Keep the edge sharp with an up-and-down ladder" },
    { code: "PUTT-GATE-002", why: "Stay sharp on short makes" },
  ],
  putting_short: [
    { code: "PUTT-GATE-002", why: "Centre-strike gate from 3 ft" },
    { code: "PUTT-GATE-005", why: "Start-line gate for short putts" },
  ],
  putting_speed: [
    { code: "PUTT-GATE-005", why: "Start it on line, then freer speed" },
    { code: "CHIP-UPDE-022", why: "Leave yourself tap-ins more often" },
  ],
  putting_break: [
    { code: "PUTT-GATE-001", why: "Left-to-right break feels" },
    { code: "PUTT-GATE-003", why: "Right-to-left break feels" },
  ],
  putting_three_putt: [
    { code: "PUTT-GATE-002", why: "Clean up the short ones after a lag" },
    { code: "PUTT-GATE-005", why: "Start line so the second putt is short" },
  ],
  putting_start_line: [
    { code: "PUTT-GATE-005", why: "Straight start-line gate" },
    { code: "PUTT-GATE-004", why: "Start line on a small break" },
  ],
  putting_holing: [
    { code: "PUTT-GATE-002", why: "Build a make streak from short range" },
    { code: "PUTT-GATE-001", why: "Hole more with a touch of break" },
  ],
  chipping_closer: [
    { code: "CHIP-5MET-012", why: "Land-spot control from 5 m" },
    { code: "CHIP-BAFC-025", why: "Ball-first contact for tighter proximity" },
  ],
  chipping_holing_out: [
    { code: "PUTT-GATE-002", why: "Convert more when you chip it close" },
    { code: "CHIP-UPDE-022", why: "Full up-and-down reps" },
  ],
  chipping_short_putts: [
    { code: "PUTT-GATE-002", why: "Short make % after chips" },
    { code: "PUTT-GATE-005", why: "Start line on the scramble putt" },
  ],
  flop_proximity: [
    { code: "CHIP-FLOP-018", why: "Flop setup and soft landings" },
    { code: "CHIP-5MET-012", why: "Landing-spot feel at short range" },
  ],
  bunker_green: [
    { code: "BUNK-JOTFL-081", why: "Clear the lip and get it on the green" },
    { code: "BUNK-SADE-082", why: "Sand depth for predictable splash" },
  ],
  bunker_strike: [
    { code: "BUNK-SADE-082", why: "Sand depth consistency" },
    { code: "BUNK-LIDR-083", why: "Line drill for entry point" },
  ],
  bunker_putt: [
    { code: "PUTT-GATE-002", why: "Hole the sand-save putt" },
    { code: "BUNK-UPDW-088", why: "Full bunker up-and-down practice" },
  ],
  wedge_dispersion: [
    { code: "WEDG-CLSY-056", why: "Clock-system distance control" },
    { code: "IRON-FING-049", why: "Finger-dispersion precision" },
  ],
  iron_dispersion: [
    { code: "IRON-FING-049", why: "Finger-dispersion walls" },
    { code: "IRON-HB2F-050", why: "Consecutive shots inside 2 fingers" },
  ],
  driver_dispersion: [
    { code: "DRIV-SIFW-028", why: "Fairway corridor streak" },
    { code: "DRIV-ALTH-027", why: "Centre contact via tee-height changes" },
  ],
  generic_improve: [
    { code: "CHIP-UPDE-022", why: "Solid all-round short-game reps" },
    { code: "PUTT-GATE-002", why: "Short putting fundamentals" },
  ],
};

/** Infer a theme from a FocusCard title when the runner doesn't export a key yet. */
export function themeFromFocusTitle(title: string): CombineFocusTheme {
  const t = title.toLowerCase();
  if (t.includes("perfect")) return "perfect";
  if (t.includes("three putt")) return "putting_three_putt";
  if (t.includes("getting it to the hole") || t.includes("speed")) return "putting_speed";
  if (t.includes("more break") || t.includes("playing more break")) return "putting_break";
  if (t.includes("start line")) return "putting_start_line";
  if (t.includes("short putt")) return "chipping_short_putts";
  if (t.includes("chipping closer") || t.includes("getting it closer")) return "chipping_closer";
  if (t.includes("holing out") || t.includes("holing the putt") || t.includes("holing more"))
    return "chipping_holing_out";
  if (t.includes("on the green") || t.includes("getting it on")) return "bunker_green";
  if (t.includes("fat") || t.includes("thin") || t.includes("strike")) return "bunker_strike";
  if (t.includes("flop")) return "flop_proximity";
  if (t.includes("dispersion") && t.includes("driver")) return "driver_dispersion";
  if (t.includes("dispersion") && t.includes("wedge")) return "wedge_dispersion";
  if (t.includes("dispersion")) return "iron_dispersion";
  return "generic_improve";
}

export function suggestDrillsForTheme(
  theme: CombineFocusTheme,
  limit = 2,
): SuggestedDrill[] {
  const specs = THEME_DRILLS[theme] ?? THEME_DRILLS.generic_improve;
  const out: SuggestedDrill[] = [];
  for (const s of specs) {
    const d = drill(s.code, s.why);
    if (d) out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

/** Remember these for Coach's Pet / Insights continuity. */
export function rememberRecommendedDrills(drills: SuggestedDrill[]): void {
  if (typeof window === "undefined" || drills.length === 0) return;
  try {
    const prev: string[] = JSON.parse(localStorage.getItem(RECOMMENDED_DRILLS_STORAGE_KEY) || "[]");
    const next = [...new Set([...drills.map((d) => d.id), ...drills.map((d) => d.drillId), ...prev])].slice(
      0,
      50,
    );
    localStorage.setItem(RECOMMENDED_DRILLS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function officialDrillByCode(code: string): DrillRecord | null {
  return byCode.get(code) ?? null;
}
