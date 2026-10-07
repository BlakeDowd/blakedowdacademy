import type { SupabaseClient } from "@supabase/supabase-js";

/** One player action from coach_usage_events (see 20261007120000_app_usage.sql). */
export type UsageEvent = {
  user_id: string;
  source: UsageSource;
  detail: string | null;
  qty: number;
  minutes: number;
  at: string;
};

export type UsageSource =
  | "practice"
  | "skills_log"
  | "drill_score"
  | "round"
  | "lesson"
  | "trophy"
  | "coaching_post"
  | "swing_upload"
  | "screen";

export const USAGE_SETUP_MESSAGE =
  "App usage needs one database step: run supabase/migrations/20261007120000_app_usage.sql in Supabase.";

export async function fetchUsageEvents(supabase: SupabaseClient, since: Date): Promise<UsageEvent[]> {
  const { data, error } = await supabase.rpc("coach_usage_events", { p_since: since.toISOString() });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883" || /coach_usage_events/.test(error.message ?? "")) {
      throw new Error(USAGE_SETUP_MESSAGE);
    }
    throw new Error(error.message || "Couldn't load app usage.");
  }
  return ((data ?? []) as UsageEvent[]).map((e) => ({ ...e, qty: Number(e.qty) || 1, minutes: Number(e.minutes) || 0 }));
}

// ---------------------------------------------------------------------------
// Screen tracking

const THROTTLE_MS = 30 * 60 * 1000;
const SEEN_KEY = "app_usage_seen";

let currentUserId: string | null = null;

export function setUsageUser(userId: string | null): void {
  currentUserId = userId;
}

/** `/practice/putting-test-9` → `practice/putting-test-9`, `/` → `home`. Null for screens not worth counting. */
export function screenKeyForPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "home";
  const [first, second] = parts;
  if (["login", "reset-password", "auth", "join", "finish-profile", "admin"].includes(first)) return null;
  if (first === "dashboard") return "dashboard-coach";
  if (first === "skill-history") return first;
  return second && ["practice", "virtual-caddie", "log-round", "combines"].includes(first) ? `${first}/${second}` : first;
}

/** Records that the signed-in player opened a screen or tool, at most once per 30 minutes each. */
export function trackScreen(screen: string): void {
  const userId = currentUserId;
  if (!userId || typeof window === "undefined") return;
  const key = `${userId}:${screen}`;
  let seen: Record<string, number> = {};
  try {
    seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, number>;
  } catch {
    seen = {};
  }
  const now = Date.now();
  if (now - (seen[key] ?? 0) < THROTTLE_MS) return;
  seen[key] = now;
  for (const k of Object.keys(seen)) if (now - seen[k] > THROTTLE_MS) delete seen[k];
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage full or blocked: still record the event */
  }
  void (async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient().from("app_events").insert({ user_id: userId, screen });
    if (error && !/app_events|PGRST205|42P01/.test(`${error.code} ${error.message}`)) {
      console.warn("[appUsage] track:", error.message);
    }
  })();
}

// ---------------------------------------------------------------------------
// Labels

const SCREEN_LABELS: Record<string, string> = {
  home: "Home",
  practice: "Practice",
  "practice-planner": "Plan my week",
  "practice-insights": "Coach's Insights",
  "practice-library": "Drill Library",
  "practice-combine": "Combine Tests list",
  "practice-fuel": "Fuel Planner",
  library: "Library",
  profile: "Profile",
  stats: "Stats",
  academy: "Academy",
  scores: "Scores",
  activity: "Activity",
  "log-round": "Log a round",
  "log-round/live": "Live round",
  "virtual-caddie": "Virtual Caddie",
  "virtual-caddie/bag": "Caddie: My bag",
  "virtual-caddie/shot-blueprint": "Caddie: Shot blueprint",
  "short-game-tempo": "Short game tempo",
  "full-swing-tempo": "Full swing tempo",
  "putting-calculator": "Putting calculator",
  "handicap-history": "Handicap history",
  "skill-history": "Skill history",
  "dashboard-coach": "Coach dashboard",
};

const PRACTICE_AREAS = new Set([
  "Driving",
  "Irons",
  "Wedges",
  "Chipping",
  "Bunkers",
  "Putting",
  "Mental/Strategy",
  "On-Course",
]);

