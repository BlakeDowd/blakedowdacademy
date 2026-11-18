import type { FacilityType } from "@/components/DrillCard";

/** Typical scoring band — asked first so we pitch drills at the right level. */
export type FinderScoreBand = {
  id: string;
  label: string;
  blurb: string;
  /** Soft keywords preferred when ranking drills for this scoring level. */
  preferKeywords: string[];
};

export type FinderStruggle = {
  id: string;
  label: string;
  blurb: string;
  areas: FacilityType[];
  /** Match against catalog `focus` (case-insensitive includes). */
  focuses: string[];
};

export type FinderStyle = {
  id: string;
  label: string;
  blurb: string;
  /** Soft keywords to prefer in drill title/description when ranking. */
  preferKeywords: string[];
};

export type FinderAnswers = {
  scoreBandId: string;
  /** One or more costing areas. */
  struggleIds: string[];
  /** One or more of mechanics / skill / performance. */
  styleIds: string[];
  minutes: number;
};

export type FinderPrefs = {
  /** How often each struggle was chosen — used to personalise next time. */
  struggleCounts: Record<string, number>;
  lastScoreBandId: string | null;
  lastStruggleIds: string[];
  lastStyleIds: string[];
  updatedAt: string;
};

const PREFS_KEY = "practice_finder_prefs.v1";

export const FINDER_SCORE_BANDS: FinderScoreBand[] = [
  {
    id: "100-plus",
    label: "100+",
    blurb: "Breaking 100 — contact and simple misses first",
    preferKeywords: ["setup", "fundament", "contact", "feel", "tempo", "grip", "ball first", "centre"],
  },
  {
    id: "90-100",
    label: "90–100",
    blurb: "Breaking 90 — keep it in play and get the ball on the green",
    preferKeywords: ["fairway", "target", "setup", "dispersion", "up and down", "chip", "putt"],
  },
  {
    id: "80-90",
    label: "80–90",
    blurb: "Breaking 80 — distance control and fewer big numbers",
    preferKeywords: ["distance", "clock", "dispersion", "flight", "scrambl", "window", "precision"],
  },
  {
    id: "70-80",
    label: "70–80",
    blurb: "Scoring zone — tighter windows and short-game polish",
    preferKeywords: ["dispersion", "finger", "flight", "spin", "pressure", "row", "score", "clock"],
  },
  {
    id: "below-par",
    label: "Below par",
    blurb: "Under par — pressure, shaping, and elite control",
    preferKeywords: ["pressure", "compete", "9 ball", "shape", "spin", "row", "game", "score"],
  },
];

export const FINDER_STRUGGLES: FinderStruggle[] = [
  {
    id: "miss-fairway",
    label: "Missing fairways off the tee",
    blurb: "Driver / tee-shot control",
    areas: ["Driving"],
    focuses: ["FIR"],
  },
  {
    id: "miss-green",
    label: "Missing greens with irons",
    blurb: "Approach accuracy and strike",
    areas: ["Irons"],
    focuses: ["GIR"],
  },
  {
    id: "wedge-distance",
    label: "Wedge distance control",
    blurb: "Leaving it short or long into greens",
    areas: ["Wedges"],
    focuses: ["GIR 8ft", "GIR"],
  },
  {
    id: "up-down",
    label: "Not getting up and down",
    blurb: "Chips and pitches around the green",
    areas: ["Chipping"],
    focuses: ["Up & Down", "Scambling"],
  },
  {
    id: "bunker",
    label: "Struggling from bunkers",
    blurb: "Getting out and close",
    areas: ["Bunkers"],
    focuses: ["Bunker"],
  },
  {
    id: "short-putts",
    label: "Missing short putts",
    blurb: "Inside ~6 feet",
    areas: ["Putting"],
    focuses: ["<6ft", "Make"],
  },
  {
    id: "decisions",
    label: "Bad decisions / nerves",
    blurb: "Course management and mental game",
    areas: ["Mental/Strategy"],
    focuses: ["FIR", "GIR", "Gross"],
  },
  {
    id: "scoring",
    label: "Not scoring when I hit it well",
    blurb: "Turning good ball-striking into lower scores",
    areas: ["Wedges", "Chipping", "Putting"],
    focuses: ["GIR 8ft", "Up & Down", "<6ft", "Gross"],
  },
];

export const FINDER_STYLES: FinderStyle[] = [
  {
    id: "mechanics",
    label: "Mechanics",
    blurb: "Setup, motion, and how the swing works",
    preferKeywords: ["setup", "swing", "grip", "tempo", "motion", "fundament", "feel", "technique", "video", "position"],
  },
  {
    id: "skill",
    label: "Skill development",
    blurb: "Building control, starts lines, and distances",
    preferKeywords: ["distance", "dispersion", "target", "clock", "flight", "precision", "finger", "control", "awareness"],
  },
  {
    id: "performance",
    label: "Performance",
    blurb: "Pressure, scoring, and on-course transfer",
    preferKeywords: ["game", "score", "row", "par", "compete", "pressure", "18", "9", "visualis", "routine"],
  },
];