const TEST_LABELS: Record<string, string> = {
  "putting-test": "Putting test (18 holes)",
  PuttingTest9Holes: "Putting test (9 holes)",
  PuttingTest3To6ft: "Putting test 3–6 ft",
  PuttingTest8to20: "Putting test 8–20 ft",
  PuttingTest20to40: "Lag putting test 20–40 ft",
  aimpoint_6ft_combine: "AimPoint 6 ft combine",
  aimpoint_long_40ft: "AimPoint 20–40 ft",
  slope_mid_20ft: "AimPoint 8–20 ft",
  chipping_combine_9: "Chipping combine",
  wedge_lateral_9: "Wedge lateral 9",
  bunker_9_hole_challenge: "Bunker 9-hole challenge",
  tee_shot_dispersion_combine: "Tee shot dispersion",
  iron_precision_protocol: "Iron precision protocol",
  strike_speed_control: "Strike & speed control",
  start_line_speed_test: "Start line & speed",
  gauntlet_protocol_session: "Gauntlet protocol",
  iron_face_control: "Iron face control",
  iron_skills: "Iron skills combine",
  chipping: "Chipping combine",
  flop_shot: "Flop shot combine",
  survival_20: "Survival 20",
  three_strikes: "3 strikes wedge challenge",
  bunker_protocol: "Bunker proximity protocol",
};

function humanize(slug: string): string {
  const s = slug.replace(/[/_-]+/g, " ").replace(/\s+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "Other";
}

export function screenLabel(screen: string): string {
  if (SCREEN_LABELS[screen]) return SCREEN_LABELS[screen];
  if (screen.startsWith("practice/") || screen.startsWith("combines/")) return humanize(screen.split("/")[1]);
  return humanize(screen);
}

export type DrillTitles = Map<string, string>;

/** The feature an action belongs to, for the totals list. */
export function featureOf(e: UsageEvent): string {
  switch (e.source) {
    case "practice":
      if (e.detail && PRACTICE_AREAS.has(e.detail)) return "Practice sessions";
      if (e.detail && TEST_LABELS[e.detail]) return "Combines & tests";
      return "Planner drills completed";
    case "skills_log":
      return "Combines & tests";
    case "drill_score":
      return "Drill scores logged";
    case "round":
      return "Rounds logged";
    case "lesson":
      return "Library lessons";
    case "trophy":
      return "Trophies earned";
    case "coaching_post":
      return "Coaching posts";
    case "swing_upload":
      return "Swing uploads";
    case "screen":
      return "Screens opened";
  }
}

/** The specific drill, test or screen, e.g. "Putting test 8–20 ft". */
export function itemOf(e: UsageEvent, drills: DrillTitles): string | null {
  const d = e.detail?.trim();
  if (e.source === "screen") return d ? screenLabel(d) : null;
  if (!d) return null;
  if (e.source === "practice" || e.source === "skills_log") {
    return TEST_LABELS[d] ?? (PRACTICE_AREAS.has(d) ? d : (drills.get(d) ?? humanize(d)));
  }
  if (e.source === "drill_score") return drills.get(d) ?? humanize(d);
  if (e.source === "trophy") return humanize(d);
  if (e.source === "coaching_post") return d === "video" ? "Video" : d === "photo" ? "Photo" : "Message";
  return d;
}

/** Feed sentence after the player's name, e.g. "logged 45 min of Putting". */
export function describeUsage(e: UsageEvent, drills: DrillTitles): string {
  const item = itemOf(e, drills);
  switch (e.source) {
    case "practice":
      if (e.detail && PRACTICE_AREAS.has(e.detail)) {
        return e.minutes > 0 ? `logged ${e.minutes} min of ${item}` : `logged a ${item} session`;
      }
      if (e.detail && TEST_LABELS[e.detail]) return `played ${item}`;
      return `completed ${item}`;
    case "skills_log":
      return `played ${item}`;
    case "drill_score":
      return e.qty > 1 ? `logged ${e.qty} scores on ${item}` : `logged a score on ${item}`;
    case "round":
      return "logged a round";
    case "lesson":
      return item ? `finished the lesson "${item}"` : "finished a library lesson";
    case "trophy":
      return item ? `earned a trophy: ${item}` : "earned a trophy";
    case "coaching_post":
      return `posted a ${item?.toLowerCase() ?? "message"} to their coach`;
    case "swing_upload":
      return "uploaded a swing";
    case "screen":
      return `opened ${item}`;
  }
}