export function getFinderScoreBand(id: string | null | undefined): FinderScoreBand | null {
  if (!id) return null;
  return FINDER_SCORE_BANDS.find((s) => s.id === id) ?? null;
}

export function getFinderStruggle(id: string | null | undefined): FinderStruggle | null {
  if (!id) return null;
  return FINDER_STRUGGLES.find((s) => s.id === id) ?? null;
}

export function getFinderStyle(id: string | null | undefined): FinderStyle | null {
  if (!id) return null;
  return FINDER_STYLES.find((s) => s.id === id) ?? null;
}

export function loadFinderPrefs(): FinderPrefs {
  const empty: FinderPrefs = {
    struggleCounts: {},
    lastScoreBandId: null,
    lastStruggleIds: [],
    lastStyleIds: [],
    updatedAt: "",
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as FinderPrefs & {
      lastStyleId?: string | null;
      lastStruggleId?: string | null;
    };
    const styleIds = Array.isArray(parsed.lastStyleIds)
      ? parsed.lastStyleIds.filter((id): id is string => typeof id === "string")
      : typeof parsed.lastStyleId === "string"
        ? [parsed.lastStyleId]
        : [];
    const struggleIds = Array.isArray(parsed.lastStruggleIds)
      ? parsed.lastStruggleIds.filter((id): id is string => typeof id === "string")
      : typeof parsed.lastStruggleId === "string"
        ? [parsed.lastStruggleId]
        : [];
    return {
      struggleCounts: parsed.struggleCounts && typeof parsed.struggleCounts === "object" ? parsed.struggleCounts : {},
      lastScoreBandId: typeof parsed.lastScoreBandId === "string" ? parsed.lastScoreBandId : null,
      lastStruggleIds: struggleIds,
      lastStyleIds: styleIds,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return empty;
  }
}

export function recordFinderAnswers(
  answers: Pick<FinderAnswers, "scoreBandId" | "struggleIds" | "styleIds">,
): FinderPrefs {
  const prev = loadFinderPrefs();
  const struggleCounts = { ...prev.struggleCounts };
  for (const id of answers.struggleIds) {
    struggleCounts[id] = (struggleCounts[id] ?? 0) + 1;
  }
  const next: FinderPrefs = {
    struggleCounts,
    lastScoreBandId: answers.scoreBandId,
    lastStruggleIds: answers.struggleIds,
    lastStyleIds: answers.styleIds,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function strugglesFromIds(ids: string[]): FinderStruggle[] {
  const set = new Set(ids);
  return FINDER_STRUGGLES.filter((s) => set.has(s.id));
}

export function stylesFromIds(ids: string[]): FinderStyle[] {
  const set = new Set(ids);
  return FINDER_STYLES.filter((s) => set.has(s.id));
}

/** Unique facilities from selected struggles, catalog order preserved per struggle. */
export function areasFromStruggles(struggles: FinderStruggle[]): FacilityType[] {
  const seen = new Set<FacilityType>();
  const areas: FacilityType[] = [];
  for (const s of struggles) {
    for (const a of s.areas) {
      if (!seen.has(a)) {
        seen.add(a);
        areas.push(a);
      }
    }
  }
  return areas;
}

export function focusesFromStruggles(struggles: FinderStruggle[]): string[] {
  const seen = new Set<string>();
  const focuses: string[] = [];
  for (const s of struggles) {
    for (const f of s.focuses) {
      const key = f.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        focuses.push(f);
      }
    }
  }
  return focuses;
}

/** Most-chosen struggle so far (for “we’re learning what you need”). */
export function topStruggleFromPrefs(prefs: FinderPrefs): FinderStruggle | null {
  let bestId: string | null = prefs.lastStruggleIds[0] ?? null;
  let best = -1;
  for (const [id, n] of Object.entries(prefs.struggleCounts)) {
    if (n > best) {
      best = n;
      bestId = id;
    }
  }
  return getFinderStruggle(bestId);
}

export function drillMatchesFocuses(focus: string | null | undefined, focuses: string[]): boolean {
  if (!focuses.length) return true;
  if (!focus) return false;
  const f = focus.toLowerCase();
  return focuses.some((needle) => f.includes(needle.toLowerCase()));
}

export function drillStyleScore(
  text: string,
  style: FinderStyle | null,
): number {
  if (!style) return 0;
  const t = text.toLowerCase();
  let score = 0;
  for (const kw of style.preferKeywords) {
    if (t.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}
